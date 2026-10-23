import {
  createDefaultWebMenuConfiguration,
  parseWebMenuConfiguration,
} from '@webrad/runtime/menu-model';
import type { ComponentDefinition, ComponentPropertyDefinition } from './types.js';

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
    defaultBounds: { width: 288, height: 640 },
    defaults: {
      configuration: createDefaultWebMenuConfiguration(),
      visible: true,
      collapseWhenHidden: true,
      enabled: true,
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
        name: 'configuration',
        label: 'Menu configuration',
        type: 'menu-config',
        category: 'Menu',
        source: 'props',
        designerAction: 'menu-configurator',
        defaultValue: createDefaultWebMenuConfiguration(),
        description:
          'Edit nested items, icons, brand, user profile, appearance and desktop/mobile behavior.',
        validateValue: (value) => {
          try {
            parseWebMenuConfiguration(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    ],
    events: [
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
    ],
  };
}
