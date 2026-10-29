import {
  automaticMenuLayout,
  menuInspectorProperties,
  MENU_CONFIGURATION_PROPERTY,
} from './menu-properties.js';
import { projectWebMenuLayout, reusableMenuNode } from '@webrad/runtime/menu-layout';
import { createDefaultWebMenuConfiguration } from '@webrad/runtime/menu-model';
import type {
  ComponentDefinition,
  ComponentEventDefinition,
  ComponentPropertyDefinition,
} from './types.js';

export const MENU_EVENTS: readonly ComponentEventDefinition[] = [
  {
    name: 'OnSearch',
    category: 'Menu',
    eventDetailType: 'WebMenuSearchEvent',
    eventDetailProperties: ['text'],
    description:
      'Emitted when the user presses Enter in event search mode. Typing and clearing do not emit; menu items remain unchanged.',
  },
  {
    name: 'OnItemClick',
    category: 'Menu',
    eventDetailType: 'WebMenuItemEvent',
    eventDetailProperties: ['item', 'itemId', 'path'],
    description:
      'Call event.preventDefault() synchronously to cancel automatic selection and navigation.',
  },
  {
    name: 'OnSelectionChange',
    category: 'Menu',
    eventDetailType: 'WebMenuItemEvent',
    eventDetailProperties: ['item', 'itemId'],
  },
  {
    name: 'OnItemToggle',
    category: 'Menu',
    eventDetailType: 'WebMenuItemToggleEvent',
    eventDetailProperties: ['itemId', 'expanded'],
  },
  {
    name: 'OnCollapseChange',
    category: 'Menu',
    eventDetailType: 'WebMenuStateEvent',
    eventDetailProperties: ['collapsed'],
  },
  { name: 'OnOpen', category: 'Menu', eventDetailType: 'WebMenuStateEvent' },
  { name: 'OnClose', category: 'Menu', eventDetailType: 'WebMenuStateEvent' },
  { name: 'OnBrandClick', category: 'Menu', eventDetailType: 'WebMenuBrand' },
  { name: 'OnUserClick', category: 'Menu', eventDetailType: 'WebMenuUser' },
];

export function createWebMenuDefinition(
  geometry: readonly ComponentPropertyDefinition[],
): ComponentDefinition {
  return {
    type: 'WebMenu',
    displayName: 'Menu',
    namePrefix: 'Menu',
    palette: { category: 'Navigation', caption: 'Menu' },
    icon: 'menu',
    visual: true,
    canHaveChildren: false,
    defaultEvent: 'OnItemClick',
    designerAction: 'menu-configurator',
    projectLayout: (node, viewport, context) =>
      projectWebMenuLayout(
        node,
        viewport.responsiveWidth ?? viewport.width,
        undefined,
        context?.reusableElements?.some(
          (definition) => reusableMenuNode(definition)?.id === node.id,
        ) ?? false,
        viewport.height,
      ),
    supportsFloatingPlacement: true,
    floatingSizing: 'responsive',
    automaticLayout: automaticMenuLayout,
    inspectorProperties: menuInspectorProperties,
    defaultBounds: { width: 288, height: 640 },
    defaults: {
      configuration: createDefaultWebMenuConfiguration(),
      visible: true,
      collapseWhenHidden: true,
      enabled: true,
      placement: 'floating',
      floatingHorizontalAnchor: 'left',
      floatingVerticalAnchor: 'top',
    },
    styleEditor: {
      essentialProperties: [
        'fontFamily',
        'fontWeight',
        'letterSpacing',
        'lineHeight',
        'borderWidth',
        'borderStyle',
        'borderColor',
        'borderRadius',
        'boxShadow',
        'opacity',
      ],
    },
    properties: [
      ...geometry,
      {
        name: 'menuDefinitionId',
        label: 'Menu definition',
        type: 'menu-definition',
        category: 'Menu',
        source: 'props',
        description:
          'Shared configuration and TypeScript; runtime state remains independent for each placement.',
      },
      {
        name: 'editMenuDefinition',
        label: 'Edit shared menu',
        type: 'designer-action',
        category: 'Menu',
        designerAction: 'menu-definition-edit',
      },
      MENU_CONFIGURATION_PROPERTY,
      {
        name: 'placement',
        label: 'Placement',
        type: 'enum',
        source: 'props',
        defaultValue: 'floating',
        options: ['in-flow', 'floating'],
        readOnly: true,
      },
      {
        name: 'floatingHorizontalAnchor',
        label: 'Horizontal side',
        type: 'enum',
        source: 'props',
        defaultValue: 'left',
        options: ['left', 'center', 'right'],
        category: 'Menu placement',
      },
      {
        name: 'floatingVerticalAnchor',
        label: 'Vertical side',
        type: 'enum',
        source: 'props',
        defaultValue: 'top',
        options: ['top', 'center', 'bottom'],
        category: 'Menu placement',
      },
      {
        name: 'floatingZIndex',
        label: 'Layer',
        type: 'number',
        source: 'props',
        defaultValue: 1000,
        readOnly: true,
      },
    ],
    events: MENU_EVENTS,
  };
}
