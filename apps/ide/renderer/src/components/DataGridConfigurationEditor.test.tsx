// @vitest-environment jsdom

import {
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  createDefaultDataGridConfiguration,
  type ComponentNode,
  type DataGridConfiguration,
} from '@webrad/project-model';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { DataGridConfigurationEditor } from './DataGridConfigurationEditor';

const apiDefaults = createDefaultApiClientConfiguration();
const request = apiDefaults.operations[0];
if (request === undefined) throw new Error('Expected a default API operation.');

const apiClient: ComponentNode = {
  id: 'api-client',
  type: 'WebApiClient',
  name: 'CustomersApi',
  parentId: null,
  layout: createDefaultComponentLayout(),
  bounds: { x: 0, y: 0, width: 112, height: 52 },
  props: {
    baseUrl: 'https://api.example.test',
    apiClientConfig: {
      ...apiDefaults,
      operations: [
        {
          ...request,
          id: 'load-customers',
          name: 'LoadCustomers',
          path: '/customers',
          responseSchema: {
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
                  id: 'payload',
                  name: 'payload',
                  path: '/payload',
                  kind: 'object',
                  fieldType: 'object',
                  nullable: false,
                  children: [
                    {
                      id: 'customers',
                      name: 'customers',
                      path: '/payload/customers',
                      kind: 'list',
                      fieldType: 'list',
                      nullable: false,
                      children: [
                        {
                          id: 'name',
                          name: 'name',
                          path: '/payload/customers/*/name',
                          kind: 'field',
                          fieldType: 'string',
                          nullable: false,
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  },
  events: {},
  children: [],
};

function EditorHarness(): ReactElement {
  const [value, setValue] = useState<DataGridConfiguration>(createDefaultDataGridConfiguration());
  return (
    <DataGridConfigurationEditor
      availableComponents={[apiClient]}
      id="data-grid-config"
      onChange={setValue}
      value={value}
    />
  );
}

describe('DataGridConfigurationEditor', () => {
  it('selects an API operation, a nested response list, and item-relative dynamic fields', async () => {
    render(<EditorHarness />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Data Grid API Client'), 'api-client');
    await user.selectOptions(screen.getByLabelText('Data Grid endpoint'), 'load-customers');
    await user.selectOptions(
      screen.getByLabelText('Data Grid response list'),
      '/payload/customers',
    );
    await user.selectOptions(
      screen.getByLabelText('Dynamic field for Data Grid column 1'),
      '/name',
    );
    await user.selectOptions(
      screen.getByLabelText('Cell component for Data Grid column 1'),
      'button',
    );

    expect((screen.getByLabelText('Data Grid response list') as HTMLSelectElement).value).toBe(
      '/payload/customers',
    );
    expect(
      (screen.getByLabelText('Dynamic field for Data Grid column 1') as HTMLSelectElement).value,
    ).toBe('/name');
    expect(
      (screen.getByLabelText('Cell component for Data Grid column 1') as HTMLSelectElement).value,
    ).toBe('button');
    expect((screen.getByLabelText('Keep header fixed') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Keep footer fixed') as HTMLInputElement).disabled).toBe(true);
  });
});
