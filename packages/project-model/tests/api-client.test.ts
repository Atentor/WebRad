import { describe, expect, it } from 'vitest';

import {
  ApiClientConfigurationSchema,
  DataGridConfigurationSchema,
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  createDefaultDataGridConfiguration,
  createPage,
  deserializePage,
  normalizeApiClientConfiguration,
  parseDataGridConfiguration,
  safeParsePage,
  serializePage,
  type ApiClientConfiguration,
  type DataGridConfiguration,
  type PageModel,
} from '../src/index.js';

function validConfiguration(): ApiClientConfiguration {
  return {
    schemaVersion: 1,
    defaultHeaders: [
      { id: 'header-accept', name: 'Accept', value: 'application/json', enabled: true },
    ],
    timeoutMs: 12_000,
    operations: [
      {
        id: 'operation-customers',
        name: 'LoadCustomers',
        method: 'GET',
        path: '/v1/customers',
        headers: [],
        query: [{ id: 'query-page', name: 'page', value: '1', enabled: true }],
        body: { kind: 'none', content: '' },
        credentials: 'include',
        timeoutMs: null,
        responseSchema: {
          version: 1,
          root: {
            id: 'response-root',
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
                    nullable: true,
                    children: [],
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  };
}

function pageWithApiClientConfiguration(configuration: unknown): PageModel {
  let id = 0;
  const page = createPage('PageMain', () => `api-config-${String((id += 1))}`);
  const root = page.components[0];
  if (root === undefined) throw new Error('Expected PageMain to have a root component.');

  return {
    ...page,
    components: [
      { ...root, children: ['api-client'] },
      {
        id: 'api-client',
        type: 'WebApiClient',
        name: 'ApiClient1',
        parentId: root.id,
        layout: createDefaultComponentLayout(),
        bounds: { x: 0, y: 0, width: 112, height: 52 },
        props: {
          baseUrl: 'https://api.example.test',
          apiClientConfig: configuration,
        },
        events: {},
        children: [],
      },
    ],
  };
}

describe('persisted API Client configuration', () => {
  it('creates independent, valid defaults and normalizes legacy API clients', () => {
    const first = createDefaultApiClientConfiguration();
    const second = createDefaultApiClientConfiguration();

    expect(ApiClientConfigurationSchema.safeParse(first).success).toBe(true);
    expect(first).toEqual({
      schemaVersion: 1,
      defaultHeaders: [],
      timeoutMs: 30_000,
      operations: [
        {
          id: 'operation-1',
          name: 'Request',
          method: 'GET',
          path: '',
          headers: [],
          query: [],
          body: { kind: 'none', content: '' },
          credentials: 'omit',
          timeoutMs: null,
          responseSchema: null,
        },
      ],
    });
    expect(first).not.toBe(second);
    expect(first.operations).not.toBe(second.operations);
    expect(normalizeApiClientConfiguration(undefined)).toEqual(first);
  });

  it('accepts, persists, and restores typed objects, fields, and lists', () => {
    const configuration = validConfiguration();
    const page = pageWithApiClientConfiguration(configuration);

    expect(ApiClientConfigurationSchema.safeParse(configuration).success).toBe(true);
    expect(safeParsePage(page).success).toBe(true);

    const restored = deserializePage(serializePage(page));
    expect(restored.components.find((component) => component.id === 'api-client')?.props).toEqual({
      baseUrl: 'https://api.example.test',
      apiClientConfig: configuration,
    });
  });

  it('persists a typed Data Grid binding to a nested API response list', () => {
    const apiConfiguration = validConfiguration();
    const defaults = createDefaultDataGridConfiguration();
    const dataGridConfiguration: DataGridConfiguration = {
      ...defaults,
      apiClientId: 'api-client',
      operationId: 'operation-customers',
      listPath: '/customers',
      rowHeightMode: 'dynamic',
      minRowHeight: 44,
      maxRowHeight: 160,
      cellPaddingHorizontal: 14,
      cellPaddingVertical: 6,
      wrapText: true,
      stripedRows: true,
      showVerticalLines: true,
      columns: [
        {
          ...defaults.columns[0]!,
          id: 'customer-name',
          header: 'Customer',
          fieldPath: '/name',
          cellKind: 'text',
          footer: 'Total',
          widthMode: 'dynamic',
          minWidth: 180,
          maxWidth: null,
          flex: 2,
        },
        {
          ...defaults.columns[1]!,
          id: 'customer-id',
          header: 'ID',
          fieldPath: '/id',
          cellKind: 'button',
          footer: '',
          widthMode: 'fixed',
          width: 96,
          headerAlign: 'end',
          cellAlign: 'end',
        },
        {
          ...defaults.columns[2]!,
          id: 'customer-active',
          header: 'Active',
          fieldPath: '/active',
          cellKind: 'checkbox',
          footer: '',
        },
      ],
    };
    const apiPage = pageWithApiClientConfiguration(apiConfiguration);
    const root = apiPage.components[0];
    if (root === undefined) throw new Error('Expected a page root.');
    const page: PageModel = {
      ...apiPage,
      components: [
        { ...root, children: [...root.children, 'data-grid'] },
        ...apiPage.components.slice(1),
        {
          id: 'data-grid',
          type: 'WebDataGrid',
          name: 'DataGrid1',
          parentId: root.id,
          layout: createDefaultComponentLayout(),
          bounds: { x: 20, y: 40, width: 640, height: 320 },
          props: { dataGridConfig: dataGridConfiguration },
          events: {},
          children: [],
        },
      ],
    };

    expect(DataGridConfigurationSchema.safeParse(dataGridConfiguration).success).toBe(true);
    expect(safeParsePage(page).success).toBe(true);
    expect(
      deserializePage(serializePage(page)).components.find(
        (component) => component.id === 'data-grid',
      )?.props,
    ).toEqual({ dataGridConfig: dataGridConfiguration });
  });

  it('upgrades strict v1 Data Grid bindings without losing their stable column IDs', () => {
    const legacy = {
      schemaVersion: 1,
      apiClientId: 'api-client',
      operationId: 'operation-customers',
      listPath: '/customers',
      columnCount: 1,
      showHeader: true,
      stickyHeader: true,
      showFooter: false,
      stickyFooter: true,
      columns: [
        {
          id: 'customer-name',
          header: 'Customer',
          fieldPath: '/name',
          cellKind: 'text',
          footer: '',
        },
      ],
    };

    expect(DataGridConfigurationSchema.safeParse(legacy).success).toBe(true);
    expect(parseDataGridConfiguration(legacy)).toMatchObject({
      schemaVersion: 2,
      apiClientId: 'api-client',
      operationId: 'operation-customers',
      listPath: '/customers',
      rowHeightMode: 'dynamic',
      columns: [
        {
          id: 'customer-name',
          widthMode: 'dynamic',
          minWidth: 96,
          flex: 1,
        },
      ],
    });
  });

  it('materializes a v2 Data Grid configuration when a page contains a v1 binding', () => {
    const legacy = {
      schemaVersion: 1,
      apiClientId: 'api-client',
      operationId: 'operation-customers',
      listPath: '/customers',
      columnCount: 1,
      showHeader: true,
      stickyHeader: true,
      showFooter: false,
      stickyFooter: true,
      columns: [
        {
          id: 'customer-name',
          header: 'Customer',
          fieldPath: '/name',
          cellKind: 'text',
          footer: '',
        },
      ],
    };
    const apiPage = pageWithApiClientConfiguration(validConfiguration());
    const root = apiPage.components[0];
    if (root === undefined) throw new Error('Expected a page root.');
    const page: PageModel = {
      ...apiPage,
      components: [
        { ...root, children: [...root.children, 'data-grid'] },
        ...apiPage.components.slice(1),
        {
          id: 'data-grid',
          type: 'WebDataGrid',
          name: 'DataGrid1',
          parentId: root.id,
          layout: createDefaultComponentLayout(),
          bounds: { x: 20, y: 40, width: 640, height: 320 },
          props: { dataGridConfig: legacy },
          events: {},
          children: [],
        },
      ],
    };

    const expected = parseDataGridConfiguration(legacy);
    const parsed = safeParsePage(page);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(
      parsed.data.components.find((component) => component.id === 'data-grid')?.props
        .dataGridConfig,
    ).toEqual(expected);
    expect(
      deserializePage(JSON.stringify(page)).components.find(
        (component) => component.id === 'data-grid',
      )?.props.dataGridConfig,
    ).toEqual(expected);
    expect(
      deserializePage(serializePage(page)).components.find(
        (component) => component.id === 'data-grid',
      )?.props.dataGridConfig,
    ).toEqual(expected);
  });

  it('rejects Data Grid dimensions whose maximum is below its minimum', () => {
    const defaults = createDefaultDataGridConfiguration();
    expect(
      DataGridConfigurationSchema.safeParse({
        ...defaults,
        minRowHeight: 60,
        maxRowHeight: 40,
      }).success,
    ).toBe(false);
    expect(
      DataGridConfigurationSchema.safeParse({
        ...defaults,
        columns: [
          {
            ...defaults.columns[0]!,
            minWidth: 180,
            maxWidth: 120,
          },
          ...defaults.columns.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects invalid operation identities and invalid response-schema trees', () => {
    const duplicateOperation = {
      ...validConfiguration(),
      operations: [
        ...validConfiguration().operations,
        { ...validConfiguration().operations[0]!, id: 'operation-customers' },
      ],
    };
    const duplicateResult = ApiClientConfigurationSchema.safeParse(duplicateOperation);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(
        duplicateResult.error.issues.some((issue) =>
          issue.message.includes('Duplicate API operation'),
        ),
      ).toBe(true);
    }

    const malformedTree = {
      ...validConfiguration(),
      operations: [
        {
          ...validConfiguration().operations[0]!,
          responseSchema: {
            version: 1,
            root: {
              id: 'root',
              name: 'Response',
              path: '',
              kind: 'field',
              fieldType: 'string',
              nullable: false,
              children: [
                {
                  id: 'child',
                  name: 'unexpected',
                  path: '/unexpected',
                  kind: 'field',
                  fieldType: 'string',
                  nullable: false,
                  children: [],
                },
              ],
            },
          },
        },
      ],
    };

    expect(ApiClientConfigurationSchema.safeParse(malformedTree).success).toBe(false);

    const pageResult = safeParsePage(pageWithApiClientConfiguration(malformedTree));
    expect(pageResult.success).toBe(false);
    if (!pageResult.success) {
      expect(
        pageResult.error.issues.some(
          (issue) =>
            issue.path.join('.') ===
              'components.1.props.apiClientConfig.operations.0.responseSchema.root.children' ||
            issue.message.includes('field node cannot have children'),
        ),
      ).toBe(true);
    }
  });
});
