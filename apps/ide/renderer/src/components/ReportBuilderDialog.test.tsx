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
import { nestedReportProject } from '../../../../../tests/fixtures/report-builder-nested';
import { reportGroupProject } from '../../../../../tests/fixtures/report-builder-group';
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
  type: 'text' | 'image' | 'line' | 'repeater' | 'group',
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
  const rowTarget = target.matches('.wr-report-element-group')
    ? target.querySelector(':scope > [data-report-group-content]')!
    : target.matches('.wr-report-element-repeater')
      ? target.querySelector('[data-report-repeater-section="row"]')!
      : target;
  const dropTarget = rowTarget.matches('.wr-report-repeater-section')
    ? rowTarget.querySelector('[data-report-section-column="0"]')!
    : rowTarget;
  fireEvent.dragOver(dropTarget, { dataTransfer });
  const event = createEvent.drop(dropTarget, { dataTransfer });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
  fireEvent(dropTarget, event);
  fireEvent.dragEnd(palette, { dataTransfer });
}

it('authors Group styles and nested contents with local coordinates, undo/redo and stable saved identities', () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Add report group' }));
  expect(screen.queryByRole('button', { name: 'Select Group' })).toBeNull();
  dragReportComponent('group');
  const originalId = screen
    .getByRole('button', { name: 'Select Group' })
    .getAttribute('data-report-element-id');
  fireEvent.click(screen.getByLabelText('Report group background'));
  fireEvent.change(screen.getByLabelText('Report group background color'), {
    target: { value: '#e0f2fe' },
  });
  fireEvent.change(screen.getByLabelText('Report group border color'), {
    target: { value: '#007acc' },
  });
  fireEvent.change(screen.getByLabelText('Report group border style'), {
    target: { value: 'dashed' },
  });
  fireEvent.change(screen.getByLabelText('Report group border width (mm)'), {
    target: { value: '0.5' },
  });
  fireEvent.change(screen.getByLabelText('Report group corner radius (mm)'), {
    target: { value: '3' },
  });
  const content = screen
    .getByRole('button', { name: 'Select Group' })
    .querySelector('[data-report-group-content]')!;
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
    x: 300,
    y: 200,
    left: 300,
    top: 200,
    right: 840,
    bottom: 290,
    width: 540,
    height: 90,
    toJSON: () => ({}),
  });
  dragReportComponent('text', content, 309, 209);
  expect(screen.getByText('Back to group')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Report text'), { target: { value: 'Inside Group' } });
  dragReportComponent('group', content, 300, 200);
  fireEvent.change(screen.getByLabelText('Report element name'), {
    target: { value: 'Inner Group' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.queryByRole('button', { name: 'Select Inner Group' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Redo report edit' }));
  expect(screen.getByRole('button', { name: 'Select Inner Group' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledOnce();
  const template = onSave.mock.calls[0]![0] as WebReportTemplate;
  const group = template.bands.find((band) => band.kind === 'detail')!.elements[0]!;
  expect(group).toMatchObject({
    id: originalId,
    type: 'group',
    appearance: {
      backgroundColor: '#e0f2fe',
      borderColor: '#007acc',
      borderWidth: 0.5,
      borderStyle: 'dashed',
      borderRadius: 3,
    },
  });
  if (group.type !== 'group') throw new Error('Missing Group.');
  expect(group.children).toHaveLength(2);
  expect(group.children[0]).toMatchObject({
    type: 'text',
    x: 8 / 3,
    y: 8 / 3,
    value: { value: 'Inside Group' },
  });
  expect(group.children[1]).toMatchObject({ type: 'group', name: 'Inner Group' });
});

it('retains the enclosing record schema inside Groups and exposes group context in the outline', () => {
  const components = reportGroupProject('https://example.test').pages[0]!.components;
  const component = components.find((item) => item.type === 'WebReportBuilder')!;
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select customer-name' }));
  expect(screen.getByLabelText('Report row field')).toHaveProperty('value', '/name');
  expect(screen.getByText('Inside Record card')).toBeTruthy();
  fireEvent.click(screen.getByText('Back to group'));
  expect(screen.getByRole('button', { name: 'Edit group contents' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit group contents' }));
  expect(screen.getByRole('heading', { name: 'Group contents' })).toBeTruthy();
});

it('edits nested sections, parent-row fields and appearance while preserving undo and saved geometry', () => {
  const components = nestedReportProject('https://example.test').pages[0]!.components;
  const component = components.find((item) => item.type === 'WebReportBuilder')!;
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select Customers' }));
  fireEvent.click(screen.getByLabelText('Report repeater header'));
  expect(screen.getByLabelText('Report repeater header')).toHaveProperty('checked', false);
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.getByLabelText('Report repeater header')).toHaveProperty('checked', true);
  fireEvent.change(screen.getByLabelText('Report columns'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Report repeater background color'), {
    target: { value: '#abcdef' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Select order-header' }));
  expect(screen.getByLabelText('Report row field')).toHaveProperty('value', '/name');
  fireEvent.click(screen.getByRole('button', { name: 'Select order-product' }));
  expect(screen.getByLabelText('Report row field')).toHaveProperty('value', '/product');
  const row = screen
    .getByRole('button', { name: 'Select Orders' })
    .querySelector('[data-report-repeater-section="row"]')!;
  dragReportComponent('repeater', row);
  expect(
    document.querySelectorAll('.wr-report-element-repeater[data-report-primary="true"]'),
  ).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(
    document.querySelectorAll('.wr-report-element-repeater[data-report-primary="true"]'),
  ).toHaveLength(2);
  const header = screen
    .getByRole('button', { name: 'Select Customers' })
    .querySelector('[data-report-repeater-section="header"]')!;
  dragReportComponent('text', header);
  fireEvent.change(screen.getByLabelText('Report text'), {
    target: { value: 'Saved header field' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledOnce();
  const saved = onSave.mock.calls[0]![0] as WebReportTemplate;
  const group = saved.bands[0]!.elements[0]!;
  expect(group).toMatchObject({
    layout: { columns: 3 },
    appearance: { backgroundColor: '#abcdef' },
    header: {
      elements: expect.arrayContaining([
        expect.objectContaining({ value: { kind: 'static', value: 'Saved header field' } }),
      ]),
    },
  });
});

it('authors separate Header/Footer column content, preserves selection across moves and saves each section layout', () => {
  const components = nestedReportProject('https://example.test').pages[0]!.components;
  const component = components.find((item) => item.type === 'WebReportBuilder')!;
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select Customers' }));
  fireEvent.change(screen.getByLabelText('Report header columns'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Report header column gap (mm)'), {
    target: { value: '4' },
  });
  fireEvent.change(screen.getByLabelText('Report footer columns'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Report footer column gap (mm)'), {
    target: { value: '3' },
  });
  const group = screen.getByRole('button', { name: 'Select Customers' });
  dragReportComponent(
    'text',
    group.querySelector(
      ':scope > [data-report-repeater-section="header"] > [data-report-section-column="1"]',
    )!,
  );
  fireEvent.change(screen.getByLabelText('Report text'), {
    target: { value: 'Header right field' },
  });
  expect(screen.getByLabelText('Report section column')).toHaveProperty('value', '1');
  dragReportComponent(
    'text',
    group.querySelector(
      ':scope > [data-report-repeater-section="footer"] > [data-report-section-column="2"]',
    )!,
  );
  fireEvent.change(screen.getByLabelText('Report text'), {
    target: { value: 'Footer right field' },
  });
  fireEvent.change(screen.getByLabelText('Report section column'), { target: { value: '1' } });
  expect(screen.getByLabelText('Report text')).toHaveProperty('value', 'Footer right field');
  expect(screen.getByRole('button', { name: 'Select Text', pressed: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.getByLabelText('Report section column')).toHaveProperty('value', '2');
  fireEvent.click(screen.getByRole('button', { name: 'Redo report edit' }));
  expect(screen.getByLabelText('Report section column')).toHaveProperty('value', '1');
  fireEvent.click(screen.getByRole('button', { name: 'Select Customers' }));
  fireEvent.change(screen.getByLabelText('Report header columns'), {
    target: { value: '1000000' },
  });
  expect(screen.getByRole('alert').textContent).toContain('header.columns');
  expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledOnce();
  const saved = (onSave.mock.calls[0]![0] as WebReportTemplate).bands[0]!.elements[0]!;
  expect(saved).toMatchObject({
    layout: { columns: 2 },
    header: {
      columns: 2,
      columnGap: 4,
      elements: expect.arrayContaining([
        expect.objectContaining({
          column: 1,
          value: { kind: 'static', value: 'Header right field' },
        }),
      ]),
    },
    footer: {
      columns: 3,
      columnGap: 3,
      elements: expect.arrayContaining([
        expect.objectContaining({
          column: 1,
          value: { kind: 'static', value: 'Footer right field' },
        }),
      ]),
    },
  });
});

it('drops into a later record column using local coordinates and edits one shared template with undo/redo', () => {
  const components = nestedReportProject('https://example.test').pages[0]!.components;
  const original = components.find((item) => item.type === 'WebReportBuilder')!;
  const template = original.props.reportTemplate as WebReportTemplate;
  const component = {
    ...original,
    props: {
      ...original.props,
      reportTemplate: {
        ...template,
        bands: template.bands.map((band) => ({
          ...band,
          elements: band.elements.map((element) =>
            element.type !== 'repeater' ? element : { ...element, children: [] },
          ),
        })),
      },
    },
  };
  const onSave = vi.fn();
  render(
    <ReportBuilderDialog
      component={component}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  const cell = screen
    .getByRole('button', { name: 'Select Customers' })
    .querySelector(
      ':scope > [data-report-repeater-section="row"] > [data-report-section-column="1"]',
    )!;
  vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({
    x: 320,
    y: 200,
    left: 320,
    top: 200,
    right: 584,
    bottom: 284,
    width: 264,
    height: 84,
    toJSON: () => ({}),
  });
  dragReportComponent('text', cell, 335, 207);
  expect(Number((screen.getByLabelText('Report x (mm)') as HTMLInputElement).value)).toBeCloseTo(
    16 / 3,
  );
  expect(Number((screen.getByLabelText('Report y (mm)') as HTMLInputElement).value)).toBeCloseTo(
    8 / 3,
  );
  expect(screen.getByRole('button', { name: 'Select Text (column 2)' })).toHaveProperty(
    'ariaPressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Select Text' })).toHaveProperty(
    'ariaPressed',
    'false',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.queryByRole('button', { name: 'Select Text' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Redo report edit' }));
  expect(screen.getByRole('button', { name: 'Select Text (column 2)' })).toHaveProperty(
    'ariaPressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  expect(onSave).toHaveBeenCalledOnce();
  const group = (onSave.mock.calls[0]![0] as WebReportTemplate).bands[0]!.elements[0]!;
  if (group.type !== 'repeater') throw new Error('Missing repeater.');
  expect(group.children).toHaveLength(1);
  expect(group.children[0]).toMatchObject({ x: 16 / 3, y: 8 / 3 });
  expect(group.children[0]).not.toHaveProperty('column');
  expect(group.children[0]).not.toHaveProperty('canvasPath');
});

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
  expect(Number((screen.getByLabelText('Report x (mm)') as HTMLInputElement).value)).toBeCloseTo(
    32 / 3,
  );
  expect(Number((screen.getByLabelText('Report y (mm)') as HTMLInputElement).value)).toBeCloseTo(
    8 / 3,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Undo report edit' }));
  expect(screen.queryByRole('button', { name: 'Select Text' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Redo report edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
  const saved = onSave.mock.calls[0]?.[0] as WebReportTemplate;
  expect(saved.bands.find((band) => band.kind === 'detail')?.elements).toEqual([]);
  expect(saved.bands.find((band) => band.kind === 'title')?.elements.at(-1)).toMatchObject({
    type: 'text',
    x: 32 / 3,
    y: 8 / 3,
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
