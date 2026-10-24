import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { compileProject, compileProjectToMemory } from '@webrad/compiler';
import { parseProject, updateProjectSettings } from '@webrad/project-model';
import { withChromium } from './chromium';
import { groupProject, groupUserSources } from './fixtures/group';
it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'renders the exported classic bundle through file URLs with working component events',
  async () => {
    const original = groupProject();
    const project = updateProjectSettings(original, {
      pwa: { ...original.settings.pwa, enabled: true },
    });
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-deploy-file-'));
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) ||
      !path.basename(resolved).startsWith('webrad-deploy-file-')
    )
      throw new Error('Unsafe deploy fixture directory.');
    try {
      const compiled = await compileProject(project, {
        outputDirectory: directory,
        target: 'deploy',
        userSources: groupUserSources,
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        pathToFileURL(path.join(directory, 'index.html')).href,
        async (send) => {
          const evaluate = async (expression: string) => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return (
              result.result as {
                value?: unknown;
              }
            )?.value;
          };
          await expect
            .poll(
              () =>
                evaluate(
                  `document.querySelector('[data-webrad-id="group"]')?.getAttribute('aria-label')`,
                ),
              { timeout: 15000 },
            )
            .toBe('Ready');
          expect(await evaluate('location.protocol')).toBe('file:');
          expect(
            await evaluate(
              `document.querySelector('button').click(); document.querySelector('button').textContent`,
            ),
          ).toBe('Ready');
          expect(
            await evaluate(
              `Array.from(document.scripts).every(script => script.type !== 'module')`,
            ),
          ).toBe(true);
        },
      );
    } finally {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  },
  40000,
);
it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'executes the deployed Preview bundle in a subfolder and keeps scoped PWA behavior',
  async () => {
    const original = groupProject();
    const project = updateProjectSettings(
      parseProject({
        ...original,
        sourceFiles: [
          { id: 'customer', kind: 'model', name: 'Customer' },
          { id: 'greeting', kind: 'unit', name: 'Greeting' },
        ],
      }),
      {
        applicationName: 'Hosted Group',
        routingBasePath: '/app/',
        pwa: { ...original.settings.pwa, enabled: true, shortName: 'Hosted' },
      },
    );
    const sources = {
      'models/Customer.ts': 'export class Customer { name = "Hosted"; }',
      'units/Greeting.ts':
        'import type { Customer } from "../models/Customer"; export function greeting(customer: Customer): string { return customer.name + " ready"; }',
      'pages/index.ts': `import { indexGenerated } from "./index.generated";
import { Customer } from '../models/Customer';
import { greeting } from '../units/Greeting';
export class index extends indexGenerated {
  created(): void { Group1.caption = greeting(new Customer()); }
  clicked(): void { this.Button1.caption = Group1.caption; }
}`,
    };
    const compiled = await compileProjectToMemory(project, {
      target: 'deploy',
      userSources: sources,
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    let served = compiled;
    const requests: string[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      requests.push(url.pathname);
      if (url.pathname === '/app/api/private') {
        response.setHeader('Content-Type', 'application/json');
        response.end('{"private":true}');
        return;
      }
      if (!url.pathname.startsWith('/app/')) {
        response.writeHead(404);
        response.end();
        return;
      }
      const relative = decodeURIComponent(url.pathname.slice('/app/'.length)) || 'index.html';
      const content = served.files[relative] ?? served.binaryFiles?.[relative];
      if (content === undefined) {
        response.writeHead(404);
        response.end();
        return;
      }
      const mediaType = relative.endsWith('.js')
        ? 'text/javascript'
        : relative.endsWith('.css')
          ? 'text/css'
          : relative.endsWith('.webmanifest')
            ? 'application/manifest+json'
            : relative.endsWith('.png')
              ? 'image/png'
              : 'text/html';
      response.setHeader('Content-Type', mediaType);
      response.setHeader('Cache-Control', 'no-cache');
      response.end(content);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing deploy server port.');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      await withChromium(process.env.WEBRAD_BROWSER_PATH!, `${origin}/app/`, async (send) => {
        const evaluate = async (expression: string) => {
          const result = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return (
            result.result as {
              value?: unknown;
            }
          )?.value;
        };
        await expect
          .poll(
            () =>
              evaluate(
                `document.querySelector('[data-webrad-id="group"]')?.getAttribute('aria-label')`,
              ),
            { timeout: 15000 },
          )
          .toBe('Hosted ready');
        expect(requests).toEqual(
          expect.arrayContaining(['/app/assets/app.js', '/app/assets/app.css']),
        );
        expect(
          requests.some(
            (url) =>
              /^\/app\/(pages|models|units|reusable)\//u.test(url) || url.includes('/chunks/'),
          ),
        ).toBe(false);
        await expect
          .poll(() => evaluate('Boolean(navigator.serviceWorker.controller)'), { timeout: 15000 })
          .toBe(true);
        const manifest = await evaluate(
          `fetch(document.querySelector('link[rel="manifest"]').href).then(r => r.json())`,
        );
        expect(manifest).toMatchObject({
          name: 'Hosted Group',
          start_url: './',
          scope: './',
          display: 'standalone',
        });
        expect(await evaluate('navigator.serviceWorker.ready.then(r => r.scope)')).toBe(
          `${origin}/app/`,
        );
        expect(await evaluate(`fetch('/app/api/private').then(r => r.json())`)).toEqual({
          private: true,
        });
        expect(
          await evaluate(
            `(async () => Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url))))().then(lists => lists.flat().some(url => url.includes('/api/'))) `,
          ),
        ).toBe(false);
        await send('Network.enable');
        await send('Network.emulateNetworkConditions', {
          offline: true,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0,
        });
        await send('Page.reload', { ignoreCache: true });
        await expect
          .poll(
            () =>
              evaluate(
                `document.querySelector('[data-webrad-id="group"]')?.getAttribute('aria-label')`,
              ),
            { timeout: 15000 },
          )
          .toBe('Hosted ready');
        expect(
          await evaluate(
            `document.querySelector('button').click(); document.querySelector('button').textContent`,
          ),
        ).toBe('Hosted ready');
        expect(
          await evaluate(
            `fetch('/app/api/private').then(() => 'unexpected response', () => 'offline')`,
          ),
        ).toBe('offline');
        await send('Page.navigate', { url: `${origin}/app/?start=offline` });
        await expect
          .poll(
            () =>
              evaluate(
                `document.querySelector('[data-webrad-id="group"]')?.getAttribute('aria-label')`,
              ),
            { timeout: 15000 },
          )
          .toBe('Hosted ready');
        await send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 0,
          downloadThroughput: -1,
          uploadThroughput: -1,
        });
        // Disable a previously installed PWA and verify its scoped cache/worker can retire.
        served = await compileProjectToMemory(
          updateProjectSettings(project, { pwa: { ...project.settings.pwa, enabled: false } }),
          { target: 'deploy', userSources: sources },
        );
        expect(served.success, JSON.stringify(served.diagnostics)).toBe(true);
        await evaluate('navigator.serviceWorker.ready.then(r => r.update())');
        await expect
          .poll(
            () => evaluate(`navigator.serviceWorker.getRegistrations().then(rs => rs.length)`),
            { timeout: 15000 },
          )
          .toBe(0);
        await send('Page.reload', { ignoreCache: true });
        await expect
          .poll(
            () =>
              evaluate(
                `document.querySelector('[data-webrad-id="group"]')?.getAttribute('aria-label')`,
              ),
            { timeout: 15000 },
          )
          .toBe('Hosted ready');
        expect(await evaluate('Boolean(document.querySelector(\'link[rel="manifest"]\'))')).toBe(
          false,
        );
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  90000,
);
