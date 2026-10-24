import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  bindComponentEvent,
  createProject,
  deserializeProject,
  serializeProject,
  updatePage,
  type ContainerLayoutMode,
} from '@webrad/project-model';
import { comboBoxApiConfiguration } from './combo-box';
export const repeatingLayoutModes: readonly ContainerLayoutMode[] = [
  'fixed',
  'align-to-parent',
  'row',
  'column',
];
export function repeatingGroupProject(
  baseUrl = 'https://api.example.test',
  rowHeightMode: 'fixed' | 'dynamic' = 'fixed',
) {
  const project = createProject('RepeatingRows', { pageWidth: 960, pageHeight: 2200 });
  let page = project.pages[0]!;
  const add = (type: string, id: string, name: string, parentId: string, props = {}) => {
    const created = defaultComponentRegistry.createComponent(type, { id, name, parentId, props });
    const style = project.styles.find((candidate) => candidate.componentType === type);
    const node = { ...created, ...(style === undefined ? {} : { styleId: style.id }) };
    page = addComponent(page, node, parentId);
    return node;
  };
  add('WebApiClient', 'customers-api', 'ApiClient1', page.rootComponentId, {
    baseUrl,
    apiClientConfig: comboBoxApiConfiguration(),
  });
  const result = add('WebLabel', 'result', 'Result', page.rootComponentId, { caption: 'Waiting' });
  const reload = add('WebButton', 'reload', 'Reload', page.rootComponentId, { caption: 'Reload' });
  page = {
    ...page,
    components: page.components.map((node) =>
      node.id === result.id || node.id === reload.id
        ? { ...node, bounds: { ...node.bounds, x: node.id === result.id ? 20 : 220, y: 2120 } }
        : node,
    ),
  };
  for (const [index, mode] of repeatingLayoutModes.entries()) {
    const group = add(
      'WebRepeatingGroup',
      `group-${mode}`,
      `RepeatingGroup${index}`,
      page.rootComponentId,
      {
        repeatingGroupConfig: {
          schemaVersion: 1,
          apiClientId: 'customers-api',
          operationId: 'load-customers',
          listPath: '/customers',
          rowHeightMode,
          fixedRowHeight: 180,
          minRowHeight: 0,
          maxRowHeight: null,
          gap: 8,
          emptyMessage: 'No customers',
        },
      },
    );
    const panel = add('WebPanel', `panel-${mode}`, `Panel${index}`, group.id);
    add('WebLabel', `name-${mode}`, `Name${index}`, panel.id, {
      caption: 'Name',
      currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
    });
    add('WebButton', `button-${mode}`, `Choose${index}`, panel.id, {
      caption: 'Choose',
      currentRowBindings: [{ property: 'caption', fieldPath: '/id' }],
    });
    page = {
      ...page,
      components: page.components.map((node) => {
        if (node.id === group.id)
          return {
            ...node,
            bounds: { x: 10, y: index * 510, width: 940, height: 470 },
            layout: {
              ...node.layout,
              item: { ...node.layout.item, width: 'stretch', left: 10, right: 10 },
              container: { ...node.layout.container, mode, wrap: true },
            },
          };
        if (node.id === panel.id)
          return {
            ...node,
            bounds: { x: 8, y: 8, width: 900, height: 160 },
            layout: {
              ...node.layout,
              item: { ...node.layout.item, width: 'stretch', left: 8, right: 8, shrink: false },
              container: { ...node.layout.container, mode: 'row', wrap: true, gap: 8 },
            },
          };
        if (node.parentId === panel.id)
          return {
            ...node,
            bounds: { x: 0, y: 0, width: 130, height: 32 },
            layout: { ...node.layout, item: { ...node.layout.item, shrink: false } },
          };
        return node;
      }),
    };
    page = bindComponentEvent(page, `button-${mode}`, 'OnClick', `choose${index}`);
    page = bindComponentEvent(page, `name-${mode}`, 'OnClick', `label${index}`);
  }
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'load');
  page = bindComponentEvent(page, 'reload', 'OnClick', 'load');
  return deserializeProject(serializeProject(updatePage(project, page.id, page)));
}
export function repeatingGroupUserSources() {
  const methods = repeatingLayoutModes.map(
    (_, index) => `
  public ${index === 3 ? `choose${index} = async` : `async choose${index}`}(sender: WebButton, event: Event, CurrentRow: RepeatingGroup${index}CurrentRow): Promise<void> ${index === 3 ? '=>' : ''} {
    this.#clicks++;
    Name${index}.text = 'Selected ' + CurrentRow.value.name;
    this.Result.text = CurrentRow.value.name + ':' + this.#clicks;
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    this.Result.text = 'Async ' + CurrentRow.value.name + ':' + this.#clicks;
  }${index === 3 ? ';' : ''}
  public label${index}(sender: WebLabel, event: Event, CurrentRow: RepeatingGroup${index}CurrentRow): void {
    this.Name${index}.text = 'Label ' + CurrentRow.value.name;
    Result.text = String(CurrentRow.value.id);
  }`,
  );
  return {
    'pages/index.ts': `import { indexGenerated } from "./index.generated";
import type { ${repeatingLayoutModes.map((_, index) => `RepeatingGroup${index}CurrentRow`).join(', ')} } from "./index.generated";
import type { WebButton, WebLabel } from '@webrad/runtime';
export class index extends indexGenerated {
  #clicks = 0;
  public async load(): Promise<void> { await ApiClient1.Load.execute(); }
  ${methods.join('\n')}
}`,
  };
}
