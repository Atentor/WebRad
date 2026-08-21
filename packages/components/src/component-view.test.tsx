// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComponentView, hasComponentRenderer } from './component-view';
import { WEBRAD_COMPONENT_CSS } from './styles';

const button = {
  id: 'button-id',
  type: 'WebButton',
  name: 'BTNMostrar',
  parentId: 'page-id',
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
    expect(markup).toContain('class="wr-component wr-webbutton"');
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
