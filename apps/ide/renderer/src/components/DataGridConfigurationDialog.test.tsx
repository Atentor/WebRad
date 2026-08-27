// @vitest-environment jsdom

import {
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  createDefaultDataGridConfiguration,
  type ComponentNode,
  type DataGridConfiguration,
} from '@webrad/project-model';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataGridConfigurationDialog } from './DataGridConfigurationDialog';

function createDataGridComponent(
  configuration: DataGridConfiguration = createDefaultDataGridConfiguration(),
): ComponentNode {
  return {
    id: 'data-grid-1',
    type: 'WebDataGrid',
    name: 'DataGrid1',
    parentId: null,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width: 640, height: 320 },
    props: { dataGridConfig: configuration },
    events: {},
    children: [],
  };
}

function createApiClientComponent(): ComponentNode {
  const configuration = createDefaultApiClientConfiguration();
  const operation = configuration.operations[0];
  if (operation === undefined) throw new Error('Expected a default API operation.');
  return {
    id: 'api-client-1',
    type: 'WebApiClient',
    name: 'ApiClient1',
    parentId: null,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width: 112, height: 52 },
    props: {
      apiClientConfig: {
        ...configuration,
        operations: [
          {
            ...operation,
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
                    id: 'customers',
                    name: 'customers',
                    path: '/customers',
                    kind: 'list',
                    fieldType: 'list',
                    nullable: false,
                    children: [
                      {
                        id: 'customer-name',
                        name: 'name',
                        path: '/customers/*/name',
                        kind: 'field',
                        fieldType: 'string',
                        nullable: false,
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 'orders',
                    name: 'orders',
                    path: '/orders',
                    kind: 'list',
                    fieldType: 'list',
                    nullable: false,
                    children: [
                      {
                        id: 'order-code',
                        name: 'code',
                        path: '/orders/*/code',
                        kind: 'field',
                        fieldType: 'string',
                        nullable: false,
                        children: [],
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
}

async function replaceNumber(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
): Promise<void> {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

afterEach(() => {
  cleanup();
});

describe('DataGridConfigurationDialog', () => {
  it('saves mixed column widths and both fixed and dynamic row sizing values', async () => {
    const onSave = vi.fn();
    render(
      <DataGridConfigurationDialog
        availableComponents={[]}
        component={createDataGridComponent()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Width mode for Data Grid column 1'), 'fixed');
    await replaceNumber(user, 'Fixed width for Data Grid column 1', '240');
    await user.selectOptions(screen.getByLabelText('Width mode for Data Grid column 2'), 'dynamic');
    await replaceNumber(user, 'Minimum width for Data Grid column 2', '120');
    await replaceNumber(user, 'Maximum width for Data Grid column 2', '320');
    await replaceNumber(user, 'Flex grow for Data Grid column 2', '2.5');
    await user.selectOptions(
      screen.getByLabelText('Header alignment for Data Grid column 1'),
      'center',
    );
    await user.selectOptions(screen.getByLabelText('Cell alignment for Data Grid column 2'), 'end');

    await user.selectOptions(screen.getByLabelText('Data Grid row height mode'), 'fixed');
    await replaceNumber(user, 'Fixed Data Grid row height', '52');
    await user.selectOptions(screen.getByLabelText('Data Grid row height mode'), 'dynamic');
    await replaceNumber(user, 'Minimum Data Grid row height', '44');
    await replaceNumber(user, 'Maximum Data Grid row height', '88');

    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved).toMatchObject({
      rowHeightMode: 'dynamic',
      fixedRowHeight: 52,
      minRowHeight: 44,
      maxRowHeight: 88,
    });
    expect(saved.columns[0]).toMatchObject({
      widthMode: 'fixed',
      width: 240,
      headerAlign: 'center',
    });
    expect(saved.columns[1]).toMatchObject({
      widthMode: 'dynamic',
      minWidth: 120,
      maxWidth: 320,
      flex: 2.5,
      cellAlign: 'end',
    });
  });

  it('adds, reorders, and removes columns before saving one coherent draft', async () => {
    const onSave = vi.fn();
    render(
      <DataGridConfigurationDialog
        availableComponents={[]}
        component={createDataGridComponent()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Add column' }));
    await user.clear(screen.getByLabelText('Header for Data Grid column 4'));
    await user.type(screen.getByLabelText('Header for Data Grid column 4'), 'Priority');
    await user.click(screen.getByRole('button', { name: 'Move Data Grid column 4 up' }));
    await user.click(screen.getByRole('button', { name: 'Remove Data Grid column 4' }));
    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved.columnCount).toBe(3);
    expect(saved.columns.map((column) => column.header)).toEqual([
      'Column 1',
      'Column 2',
      'Priority',
    ]);
  });

  it('offers and saves fixed captions for button and checkbox columns', async () => {
    const onSave = vi.fn();
    render(
      <DataGridConfigurationDialog
        availableComponents={[]}
        component={createDataGridComponent()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();

    expect(screen.queryByLabelText('Fixed caption for Data Grid column 1')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Cell type for Data Grid column 1'), 'button');
    await user.type(screen.getByLabelText('Fixed caption for Data Grid column 1'), 'View');
    await user.selectOptions(screen.getByLabelText('Cell type for Data Grid column 2'), 'checkbox');
    await user.type(screen.getByLabelText('Fixed caption for Data Grid column 2'), 'Enabled');
    expect(screen.queryByLabelText('Fixed caption for Data Grid column 3')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved.columns[0]).toMatchObject({ cellKind: 'button', fixedCaption: 'View' });
    expect(saved.columns[1]).toMatchObject({ cellKind: 'checkbox', fixedCaption: 'Enabled' });
    expect(saved.columns[2]?.fixedCaption).toBe('');
  });

  it('clears field bindings that do not exist in a newly selected response list', async () => {
    const defaults = createDefaultDataGridConfiguration();
    const onSave = vi.fn();
    render(
      <DataGridConfigurationDialog
        availableComponents={[createApiClientComponent()]}
        component={createDataGridComponent({
          ...defaults,
          apiClientId: 'api-client-1',
          operationId: 'operation-1',
          listPath: '/customers',
          columns: defaults.columns.map((column, index) =>
            index === 0 ? { ...column, fieldPath: '/name' } : column,
          ),
        })}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Data Grid response list'), '/orders');
    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved.listPath).toBe('/orders');
    expect(saved.columns[0]?.fieldPath).toBe('');
  });

  it('discards the local draft when canceled or dismissed with Escape', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const first = render(
      <DataGridConfigurationDialog
        availableComponents={[]}
        component={createDataGridComponent()}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Data Grid empty-state message'), ' — draft only');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    first.unmount();
    render(
      <DataGridConfigurationDialog
        availableComponents={[]}
        component={createDataGridComponent()}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});
