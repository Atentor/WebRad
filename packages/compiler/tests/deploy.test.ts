import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  addComponent,
  addReusableElement,
  createProject,
  createReusableElement,
  parseProject,
  updateProjectSettings,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { createUserPageSource } from '@webrad/language';
import { JSDOM } from 'jsdom';
import { compileProjectToMemory } from '../src/index.js';

function fixture() {
  const original = createProject('DeployApp');
  const page = original.pages[0];
  if (page === undefined) throw new Error('Expected entry page.');
  const withLabel = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebLabel', {
      id: 'label',
      name: 'Title',
      parentId: page.rootComponentId,
      props: { caption: 'Hosted application' },
    }),
    page.rootComponentId,
  );
  return updateProjectSettings(
    { ...original, pages: [withLabel] },
    {
      build: { ...original.settings.build, minify: false },
      environmentVariables: [
        { name: 'MODE', values: { development: 'dev-secret', production: 'production-value' } },
      ],
    },
  );
}

describe('hosting deployment', () => {
  it('exports real modules, selects runtime controls, and omits unreferenced code', async () => {
    let project = fixture();
    project = addReusableElement(project, createReusableElement('UnusedVideo'));
    project = parseProject({
      ...project,
      sourceFiles: [
        { id: 'model', kind: 'model', name: 'Customer' },
        { id: 'unit', kind: 'unit', name: 'Greeting' },
        { id: 'unused-unit', kind: 'unit', name: 'Unused' },
      ],
    });
    const page = project.pages[0];
    if (page === undefined) throw new Error('Expected entry page.');
    const result = await compileProjectToMemory(project, {
      target: 'deploy',
      userSources: {
        'models/Customer.ts': 'export class Customer { public name = "Marta"; }',
        'units/Greeting.ts':
          'import type { Customer } from "../models/Customer"; export const greeting = (customer: Customer): string => "Hello " + customer.name; export const unused = "UNUSED_EXPORT_FROM_USED_UNIT";',
        'units/Unused.ts':
          'export const UNUSED_MARKER = "UNREACHABLE_CODE_SENTINEL"; export const unusedRestGo = (): unknown => RestGO.auth;',
        'reusables/UnusedVideo.ts':
          'import { UnusedVideoGenerated } from "./UnusedVideo.generated"; export class UnusedVideo extends UnusedVideoGenerated {}',
        'pages/PageMain.ts':
          'import { Customer } from "../models/Customer"; import { greeting } from "../units/Greeting";\n' +
          createUserPageSource(page) +
          '\ndocument.documentElement.dataset.greeting = greeting(new Customer());',
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.previewHtml).toBeUndefined();
    expect(result.files['index.html']).toContain('type="module" src="./assets/app.js"');
    expect(Object.keys(result.files)).toEqual(
      expect.arrayContaining(['pages/PageMain.js', 'models/Customer.js', 'units/Greeting.js']),
    );
    expect(Object.keys(result.files)).not.toContain('units/Unused.js');
    expect(Object.keys(result.files).some((file) => file.includes('UnusedVideo'))).toBe(false);
    const javascript = Object.entries(result.files)
      .filter(([file]) => file.endsWith('.js'))
      .map(([, source]) => source)
      .join('\n');
    expect(javascript).toContain('WebLabel');
    expect(javascript).not.toMatch(
      /shaka|WebVideoPlayer|WebDataGrid|RestGoTransport|UNREACHABLE_CODE_SENTINEL/u,
    );
    expect(javascript).not.toContain('UNUSED_EXPORT_FROM_USED_UNIT');
    expect(result.files['assets/app.css']).not.toMatch(/wr-webvideoplayer|wr-data-grid-/u);
    expect(javascript).toContain('production-value');
    expect(javascript).not.toContain('dev-secret');
    expect(javascript).not.toMatch(/from\s+["'](?:node:|electron)/u);
    expect(result.files['manifest.webmanifest']).toBeUndefined();
  }, 30_000);

  it('generates installable subfolder metadata, raster icons and an isolated offline shell', async () => {
    const original = fixture();
    const project = updateProjectSettings(original, {
      pwa: {
        ...original.settings.pwa,
        enabled: true,
        shortName: 'Hosted',
        orientation: 'portrait',
        themeColor: '#123456',
      },
    });
    const result = await compileProjectToMemory(project, { target: 'deploy', userSources: {} });
    expect(result.diagnostics).toEqual([]);
    expect(result.success).toBe(true);
    const manifest = JSON.parse(result.files['manifest.webmanifest'] ?? '{}') as Record<
      string,
      unknown
    >;
    expect(manifest).toMatchObject({
      id: './',
      start_url: './',
      scope: './',
      short_name: 'Hosted',
      orientation: 'portrait',
      display: 'standalone',
    });
    for (const size of [192, 512]) {
      const bytes = result.binaryFiles?.[`assets/icons/pwa-${String(size)}.png`];
      expect(bytes).toBeDefined();
      const metadata = await sharp(bytes).metadata();
      expect(metadata).toMatchObject({ format: 'png', width: size, height: size });
    }
    expect(result.files['index.html']).toContain('href="./manifest.webmanifest"');
    expect(result.files['index.html']).toContain('name="theme-color" content="#123456"');
    expect(result.files['assets/pwa-register.js']).toContain(
      "new URL('../service-worker.js', import.meta.url)",
    );

    const listeners = new Map<string, (event: unknown) => void>();
    const cachedUrls: string[] = [];
    const cache = {
      addAll: (requests: Request[]) => {
        expect(requests.every((request) => request.cache === 'reload')).toBe(true);
        cachedUrls.push(...requests.map((request) => request.url));
        return Promise.resolve();
      },
      match: () => Promise.resolve(new Response('offline shell')),
    };
    const scope = 'https://example.test/hosted/app/';
    const caches = {
      open: () => Promise.resolve(cache),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    };
    vm.runInNewContext(result.files['service-worker.js'] ?? '', {
      URL,
      Request,
      Set,
      caches,
      fetch: () => Promise.reject(new Error('offline')),
      self: {
        registration: { scope },
        clients: { claim: () => Promise.resolve() },
        addEventListener: (name: string, listener: (event: unknown) => void) =>
          listeners.set(name, listener),
      },
    });
    let install: Promise<unknown> | undefined;
    listeners.get('install')?.({
      waitUntil: (promise: Promise<unknown>) => {
        install = promise;
      },
    });
    await install;
    expect(cachedUrls).toContain(`${scope}assets/pwa-register.js`);
    expect(cachedUrls.every((url) => url.startsWith(scope))).toBe(true);
    let navigation: Promise<Response> | undefined;
    listeners.get('fetch')?.({
      request: { method: 'GET', mode: 'navigate', url: scope },
      respondWith: (promise: Promise<Response>) => {
        navigation = promise;
      },
    });
    expect(await (await navigation)?.text()).toBe('offline shell');
    for (const url of [
      `${scope}api/private`,
      'https://api.example.test/private',
      `${scope}assets/app.js?token=secret`,
    ]) {
      let intercepted = false;
      listeners.get('fetch')?.({
        request: { method: 'GET', mode: 'cors', url },
        respondWith: () => {
          intercepted = true;
        },
      });
      expect(intercepted).toBe(false);
    }
    expect(result.files['service-worker.js']).not.toContain('skipWaiting(');
    expect(Object.keys(result.files).every((file) => !path.isAbsolute(file))).toBe(true);
  }, 30_000);

  it('returns imported asset bytes in memory and keeps PWA out of Preview', async () => {
    const original = fixture();
    const project = parseProject({
      ...original,
      settings: { ...original.settings, pwa: { ...original.settings.pwa, enabled: true } },
      assets: [
        {
          id: 'asset',
          fileName: 'sample.bin',
          mediaType: 'application/octet-stream',
          base64: 'AP8B',
        },
      ],
    });
    const result = await compileProjectToMemory(project, { userSources: {} });
    expect(result.success).toBe(true);
    expect(result.binaryFiles?.['assets/imported/sample.bin']).toEqual(Buffer.from([0, 255, 1]));
    expect(result.files['manifest.webmanifest']).toBeUndefined();
    expect(result.previewHtml).not.toContain('serviceWorker');
    expect(result.previewHtml).not.toContain('WebVideoPlayer');
    expect(result.previewHtml).not.toContain('RestGoTransport');
  }, 30_000);

  it('keeps runtime adapters functional for authored dynamic registry creation', async () => {
    const project = fixture();
    const page = project.pages[0];
    const node = page?.components.find((component) => component.id === 'label');
    if (page === undefined || node === undefined) throw new Error('Expected fixture node.');
    const result = await compileProjectToMemory(project, {
      userSources: {
        'pages/PageMain.ts':
          'import { runtimeComponentRegistry } from "@webrad/runtime";\n' +
          createUserPageSource(page) +
          `\ndocument.documentElement.dataset.dynamicImage = runtimeComponentRegistry.create(document, ${JSON.stringify({ id: node.id, name: node.name, parentId: node.parentId, layout: node.layout, bounds: node.bounds, children: node.children, type: 'WebImage', props: { src: '', placeholder: 'user', alt: 'Dynamic' } })}).element.tagName;`,
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.success).toBe(true);
    const dom = new JSDOM(result.previewHtml, {
      runScripts: 'dangerously',
      url: 'http://localhost/preview/',
    });
    try {
      expect(dom.window.document.documentElement.dataset.dynamicImage).toBe('IMG');
    } finally {
      dom.window.close();
    }
  }, 30_000);
});
