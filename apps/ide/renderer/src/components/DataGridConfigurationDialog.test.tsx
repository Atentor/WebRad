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
import { StrictMode } from 'react';
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

function createApiClientComponent(includeWholeItemField = false): ComponentNode {
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
                      ...(includeWholeItemField
                        ? [
                            {
                              id: 'customer-item',
                              name: 'Customer item',
                              path: '/customers/*',
                              kind: 'field' as const,
                              fieldType: 'string' as const,
                              nullable: false,
                              children: [],
                            },
                          ]
                        : []),
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
  it.each([
    ['Show Data Grid header', 'showHeader'],
    ['Keep Data Grid header fixed', 'stickyHeader'],
    ['Show Data Grid footer', 'showFooter'],
    ['Keep Data Grid footer fixed', 'stickyFooter'],
    ['Wrap Data Grid text', 'wrapText'],
    ['Stripe Data Grid rows', 'stripedRows'],
    ['Show Data Grid horizontal lines', 'showHorizontalLines'],
    ['Show Data Grid vertical lines', 'showVerticalLines'],
  ] as const)('repeatedly toggles %s while editing the local draft', async (label, property) => {
    const configuration = {
      ...createDefaultDataGridConfiguration(),
      showHeader: true,
      showFooter: true,
    };
    const initialValue = configuration[property];
    const onSave = vi.fn();
    render(
      <StrictMode>
        <DataGridConfigurationDialog
          availableComponents={[]}
          component={createDataGridComponent(configuration)}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </StrictMode>,
    );
    const user = userEvent.setup();
    const toggle = screen.getByRole('checkbox', { name: label });

    for (let index = 0; index < 3; index += 1) {
      await user.type(screen.getByLabelText('Data Grid empty-state message'), String(index));
      await user.click(toggle);
      expect(toggle).toHaveProperty('checked', index % 2 === 0 ? !initialValue : initialValue);
      expect(screen.getByRole('dialog', { name: 'Configure Data Grid' })).toBeDefined();
      expect(onSave).not.toHaveBeenCalled();
    }

    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      [property]: !initialValue,
      emptyMessage: `${configuration.emptyMessage}012`,
    });
    expect(configuration[property]).toBe(initialValue);
    expect(configuration.emptyMessage).toBe('No data');
  });

  it('preserves sticky settings while header and footer controls are disabled and enabled', async () => {
    const onSave = vi.fn();
    render(
      <StrictMode>
        <DataGridConfigurationDialog
          availableComponents={[]}
          component={createDataGridComponent()}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </StrictMode>,
    );
    const user = userEvent.setup();
    const header = screen.getByRole('checkbox', { name: 'Show Data Grid header' });
    const stickyHeader = screen.getByRole('checkbox', { name: 'Keep Data Grid header fixed' });
    const footer = screen.getByRole('checkbox', { name: 'Show Data Grid footer' });
    const stickyFooter = screen.getByRole('checkbox', { name: 'Keep Data Grid footer fixed' });

    expect(stickyFooter).toHaveProperty('disabled', true);
    expect(stickyFooter).toHaveProperty('checked', true);
    await user.click(header);
    expect(stickyHeader).toHaveProperty('disabled', true);
    expect(stickyHeader).toHaveProperty('checked', true);
    await user.click(header);
    expect(stickyHeader).toHaveProperty('disabled', false);
    await user.click(stickyHeader);

    await user.click(footer);
    expect(stickyFooter).toHaveProperty('disabled', false);
    await user.click(stickyFooter);
    for (let index = 0; index < 2; index += 1) {
      await user.click(header);
      expect(stickyHeader).toHaveProperty('disabled', true);
      await user.click(header);
      expect(stickyHeader).toHaveProperty('checked', false);
      await user.click(footer);
      expect(stickyFooter).toHaveProperty('disabled', true);
      await user.click(footer);
      expect(stickyFooter).toHaveProperty('checked', false);
    }

    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      showHeader: true,
      stickyHeader: false,
      showFooter: true,
      stickyFooter: false,
    });
  });

  it('retains sizes and column content across repeated mode changes and appearance updates', async () => {
    const configuration = createDefaultDataGridConfiguration();
    const onSave = vi.fn();
    render(
      <StrictMode>
        <DataGridConfigurationDialog
          availableComponents={[]}
          component={createDataGridComponent(configuration)}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </StrictMode>,
    );
    const user = userEvent.setup();
    const rowMode = screen.getByLabelText('Data Grid row height mode');
    const columnMode = screen.getByLabelText('Width mode for Data Grid column 1');
    const cellKind = screen.getByLabelText('Cell type for Data Grid column 1');

    await user.selectOptions(rowMode, 'fixed');
    await replaceNumber(user, 'Fixed Data Grid row height', '52');
    await user.selectOptions(rowMode, 'dynamic');
    await replaceNumber(user, 'Minimum Data Grid row height', '44');
    await replaceNumber(user, 'Maximum Data Grid row height', '88');
    await user.selectOptions(columnMode, 'fixed');
    await replaceNumber(user, 'Fixed width for Data Grid column 1', '240');
    await user.selectOptions(columnMode, 'dynamic');
    await replaceNumber(user, 'Minimum width for Data Grid column 1', '120');
    await replaceNumber(user, 'Maximum width for Data Grid column 1', '320');
    await user.selectOptions(cellKind, 'button');
    await user.type(screen.getByLabelText('Fixed caption for Data Grid column 1'), 'View customer');
    await user.type(screen.getByLabelText('Footer for Data Grid column 1'), 'Total');

    for (let index = 0; index < 2; index += 1) {
      await user.selectOptions(rowMode, 'fixed');
      expect(screen.getByLabelText('Fixed Data Grid row height')).toHaveProperty('value', '52');
      await user.selectOptions(rowMode, 'dynamic');
      expect(screen.getByLabelText('Minimum Data Grid row height')).toHaveProperty('value', '44');
      expect(screen.getByLabelText('Maximum Data Grid row height')).toHaveProperty('value', '88');
      await user.selectOptions(columnMode, 'fixed');
      expect(screen.getByLabelText('Fixed width for Data Grid column 1')).toHaveProperty(
        'value',
        '240',
      );
      await user.selectOptions(columnMode, 'dynamic');
      expect(screen.getByLabelText('Minimum width for Data Grid column 1')).toHaveProperty(
        'value',
        '120',
      );
      expect(screen.getByLabelText('Maximum width for Data Grid column 1')).toHaveProperty(
        'value',
        '320',
      );
      await user.selectOptions(cellKind, 'text');
      expect(screen.queryByLabelText('Fixed caption for Data Grid column 1')).toBeNull();
      await user.click(screen.getByRole('checkbox', { name: 'Wrap Data Grid text' }));
      await user.selectOptions(cellKind, 'checkbox');
      expect(screen.getByLabelText('Fixed caption for Data Grid column 1')).toHaveProperty(
        'value',
        'View customer',
      );
      await user.selectOptions(cellKind, 'button');
    }

    await user.click(screen.getByRole('button', { name: 'Move Data Grid column 1 down' }));
    await user.click(screen.getByRole('button', { name: 'Remove Data Grid column 1' }));
    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved).toMatchObject({
      rowHeightMode: 'dynamic',
      fixedRowHeight: 52,
      minRowHeight: 44,
      maxRowHeight: 88,
      columnCount: 2,
      wrapText: configuration.wrapText,
    });
    expect(saved.columns[0]).toMatchObject({
      id: configuration.columns[0]?.id,
      cellKind: 'button',
      fixedCaption: 'View customer',
      footer: 'Total',
      widthMode: 'dynamic',
      width: 240,
      minWidth: 120,
      maxWidth: 320,
    });
    expect(saved.columns[1]?.id).toBe(configuration.columns[2]?.id);
  });
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

  it('keeps one explicit no-field choice selectable for a bound response list', async () => {
    const defaults = createDefaultDataGridConfiguration();
    const onSave = vi.fn();
    render(
      <DataGridConfigurationDialog
        availableComponents={[createApiClientComponent(true)]}
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
    const field = screen.getByLabelText(
      'Dynamic field for Data Grid column 1',
    ) as HTMLSelectElement;

    expect([...field.options].filter((option) => option.value.length === 0)).toHaveLength(1);
    expect(screen.getAllByRole('option', { name: '(no field)' })).toHaveLength(3);
    await user.selectOptions(field, '');
    expect(field.value).toBe('');

    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));
    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved.columns[0]?.fieldPath).toBe('');
  });

  it('offers an optional icon picker only for button columns', async () => {
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

    expect(screen.queryByLabelText('Button icon for Data Grid column 1')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Cell type for Data Grid column 1'), 'button');
    await user.selectOptions(screen.getByLabelText('Cell type for Data Grid column 2'), 'checkbox');
    expect(screen.queryByLabelText('Button icon for Data Grid column 2')).toBeNull();

    const iconPicker = screen.getByLabelText('Button icon for Data Grid column 1');
    expect(iconPicker.textContent).toContain('Choose icon');
    await user.click(iconPicker);
    expect(screen.getByRole('dialog', { name: 'Choose an icon' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'No icon' })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('button', { name: 'Select Save icon' }));
    expect(screen.queryByRole('dialog', { name: 'Choose an icon' })).toBeNull();
    expect(iconPicker.textContent).toContain('Save');

    await user.click(iconPicker);
    await user.click(screen.getByRole('button', { name: 'No icon' }));
    expect(iconPicker.textContent).toContain('Choose icon');

    await user.click(iconPicker);
    await user.click(screen.getByRole('button', { name: 'Select Add icon' }));
    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    const saved = onSave.mock.calls[0]?.[0] as DataGridConfiguration;
    expect(saved.columns[0]).toMatchObject({ cellKind: 'button', buttonIcon: 'add' });
    expect(saved.columns[1]).toMatchObject({ cellKind: 'checkbox', buttonIcon: null });
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
  it('restores required numeric inputs after clearing while optional limits remain empty', async () => {
    const configuration = {
      ...createDefaultDataGridConfiguration(),
      minRowHeight: 44,
      maxRowHeight: 88,
    };
    const onSave = vi.fn();
    render(
      <StrictMode>
        <DataGridConfigurationDialog
          availableComponents={[]}
          component={createDataGridComponent(configuration)}
          onClose={vi.fn()}
          onSave={onSave}
        />
      </StrictMode>,
    );
    const user = userEvent.setup();

    for (const [label, expectedValue] of [
      ['Minimum Data Grid row height', '44'],
      ['Data Grid horizontal cell padding', String(configuration.cellPaddingHorizontal)],
      ['Data Grid vertical cell padding', String(configuration.cellPaddingVertical)],
    ]) {
      if (label === undefined) throw new Error('Expected an input label.');
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.tab();
      expect(input).toHaveProperty('value', expectedValue);
    }

    await user.clear(screen.getByLabelText('Maximum Data Grid row height'));
    await user.tab();
    expect(screen.getByLabelText('Maximum Data Grid row height')).toHaveProperty('value', '');
    await user.click(screen.getByRole('button', { name: 'Save Data Grid' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      minRowHeight: 44,
      maxRowHeight: null,
      cellPaddingHorizontal: configuration.cellPaddingHorizontal,
      cellPaddingVertical: configuration.cellPaddingVertical,
    });
  });
});
