import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  applyDefaultComponentStyle,
  bindComponentEvent,
  createDefaultDataGridConfiguration,
  createProject,
  updatePage,
  type DataGridConfiguration,
} from '@webrad/project-model';
import { comboBoxApiConfiguration } from './combo-box';

export const dataGridToggleRows = [
  { id: 1, name: 'Ada', active: true },
  { id: 2, name: 'Linus', active: false },
  { id: 3, name: 'Grace', active: null },
];

export function dataGridToggleApiConfiguration() {
  const configuration = comboBoxApiConfiguration();
  const operation = configuration.operations[0]!;
  return {
    ...configuration,
    operations: [
      {
        ...operation,
        responseSchema: {
          version: 1 as const,
          root: {
            ...operation.responseSchema!.root,
            children: operation.responseSchema!.root.children.map((list) =>
              list.name !== 'customers'
                ? list
                : {
                    ...list,
                    children: [
                      {
                        id: 'active',
                        name: 'active',
                        path: '/customers/*/active',
                        kind: 'field' as const,
                        fieldType: 'boolean' as const,
                        nullable: true,
                        children: [],
                      },
                    ],
                  },
            ),
          },
        },
      },
    ],
  };
}

export function dataGridToggleConfiguration(): DataGridConfiguration {
  const defaults = createDefaultDataGridConfiguration();
  return {
    ...defaults,
    apiClientId: 'api',
    operationId: 'load-customers',
    listPath: '/customers',
    columns: defaults.columns.map((column, index) => ({
      ...column,
      id: `column-${index}`,
      header: index === 0 ? 'Active' : index === 1 ? 'Name' : 'Unbound',
      cellKind: index === 1 ? 'text' : 'toggle',
      fieldPath: index === 0 ? '/active' : index === 1 ? '/name' : '',
      fixedCaption: index === 0 ? 'Ignored caption' : '',
      buttonIcon: index === 0 ? 'check' : null,
    })),
  };
}

export function dataGridToggleProject(baseUrl = 'https://api.example.test') {
  let project = createProject('GridToggle');
  let page = project.pages[0]!;
  const api = defaultComponentRegistry.createComponent('WebApiClient', {
    id: 'api',
    name: 'ApiClient1',
    parentId: page.rootComponentId,
    props: { baseUrl, apiClientConfig: dataGridToggleApiConfiguration() },
  });
  const grid = applyDefaultComponentStyle(
    defaultComponentRegistry.createComponent('WebDataGrid', {
      id: 'grid',
      name: 'DataGrid1',
      parentId: page.rootComponentId,
      x: 20,
      y: 20,
      width: 600,
      height: 200,
      props: { dataGridConfig: dataGridToggleConfiguration() },
    }),
    project.styles,
  );
  page = addComponent(page, api, page.rootComponentId);
  page = addComponent(page, grid, page.rootComponentId);
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'load');
  page = bindComponentEvent(page, 'grid', 'OnCellClick', 'clicked');
  project = updatePage(project, page.id, page);
  return project;
}

export const dataGridToggleSources = {
  'pages/PageMain.ts': `import type { WebDataGridCellEventDetail } from '@webrad/runtime';
import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  async load(): Promise<void> { await ApiClient1.Load.execute(); }
  clicked(_sender: unknown, event: CustomEvent<WebDataGridCellEventDetail>): void {
    this.element.dataset.clicked = JSON.stringify({ row: event.detail.rowIndex, kind: event.detail.column.cellKind, value: event.detail.value });
  }
}`,
};
