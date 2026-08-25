import { describe, expect, it } from 'vitest';

import {
  ComponentRegistry,
  DuplicateComponentTypeError,
  InvalidComponentDefinitionError,
  MVP_COMPONENT_TYPES,
  UnknownComponentTypeError,
  componentRegistry,
  createMvpComponentRegistry,
  getNextComponentName,
  type ComponentDefinition,
} from '../src/index.js';

function definition(type = 'WebThing'): ComponentDefinition {
  return {
    type,
    displayName: 'Thing',
    namePrefix: 'Thing',
    palette: { category: 'Standard', caption: 'Thing' },
    icon: 'component-thing',
    visual: true,
    canHaveChildren: false,
    defaultEvent: 'OnClick',
    defaultBounds: { width: 100, height: 32 },
    defaults: { caption: 'Thing', options: ['one'] },
    properties: [
      {
        name: 'caption',
        label: 'Caption',
        type: 'string',
        category: 'Appearance',
        source: 'props',
        defaultValue: 'Thing',
      },
    ],
    events: [{ name: 'OnClick', category: 'Behavior' }],
  };
}

function defaultLayout() {
  return {
    container: {
      mode: 'fixed',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      gap: 0,
      wrap: false,
      justifyContent: 'start',
      alignItems: 'start',
    },
    item: {
      width: 'fixed',
      height: 'fixed',
      minWidth: 0,
      maxWidth: null,
      minHeight: 0,
      maxHeight: null,
      grow: 0,
      shrink: true,
      horizontalAnchor: 'start',
      verticalAnchor: 'start',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
  };
}

describe('MVP component metadata', () => {
  it('registers the ten visual controls and WebApiClient in a stable order', () => {
    expect(componentRegistry.list().map((item) => item.type)).toEqual(MVP_COMPONENT_TYPES);
    expect(componentRegistry.size).toBe(11);
    expect(
      componentRegistry
        .list()
        .filter((item) => item.visual)
        .map((item) => item.type),
    ).toEqual(MVP_COMPONENT_TYPES.filter((type) => type !== 'WebApiClient'));
  });

  it('describes role, palette, icon, size, defaults, properties, and events for every type', () => {
    for (const component of componentRegistry.list()) {
      expect(component.displayName).not.toBe('');
      expect(component.palette.category).not.toBe('');
      expect(component.palette.caption).not.toBe('');
      expect(component.icon).not.toBe('');
      expect(component.defaultBounds.width).toBeGreaterThan(0);
      expect(component.defaultBounds.height).toBeGreaterThan(0);
      expect(component.properties.some((property) => property.name === 'name')).toBe(true);
      if (component.visual) {
        expect(component.properties.some((property) => property.name === 'width')).toBe(true);
        expect(component.events.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks only page and panel as MVP containers', () => {
    expect(
      componentRegistry
        .list()
        .filter((item) => item.canHaveChildren)
        .map((item) => item.type),
    ).toEqual(['WebPage', 'WebPanel']);
  });

  it('exposes structural responsive-layout metadata only where it applies', () => {
    const containerPropertyNames = [
      'containerMode',
      'containerPaddingTop',
      'containerPaddingRight',
      'containerPaddingBottom',
      'containerPaddingLeft',
      'containerGap',
      'containerWrap',
      'containerJustifyContent',
      'containerAlignItems',
    ];
    const itemPropertyNames = [
      'itemWidth',
      'itemHeight',
      'itemMinWidth',
      'itemMaxWidth',
      'itemMinHeight',
      'itemMaxHeight',
      'itemGrow',
      'itemShrink',
      'itemHorizontalAnchor',
      'itemVerticalAnchor',
      'itemLeft',
      'itemRight',
      'itemTop',
      'itemBottom',
    ];

    for (const type of ['WebPage', 'WebPanel']) {
      const definition = componentRegistry.require(type);
      expect(
        definition.properties
          .filter((property) => property.source === 'layout-container')
          .map((property) => property.name),
      ).toEqual(containerPropertyNames);
    }
    for (const definition of componentRegistry.list().filter((definition) => definition.visual)) {
      expect(
        definition.properties
          .filter((property) => property.source === 'layout-item')
          .map((property) => property.name),
      ).toEqual(itemPropertyNames);
    }
  });

  it('provides the required WebButton default event and event set', () => {
    const button = componentRegistry.require('WebButton');
    expect(button.defaultEvent).toBe('OnClick');
    expect(button.defaults.caption).toBe('Button');
    expect(button.defaultBounds).toEqual({ width: 100, height: 32 });
    expect(button.events.map((item) => item.name)).toEqual([
      'OnClick',
      'OnFocus',
      'OnBlur',
      'OnMouseEnter',
      'OnMouseLeave',
    ]);
  });

  it('keeps palette filtering metadata-driven', () => {
    const registry = createMvpComponentRegistry();
    expect(registry.categories()).toEqual(['Containers', 'Standard', 'Nonvisual']);
    expect(registry.listByCategory('Containers').map((item) => item.type)).toEqual([
      'WebPage',
      'WebPanel',
    ]);
    expect(registry.listByCategory('Nonvisual').map((item) => item.type)).toEqual(['WebApiClient']);
  });

  it('describes WebApiClient as a functional nonvisual service with no fake events', () => {
    const apiClient = componentRegistry.require('WebApiClient');
    expect(apiClient.visual).toBe(false);
    expect(apiClient.canHaveChildren).toBe(false);
    expect(apiClient.defaultEvent).toBeNull();
    expect(apiClient.defaults).toEqual({ baseUrl: '' });
    expect(apiClient.properties.map((property) => property.name)).toEqual(['name', 'baseUrl']);
    expect(apiClient.events).toEqual([]);
  });
});

describe('ComponentRegistry behavior', () => {
  it('registers, retrieves, unregisters, and rejects duplicate or unknown types', () => {
    const registry = new ComponentRegistry();
    registry.register(definition());

    expect(registry.has('WebThing')).toBe(true);
    expect(registry.require('WebThing').displayName).toBe('Thing');
    expect(() => registry.register(definition())).toThrow(DuplicateComponentTypeError);
    expect(() => registry.require('Missing')).toThrow(UnknownComponentTypeError);
    expect(registry.unregister('WebThing')).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('validates definitions before registration', () => {
    const registry = new ComponentRegistry();
    expect(() =>
      registry.register({
        ...definition(),
        defaultEvent: 'OnMissing',
      }),
    ).toThrow(InvalidComponentDefinitionError);
    expect(() =>
      registry.register({
        ...definition(),
        properties: [{ name: 'mode', type: 'enum', options: [] }],
      }),
    ).toThrow(InvalidComponentDefinitionError);
    expect(() => registry.register({ ...definition(), type: 'bad-type' })).toThrow(
      InvalidComponentDefinitionError,
    );
  });

  it('copies and freezes registered metadata so callers cannot mutate it indirectly', () => {
    const defaults = { caption: 'Before', options: ['one'] };
    const input = { ...definition(), defaults };
    const registry = new ComponentRegistry([input]);
    defaults.caption = 'After';
    defaults.options.push('two');

    const stored = registry.require('WebThing');
    expect(stored.defaults).toEqual({ caption: 'Before', options: ['one'] });
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.defaults)).toBe(true);
    expect(Object.isFrozen(stored.properties)).toBe(true);
    expect(Object.isFrozen(stored.events)).toBe(true);
  });

  it('supports the conceptual static global registry API', () => {
    expect(ComponentRegistry.has('WebButton')).toBe(true);
    expect(ComponentRegistry.get('WebButton')).toBe(componentRegistry.get('WebButton'));
    expect(ComponentRegistry.list()).toHaveLength(11);
  });
});

describe('sequential names and node defaults', () => {
  it('finds the first available sequential name from strings or model nodes', () => {
    expect(getNextComponentName('WebButton', ['Button1', 'Button2', 'Button4'])).toBe('Button3');
    expect(componentRegistry.suggestName('WebEdit', [{ name: 'Edit1' }, { name: 'Edit2' }])).toBe(
      'Edit3',
    );
  });

  it('materializes bounds, defaults, events, parent, and injected stable ID', () => {
    const node = componentRegistry.createComponent('WebButton', {
      idFactory: () => 'stable-id',
      existingNames: ['Button1'],
      parentId: 'root-id',
      x: 420,
      y: 300,
      props: { caption: 'Gravar' },
    });

    expect(node).toEqual({
      id: 'stable-id',
      type: 'WebButton',
      name: 'Button2',
      parentId: 'root-id',
      layout: defaultLayout(),
      bounds: { x: 420, y: 300, width: 100, height: 32 },
      props: { caption: 'Gravar', visible: true, enabled: true, tabIndex: 0 },
      events: {
        OnClick: null,
        OnFocus: null,
        OnBlur: null,
        OnMouseEnter: null,
        OnMouseLeave: null,
      },
      children: [],
    });
  });

  it('materializes a nonvisual API client using the same persistent node contract', () => {
    const node = componentRegistry.createComponent('WebApiClient', {
      id: 'api-id',
      existingNames: ['ApiClient1'],
      parentId: 'root-id',
      props: { baseUrl: 'https://api.example.test/v1' },
    });

    expect(node).toEqual({
      id: 'api-id',
      type: 'WebApiClient',
      name: 'ApiClient2',
      parentId: 'root-id',
      layout: defaultLayout(),
      bounds: { x: 0, y: 0, width: 112, height: 52 },
      props: { baseUrl: 'https://api.example.test/v1' },
      events: {},
      children: [],
    });
  });

  it('does not share mutable default values between created nodes', () => {
    const first = componentRegistry.createComponent('WebComboBox', { id: 'first' });
    const second = componentRegistry.createComponent('WebComboBox', { id: 'second' });
    const firstItems = first.props.items;
    const secondItems = second.props.items;
    expect(Array.isArray(firstItems)).toBe(true);
    expect(Array.isArray(secondItems)).toBe(true);
    if (Array.isArray(firstItems)) firstItems.push('changed');
    expect(secondItems).toEqual([]);
    expect(first.layout).toEqual(defaultLayout());
    expect(second.layout).toEqual(defaultLayout());
    expect(first.layout).not.toBe(second.layout);
    expect(first.layout.container).not.toBe(second.layout.container);
    expect(first.layout.item).not.toBe(second.layout.item);
  });

  it('rejects explicit duplicate names and invalid sizes', () => {
    expect(() =>
      componentRegistry.createComponent('WebButton', {
        id: 'button-id',
        name: 'Button1',
        existingNames: ['Button1'],
      }),
    ).toThrow('already in use');
    expect(() =>
      componentRegistry.createComponent('WebButton', { id: 'button-id', width: 0 }),
    ).toThrow('dimensions');
  });
});
