import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  bindComponentEvent,
  createDefaultApiClientConfiguration,
  createProject,
  updatePage,
  type ApiClientResponseSchema,
  type ComboBoxConfiguration,
} from '@webrad/project-model';

export const comboBoxResponseSchema: ApiClientResponseSchema = {
  version: 1,
  root: {
    id: 'response',
    name: 'Response',
    path: '',
    kind: 'object',
    fieldType: 'object',
    nullable: false,
    children: [
      {
        id: 'customers-list',
        name: 'customers',
        path: '/customers',
        kind: 'list',
        fieldType: 'list',
        nullable: false,
        children: [
          {
            id: 'customer-item',
            name: 'Item',
            path: '/customers/*',
            kind: 'object',
            fieldType: 'object',
            nullable: false,
            children: [
              {
                id: 'customer-id',
                name: 'id',
                path: '/customers/*/id',
                kind: 'field',
                fieldType: 'integer',
                nullable: false,
                children: [],
              },
              {
                id: 'customer-name',
                name: 'name',
                path: '/customers/*/name',
                kind: 'field',
                fieldType: 'string',
                nullable: false,
                children: [],
              },
              {
                id: 'customer-alias',
                name: 'full/name',
                path: '/customers/*/full~1name',
                kind: 'field',
                fieldType: 'string',
                nullable: false,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'codes-list',
        name: 'codes',
        path: '/codes',
        kind: 'list',
        fieldType: 'list',
        nullable: false,
        children: [
          {
            id: 'code-item',
            name: 'Item',
            path: '/codes/*',
            kind: 'field',
            fieldType: 'string',
            nullable: false,
            children: [],
          },
        ],
      },
    ],
  },
};

export const comboBoxBinding: ComboBoxConfiguration = {
  schemaVersion: 1,
  apiClientId: 'customers-api',
  operationId: 'load-customers',
  listPath: '/customers',
  displayField: '/name',
  keyField: '/id',
};

export function comboBoxApiConfiguration() {
  const defaults = createDefaultApiClientConfiguration();
  const operation = defaults.operations[0];
  if (operation === undefined) throw new Error('Missing default operation.');
  return {
    ...defaults,
    operations: [
      {
        ...operation,
        id: 'load-customers',
        name: 'Load',
        path: '/customers',
        responseSchema: comboBoxResponseSchema,
      },
    ],
  };
}

export function comboBoxProject(baseUrl = 'https://api.example.test') {
  const project = createProject('ComboBoxBinding');
  let page = project.pages[0];
  if (page === undefined) throw new Error('Missing page.');
  const rootId = page.rootComponentId;
  for (const component of [
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'customers-api',
      name: 'ApiClient1',
      parentId: rootId,
      props: { baseUrl, apiClientConfig: comboBoxApiConfiguration() },
    }),
    defaultComponentRegistry.createComponent('WebComboBox', {
      id: 'customer-combo',
      name: 'ComboBox1',
      parentId: rootId,
      x: 24,
      y: 24,
      props: { comboBoxConfig: comboBoxBinding, value: '2', items: ['Static item'] },
    }),
    defaultComponentRegistry.createComponent('WebLabel', {
      id: 'selected-label',
      name: 'SelectedKey',
      parentId: rootId,
      x: 24,
      y: 80,
      props: { caption: 'Waiting' },
    }),
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'reload-button',
      name: 'Reload',
      parentId: rootId,
      x: 220,
      y: 24,
      props: { caption: 'Reload' },
    }),
  ])
    page = addComponent(page, component, rootId);
  page = bindComponentEvent(page, rootId, 'OnCreate', 'loadCustomers');
  page = bindComponentEvent(page, 'reload-button', 'OnClick', 'loadCustomers');
  page = bindComponentEvent(page, 'customer-combo', 'OnChange', 'choiceChanged');
  return updatePage(project, page.id, { components: page.components });
}

export function comboBoxUserSources(pageName: string): Readonly<Record<string, string>> {
  return {
    [`pages/${pageName}.ts`]: `import { ${pageName}Generated } from './${pageName}.generated';
export class ${pageName} extends ${pageName}Generated {
  public async loadCustomers(): Promise<void> {
    await ApiClient1.Load.execute();
  }
  public choiceChanged(): void {
    SelectedKey.text = ComboBox1.value;
  }
}`,
  };
}
