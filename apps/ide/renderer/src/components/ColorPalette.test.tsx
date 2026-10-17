// @vitest-environment jsdom

import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  createProject,
  paletteColorReference,
  type ProjectPaletteColor,
} from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectColorPaletteContext } from '../project-color-palette';
import { ColorInput } from './ColorInput';
import { ObjectInspector } from './ObjectInspector';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { VisualStyleEditor } from './VisualStyleEditor';
import { StylesWorkspace } from './StylesWorkspace';

const palette = [
  { id: 'graphite', name: 'Graphite', color: '#334155' },
  { id: 'blue', name: 'Blue', color: '#007acc' },
];
const originalShow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
const originalHide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');

beforeEach(() => {
  // jsdom lacks native popovers; the browser smoke exercises the actual top layer.
  for (const [name, newState] of [
    ['showPopover', 'open'],
    ['hidePopover', 'closed'],
  ]) {
    Object.defineProperty(HTMLElement.prototype, name!, {
      configurable: true,
      value(this: HTMLElement) {
        this.style.display = newState === 'open' ? 'grid' : 'none';
        this.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
      },
    });
  }
});

afterEach(() => {
  cleanup();
  for (const [name, descriptor] of [
    ['showPopover', originalShow],
    ['hidePopover', originalHide],
  ] as const) {
    if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, name);
    else Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});

describe('project color palette', () => {
  it('distinguishes linked style colors and unlinks at their current value when Custom color is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const definition = COMPONENT_STYLE_PROPERTY_DEFINITIONS.find(
      (entry) => entry.name === 'textColor',
    )!;
    render(
      <ProjectColorPaletteContext.Provider value={palette}>
        <VisualStyleEditor
          componentType="WebLabel"
          stateName="base"
          definitions={[definition]}
          properties={{ textColor: paletteColorReference('blue') }}
          onChange={onChange}
        />
      </ProjectColorPaletteContext.Provider>,
    );
    const selector = screen.getByLabelText('Text color type') as HTMLSelectElement;
    expect(selector.value).toBe('palette');
    await user.selectOptions(selector, 'custom');
    expect(onChange).toHaveBeenCalledWith({ textColor: '#007acc' });
  });

  it('resolves the selected identity after palette edits and emits a literal when edited manually', () => {
    const onChange = vi.fn();
    const linked = paletteColorReference('blue');
    const { rerender } = render(
      <ProjectColorPaletteContext.Provider value={palette}>
        <ColorInput label="Linked color" value={linked} onChange={onChange} />
      </ProjectColorPaletteContext.Provider>,
    );
    expect((screen.getByLabelText('Linked color') as HTMLInputElement).value).toBe('#007acc');
    const changed = [
      ...palette.map((entry) =>
        entry.id === 'blue' ? { ...entry, name: 'Rose', color: '#e11d48' } : entry,
      ),
      { id: 'duplicate', name: 'Duplicate', color: '#e11d48' },
    ];
    rerender(
      <ProjectColorPaletteContext.Provider value={changed}>
        <ColorInput label="Linked color" value={linked} onChange={onChange} />
      </ProjectColorPaletteContext.Provider>,
    );
    expect((screen.getByLabelText('Linked color') as HTMLInputElement).value).toBe('#e11d48');
    const swatches = screen.getAllByLabelText('Use #E11D48 for Linked color');
    expect(swatches.map((swatch) => swatch.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
    ]);
    fireEvent.change(screen.getByLabelText('Linked color'), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');
  });

  it('keeps custom color input available and disables palette selection with its field', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ColorInput label="Color" value="#000000" onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Predefined colors for Color' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456');
    rerender(
      <ProjectColorPaletteContext.Provider value={palette}>
        <ColorInput label="Color" value="#000000" onChange={onChange} disabled />
      </ProjectColorPaletteContext.Provider>,
    );
    expect(
      (screen.getByRole('button', { name: 'Predefined colors for Color' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    rerender(
      <ProjectColorPaletteContext.Provider value={palette}>
        <ColorInput label="Color" value="#000000" onChange={onChange} />
      </ProjectColorPaletteContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'Predefined colors for Color' }));
    await user.click(screen.getByRole('button', { name: 'Use #007ACC for Color' }));
    expect(onChange).toHaveBeenLastCalledWith(paletteColorReference('blue'));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Predefined colors for Color' }),
    );
  });

  it('adds, edits, limits, removes and saves colors without mutating settings on cancel', async () => {
    const settings = createProject('Palette', { settings: { colorPalette: [] } }).settings;
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <StylesWorkspace
        styles={[]}
        colorPalette={settings.colorPalette}
        onUpdateColorPalette={onSave}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={vi.fn()}
        onDeleteStyle={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Color palette' }));
    for (let index = 0; index < 10; index += 1)
      await user.click(screen.getByRole('button', { name: 'Add color' }));
    expect((screen.getByRole('button', { name: 'Add color' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText('Palette color 1'), { target: { value: '#007acc' } });
    fireEvent.change(screen.getByLabelText('Palette color 2 hex'), {
      target: { value: '#zzzzzz' },
    });
    await user.click(screen.getByRole('button', { name: 'Save palette' }));
    expect(screen.getByRole('alert').textContent).toContain('hexadecimal');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Palette color 2 hex'), {
      target: { value: '#ffffff' },
    });
    await user.click(screen.getByRole('button', { name: 'Remove palette color 10' }));
    expect((screen.getByRole('button', { name: 'Add color' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await user.click(screen.getByRole('button', { name: 'Save palette' }));
    const saved = onSave.mock.calls[0]?.[0] as readonly ProjectPaletteColor[];
    expect(saved.map((entry) => entry.color)).toEqual([
      '#007acc',
      '#ffffff',
      ...Array<string>(7).fill('#334155'),
    ]);
    await user.click(screen.getByRole('button', { name: 'Color palette' }));
    await user.click(screen.getByRole('button', { name: 'Add color' }));
    onSave.mockClear();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Project color palette' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(settings.colorPalette).toEqual([]);
  });

  it('keeps palette choices in project options without offering palette configuration in settings', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Palette"
        settings={{ ...createProject('Palette').settings, colorPalette: palette }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.queryByRole('tab', { name: 'Color palette' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Predefined colors for Track color' }));
    await user.click(screen.getByRole('button', { name: 'Use #007ACC for Track color' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        colorPalette: palette,
        scrollbar: expect.objectContaining({ trackColor: paletteColorReference('blue') }),
      }),
    );
  });

  it('applies project colors through every registered color property in the Inspector', () => {
    for (const definition of defaultComponentRegistry.list()) {
      const colorProperties = definition.properties.filter((property) => property.type === 'color');
      if (colorProperties.length === 0) continue;
      const onPropertyChange = vi.fn();
      const node = defaultComponentRegistry.createComponent(definition.type);
      render(
        <ProjectColorPaletteContext.Provider value={palette}>
          <ObjectInspector
            selection={[node]}
            onPropertyChange={onPropertyChange}
            onEventChange={vi.fn()}
            onEventDoubleClick={vi.fn()}
          />
        </ProjectColorPaletteContext.Provider>,
      );
      for (const property of colorProperties) {
        const label = `${property.label ?? property.name} color picker`;
        fireEvent.click(screen.getByLabelText(`Use #007ACC for ${label}`));
        expect(onPropertyChange).toHaveBeenLastCalledWith(
          property.name,
          paletteColorReference('blue'),
          expect.objectContaining(property),
        );
      }
      cleanup();
    }
  });

  it('offers palette choices for all style colors and both endpoints of every gradient', () => {
    for (const definition of COMPONENT_STYLE_PROPERTY_DEFINITIONS) {
      if (definition.editor.kind !== 'color' && definition.editor.kind !== 'gradient') continue;
      const onChange = vi.fn();
      render(
        <ProjectColorPaletteContext.Provider value={palette}>
          <VisualStyleEditor
            componentType={definition.componentTypes?.[0] ?? 'WebButton'}
            stateName={definition.stateNames?.[0] ?? 'base'}
            definitions={[definition]}
            properties={{ [definition.name]: definition.defaultValue }}
            onChange={onChange}
          />
        </ProjectColorPaletteContext.Provider>,
      );
      if (definition.editor.kind === 'color') {
        fireEvent.click(screen.getByLabelText(`Use #007ACC for ${definition.label}`));
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ [definition.name]: paletteColorReference('blue') }),
        );
      } else {
        for (const end of ['from', 'to']) {
          fireEvent.click(
            screen.getByLabelText(`Use #007ACC for ${definition.label} ${end} color`),
          );
          expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
              [definition.name]: expect.objectContaining({ [end]: paletteColorReference('blue') }),
            }),
          );
        }
      }
      cleanup();
    }
  });
});
