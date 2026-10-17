import { describe, expect, it } from 'vitest';
import {
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  type ComponentStyleProperties,
} from '@webrad/project-model';

import {
  createStylePropertyGroups,
  type StylePropertyGroup,
  type StylePropertyView,
} from '../src/style-editor.js';

type CatalogOptions = Parameters<typeof createStylePropertyGroups>[0];

function catalog(overrides: Partial<CatalogOptions> = {}): readonly StylePropertyGroup[] {
  return createStylePropertyGroups({
    definitions: COMPONENT_STYLE_PROPERTY_DEFINITIONS,
    componentType: 'WebButton',
    stateName: 'base',
    properties: {},
    essentialProperties: ['backgroundColor', 'textColor', 'borderRadius'],
    view: 'essential',
    search: '',
    ...overrides,
  });
}

function names(groups: readonly StylePropertyGroup[]): readonly string[] {
  return groups.flatMap((group) => group.definitions.map((definition) => definition.name));
}

describe('visual style property browsing', () => {
  it('keeps the initial view small and retains configured uncommon properties', () => {
    expect(names(catalog())).toEqual(['backgroundColor', 'borderRadius', 'textColor']);

    const groups = catalog({ properties: { rotate: 15, opacity: 0 } });
    expect(names(groups)).toEqual(
      expect.arrayContaining(['backgroundColor', 'borderRadius', 'textColor', 'rotate', 'opacity']),
    );
    expect(groups.find((group) => group.name === 'Appearance')?.configuredCount).toBe(1);
    expect(groups.find((group) => group.name === 'Motion')?.configuredCount).toBe(1);
  });

  it('shows only configured values in the configured view, including zero', () => {
    const groups = catalog({
      view: 'configured',
      properties: { opacity: 0, rotate: 0, fontSize: { value: 0, unit: 'px' } },
    });

    expect(names(groups)).toEqual(['opacity', 'fontSize', 'rotate']);
    expect(groups.map((group) => group.configuredCount)).toEqual([1, 1, 1]);
    expect(catalog({ view: 'configured' })).toEqual([]);
  });

  it.each<StylePropertyView>(['essential', 'configured', 'all'])(
    'searches the complete applicable catalog while browsing %s',
    (view) => {
      expect(names(catalog({ view, search: '  rOtAtE  ' }))).toEqual(['rotate']);
    },
  );

  it('matches descriptions, source categories, and simplified group names', () => {
    expect(names(catalog({ search: 'participates in layout' }))).toEqual(['display']);
    const transformGroups = catalog({ search: 'Transform' });
    expect(names(transformGroups)).toEqual(
      expect.arrayContaining(['rotate', 'scale', 'translateX', 'transformOrigin']),
    );

    const motionGroups = catalog({ search: 'Motion' });
    expect(motionGroups.map((group) => group.name)).toEqual(['Motion']);
    expect(names(motionGroups)).toEqual(expect.arrayContaining(['rotate', 'animationName']));
  });

  it('falls back to all applicable properties when a component has no shortcut metadata', () => {
    expect(names(catalog({ essentialProperties: undefined }))).toEqual(
      names(catalog({ view: 'all' })),
    );
    expect(names(catalog({ essentialProperties: undefined }))).toContain('animationName');
    expect(names(catalog({ essentialProperties: [] }))).toEqual([]);
  });

  it('respects component applicability even when values exist or search bypasses the view', () => {
    const properties: ComponentStyleProperties = {
      objectFit: 'cover',
      buttonContentMode: 'icon',
      dataGridHeaderBackgroundColor: '#334455',
    };

    expect(names(catalog({ componentType: 'WebImage', view: 'configured', properties }))).toEqual([
      'objectFit',
    ]);
    expect(names(catalog({ componentType: 'WebImage', properties, search: 'Button' }))).toEqual([]);
    expect(names(catalog({ componentType: 'WebButton', properties, search: 'Image fit' }))).toEqual(
      [],
    );
  });

  it('filters base-only button settings while allowing state-specific icon appearance', () => {
    const groups = catalog({
      stateName: 'hover',
      search: 'Icon',
      properties: { buttonContentMode: 'icon', buttonIconPosition: 'right' },
    });

    expect(names(groups)).toEqual(['buttonIconSize', 'buttonIconColor']);
    expect(groups[0]?.configuredCount).toBe(0);
  });

  it('preserves grid state restrictions before browsing or search filters', () => {
    const properties: ComponentStyleProperties = {
      textColor: '#112233',
      dataGridHeaderBackgroundColor: '#334455',
    };
    const options: Partial<CatalogOptions> = {
      componentType: 'WebDataGrid',
      essentialProperties: ['textColor', 'dataGridHeaderBackgroundColor'],
      properties,
    };

    expect(names(catalog(options))).toEqual(['textColor', 'dataGridHeaderBackgroundColor']);
    expect(names(catalog({ ...options, stateName: 'hover' }))).toEqual(['textColor']);
    expect(catalog({ ...options, stateName: 'hover', search: 'Header' })).toEqual([]);
  });

  it('groups without modifying definitions, shortcut lists, or persisted values', () => {
    const definitions = Object.freeze([...COMPONENT_STYLE_PROPERTY_DEFINITIONS].reverse());
    const essentialProperties = Object.freeze(['textColor', 'backgroundColor']);
    const properties = Object.freeze({
      textColor: '#112233',
      backgroundColor: '#334455',
      rotate: 20,
    });
    const initialDefinitionOrder = [...definitions];
    const initialProperties = structuredClone(properties);
    const groups = catalog({ definitions, essentialProperties, properties });

    expect(groups.map((group) => group.name)).toEqual(['Appearance', 'Text', 'Motion']);
    expect(groups.map((group) => group.configuredCount)).toEqual([1, 1, 1]);
    expect(definitions).toEqual(initialDefinitionOrder);
    expect(properties).toEqual(initialProperties);
    expect(essentialProperties).toEqual(['textColor', 'backgroundColor']);
    for (const group of groups) {
      for (const definition of group.definitions) {
        expect(definitions).toContain(definition);
      }
    }
    expect(catalog({ definitions, essentialProperties, properties })).toEqual(groups);
  });
});
