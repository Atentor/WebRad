import { defaultComponentRegistry } from '@webrad/component-registry';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  addComponent,
  addReusableElement,
  bindComponentEvent,
  createProject,
  createReusableElement,
  createDefaultApiClientConfiguration,
  createDefaultDataGridConfiguration,
  deserializePage,
  serializePage,
  updatePage,
} from '@webrad/project-model';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';

it('persists Margin and executes typed bare and this-qualified margin access in compiled Preview', async () => {
  let project = createProject('ComponentMargin');
  const reusable = createReusableElement('MarginReusable');
  project = addReusableElement(project, reusable);
  let page = project.pages[0];
  if (page === undefined) throw new Error('Missing page.');
  const apiConfig = createDefaultApiClientConfiguration();
  const operation = apiConfig.operations[0];
  if (operation === undefined) throw new Error('Missing default operation.');
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'margin-api',
      name: 'MarginApi',
      parentId: page.rootComponentId,
      props: {
        apiClientConfig: {
          ...apiConfig,
          operations: [
            {
              ...operation,
              responseSchema: {
                version: 1,
                root: {
                  id: 'margin-response',
                  name: 'Response',
                  path: '',
                  kind: 'list',
                  fieldType: 'list',
                  nullable: false,
                  children: [],
                },
              },
            },
          ],
        },
      },
    }),
    page.rootComponentId,
  );
  const visuals = defaultComponentRegistry
    .list()
    .filter((definition) => definition.visual && definition.type !== 'WebPage');
  for (const definition of visuals) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent(definition.type, {
        id: `margin-${definition.type}`,
        name: `Margin${definition.type}`,
        parentId: page.rootComponentId,
        props: {
          margin: 12,
          marginTop: 1,
          marginRight: 2,
          marginBottom: 3,
          marginLeft: 4,
          ...(definition.type === 'WebReusableElement' ? { reusableElementId: reusable.id } : {}),
          ...(definition.type === 'WebDataGrid'
            ? {
                dataGridConfig: {
                  ...createDefaultDataGridConfiguration(),
                  apiClientId: 'margin-api',
                  operationId: operation.id,
                },
              }
            : {}),
        },
      }),
      page.rootComponentId,
    );
  }
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'applyMargins');
  const restored = deserializePage(serializePage(page));
  expect(restored).toEqual(page);
  project = updatePage(project, page.id, restored);
  const userSource = `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  applyMargins(): void {
    this.margin = 3;
${visuals
  .map(
    (definition) => `    Margin${definition.type}.margin += 1;
    this.Margin${definition.type}.margin += 2;
    Margin${definition.type}.marginTop = 5;
    this.Margin${definition.type}.marginRight = 6;
    Margin${definition.type}.marginBottom = 7;
    this.Margin${definition.type}.marginLeft = 8;`,
  )
  .join('\n')}
  }
}`;
  const compiled = await compileProjectToMemory(project, {
    userSources: { [`pages/${page.name}.ts`]: userSource },
  });
  expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
  expect(compiled.previewHtml).toContain('<script>');
  const javascript = compiled.files['assets/app.js'];
  if (javascript === undefined) throw new Error('Missing compiled application.');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  dom.window.fetch = async () =>
    new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  try {
    dom.window.eval(javascript);
    expect(
      dom.window.document.querySelector<HTMLElement>(`[data-webrad-id="${page.rootComponentId}"]`)
        ?.style.margin,
    ).toBe('3px');
    for (const definition of visuals) {
      expect(
        dom.window.document.querySelector<HTMLElement>(
          `[data-webrad-id="margin-${definition.type}"]`,
        )?.style.margin,
      ).toBe('5px 6px 7px 8px');
    }
  } finally {
    dom.window.close();
  }
});
