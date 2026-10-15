// @vitest-environment jsdom
import { componentRegistry } from '@webrad/component-registry';
import {
  createDefaultReportTemplate,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { comboBoxApiConfiguration } from '../../../../../tests/fixtures/combo-box';
import { reportBuilderTemplate } from '../../../../../tests/fixtures/report-builder';
import { ReportBuilderDialog } from './ReportBuilderDialog';
import { ObjectInspector } from './ObjectInspector';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixture(template: WebReportTemplate = createDefaultReportTemplate()) {
  const component = componentRegistry.createComponent('WebReportBuilder', {
    id: 'report',
    name: 'ReportBuilder1',
    parentId: 'root',
    props: { reportTemplate: template },
  });
  const client = componentRegistry.createComponent('WebApiClient', {
    id: 'customers-api',
    name: 'ApiClient1',
    parentId: 'root',
    props: { apiClientConfig: comboBoxApiConfiguration() },
  });
  return { component, components: [component, client] };
}

function dragReportComponent(
  type: 'text' | 'image' | 'line' | 'repeater',
  target: Element = document.querySelectorAll('.wr-report-band')[2]!,
  x = 0,
  y = 0,
): void {
  const palette = screen.getByRole('button', { name: `Add report ${type}` });
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: '',
    setData: (key: string, value: string) => values.set(key, value),
    getData: (key: string) => values.get(key) ?? '',
  };
  fireEvent.dragStart(palette, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  const event = createEvent.drop(target, { dataTransfer });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  fireEvent(target, event);
  fireEvent.dragEnd(palette, { dataTransfer });
}

it('opens the registry action from the Inspector and saves one isolated report draft', async () => {
  const { component, components } = fixture();
  const action = vi.fn();
  const inspector = render(
    <ObjectInspector
      selection={[component]}
      availableComponents={components}
      onPropertyChange={vi.fn()}
      onEventChange={vi.fn()}
      onEventDoubleClick={vi.fn()}
      onDesignerAction={action}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open Report Builder' }));
  expect(action).toHaveBeenCalledWith(
    'report-builder',
    component,
    expect.objectContaining({ name: 'reportTemplate' }),
  );
  inspector.unmount();
  const onSave = vi.fn();
  render(
    <StrictMode>
      <ReportBuilderDialog
        component={component}
        availableComponents={components}
        onSave={onSave}
        onClose={vi.fn()}
      />
    </StrictMode>,
  );
  await user.click(screen.getByRole('button', { name: 'Add report text' }));
  expect(screen.queryByLabelText('Report text')).toBeNull();
  expect(screen.getByRole('button', { name: 'Undo report edit' })).toHaveProperty('disabled', true);
  dragReportComponent('text');
  const text = screen.getByLabelText('Report text');
  await user.clear(text);
  await user.type(text, 'Annual statement');
  expect(onSave).not.toHaveBeenCalled();
  expect(
    (component.props.reportTemplate as WebReportTemplate).bands.find(
      (band) => band.kind === 'detail',
    )?.elements,
  ).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledOnce();
  expect(
    onSave.mock.calls[0]?.[0].bands.find((band: { kind: string }) => band.kind === 'detail')
      .elements[0],
  ).toMatchObject({ type: 'text', value: { kind: 'static', value: 'Annual statement' } });
});

it('binds a single repeated row to saved API responses and exposes its fields', async () => {
  const { component, components } = fixture();
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  dragReportComponent('repeater');
  expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', true);
  await user.selectOptions(screen.getByLabelText('Report API Client'), 'customers-api');
  expect(screen.getByLabelText('Report response list')).toHaveProperty('value', '/customers');
  await user.click(screen.getByRole('button', { name: 'Edit row template' }));
  const row = screen.getByRole('button', { name: 'Select Repeater' });
  dragReportComponent('repeater', row);
  expect(document.querySelectorAll('.wr-report-element-repeater')).toHaveLength(1);
  dragReportComponent('text', row);
  await user.selectOptions(screen.getByLabelText('Report value source'), 'row');
  await user.selectOptions(screen.getByLabelText('Report row field'), '/name');
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      bands: expect.arrayContaining([
        expect.objectContaining({
          kind: 'detail',
          elements: [
            expect.objectContaining({
              type: 'repeater',
              source: {
                apiClientId: 'customers-api',
                operationId: 'load-customers',
                listPath: '/customers',
              },
              children: [
                expect.objectContaining({ type: 'text', value: { kind: 'row', path: '/name' } }),
              ],
            }),
          ],
        }),
      ]),
    }),
  );
});

it('renames parameters without breaking element bindings and keeps typed defaults', async () => {
  const { component, components } = fixture(reportBuilderTemplate());
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('tab', { name: 'Parameters (1)' }));
  const name = screen.getByLabelText('Parameter 1 name');
  await user.clear(name);
  await user.type(name, 'Heading');
  await user.click(screen.getByRole('button', { name: 'Add parameter' }));
  await user.selectOptions(screen.getByLabelText('Parameter 2 type'), 'number');
  fireEvent.change(screen.getByLabelText('Parameter 2 default'), { target: { value: '42.5' } });
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  const saved = onSave.mock.calls[0]?.[0] as WebReportTemplate;
  expect(saved.parameters).toEqual([
    { name: 'Heading', type: 'string', defaultValue: 'Clientes' },
    { name: 'Parameter2', type: 'number', defaultValue: 42.5 },
  ]);
  expect(saved.bands.find((band) => band.kind === 'title')?.elements[0]).toMatchObject({
    value: { kind: 'parameter', name: 'Heading' },
  });
});

it('drops into the hovered band at the current zoom with one undoable insertion', async () => {
  const { component, components } = fixture();
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Report canvas zoom'), { target: { value: '0.5' } });
  const title = document.querySelector('.wr-report-band')!;
  dragReportComponent('text', title, 15, 4.5);
  expect(screen.getByLabelText('Report x (mm)')).toHaveProperty('value', '10');
  expect(screen.getByLabelText('Report y (mm)')).toHaveProperty('value', '3');
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.queryByRole('button', { name: 'Select Text' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Redo report edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  const saved = onSave.mock.calls[0]?.[0] as WebReportTemplate;
  expect(saved.bands.find((band) => band.kind === 'detail')?.elements).toEqual([]);
  expect(saved.bands.find((band) => band.kind === 'title')?.elements.at(-1)).toMatchObject({
    type: 'text',
    x: 10,
    y: 3,
  });
});

it('cancels palette drags and rejects repeater drops on page headers', () => {
  const { component, components } = fixture();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const palette = screen.getByRole('button', { name: 'Add report image' });
  fireEvent.dragStart(palette, { dataTransfer: { setData: vi.fn() } });
  fireEvent.dragEnd(palette);
  expect(document.querySelector('.wr-report-element-image')).toBeNull();
  dragReportComponent('repeater', document.querySelectorAll('.wr-report-band')[1]!);
  expect(document.querySelector('.wr-report-element-repeater')).toBeNull();
  expect(screen.getByRole('button', { name: 'Undo report edit' })).toHaveProperty('disabled', true);
  dragReportComponent('image', undefined, 10000, 10000);
  expect(screen.getByLabelText('Report x (mm)')).toHaveProperty('value', '150');
  expect(screen.getByLabelText('Report y (mm)')).toHaveProperty('value', '10');
  dragReportComponent('line');
  expect(document.querySelectorAll('.wr-report-element-line')).toHaveLength(1);
});

it('validates geometry, supports undo and discards the draft when canceled', async () => {
  const { component, components } = fixture();
  const user = userEvent.setup();
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  dragReportComponent('text');
  fireEvent.change(screen.getByLabelText('Report width (mm)'), { target: { value: '500' } });
  expect(screen.getByRole('alert').textContent).toContain('geometry exceeds');
  expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', true);
  await user.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.getByLabelText('Report width (mm)')).toHaveProperty('value', '60');
  expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', false);
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it('imports external JSON through a URL and preserves the draft when import fails', async () => {
  const { component, components } = fixture();
  const user = userEvent.setup();
  const onSave = vi.fn();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      text: async () => '{"schemaVersion":999}',
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ ...createDefaultReportTemplate(), name: 'External invoice' }),
    });
  vi.stubGlobal('fetch', fetch);
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Import URL' }));
  await user.type(screen.getByLabelText('Report template URL'), 'https://example.com/invoice.json');
  await user.click(screen.getByRole('button', { name: 'Load template' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('only version 1'));
  expect(screen.getByLabelText('Report template name')).toHaveProperty(
    'value',
    createDefaultReportTemplate().name,
  );
  expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', false);
  await user.click(screen.getByRole('button', { name: 'Load template' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Report template name')).toHaveProperty(
      'value',
      'External invoice',
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'External invoice' }));
});

it('imports a chosen template file as an undoable model change', async () => {
  const { component, components } = fixture();
  const user = userEvent.setup();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const file = new File(['{}'], 'saved.report.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', {
    value: async () => JSON.stringify({ ...createDefaultReportTemplate(), name: 'Saved template' }),
  });
  await user.upload(screen.getByLabelText('Import report template file'), file);
  await waitFor(() =>
    expect(screen.getByLabelText('Report template name')).toHaveProperty('value', 'Saved template'),
  );
  await user.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.getByLabelText('Report template name')).toHaveProperty(
    'value',
    createDefaultReportTemplate().name,
  );
});

it('imports and saves portable API names while showing resolved clients, operations and row fields', async () => {
  const source = reportBuilderTemplate();
  const template: WebReportTemplate = {
    ...source,
    name: 'Portable report',
    bands: source.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) =>
        element.type === 'repeater'
          ? {
              ...element,
              source: { ...element.source, apiClientId: 'ApiClient1', operationId: 'Load' },
            }
          : band.kind === 'title' && element.type === 'text'
            ? {
                ...element,
                name: 'Company',
                value: {
                  kind: 'field' as const,
                  apiClientId: 'ApiClient1',
                  operationId: 'Load',
                  path: '/company',
                },
              }
            : element,
      ),
    })),
  };
  const original = fixture();
  const configuration = comboBoxApiConfiguration();
  const components = original.components.map((component) =>
    component.type !== 'WebApiClient'
      ? component
      : {
          ...component,
          props: {
            ...component.props,
            apiClientConfig: {
              ...configuration,
              operations: configuration.operations.map((operation) => ({
                ...operation,
                responseSchema: {
                  ...operation.responseSchema,
                  root: {
                    ...operation.responseSchema.root,
                    children: [
                      ...operation.responseSchema.root.children,
                      {
                        id: 'company-field',
                        name: 'company',
                        path: '/company',
                        kind: 'field',
                        fieldType: 'string',
                        nullable: false,
                        children: [],
                      },
                    ],
                  },
                },
              })),
            },
          },
        },
  );
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={original.component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  const file = new File(['{}'], 'portable.report.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(template) });
  await user.upload(screen.getByLabelText('Import report template file'), file);
  await waitFor(() =>
    expect(screen.getByLabelText('Report template name')).toHaveProperty(
      'value',
      'Portable report',
    ),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: 'Select Customers' }));
  expect(screen.getByLabelText('Report API Client')).toHaveProperty('value', 'customers-api');
  expect(screen.getByLabelText('Report operation')).toHaveProperty('value', 'load-customers');
  expect(screen.getByLabelText('Report response list')).toHaveProperty('value', '/customers');
  fireEvent.click(screen.getByRole('button', { name: 'Select Customer name' }));
  expect(screen.getByLabelText('Report row field')).toHaveProperty('value', '/name');
  fireEvent.click(screen.getByRole('button', { name: 'Select Company' }));
  expect(screen.getByLabelText('Report API Client')).toHaveProperty('value', 'customers-api');
  expect(screen.getByLabelText('Report operation')).toHaveProperty('value', 'load-customers');
  expect(screen.getByLabelText('Report response field')).toHaveProperty('value', '/company');
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledWith(template);
});
