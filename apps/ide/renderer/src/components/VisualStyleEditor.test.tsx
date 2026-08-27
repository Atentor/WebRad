// @vitest-environment jsdom

import type { ComponentStyleProperties, ComponentStyleStateName } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { VisualStyleEditor } from './VisualStyleEditor';

afterEach(cleanup);

function VisualEditorHarness({
  componentType = 'WebButton',
  stateName = 'base',
}: {
  readonly componentType?: string;
  readonly stateName?: ComponentStyleStateName;
}): ReactElement {
  const [properties, setProperties] = useState<ComponentStyleProperties>({});
  return (
    <>
      <VisualStyleEditor
        componentType={componentType}
        stateName={stateName}
        properties={properties}
        onChange={setProperties}
      />
      <output aria-label="Current properties">{JSON.stringify(properties)}</output>
    </>
  );
}

function currentProperties(): Record<string, unknown> {
  return JSON.parse(screen.getByLabelText('Current properties').textContent ?? '{}') as Record<
    string,
    unknown
  >;
}

describe('VisualStyleEditor', () => {
  it('edits enum, length, color, gradient, and number values without exposing class or CSS inputs', async () => {
    const user = userEvent.setup();
    const { container } = render(<VisualEditorHarness />);

    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.queryByText(/Tailwind class/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Layout/ }));
    await user.click(screen.getByLabelText('Configure Display'));
    expect(currentProperties()).toMatchObject({ display: 'block' });
    await user.selectOptions(screen.getByLabelText('Display'), 'flex');
    expect(currentProperties()).toMatchObject({ display: 'flex' });

    await user.click(screen.getByRole('button', { name: /^Spacing/ }));
    expect(screen.queryByLabelText('Configure Display')).toBeNull();
    await user.click(screen.getByLabelText('Configure Padding top'));
    fireEvent.change(screen.getByLabelText('Padding top value'), { target: { value: '20' } });
    await user.selectOptions(screen.getByLabelText('Padding top unit'), 'rem');
    expect(currentProperties()).toMatchObject({
      paddingTop: { value: 20, unit: 'rem' },
    });

    await user.click(screen.getByRole('button', { name: /^Colors/ }));
    expect(screen.queryByLabelText('Configure Padding top')).toBeNull();
    await user.click(screen.getByLabelText('Configure Background color'));
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#2563eb' },
    });
    expect(currentProperties()).toMatchObject({ backgroundColor: '#2563eb' });

    await user.click(screen.getByLabelText('Configure Background gradient'));
    await user.selectOptions(
      screen.getByLabelText('Background gradient direction'),
      'to-bottom-right',
    );
    fireEvent.change(screen.getByLabelText('Background gradient from color'), {
      target: { value: '#0ea5e9' },
    });
    fireEvent.change(screen.getByLabelText('Background gradient to color'), {
      target: { value: '#8b5cf6' },
    });
    expect(currentProperties()).toMatchObject({
      backgroundGradient: {
        kind: 'linear',
        direction: 'to-bottom-right',
        from: '#0ea5e9',
        to: '#8b5cf6',
      },
    });
    expect(currentProperties()).not.toHaveProperty('backgroundColor');
    expect(container.querySelector('.wr-style-gradient-swatch')).toBeNull();

    await user.click(screen.getByLabelText('Configure Text color'));
    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#f59e0b' } });
    expect(currentProperties()).toMatchObject({ textColor: '#f59e0b' });
    await user.click(screen.getByLabelText('Configure Text gradient'));
    await user.selectOptions(screen.getByLabelText('Text gradient direction'), 'to-left');
    expect(currentProperties()).toMatchObject({
      textGradient: {
        kind: 'linear',
        direction: 'to-left',
        from: '#2563eb',
        to: '#7c3aed',
      },
    });
    expect(currentProperties()).not.toHaveProperty('textColor');

    await user.click(screen.getByRole('button', { name: /^Effects/ }));
    await user.click(screen.getByLabelText('Configure Opacity'));
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '65' } });
    expect(currentProperties()).toMatchObject({ opacity: 65 });

    await user.click(screen.getByRole('button', { name: /^Colors/ }));
    await user.click(screen.getByRole('button', { name: 'Clear Background gradient' }));
    expect(currentProperties()).not.toHaveProperty('backgroundGradient');
    expect(currentProperties()).not.toHaveProperty('backgroundColor');
    await user.click(screen.getByLabelText('Configure Background color'));
    expect(currentProperties()).toMatchObject({ backgroundColor: '#ffffff' });
    expect(currentProperties()).not.toHaveProperty('backgroundGradient');
    await user.click(screen.getByRole('button', { name: 'Clear Background color' }));
    expect(currentProperties()).not.toHaveProperty('backgroundColor');

    await user.click(screen.getByRole('button', { name: /^Border/ }));
    await user.click(screen.getByLabelText('Configure Border color'));
    fireEvent.change(screen.getByLabelText('Border color'), { target: { value: '#22c55e' } });
    expect(currentProperties()).toMatchObject({ borderColor: '#22c55e' });
    await user.click(screen.getByLabelText('Configure Border gradient'));
    expect(currentProperties()).toMatchObject({
      borderGradient: {
        kind: 'linear',
        direction: 'to-right',
        from: '#2563eb',
        to: '#7c3aed',
      },
    });
    expect(currentProperties()).not.toHaveProperty('borderColor');
  });

  it('filters the catalog by human labels and exposes visual animation controls', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness stateName="hover" />);

    await user.type(screen.getByRole('searchbox', { name: 'Search properties' }), 'animation');
    expect(screen.queryByRole('button', { name: /^Layout/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Animation/ })).toBeDefined();

    await user.click(screen.getByRole('button', { name: /^Animation/ }));
    await user.click(screen.getByLabelText('Configure Animation'));
    await user.selectOptions(screen.getByLabelText('Animation'), 'bounce');
    await user.click(screen.getByLabelText('Configure Transition duration'));
    fireEvent.change(screen.getByLabelText('Transition duration'), {
      target: { value: '320' },
    });

    expect(currentProperties()).toMatchObject({
      animationName: 'bounce',
      transitionDuration: 320,
    });
  });

  it('groups button icon styles and keeps presentation on the base state', async () => {
    const user = userEvent.setup();
    const base = render(<VisualEditorHarness stateName="base" />);
    await user.click(screen.getByRole('button', { name: /^Icon/ }));
    await user.click(screen.getByLabelText('Configure Button content'));
    await user.selectOptions(screen.getByLabelText('Button content'), 'text-icon');
    await user.click(screen.getByLabelText('Configure Icon position'));
    await user.selectOptions(screen.getByLabelText('Icon position'), 'bottom');
    await user.click(screen.getByLabelText('Configure Icon size'));
    fireEvent.change(screen.getByLabelText('Icon size value'), { target: { value: '24' } });
    await user.click(screen.getByLabelText('Configure Icon color'));
    expect(currentProperties()).toMatchObject({
      buttonContentMode: 'text-icon',
      buttonIconPosition: 'bottom',
      buttonIconSize: { value: 24, unit: 'px' },
      buttonIconColor: 'current',
    });
    base.unmount();

    const hover = render(<VisualEditorHarness componentType="WebButton" stateName="hover" />);
    await user.click(screen.getByRole('button', { name: /^Icon/ }));
    expect(screen.getByLabelText('Configure Icon color')).toBeDefined();
    expect(screen.getByLabelText('Configure Icon size')).toBeDefined();
    expect(screen.queryByLabelText('Configure Button content')).toBeNull();
    expect(screen.queryByLabelText('Configure Icon position')).toBeNull();
    hover.unmount();

    render(<VisualEditorHarness componentType="WebLabel" stateName="base" />);
    expect(screen.queryByRole('button', { name: /^Icon/ })).toBeNull();
  });

  it('exposes Data Grid surfaces and embedded controls on the base state', async () => {
    const user = userEvent.setup();
    const grid = render(<VisualEditorHarness componentType="WebDataGrid" stateName="base" />);

    await user.click(
      screen.getByRole('button', { name: 'Data Grid Lines, 0 configured, 8 properties' }),
    );
    expect(screen.getByLabelText('Configure Horizontal line visibility')).toBeDefined();
    expect(screen.getByLabelText('Configure Horizontal line color')).toBeDefined();
    expect(screen.getByLabelText('Configure Horizontal line width')).toBeDefined();
    expect(screen.getByLabelText('Configure Horizontal line style')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line visibility')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line color')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line width')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line style')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Horizontal line visibility'));
    await user.selectOptions(screen.getByLabelText('Horizontal line visibility'), 'hide');
    await user.click(screen.getByLabelText('Configure Vertical line width'));
    fireEvent.change(screen.getByLabelText('Vertical line width value'), {
      target: { value: '2' },
    });
    expect(currentProperties()).toMatchObject({
      dataGridHorizontalLineVisibility: 'hide',
      dataGridVerticalLineWidth: { value: 2, unit: 'px' },
    });

    await user.click(
      screen.getByRole('button', { name: 'Data Grid Header, 0 configured, 9 properties' }),
    );
    expect(screen.getByLabelText('Configure Header background color')).toBeDefined();
    expect(screen.getByLabelText('Configure Header text color')).toBeDefined();
    expect(screen.getByLabelText('Configure Header border color')).toBeDefined();
    expect(screen.getByLabelText('Configure Header border width')).toBeDefined();
    expect(screen.getByLabelText('Configure Header border style')).toBeDefined();
    expect(screen.getByLabelText('Configure Header height')).toBeDefined();
    expect(screen.getByLabelText('Configure Header horizontal padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Header vertical padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Header font weight')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Header border style'));
    await user.selectOptions(screen.getByLabelText('Header border style'), 'dashed');
    expect(currentProperties()).toMatchObject({ dataGridHeaderBorderStyle: 'dashed' });

    await user.click(
      screen.getByRole('button', { name: 'Data Grid Footer, 0 configured, 9 properties' }),
    );
    expect(screen.getByLabelText('Configure Footer background color')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer text color')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer border color')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer border width')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer border style')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer height')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer horizontal padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer vertical padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Footer font weight')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Footer height'));
    await user.selectOptions(screen.getByLabelText('Footer height mode'), 'custom');
    fireEvent.change(screen.getByLabelText('Footer height value'), { target: { value: '36' } });
    expect(currentProperties()).toMatchObject({
      dataGridFooterHeight: { value: 36, unit: 'px' },
    });

    await user.click(
      screen.getByRole('button', { name: 'Data Grid Button, 0 configured, 9 properties' }),
    );
    expect(screen.getByLabelText('Configure Button background color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button text color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border width')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border style')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border radius')).toBeDefined();
    expect(screen.getByLabelText('Configure Button horizontal padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Button vertical padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Button font weight')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Button border radius'));
    fireEvent.change(screen.getByLabelText('Button border radius value'), {
      target: { value: '8' },
    });
    expect(currentProperties()).toMatchObject({
      dataGridButtonBorderRadius: { value: 8, unit: 'px' },
    });

    await user.click(
      screen.getByRole('button', { name: 'Data Grid Checkbox, 0 configured, 5 properties' }),
    );
    expect(screen.getByLabelText('Configure Checkbox accent color')).toBeDefined();
    expect(screen.getByLabelText('Configure Checkbox size')).toBeDefined();
    expect(screen.getByLabelText('Configure Checkbox caption color')).toBeDefined();
    expect(screen.getByLabelText('Configure Checkbox caption font weight')).toBeDefined();
    expect(screen.getByLabelText('Configure Checkbox caption gap')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Checkbox size'));
    fireEvent.change(screen.getByLabelText('Checkbox size value'), {
      target: { value: '18' },
    });
    expect(currentProperties()).toMatchObject({
      dataGridCheckboxSize: { value: 18, unit: 'px' },
    });
    grid.unmount();

    const hover = render(<VisualEditorHarness componentType="WebDataGrid" stateName="hover" />);
    expect(screen.queryByRole('button', { name: /^Data Grid Lines,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Header,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Footer,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Button,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Checkbox,/ })).toBeNull();
    hover.unmount();

    render(<VisualEditorHarness componentType="WebButton" stateName="base" />);
    expect(screen.queryByRole('button', { name: /^Data Grid Lines,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Header,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Footer,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Button,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Data Grid Checkbox,/ })).toBeNull();
  });

  it('uses metadata component compatibility to show image-only properties', async () => {
    const user = userEvent.setup();
    const buttonView = render(<VisualEditorHarness />);
    expect(screen.queryByRole('button', { name: /^Image/ })).toBeNull();
    buttonView.unmount();

    render(<VisualEditorHarness componentType="WebImage" />);
    await user.click(screen.getByRole('button', { name: /^Image/ }));
    expect(screen.getByLabelText('Configure Image fit')).toBeDefined();
    expect(screen.getByLabelText('Configure Image position')).toBeDefined();
  });
});
