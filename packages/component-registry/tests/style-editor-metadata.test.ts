import { describe, expect, it } from 'vitest';
import { COMPONENT_STYLE_PROPERTY_DEFINITIONS } from '@webrad/project-model';

import {
  ComponentRegistry,
  InvalidComponentDefinitionError,
  componentRegistry,
} from '../src/index.js';

function essentialProperties(type: string): readonly string[] {
  const properties = componentRegistry.require(type).styleEditor?.essentialProperties;
  expect(properties, `${type} must describe its essential visual properties`).toBeDefined();
  return properties ?? [];
}

describe('registry visual style shortcuts', () => {
  it('curates a small, valid set for every visual component without replacing the full catalog', () => {
    for (const component of componentRegistry.list()) {
      if (!component.visual) {
        expect(component.styleEditor).toBeUndefined();
        continue;
      }

      const essentials = essentialProperties(component.type);
      const available = COMPONENT_STYLE_PROPERTY_DEFINITIONS.filter(
        (property) => property.componentTypes?.includes(component.type) ?? true,
      );
      expect(essentials.length).toBeGreaterThanOrEqual(10);
      expect(essentials.length).toBeLessThanOrEqual(22);
      expect(new Set(essentials).size).toBe(essentials.length);
      expect(essentials.length).toBeLessThan(available.length);

      for (const name of essentials) {
        const property = available.find((definition) => definition.name === name);
        expect(
          property,
          `${component.type} shortcut ${name} must apply to this component`,
        ).toBeDefined();
        expect(['Layout', 'Dimensions', 'Transform', 'Animation']).not.toContain(
          property?.category,
        );
      }

      expect(available.some((property) => property.category === 'Animation')).toBe(true);
      expect(available.some((property) => property.category === 'Transform')).toBe(true);
    }
  });

  it('prioritizes inherited typography and surface appearance on containers', () => {
    for (const type of ['WebPage', 'WebPanel', 'WebPopup', 'WebReusableElement']) {
      expect(essentialProperties(type)).toEqual(
        expect.arrayContaining([
          'backgroundColor',
          'textColor',
          'fontFamily',
          'fontSize',
          'borderColor',
          'borderWidth',
          'borderRadius',
          'boxShadow',
        ]),
      );
      expect(essentialProperties(type)).not.toContain('objectFit');
      expect(essentialProperties(type)).not.toContain('buttonContentMode');
    }
  });

  it('selects typography for text and fit, position, and appearance for images', () => {
    expect(essentialProperties('WebLabel')).toEqual(
      expect.arrayContaining([
        'fontSize',
        'fontWeight',
        'textAlign',
        'lineHeight',
        'textDecoration',
        'whiteSpace',
      ]),
    );
    expect(essentialProperties('WebImage')).toEqual(
      expect.arrayContaining(['objectFit', 'objectPosition', 'borderRadius', 'boxShadow']),
    );
    expect(essentialProperties('WebImage')).not.toContain('fontSize');
    expect(essentialProperties('WebLabel')).not.toContain('objectFit');
  });

  it('keeps input focus and button icon controls available in their relevant shortcuts', () => {
    for (const type of ['WebEdit', 'WebTextArea', 'WebComboBox', 'WebListBox']) {
      expect(essentialProperties(type)).toEqual(
        expect.arrayContaining([
          'fontSize',
          'borderColor',
          'borderRadius',
          'ringColor',
          'ringWidth',
        ]),
      );
      expect(essentialProperties(type)).not.toContain('buttonContentMode');
    }

    expect(essentialProperties('WebButton')).toEqual(
      expect.arrayContaining([
        'backgroundColor',
        'textColor',
        'paddingLeft',
        'paddingRight',
        'buttonContentMode',
        'buttonIconPosition',
        'buttonIconSize',
        'buttonIconColor',
      ]),
    );
    expect(essentialProperties('WebCheckBox')).toEqual(
      expect.arrayContaining(['textColor', 'fontSize', 'ringColor']),
    );
  });

  it('covers the grid body and each specialized visual section while preserving state restrictions', () => {
    const names = new Set(essentialProperties('WebDataGrid'));
    const properties = COMPONENT_STYLE_PROPERTY_DEFINITIONS.filter((property) =>
      names.has(property.name),
    );
    expect(properties.map((property) => property.category)).toEqual(
      expect.arrayContaining([
        'Typography',
        'Colors',
        'Border',
        'Data Grid Lines',
        'Data Grid Header',
        'Data Grid Footer',
        'Data Grid Button',
        'Data Grid Checkbox',
      ]),
    );
    for (const property of properties.filter((property) => property.name.startsWith('dataGrid'))) {
      expect(property.componentTypes).toEqual(['WebDataGrid']);
      expect(property.stateNames).toEqual(['base']);
    }
  });

  it('copies and freezes shortcut metadata without freezing the caller-owned input', () => {
    const properties = ['fontSize'];
    const styleEditor = { essentialProperties: properties };
    const registry = new ComponentRegistry([
      { ...componentRegistry.require('WebLabel'), type: 'WebCustomLabel', styleEditor },
    ]);

    expect(Object.isFrozen(styleEditor)).toBe(false);
    expect(Object.isFrozen(properties)).toBe(false);
    properties.push('textColor');

    const stored = registry.require('WebCustomLabel').styleEditor;
    expect(stored?.essentialProperties).toEqual(['fontSize']);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored?.essentialProperties)).toBe(true);
  });

  it('rejects ambiguous or malformed shortcut names before registration', () => {
    const base = componentRegistry.require('WebLabel');
    for (const essentialProperties of [['fontSize', 'fontSize'], ['bad-name'], ['']]) {
      expect(
        () => new ComponentRegistry([{ ...base, styleEditor: { essentialProperties } }]),
      ).toThrow(InvalidComponentDefinitionError);
    }
  });
});
