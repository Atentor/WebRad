import {
  addComponent,
  createDefaultApiClientConfiguration,
  createProject,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { compileProjectToMemory } from '../src/index.js';
import {
  importRestGoPublishedApis,
  synchronizeRestGoApiConfiguration,
  type RestGoPublishedApi,
} from '@webrad/designer';

describe('compiled API Client body templates', () => {
  it('executes a synchronized imported request through its generated typed instance in compiled Preview', async () => {
    const project = createProject('SynchronizedRestGo');
    const page = project.pages[0]!;
    const api: RestGoPublishedApi = {
      id: '20:11',
      name: 'notas',
      database: 'demo',
      endpoint: 'notas',
      method: 'PUT',
      apiVersion: 1,
      authentication: 'public',
      kind: 'sql',
      script: 'SELECT :id, :old',
    };
    const imported = importRestGoPublishedApis([api]);
    const configured = {
      ...imported,
      operations: imported.operations.map((operation) => ({
        ...operation,
        body: {
          kind: 'json' as const,
          content: '{"id":<id>,"old":null}',
          parameters: [{ name: 'id', type: 'integer' as const }],
        },
      })),
    };
    const synchronized = synchronizeRestGoApiConfiguration(configured, [
      { ...api, script: 'SELECT :id, :caption' },
    ]);
    const configuredPage = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebApiClient', {
        id: 'sync-api',
        name: 'ApiNotas',
        parentId: page.rootComponentId,
        props: { baseUrl: '', apiClientConfig: synchronized },
      }),
      page.rootComponentId,
    );
    const result = await compileProjectToMemory(
      {
        ...project,
        pages: [configuredPage],
        settings: {
          ...project.settings,
          restGo: {
            ...project.settings.restGo,
            enabled: true,
            baseUrl: 'https://restgo.example.test/backend',
            persistSession: false,
          },
        },
      },
      {
        userSources: {
          [`pages/${page.name}.ts`]: `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  public constructor(element: HTMLElement) {
    super(element);
    ApiNotas.PutNotas.parameter.id = 42;
    void this.ApiNotas.PutNotas.execute().then(() => { this.element.dataset.syncComplete = 'true'; }).catch((error: unknown) => { this.element.dataset.syncError = String(error); });
  }
}`,
        },
      },
    );
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.files['assets/app.js']).not.toContain('restGoSource');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(String(url)).toBe('https://restgo.example.test/backend/v1/demo/notas');
      expect(JSON.parse(String(init?.body))).toEqual({ id: 42, caption: null });
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
      return new Response('{"success":true}', { headers: { 'Content-Type': 'application/json' } });
    });
    Object.defineProperties(dom.window, {
      fetch: { value: fetch },
      Headers: { value: globalThis.Headers },
      ReadableStream: { value: globalThis.ReadableStream },
      AbortController: { value: globalThis.AbortController },
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      await vi.waitFor(() => {
        const root = dom.window.document.querySelector<HTMLElement>('[data-webrad-id]');
        expect(root?.dataset.syncError).toBeUndefined();
        expect(root?.dataset.syncComplete).toBe('true');
        expect(fetch).toHaveBeenCalledOnce();
      });
    } finally {
      dom.window.close();
    }
  });
  it('preserves templates and executes parameter values from a concrete generated component instance', async () => {
    const project = createProject('ApiBodyTemplates');
    const page = project.pages[0];
    if (page === undefined) throw new Error('Expected the default page.');
    const defaults = createDefaultApiClientConfiguration();
    const configuredPage = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebApiClient', {
        id: 'template-api',
        name: 'ApiClient1',
        parentId: page.rootComponentId,
        props: {
          baseUrl: 'https://api.example.test',
          apiClientConfig: {
            ...defaults,
            operations: defaults.operations.map((operation) => ({
              ...operation,
              name: 'PutKey',
              method: 'PUT',
              path: '/key',
              body: {
                kind: 'json',
                content: '{"idinstancia":<idinstancia>,"chave":<chave>}',
                parameters: [
                  { name: 'idinstancia', type: 'integer' },
                  { name: 'chave', type: 'string' },
                ],
              },
            })),
          },
        },
      }),
      page.rootComponentId,
    );
    const userSource = `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  public constructor(element: HTMLElement) {
    super(element);
    ApiClient1.PutKey.parameter.idinstancia = 23;
    this.ApiClient1.PutKey.parameter.chave = 'compiled';
    void this.ApiClient1.PutKey.execute()
      .then(() => {
        this.element.dataset.templateComplete = 'true';
      })
      .catch((error: unknown) => {
        this.element.dataset.templateError = String(error);
      });
  }
}`;
    const result = await compileProjectToMemory(
      { ...project, pages: [configuredPage] },
      { userSources: { [`pages/${page.name}.ts`]: userSource } },
    );
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ idinstancia: 23, chave: 'compiled' });
      return new Response('{"success":true}', { headers: { 'Content-Type': 'application/json' } });
    });
    Object.defineProperties(dom.window, {
      fetch: { value: fetch },
      Headers: { value: globalThis.Headers },
      ReadableStream: { value: globalThis.ReadableStream },
      AbortController: { value: globalThis.AbortController },
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      await vi.waitFor(() => {
        const root = dom.window.document.querySelector<HTMLElement>('[data-webrad-id]');
        expect(root?.dataset.templateError).toBeUndefined();
        expect(fetch).toHaveBeenCalledOnce();
        expect(root?.dataset.templateComplete).toBe('true');
      });
    } finally {
      dom.window.close();
    }
  });
});
