import {
  addComponent,
  createDefaultApiClientConfiguration,
  createProject,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { compileProjectToMemory } from '../src/index.js';

describe('compiled API Client body templates', () => {
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
    void this.ApiClient1.PutKey.execute().then(() => {
      this.element.dataset.templateComplete = 'true';
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
      AbortController: { value: globalThis.AbortController },
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      await vi.waitFor(() => {
        expect(fetch).toHaveBeenCalledOnce();
        expect(
          dom.window.document.querySelector<HTMLElement>('[data-webrad-id]')?.dataset
            .templateComplete,
        ).toBe('true');
      });
    } finally {
      dom.window.close();
    }
  });
});
