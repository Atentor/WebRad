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

  it('shows button presentation only on the base state', async () => {
    const user = userEvent.setup();
    const base = render(<VisualEditorHarness stateName="base" />);
    await user.click(screen.getByRole('button', { name: /^Content/ }));
    await user.click(screen.getByLabelText('Configure Button content'));
    await user.selectOptions(screen.getByLabelText('Button content'), 'text-icon');
    await user.click(screen.getByLabelText('Configure Icon position'));
    await user.selectOptions(screen.getByLabelText('Icon position'), 'bottom');
    expect(currentProperties()).toMatchObject({
      buttonContentMode: 'text-icon',
      buttonIconPosition: 'bottom',
    });
    base.unmount();

    render(<VisualEditorHarness stateName="hover" />);
    expect(screen.queryByRole('button', { name: /^Content/ })).toBeNull();
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
