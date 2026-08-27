// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDefaultComponentLayout } from '@webrad/project-model';
import { ComponentView, hasComponentRenderer } from './component-view';
import { WEBRAD_COMPONENT_CSS } from './styles';

const button = {
  id: 'button-id',
  type: 'WebButton',
  name: 'BTNMostrar',
  parentId: 'page-id',
  layout: createDefaultComponentLayout(),
  bounds: { x: 10, y: 20, width: 100, height: 32 },
  props: { caption: 'Mostrar', visible: true, enabled: true },
  events: { OnClick: 'BTNMostrarClick' },
  children: [],
} as const;

describe('ComponentView', () => {
  it('renders a registered component from real DOM elements', () => {
    const markup = renderToStaticMarkup(<ComponentView node={button} />);

    expect(markup).toContain('Mostrar');
    expect(markup).toContain('<button');
    expect(markup).toContain(
      'class="wr-component wr-webbutton wr-button-content-text-icon wr-button-icon-left"',
    );
    expect(markup).toContain('data-webrad-button-icon=""');
    expect(markup).toContain('data-webrad-text-content=""');
  });

  it('renders the Data Grid design-time table with configured headers and footer', () => {
    const markup = renderToStaticMarkup(
      <ComponentView
        node={{
          ...button,
          id: 'data-grid-id',
          type: 'WebDataGrid',
          name: 'DataGrid1',
          props: {
            dataGridConfig: {
              schemaVersion: 2,
              apiClientId: null,
              operationId: null,
              listPath: '',
              columnCount: 2,
              showHeader: true,
              stickyHeader: true,
              showFooter: true,
              stickyFooter: true,
              rowHeightMode: 'dynamic',
              fixedRowHeight: 40,
              minRowHeight: 42,
              maxRowHeight: 160,
              cellPaddingHorizontal: 12,
              cellPaddingVertical: 6,
              wrapText: true,
              stripedRows: true,
              showHorizontalLines: true,
              showVerticalLines: true,
              emptyMessage: 'No records',
              columns: [
                {
                  id: 'name',
                  header: 'Name',
                  fieldPath: '/name',
                  cellKind: 'button',
                  fixedCaption: 'View',
                  footer: 'Total',
                  widthMode: 'dynamic',
                  width: 180,
                  minWidth: 120,
                  maxWidth: null,
                  flex: 2,
                  headerAlign: 'start',
                  cellAlign: 'start',
                },
                {
                  id: 'active',
                  header: 'Active',
                  fieldPath: '/active',
                  cellKind: 'checkbox',
                  fixedCaption: 'Enabled',
                  footer: '',
                  widthMode: 'fixed',
                  width: 88,
                  minWidth: 88,
                  maxWidth: 88,
                  flex: 1,
                  headerAlign: 'center',
                  cellAlign: 'center',
                },
              ],
            },
            visible: true,
            enabled: true,
          },
        }}
      />,
    );

    expect(markup).toContain('wr-webdatagrid');
    expect(markup).toContain('role="columnheader"');
    expect(markup).toContain('data-webrad-data-grid-column="name"');
    expect(markup).toContain('Total');
    expect(markup).toContain('wr-data-grid-button-caption');
    expect(markup).toContain('>View</span>');
    expect(markup).toContain('wr-data-grid-checkbox-control');
    expect(markup).toContain('wr-data-grid-checkbox-caption');
    expect(markup).toContain('>Enabled</span>');
    expect(markup).toContain('data-webrad-row-height-mode="dynamic"');
    expect(markup).toContain('--wr-data-grid-columns:120px 88px');
    expect(markup).toContain('wr-data-grid-has-footer');
  });

  it('projects the selected reusable style classes onto the component root', () => {
    const markup = renderToStaticMarkup(
      <ComponentView
        node={{
          ...button,
          props: { ...button.props, backgroundColor: 'red', color: 'white' },
        }}
        styleClassName="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 animate-pulse"
      />,
    );

    expect(markup).toContain(
      'class="wr-component wr-webbutton wr-button-content-text-icon wr-button-icon-left bg-blue-600 hover:bg-blue-700 disabled:opacity-50 animate-pulse"',
    );
    expect(markup).not.toContain('background-color:red');
    expect(markup).not.toContain('color:white');

    const emptyStyleMarkup = renderToStaticMarkup(
      <ComponentView
        node={{ ...button, props: { ...button.props, backgroundColor: 'red' } }}
        styleClassName=""
      />,
    );
    expect(emptyStyleMarkup).not.toContain('background-color:red');
  });

  it('keeps the instance icon while style classes choose button content and placement', () => {
    const view = render(
      <ComponentView
        node={{ ...button, props: { ...button.props, icon: 'save' } }}
        styleClassName="[&_.wr-button-icon]:block [&_.wr-button-icon]:w-[24px]! [&_.wr-button-icon]:h-[24px]! [&_.wr-button-icon]:text-[#f59e0b] [&_.wr-button-text]:sr-only flex-col-reverse"
      />,
    );
    const element = view.getByRole('button', { name: 'Mostrar' });

    expect(element.querySelector('[data-webrad-button-icon] path')?.getAttribute('d')).toContain(
      'M5 3h12',
    );
    expect(element.classList).toContain('[&_.wr-button-icon]:block');
    expect(element.classList).toContain('[&_.wr-button-icon]:w-[24px]!');
    expect(element.classList).toContain('[&_.wr-button-icon]:h-[24px]!');
    expect(element.classList).toContain('[&_.wr-button-icon]:text-[#f59e0b]');
    expect(element.classList).toContain('[&_.wr-button-text]:sr-only');
    expect(element.classList).toContain('flex-col-reverse');
    expect(element.querySelector('[data-webrad-text-content]')?.textContent).toBe('Mostrar');
    view.unmount();
  });

  it('renders visual descendants inside container roots', () => {
    const panel = {
      ...button,
      id: 'panel-id',
      type: 'WebPanel',
      name: 'Panel1',
      props: { caption: 'Actions', visible: true, enabled: true },
      children: [button.id],
    };
    const markup = renderToStaticMarkup(
      <ComponentView node={panel} styleClassName="[&>button]:uppercase">
        <ComponentView node={button} />
      </ComponentView>,
    );

    expect(markup).toContain('<section');
    expect(markup).toContain('[&amp;&gt;button]:uppercase');
    expect(markup).toContain('<button');
    expect(markup.indexOf('<button')).toBeGreaterThan(markup.indexOf('<section'));
    expect(markup.indexOf('</button>')).toBeLessThan(markup.indexOf('</section>'));
  });

  it('keeps enabled controls visually enabled at design time while removing them from tab order', () => {
    const markup = renderToStaticMarkup(<ComponentView node={button} designTime />);

    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain('aria-disabled="false"');
    expect(markup).toContain('tabindex="-1"');
  });

  it('still projects an explicitly disabled model property', () => {
    const markup = renderToStaticMarkup(
      <ComponentView node={{ ...button, props: { ...button.props, enabled: false } }} designTime />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-disabled="true"');
  });

  it('projects list metadata with the same visible selection shape as the runtime', () => {
    const list = {
      ...button,
      type: 'WebListBox',
      name: 'ListBox1',
      props: { items: ['One', 'Two'], selectedIndex: 1, multiple: false },
    };
    const markup = renderToStaticMarkup(<ComponentView node={list} designTime />);

    expect(markup).toContain('size="4"');
    expect(markup).toContain('<option value="Two" selected="">Two</option>');
  });

  it('synchronizes live control state when Inspector-backed props change', () => {
    const edit = {
      ...button,
      type: 'WebEdit',
      name: 'Edit1',
      props: { value: 'first', visible: true, enabled: true },
    };
    const view = render(<ComponentView node={edit} designTime />);
    expect((view.getByRole('textbox') as HTMLInputElement).value).toBe('first');
    view.rerender(
      <ComponentView node={{ ...edit, props: { ...edit.props, value: 'second' } }} designTime />,
    );
    expect((view.getByRole('textbox') as HTMLInputElement).value).toBe('second');

    const checkBox = {
      ...button,
      type: 'WebCheckBox',
      name: 'CheckBox1',
      props: { caption: 'Enabled', checked: false, visible: true, enabled: true },
    };
    view.rerender(<ComponentView node={checkBox} designTime />);
    expect((view.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    view.rerender(
      <ComponentView
        node={{ ...checkBox, props: { ...checkBox.props, checked: true } }}
        designTime
      />,
    );
    expect((view.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    view.unmount();
  });

  it('reports renderer coverage', () => {
    expect(hasComponentRenderer('WebButton')).toBe(true);
    expect(hasComponentRenderer('Missing')).toBe(false);
  });

  it('uses the browser runtime visual stylesheet contract', () => {
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-component');
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-webbutton:hover:not(:disabled)');
    expect(WEBRAD_COMPONENT_CSS).not.toContain('.wr-runtime-component');
  });
});
