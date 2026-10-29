// @vitest-environment jsdom

import { ComponentRegistry, defaultComponentRegistry } from '@webrad/component-registry';
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
  initialProperties = {},
  registry,
}: {
  readonly componentType?: string;
  readonly stateName?: ComponentStyleStateName;
  readonly initialProperties?: ComponentStyleProperties;
  readonly registry?: ComponentRegistry;
}): ReactElement {
  const [properties, setProperties] = useState<ComponentStyleProperties>(initialProperties);
  return (
    <>
      <VisualStyleEditor
        componentType={componentType}
        stateName={stateName}
        properties={properties}
        onChange={setProperties}
        registry={registry}
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

async function expandCategory(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> {
  const category = screen.getByRole('button', { name: new RegExp('^' + name + ',') });
  if (category.getAttribute('aria-expanded') !== 'true') await user.click(category);
}

describe('VisualStyleEditor', () => {
  it('selects the eight bundled font families and keeps generic options available', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness initialProperties={{ fontFamily: 'sans' }} />);
    await expandCategory(user, 'Text');
    const select = screen.getByLabelText('Font family', { selector: 'select' });
    const fonts = [
      ['roboto', 'Roboto'],
      ['open-sans', 'Open Sans'],
      ['jetbrains-mono', 'JetBrains Mono'],
      ['inter', 'Inter'],
      ['lato', 'Lato'],
      ['montserrat', 'Montserrat'],
      ['poppins', 'Poppins'],
      ['nunito', 'Nunito'],
    ] as const;
    for (const [id, label] of fonts) {
      expect(screen.getByRole('option', { name: label }).getAttribute('value')).toBe(id);
      await user.selectOptions(select, id);
      expect(currentProperties()).toEqual({ fontFamily: id });
    }
    await user.selectOptions(select, 'mono');
    expect(currentProperties()).toEqual({ fontFamily: 'mono' });
  });
  it('edits enum, length, color, gradient, and number values without exposing class or CSS inputs', async () => {
    const user = userEvent.setup();
    const { container } = render(<VisualEditorHarness />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));

    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.queryByText(/Tailwind class/i)).toBeNull();

    await expandCategory(user, 'Layout & size');
    await user.click(screen.getByLabelText('Configure Display'));
    expect(currentProperties()).toMatchObject({ display: 'block' });
    await user.selectOptions(screen.getByLabelText('Display', { selector: 'select' }), 'flex');
    expect(currentProperties()).toMatchObject({ display: 'flex' });

    await expandCategory(user, 'Spacing');
    expect(screen.queryByLabelText('Configure Display')).toBeNull();
    await user.click(screen.getByLabelText('Configure Padding top'));
    fireEvent.change(screen.getByLabelText('Padding top value'), { target: { value: '20' } });
    await user.selectOptions(screen.getByLabelText('Padding top unit'), 'rem');
    expect(currentProperties()).toMatchObject({
      paddingTop: { value: 20, unit: 'rem' },
    });

    await expandCategory(user, 'Appearance');
    expect(screen.queryByLabelText('Configure Padding top')).toBeNull();
    await user.click(screen.getByLabelText('Configure Background color'));
    fireEvent.change(
      screen.getByLabelText('Background color', { selector: 'input[type="color"]' }),
      {
        target: { value: '#2563eb' },
      },
    );
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

    await expandCategory(user, 'Text');
    await user.click(screen.getByLabelText('Configure Text color'));
    fireEvent.change(screen.getByLabelText('Text color', { selector: 'input[type="color"]' }), {
      target: { value: '#f59e0b' },
    });
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

    await expandCategory(user, 'Appearance');
    await user.click(screen.getByLabelText('Configure Opacity'));
    fireEvent.change(screen.getByLabelText('Opacity', { selector: 'input[role="spinbutton"]' }), {
      target: { value: '65' },
    });
    expect(currentProperties()).toMatchObject({ opacity: 65 });

    await expandCategory(user, 'Appearance');
    await user.click(screen.getByRole('button', { name: 'Clear Background gradient' }));
    expect(currentProperties()).not.toHaveProperty('backgroundGradient');
    expect(currentProperties()).not.toHaveProperty('backgroundColor');
    await user.click(screen.getByLabelText('Configure Background color'));
    expect(currentProperties()).toMatchObject({ backgroundColor: '#ffffff' });
    expect(currentProperties()).not.toHaveProperty('backgroundGradient');
    await user.click(screen.getByRole('button', { name: 'Clear Background color' }));
    expect(currentProperties()).not.toHaveProperty('backgroundColor');

    await expandCategory(user, 'Appearance');
    await user.click(screen.getByLabelText('Configure Border color'));
    fireEvent.change(screen.getByLabelText('Border color', { selector: 'input[type="color"]' }), {
      target: { value: '#22c55e' },
    });
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
    expect(screen.getByRole('button', { name: /^Motion/ })).toBeDefined();

    await user.click(screen.getByLabelText('Configure Animation'));
    await user.selectOptions(screen.getByLabelText('Animation', { selector: 'select' }), 'bounce');
    await user.click(screen.getByLabelText('Configure Transition duration'));
    fireEvent.change(
      screen.getByLabelText('Transition duration', { selector: 'input[role="spinbutton"]' }),
      {
        target: { value: '320' },
      },
    );

    expect(currentProperties()).toMatchObject({
      animationName: 'bounce',
      transitionDuration: 320,
    });
  });

  it('groups button icon styles and keeps presentation on the base state', async () => {
    const user = userEvent.setup();
    const base = render(<VisualEditorHarness stateName="base" />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    await expandCategory(user, 'Icon');
    await user.click(screen.getByLabelText('Configure Button content'));
    await user.selectOptions(
      screen.getByLabelText('Button content', { selector: 'select' }),
      'text-icon',
    );
    await user.click(screen.getByLabelText('Configure Icon position'));
    await user.selectOptions(
      screen.getByLabelText('Icon position', { selector: 'select' }),
      'bottom',
    );
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

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    await expandCategory(user, 'Icon');
    expect(screen.getByLabelText('Configure Icon color')).toBeDefined();
    expect(screen.getByLabelText('Configure Icon size')).toBeDefined();
    expect(screen.queryByLabelText('Configure Button content')).toBeNull();
    expect(screen.queryByLabelText('Configure Icon position')).toBeNull();
    hover.unmount();

    render(<VisualEditorHarness componentType="WebLabel" stateName="base" />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    expect(screen.queryByRole('button', { name: /^Icon/ })).toBeNull();
  });

  it('exposes Data Grid surfaces and embedded controls on the base state', async () => {
    const user = userEvent.setup();
    const grid = render(<VisualEditorHarness componentType="WebDataGrid" stateName="base" />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));

    await expandCategory(user, 'Lines');
    expect(screen.getByLabelText('Configure Horizontal line visibility')).toBeDefined();
    expect(screen.getByLabelText('Configure Horizontal line color')).toBeDefined();
    expect(screen.getByLabelText('Configure Horizontal line width')).toBeDefined();
    expect(screen.getByLabelText('Configure Horizontal line style')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line visibility')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line color')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line width')).toBeDefined();
    expect(screen.getByLabelText('Configure Vertical line style')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Horizontal line visibility'));
    await user.selectOptions(
      screen.getByLabelText('Horizontal line visibility', { selector: 'select' }),
      'hide',
    );
    await user.click(screen.getByLabelText('Configure Vertical line width'));
    fireEvent.change(screen.getByLabelText('Vertical line width value'), {
      target: { value: '2' },
    });
    expect(currentProperties()).toMatchObject({
      dataGridHorizontalLineVisibility: 'hide',
      dataGridVerticalLineWidth: { value: 2, unit: 'px' },
    });

    await expandCategory(user, 'Header');
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
    await user.selectOptions(
      screen.getByLabelText('Header border style', { selector: 'select' }),
      'dashed',
    );
    expect(currentProperties()).toMatchObject({ dataGridHeaderBorderStyle: 'dashed' });

    await expandCategory(user, 'Footer');
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

    await expandCategory(user, 'Cell button');
    expect(screen.getByLabelText('Configure Button content')).toBeDefined();
    expect(screen.getByLabelText('Configure Icon position')).toBeDefined();
    expect(screen.getByLabelText('Configure Icon size')).toBeDefined();
    expect(screen.getByLabelText('Configure Icon color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button background color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button text color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border color')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border width')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border style')).toBeDefined();
    expect(screen.getByLabelText('Configure Button border radius')).toBeDefined();
    expect(screen.getByLabelText('Configure Button horizontal padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Button vertical padding')).toBeDefined();
    expect(screen.getByLabelText('Configure Button font weight')).toBeDefined();

    await user.click(screen.getByLabelText('Configure Button content'));
    await user.selectOptions(
      screen.getByLabelText('Button content', { selector: 'select' }),
      'icon',
    );
    await user.click(screen.getByLabelText('Configure Icon position'));
    await user.selectOptions(
      screen.getByLabelText('Icon position', { selector: 'select' }),
      'bottom',
    );
    await user.click(screen.getByLabelText('Configure Icon size'));
    fireEvent.change(screen.getByLabelText('Icon size value'), { target: { value: '24' } });
    await user.click(screen.getByLabelText('Configure Icon color'));
    await user.selectOptions(screen.getByLabelText('Icon color type'), 'custom');
    fireEvent.change(screen.getByLabelText('Icon color', { selector: 'input[type="color"]' }), {
      target: { value: '#f59e0b' },
    });
    expect(currentProperties()).toMatchObject({
      dataGridButtonContentMode: 'icon',
      dataGridButtonIconPosition: 'bottom',
      dataGridButtonIconSize: { value: 24, unit: 'px' },
      dataGridButtonIconColor: '#f59e0b',
    });

    await user.click(screen.getByLabelText('Configure Button border radius'));
    fireEvent.change(screen.getByLabelText('Button border radius value'), {
      target: { value: '8' },
    });
    expect(currentProperties()).toMatchObject({
      dataGridButtonBorderRadius: { value: 8, unit: 'px' },
    });

    await expandCategory(user, 'Cell checkbox');
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

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    expect(screen.queryByRole('button', { name: /^Lines,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Header,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Footer,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cell button,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cell checkbox,/ })).toBeNull();
    hover.unmount();

    render(<VisualEditorHarness componentType="WebButton" stateName="base" />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    expect(screen.queryByRole('button', { name: /^Lines,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Header,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Footer,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cell button,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cell checkbox,/ })).toBeNull();
  });

  it('uses metadata component compatibility to show image-only properties', async () => {
    const user = userEvent.setup();
    const buttonView = render(<VisualEditorHarness />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    expect(screen.queryByRole('button', { name: /^Image/ })).toBeNull();
    buttonView.unmount();

    render(<VisualEditorHarness componentType="WebImage" />);

    await user.click(screen.getByRole('button', { name: 'All properties' }));
    await expandCategory(user, 'Image');
    expect(screen.getByLabelText('Configure Image fit')).toBeDefined();
    expect(screen.getByLabelText('Configure Image position')).toBeDefined();
  });

  it('starts with component essentials and opens one concise group at a time', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness />);
    expect(screen.getByRole('group', { name: 'Property view' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Essential' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByLabelText('Configure Background color')).toBeDefined();
    expect(screen.queryByLabelText('Configure Background gradient')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Motion,/ })).toBeNull();
    await expandCategory(user, 'Text');
    expect(screen.getByLabelText('Configure Font size')).toBeDefined();
    expect(screen.queryByLabelText('Configure Background color')).toBeNull();
    expect(screen.queryByLabelText('Configure Text gradient')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'All properties' }));
    await expandCategory(user, 'Text');
    expect(screen.getByLabelText('Configure Text gradient')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Motion,/ })).toBeDefined();
  });

  it('uses the supplied registry to curate essentials rather than component type conditionals', () => {
    const registry = new ComponentRegistry([
      {
        ...defaultComponentRegistry.require('WebButton'),
        styleEditor: { essentialProperties: ['rotate'] },
      },
    ]);
    render(<VisualEditorHarness registry={registry} />);
    expect(screen.getByLabelText('Configure Rotate')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Appearance,/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Text,/ })).toBeNull();
  });

  it('retains configured uncommon properties in Essential and removes them when cleared', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness initialProperties={{ rotate: 15 }} />);
    await expandCategory(user, 'Motion');
    expect((screen.getByLabelText('Configure Rotate') as HTMLInputElement).checked).toBe(true);
    expect(
      (screen.getByLabelText('Rotate', { selector: 'input[role="spinbutton"]' }) as HTMLInputElement)
        .value,
    ).toBe('15');
    await user.click(screen.getByRole('button', { name: 'Clear Rotate' }));
    expect(currentProperties()).not.toHaveProperty('rotate');
    expect(screen.queryByRole('button', { name: /^Motion,/ })).toBeNull();
  });

  it('searches all applicable properties and expands every matching group from Essential', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness />);
    await user.type(screen.getByRole('searchbox', { name: 'Search properties' }), 'gradient');
    expect(screen.getByLabelText('Configure Background gradient')).toBeDefined();
    expect(screen.getByLabelText('Configure Border gradient')).toBeDefined();
    expect(screen.getByLabelText('Configure Text gradient')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Appearance,/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /^Text,/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Essential' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.queryByLabelText('Configure Background gradient')).toBeNull();
    expect(screen.queryByLabelText('Configure Text gradient')).toBeNull();
  });

  it('keeps search constrained by component compatibility and interaction state', async () => {
    const user = userEvent.setup();
    const hover = render(<VisualEditorHarness stateName="hover" />);
    await user.type(screen.getByRole('searchbox', { name: 'Search properties' }), 'Button content');
    expect(screen.getByText('No matching properties')).toBeDefined();
    expect(screen.queryByLabelText('Configure Button content')).toBeNull();
    hover.unmount();
    render(<VisualEditorHarness componentType="WebLabel" />);
    await user.type(screen.getByRole('searchbox', { name: 'Search properties' }), 'Image fit');
    expect(screen.getByText('No matching properties')).toBeDefined();
    expect(screen.queryByLabelText('Configure Image fit')).toBeNull();
  });

  it('expands only configured properties and shows the empty state after removing the last value', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness initialProperties={{ backgroundColor: '#123456', rotate: 0 }} />);
    await user.click(screen.getByRole('button', { name: 'Configured' }));
    expect(screen.getByLabelText('Configure Background color')).toBeDefined();
    expect(screen.getByLabelText('Configure Rotate')).toBeDefined();
    expect(screen.queryByLabelText('Configure Border color')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear Background color' }));
    expect(screen.queryByRole('button', { name: /^Appearance,/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear Rotate' }));
    expect(currentProperties()).toEqual({});
    expect(screen.queryByLabelText('Configure Rotate')).toBeNull();
    expect(screen.getByText('No configured properties')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Essential' }));
    expect(screen.getByLabelText('Configure Background color')).toBeDefined();
  });

  it.each([
    ['WebPage', 'Appearance', 'Background color'],
    ['WebLabel', 'Text', 'Text gradient'],
    ['WebButton', 'Icon', 'Button content'],
    ['WebImage', 'Image', 'Image fit'],
    ['WebDataGrid', 'Header', 'Header background color'],
  ])(
    'curates relevant essentials for %s while keeping advanced layout available',
    async (componentType, category, label) => {
      const user = userEvent.setup();
      render(<VisualEditorHarness componentType={componentType} />);
      await expandCategory(user, category);
      expect(screen.getByLabelText('Configure ' + label)).toBeDefined();
      expect(screen.queryByRole('button', { name: /^Layout & size,/ })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'All properties' }));
      await expandCategory(user, 'Layout & size');
      expect(screen.getByLabelText('Configure Display')).toBeDefined();
    },
  );

  it('sets an unset essential property directly and clears it back to the component default', async () => {
    const user = userEvent.setup();
    render(<VisualEditorHarness />);
    await user.click(screen.getByRole('button', { name: 'Set Background color' }));
    expect(currentProperties()).toMatchObject({ backgroundColor: '#ffffff' });
    expect((screen.getByLabelText('Configure Background color') as HTMLInputElement).checked).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Clear Background color' }));
    expect(currentProperties()).not.toHaveProperty('backgroundColor');
    expect(screen.getByRole('button', { name: 'Set Background color' })).toBeDefined();
  });

  it.each(['search', 'configured'] as const)(
    'lets users collapse and reopen groups in %s while retaining the filter and values',
    async (view) => {
      const user = userEvent.setup();
      const properties = { backgroundColor: '#123456', textColor: '#abcdef' };
      render(<VisualEditorHarness initialProperties={properties} />);
      if (view === 'search') {
        await user.type(screen.getByRole('searchbox', { name: 'Search properties' }), 'color');
      } else {
        await user.click(screen.getByRole('button', { name: 'Configured' }));
      }
      const appearance = screen.getByRole('button', { name: /^Appearance,/ });
      const text = screen.getByRole('button', { name: /^Text,/ });
      expect(appearance.getAttribute('aria-expanded')).toBe('true');
      expect(text.getAttribute('aria-expanded')).toBe('true');
      await user.click(appearance);
      expect(appearance.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByLabelText('Configure Background color')).toBeNull();
      expect(screen.getByLabelText('Configure Text color')).toBeDefined();
      expect(currentProperties()).toEqual(properties);
      await user.click(appearance);
      expect(appearance.getAttribute('aria-expanded')).toBe('true');
      expect(text.getAttribute('aria-expanded')).toBe('true');
      expect(
        (
          screen.getByLabelText('Background color', {
            selector: 'input[type="color"]',
          }) as HTMLInputElement
        ).value,
      ).toBe('#123456');
      expect(currentProperties()).toEqual(properties);
      if (view === 'search') {
        expect(
          (screen.getByRole('searchbox', { name: 'Search properties' }) as HTMLInputElement).value,
        ).toBe('color');
        expect(screen.getByLabelText('Configure Border color')).toBeDefined();
      } else {
        expect(
          screen.getByRole('button', { name: 'Configured' }).getAttribute('aria-pressed'),
        ).toBe('true');
        expect(screen.queryByLabelText('Configure Border color')).toBeNull();
      }
    },
  );
});
