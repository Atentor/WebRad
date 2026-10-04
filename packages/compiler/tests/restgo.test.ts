import { createProject, updateProjectSettings } from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { compileProjectToMemory } from '../src/index.js';
import { createVirtualSourceGraph, RESTGO_ENTRY_PATH } from '../src/source-graph.js';

describe('compiled native RestGO integration', () => {
  it('rejects user source paths that shadow embedded libraries or generated bootstrap files', async () => {
    const project = createProject('RestGoReservedSources');
    const userSources = {
      '__restgo/index.ts': 'export const maliciousSdk = true;',
      'pages/../__RESTGO/auth.ts': 'export const maliciousAuth = true;',
      '__runtime/index.ts': 'export const maliciousRuntime = true;',
      '__runtime\\globals.ts': 'export const maliciousGlobals = true;',
      'entry.ts': 'export const authoredEntry = true;',
      'APP.CSS': '.authored-style {}',
      'webrad-globals.d.ts': 'declare const RestGO: unknown;',
      'webrad-environment.d.ts': 'declare const Env: unknown;',
      'styles.d.ts': 'declare const AuthoredStyles: unknown;',
    };
    const preservedSources = { ...userSources };
    const graph = createVirtualSourceGraph(project, userSources, defaultComponentRegistry, '');
    expect(graph.sources.get(RESTGO_ENTRY_PATH)).not.toContain('maliciousSdk');
    expect(graph.diagnostics).toHaveLength(Object.keys(userSources).length);
    expect(graph.diagnostics.every((diagnostic) => diagnostic.category === 'error')).toBe(true);
    expect(graph.diagnostics.every((diagnostic) => diagnostic.message.includes('reserved'))).toBe(
      true,
    );
    const result = await compileProjectToMemory(project, { userSources });
    expect(result.success).toBe(false);
    expect(result.files).toEqual({});
    expect(userSources).toEqual(preservedSources);
  });

  it('creates the configured shared client before authored page construction', async () => {
    const original = createProject('RestGoBrowser');
    const page = original.pages[0];
    if (page === undefined) throw new Error('The default project requires an entry page.');
    const project = updateProjectSettings(original, {
      restGo: {
        enabled: true,
        baseUrl: 'https://restgo.example.test',
        apiVersion: 2,
        defaultDatabase: 'clientes',
        persistSession: false,
        sessionStorage: 'memory',
        storageKey: 'compiled-restgo-test',
      },
    });
    const userSource = `import { createClient } from '@webrad/restgo-sdk';
import { getRestGoClient, RestGO as SharedRestGO } from '@webrad/runtime';
import { ${page.name}Generated } from './${page.name}.generated';

export class ${page.name} extends ${page.name}Generated {
  public constructor(element: HTMLElement) {
    super(element);
    const standalone = createClient('https://standalone.example.test', { persistSession: false });
    this.element.dataset.restgoReady = String(RestGO.auth === getRestGoClient().auth);
    this.element.dataset.restgoShared = String(RestGO.storage === SharedRestGO.storage);
    this.element.dataset.restgoImport = String(standalone.auth !== RestGO.auth);
    void RestGO.from<readonly { id: string }[]>('pessoas').get().then(({ data, error }) => {
      this.element.dataset.restgoData = error === null ? data[0]?.id ?? '' : error.code;
    });
  }
}
`;
    const userSources = { [`pages/${page.name}.ts`]: userSource };
    const graph = createVirtualSourceGraph(project, userSources, defaultComponentRegistry, '');
    expect([...graph.sources.keys()].some((fileName) => fileName.includes('__restgo'))).toBe(true);
    expect([...graph.sources.values()]).toContain(userSource);

    const result = await compileProjectToMemory(project, { userSources });
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const application = result.files['assets/app.js'] ?? '';
    expect(application).not.toMatch(/require\(["'](?:electron|node:)/u);
    expect(application).not.toContain('nodeIntegration');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ success: true, data: [{ id: 'cliente-1' }] }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    Object.defineProperties(dom.window, {
      fetch: { value: fetch },
      Headers: { value: globalThis.Headers },
    });
    try {
      dom.window.eval(application);
      const root = dom.window.document.querySelector('[data-webrad-id]');
      expect(root?.getAttribute('data-restgo-ready')).toBe('true');
      expect(root?.getAttribute('data-restgo-shared')).toBe('true');
      expect(root?.getAttribute('data-restgo-import')).toBe('true');
      await vi.waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          'https://restgo.example.test/v2/clientes/pessoas',
          expect.objectContaining({ method: 'GET', credentials: 'omit' }),
        );
        expect(root?.getAttribute('data-restgo-data')).toBe('cliente-1');
      });
    } finally {
      dom.window.close();
    }
  });

  it('provides an actionable runtime error when the project integration is disabled', async () => {
    const project = createProject('RestGoDisabled');
    const result = await compileProjectToMemory(project, { userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      expect(() => dom.window.eval('RestGO.auth')).toThrow('Enable and configure RestGO');
    } finally {
      dom.window.close();
    }
  });
});
