// @vitest-environment jsdom

import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  createProject,
  DEFAULT_PROJECT_THEMES,
  customThemeColorReference,
  paletteColorReference,
  type ProjectThemeSettings,
} from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectThemeContext } from '../project-theme';
import { ColorInput } from './ColorInput';
import { ObjectInspector } from './ObjectInspector';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { VisualStyleEditor } from './VisualStyleEditor';
import { StylesWorkspace } from './StylesWorkspace';

const themes: ProjectThemeSettings = {
  ...DEFAULT_PROJECT_THEMES,
  customColors: [
    { id: 'graphite', name: 'Graphite', light: '#334155', dark: '#334155' },
    { id: 'blue', name: 'Blue', light: '#007acc', dark: '#60a5fa' },
  ],
};
const context = { themes, mode: 'light' as const };
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

describe('project theme colors', () => {
  it('distinguishes linked style colors and unlinks legacy references at their current value when Custom color is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const definition = COMPONENT_STYLE_PROPERTY_DEFINITIONS.find(
      (entry) => entry.name === 'textColor',
    )!;
    render(
      <ProjectThemeContext.Provider value={context}>
        <VisualStyleEditor
          componentType="WebLabel"
          stateName="base"
          definitions={[definition]}
          properties={{ textColor: paletteColorReference('blue') }}
          onChange={onChange}
        />
      </ProjectThemeContext.Provider>,
    );
    const selector = screen.getByLabelText('Text color type') as HTMLSelectElement;
    expect(selector.value).toBe('theme');
    await user.selectOptions(selector, 'custom');
    expect(onChange).toHaveBeenCalledWith({ textColor: '#007acc' });
  });

  it('resolves the selected identity after theme edits and emits a literal when edited manually', () => {
    const onChange = vi.fn();
    const linked = customThemeColorReference('blue');
    const { rerender } = render(
      <ProjectThemeContext.Provider value={context}>
        <ColorInput label="Linked color" value={linked} onChange={onChange} />
      </ProjectThemeContext.Provider>,
    );
    expect((screen.getByLabelText('Linked color') as HTMLInputElement).value).toBe('#007acc');
    const changed = {
      ...themes,
      customColors: [
        ...themes.customColors.map((entry) =>
          entry.id === 'blue' ? { ...entry, name: 'Rose', light: '#e11d48' } : entry,
        ),
        { id: 'duplicate', name: 'Duplicate', light: '#e11d48', dark: '#e11d48' },
      ],
    };
    rerender(
      <ProjectThemeContext.Provider value={{ themes: changed, mode: 'light' }}>
        <ColorInput label="Linked color" value={linked} onChange={onChange} />
      </ProjectThemeContext.Provider>,
    );
    expect((screen.getByLabelText('Linked color') as HTMLInputElement).value).toBe('#e11d48');
    expect(
      screen.getByLabelText('Use theme Rose for Linked color').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByLabelText('Use theme Duplicate for Linked color').getAttribute('aria-pressed'),
    ).toBe('false');
    fireEvent.change(screen.getByLabelText('Linked color'), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');
  });

  it('keeps custom color input available and disables theme selection with its field', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ColorInput label="Color" value="#000000" onChange={onChange} showThemeColors={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Predefined colors for Color' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '#123456' } });
    expect(onChange).toHaveBeenCalledWith('#123456');
    rerender(
      <ProjectThemeContext.Provider value={context}>
        <ColorInput label="Color" value="#000000" onChange={onChange} disabled />
      </ProjectThemeContext.Provider>,
    );
    expect(
      (screen.getByRole('button', { name: 'Predefined colors for Color' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    rerender(
      <ProjectThemeContext.Provider value={context}>
        <ColorInput label="Color" value="#000000" onChange={onChange} />
      </ProjectThemeContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'Predefined colors for Color' }));
    await user.click(screen.getByRole('button', { name: 'Use theme Blue for Color' }));
    expect(onChange).toHaveBeenLastCalledWith(customThemeColorReference('blue'));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Predefined colors for Color' }),
    );
  });

  it('adds, edits, removes and saves custom colors in Themes without mutating settings on cancel', async () => {
    const settings = createProject('Themes').settings;
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <StylesWorkspace
        styles={[]}
        themes={settings.themes}
        onUpdateThemes={onSave}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={vi.fn()}
        onDeleteStyle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Color palette' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Themes' }));
    await user.click(screen.getByRole('button', { name: 'Add color' }));
    const id = document
      .querySelector('[data-custom-theme-color]')!
      .getAttribute('data-custom-theme-color')!;
    fireEvent.change(screen.getByLabelText(`Color ${id} name`), { target: { value: 'Brand' } });
    fireEvent.change(screen.getByLabelText(`light ${id} value`), { target: { value: '#zzzzzz' } });
    await user.click(screen.getByRole('button', { name: 'Save themes' }));
    expect(screen.getByRole('alert').textContent).toContain('hexadecimal');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(`light ${id}`), { target: { value: '#007acc' } });
    expect((screen.getByLabelText(`dark ${id} value`) as HTMLInputElement).value).toBe('#007acc');
    await user.click(screen.getByRole('button', { name: 'Add color' }));
    const extraId = document
      .querySelectorAll('[data-custom-theme-color]')[1]!
      .getAttribute('data-custom-theme-color')!;
    await user.click(screen.getByLabelText(`Remove theme color ${extraId}`));
    await user.click(screen.getByRole('button', { name: 'Save themes' }));
    expect((onSave.mock.calls[0]?.[0] as ProjectThemeSettings).customColors).toEqual([
      { id, name: 'Brand', light: '#007acc', dark: '#007acc' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Themes' }));
    await user.click(screen.getByRole('button', { name: 'Add color' }));
    onSave.mockClear();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Project themes' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(settings.themes.customColors).toEqual([]);
  });

  it('keeps theme choices in project options without a separate color configuration in settings', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Themes"
        settings={{ ...createProject('Themes').settings, themes }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.queryByRole('tab', { name: 'Color palette' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Predefined colors for Track color' }));
    await user.click(screen.getByRole('button', { name: 'Use theme Blue for Track color' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        themes,
        scrollbar: expect.objectContaining({ trackColor: customThemeColorReference('blue') }),
      }),
    );
  });

  it('applies theme colors through every registered color property in the Inspector', () => {
    for (const definition of defaultComponentRegistry.list()) {
      const colorProperties = definition.properties.filter((property) => property.type === 'color');
      if (colorProperties.length === 0) continue;
      const onPropertyChange = vi.fn();
      const node = defaultComponentRegistry.createComponent(definition.type);
      render(
        <ProjectThemeContext.Provider value={context}>
          <ObjectInspector
            selection={[node]}
            onPropertyChange={onPropertyChange}
            onEventChange={vi.fn()}
            onEventDoubleClick={vi.fn()}
          />
        </ProjectThemeContext.Provider>,
      );
      for (const property of colorProperties) {
        const label = `${property.label ?? property.name} color picker`;
        fireEvent.click(screen.getByLabelText(`Use theme Blue for ${label}`));
        expect(onPropertyChange).toHaveBeenLastCalledWith(
          property.name,
          customThemeColorReference('blue'),
          expect.objectContaining(property),
        );
      }
      cleanup();
    }
  });

  it('offers theme choices for all style colors and both endpoints of every gradient', () => {
    for (const definition of COMPONENT_STYLE_PROPERTY_DEFINITIONS) {
      if (definition.editor.kind !== 'color' && definition.editor.kind !== 'gradient') continue;
      const onChange = vi.fn();
      render(
        <ProjectThemeContext.Provider value={context}>
          <VisualStyleEditor
            componentType={definition.componentTypes?.[0] ?? 'WebButton'}
            stateName={definition.stateNames?.[0] ?? 'base'}
            definitions={[definition]}
            properties={{ [definition.name]: definition.defaultValue }}
            onChange={onChange}
          />
        </ProjectThemeContext.Provider>,
      );
      if (definition.editor.kind === 'color') {
        fireEvent.click(screen.getByLabelText(`Use theme Blue for ${definition.label}`));
        expect(onChange).toHaveBeenLastCalledWith(
          expect.objectContaining({ [definition.name]: customThemeColorReference('blue') }),
        );
      } else {
        for (const end of ['from', 'to']) {
          fireEvent.click(
            screen.getByLabelText(`Use theme Blue for ${definition.label} ${end} color`),
          );
          expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
              [definition.name]: expect.objectContaining({
                [end]: customThemeColorReference('blue'),
              }),
            }),
          );
        }
      }
      cleanup();
    }
  });
});
