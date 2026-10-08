import { describe, expect, it } from 'vitest';

it('exposes Margin on every visual component, including tray visuals, and keeps services DOM-less', () => {
  for (const component of componentRegistry.list()) {
    const margins = component.properties.filter((property) => property.name === 'margin');
    if (component.visual) {
      expect(margins).toEqual([
        expect.objectContaining({
          label: 'Margin',
          type: 'number',
          source: 'props',
          defaultValue: 0,
        }),
      ]);
      const instance = componentRegistry.createComponent(component.type, {
        id: `margin-${component.type}`,
        name: `Margin${component.type}`,
        props: { margin: 12 },
      });
      expect(instance.props.margin).toBe(12);
    } else expect(margins).toEqual([]);
  }
});

import {
  ComponentRegistry,
  DuplicateComponentTypeError,
  InvalidComponentDefinitionError,
  MVP_COMPONENT_TYPES,
  UnknownComponentTypeError,
  componentRegistry,
  createMvpComponentRegistry,
  getNextComponentName,
  resolveComponentDesignerPresentation,
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
  it('registers the reusable visual wrapper, controls, Popup, and WebApiClient in a stable order', () => {
    expect(componentRegistry.list().map((item) => item.type)).toEqual(MVP_COMPONENT_TYPES);
    expect(componentRegistry.size).toBe(14);
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
        if (component.type !== 'WebReusableElement') {
          expect(component.events.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('marks page, panel, and Popup as MVP containers', () => {
    expect(
      componentRegistry
        .list()
        .filter((item) => item.canHaveChildren)
        .map((item) => item.type),
    ).toEqual(['WebPage', 'WebPanel', 'WebPopup']);
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

    for (const type of ['WebPage', 'WebPanel', 'WebPopup']) {
      const definition = componentRegistry.require(type);
      expect(
        definition.properties
          .filter((property) => property.source === 'layout-container')
          .map((property) => property.name),
      ).toEqual(containerPropertyNames);
    }
    for (const definition of componentRegistry
      .list()
      .filter((definition) => resolveComponentDesignerPresentation(definition) === 'canvas')) {
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
    expect(button.defaults.icon).toBe('add');
    expect(button.properties.find((property) => property.name === 'icon')).toMatchObject({
      type: 'icon',
      source: 'props',
      options: expect.arrayContaining([
        'add',
        'save',
        'search',
        'calendar',
        'chart-line',
        'video',
        'login',
        'logout',
        'door-in',
        'door-out',
      ]),
    });
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
      'WebReusableElement',
    ]);
    expect(registry.listByCategory('Nonvisual').map((item) => item.type)).toEqual([
      'WebPopup',
      'WebApiClient',
    ]);
  });

  it('describes WebPopup as a browser-rendered floating container authored from the nonvisual tray', () => {
    const popup = componentRegistry.require('WebPopup');

    expect(popup.visual).toBe(true);
    expect(popup.designerPresentation).toBe('tray');
    expect(resolveComponentDesignerPresentation(popup)).toBe('tray');
    expect(popup.canHaveChildren).toBe(true);
    expect(popup.defaultEvent).toBe('OnShow');
    expect(popup.defaultBounds).toEqual({ width: 360, height: 200 });
    expect(popup.defaults).toEqual({
      modal: true,
      visible: false,
      collapseWhenHidden: true,
      enabled: true,
    });
    expect(popup.properties.map((property) => property.name)).toEqual([
      'name',
      'margin',
      'width',
      'height',
      'visible',
      'collapseWhenHidden',
      'enabled',
      'containerMode',
      'containerPaddingTop',
      'containerPaddingRight',
      'containerPaddingBottom',
      'containerPaddingLeft',
      'containerGap',
      'containerWrap',
      'containerJustifyContent',
      'containerAlignItems',
      'modal',
    ]);
    expect(popup.properties.filter((property) => property.source === 'bounds')).toEqual([
      expect.objectContaining({ name: 'width', category: 'Size', defaultValue: 360 }),
      expect.objectContaining({ name: 'height', category: 'Size', defaultValue: 200 }),
    ]);
    expect(popup.properties.some((property) => property.name === 'x')).toBe(false);
    expect(popup.properties.some((property) => property.name === 'y')).toBe(false);
    expect(
      popup.properties
        .filter((property) => property.source === 'layout-container')
        .map((property) => property.name),
    ).toEqual([
      'containerMode',
      'containerPaddingTop',
      'containerPaddingRight',
      'containerPaddingBottom',
      'containerPaddingLeft',
      'containerGap',
      'containerWrap',
      'containerJustifyContent',
      'containerAlignItems',
    ]);
    expect(popup.properties.some((property) => property.source === 'layout-item')).toBe(false);
    expect(popup.properties.some((property) => property.name === 'caption')).toBe(false);
    expect(popup.properties.some((property) => property.name === 'message')).toBe(false);
    expect(popup.properties.find((property) => property.name === 'modal')).toMatchObject({
      type: 'boolean',
      source: 'props',
      defaultValue: true,
    });
    expect(popup.events.map((eventDefinition) => eventDefinition.name)).toEqual([
      'OnShow',
      'OnHide',
      'OnClose',
      'OnCancel',
    ]);
  });

  it('describes WebApiClient as a functional nonvisual service with request lifecycle events', () => {
    const apiClient = componentRegistry.require('WebApiClient');
    expect(apiClient.visual).toBe(false);
    expect(apiClient.canHaveChildren).toBe(false);
    expect(apiClient.defaultEvent).toBeNull();
    expect(apiClient.designerAction).toBe('api-client-tester');
    expect(apiClient.defaults).toEqual({
      baseUrl: '',
      apiClientConfig: {
        schemaVersion: 1,
        defaultHeaders: [],
        timeoutMs: 30_000,
        operations: [
          {
            id: 'operation-1',
            name: 'Request',
            method: 'GET',
            path: '',
            headers: [],
            query: [],
            body: { kind: 'none', content: '' },
            credentials: 'omit',
            timeoutMs: null,
            responseSchema: null,
          },
        ],
      },
    });
    expect(apiClient.properties.map((property) => property.name)).toEqual([
      'name',
      'baseUrl',
      'apiClientConfig',
    ]);
    expect(apiClient.properties.at(-1)).toMatchObject({
      name: 'apiClientConfig',
      type: 'api-client-config',
      source: 'props',
      designerAction: 'api-client-tester',
    });
    const baseUrl = apiClient.properties.find((property) => property.name === 'baseUrl');
    expect(baseUrl?.description).toContain('RestGo integration');
    expect(baseUrl?.readOnlyWhen?.({})).toBe(false);
    expect(baseUrl?.readOnlyWhen?.({ apiClientConfig: null })).toBe(false);
    expect(baseUrl?.readOnlyWhen?.({ apiClientConfig: { connection: 'custom' } })).toBe(false);
    expect(baseUrl?.readOnlyWhen?.({ apiClientConfig: { connection: 'restgo-session' } })).toBe(
      true,
    );
    expect(apiClient.events.map((eventDefinition) => eventDefinition.name)).toEqual([
      'OnRequest',
      'OnSuccess',
      'OnError',
      'OnComplete',
    ]);
    expect(apiClient.events.every((eventDefinition) => eventDefinition.eventDetailType)).toBe(true);
  });

  it('opens the dedicated Data Grid configurator through registry metadata', () => {
    const dataGrid = componentRegistry.require('WebDataGrid');
    expect(dataGrid.designerAction).toBe('data-grid-configurator');
    expect(dataGrid.defaults.dataGridConfig).toMatchObject({
      schemaVersion: 2,
      rowHeightMode: 'dynamic',
      minRowHeight: 36,
      columns: expect.arrayContaining([
        expect.objectContaining({
          widthMode: 'dynamic',
          minWidth: 96,
          flex: 1,
        }),
      ]),
    });
    expect(
      dataGrid.properties.find((property) => property.name === 'dataGridConfig'),
    ).toMatchObject({
      type: 'data-grid-config',
      source: 'props',
      designerAction: 'data-grid-configurator',
    });
    expect(dataGrid.events).toContainEqual({
      name: 'OnCellClick',
      label: 'OnCellClick',
      category: 'Data',
      eventDetailType: 'WebDataGridCellEventDetail',
      eventDetailProperties: ['column', 'rowIndex', 'columnIndex', 'value', 'getValue'],
    });
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
    expect(() =>
      registry.register({ ...definition(), designerPresentation: 'sidebar' as never }),
    ).toThrow(InvalidComponentDefinitionError);
  });

  it('resolves the default Designer presentation from runtime visual ownership', () => {
    expect(resolveComponentDesignerPresentation(componentRegistry.require('WebButton'))).toBe(
      'canvas',
    );
    expect(resolveComponentDesignerPresentation(componentRegistry.require('WebApiClient'))).toBe(
      'tray',
    );
    expect(resolveComponentDesignerPresentation(componentRegistry.require('WebPopup'))).toBe(
      'tray',
    );
    expect(
      resolveComponentDesignerPresentation({ visual: false, designerPresentation: 'canvas' }),
    ).toBe('canvas');
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
    expect(ComponentRegistry.list()).toHaveLength(14);
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
      props: {
        caption: 'Gravar',
        icon: 'add',
        visible: true,
        collapseWhenHidden: true,
        enabled: true,
        tabIndex: 0,
      },
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
      props: {
        baseUrl: 'https://api.example.test/v1',
        apiClientConfig: {
          schemaVersion: 1,
          defaultHeaders: [],
          timeoutMs: 30_000,
          operations: [
            {
              id: 'operation-1',
              name: 'Request',
              method: 'GET',
              path: '',
              headers: [],
              query: [],
              body: { kind: 'none', content: '' },
              credentials: 'omit',
              timeoutMs: null,
              responseSchema: null,
            },
          ],
        },
      },
      events: {
        OnRequest: null,
        OnSuccess: null,
        OnError: null,
        OnComplete: null,
      },
      children: [],
    });
  });

  it('materializes a tray-authored Popup with pure floating-container defaults', () => {
    const node = componentRegistry.createComponent('WebPopup', {
      id: 'popup-id',
      existingNames: ['Popup1'],
      parentId: 'root-id',
    });

    expect(node).toEqual({
      id: 'popup-id',
      type: 'WebPopup',
      name: 'Popup2',
      parentId: 'root-id',
      layout: defaultLayout(),
      bounds: { x: 0, y: 0, width: 360, height: 200 },
      props: {
        modal: true,
        visible: false,
        collapseWhenHidden: true,
        enabled: true,
      },
      events: {
        OnShow: null,
        OnHide: null,
        OnClose: null,
        OnCancel: null,
      },
      children: [],
    });
  });

  it('gives each API client an independent structured default configuration', () => {
    const first = componentRegistry.createComponent('WebApiClient', { id: 'api-first' });
    const second = componentRegistry.createComponent('WebApiClient', { id: 'api-second' });

    const firstConfig = first.props.apiClientConfig;
    const secondConfig = second.props.apiClientConfig;
    expect(firstConfig).toEqual(secondConfig);
    expect(firstConfig).not.toBe(secondConfig);
    if (
      typeof firstConfig === 'object' &&
      firstConfig !== null &&
      typeof secondConfig === 'object' &&
      secondConfig !== null
    ) {
      expect(Reflect.get(firstConfig, 'operations')).not.toBe(
        Reflect.get(secondConfig, 'operations'),
      );
    }
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

  it('rejects invalid generated-event detail metadata', () => {
    const missingType: ComponentDefinition = {
      ...definition('MissingEventDetailType'),
      events: [{ name: 'OnClick', eventDetailProperties: ['column'] }],
    };
    expect(() => new ComponentRegistry([missingType])).toThrow('require an event detail type');

    const invalidProperty: ComponentDefinition = {
      ...definition('InvalidEventDetailProperty'),
      events: [
        {
          name: 'OnClick',
          eventDetailType: 'WebDataGridCellEventDetail',
          eventDetailProperties: ['not-valid'],
        },
      ],
    };
    expect(() => new ComponentRegistry([invalidProperty])).toThrow('TypeScript-safe identifier');
  });
});
