import {
  createDefaultWebMenuConfiguration,
  parseWebMenuConfiguration,
} from '@webrad/runtime/menu-model';
import { reusableMenuNode } from '@webrad/runtime/menu-layout';
import type {
  ComponentLayoutContext,
  ComponentPropertyDefinition,
  RegisteredComponentNode,
} from './types.js';

export const MENU_CONFIGURATION_PROPERTY: ComponentPropertyDefinition = {
  name: 'configuration',
  label: 'Menu configuration',
  type: 'menu-config',
  category: 'Menu',
  source: 'props',
  designerAction: 'menu-configurator',
  defaultValue: createDefaultWebMenuConfiguration(),
  description:
    'Edit orientation, menu items, brand, user and appearance. Responsive placement is automatic.',
  validateValue: (value) => {
    try {
      parseWebMenuConfiguration(value);
      return true;
    } catch {
      return false;
    }
  },
};

export function menuInspectorTarget(
  node: RegisteredComponentNode,
  context?: ComponentLayoutContext,
): RegisteredComponentNode | undefined {
  if (node.type === 'WebMenu') return node;
  const definition =
    node.type === 'WebReusableElement'
      ? context?.reusableElements?.find((item) => item.id === node.props.reusableElementId)
      : context?.document?.rootComponentId === node.id
        ? context.document
        : undefined;
  return reusableMenuNode(definition) as RegisteredComponentNode | undefined;
}

export function automaticMenuLayout(
  node: RegisteredComponentNode,
  context?: ComponentLayoutContext,
): boolean {
  return menuInspectorTarget(node, context) !== undefined;
}

export function menuInspectorProperties(
  properties: readonly ComponentPropertyDefinition[],
  node: RegisteredComponentNode,
  context?: ComponentLayoutContext,
): readonly ComponentPropertyDefinition[] {
  const menu = menuInspectorTarget(node, context);
  if (!menu) return properties;
  const orientation = (menu.props.configuration as { readonly orientation?: unknown } | undefined)
    ?.orientation;
  const root = context?.document?.rootComponentId === node.id;
  const embedded =
    node.type === 'WebMenu' &&
    context?.reusableElements?.some((definition) => reusableMenuNode(definition)?.id === node.id);
  if (embedded)
    return properties.filter((property) =>
      ['name', 'visible', 'enabled', 'configuration'].includes(property.name),
    );
  const allowed = new Set([
    'name',
    'reusableElementId',
    'visible',
    'enabled',
    'configuration',
    'itemMinWidth',
    'itemMaxWidth',
    'itemMinHeight',
    'itemMaxHeight',
    ...(orientation === 'horizontal' ? ['height'] : ['width']),
    ...(!root ? ['floatingHorizontalAnchor', 'floatingVerticalAnchor'] : []),
    ...(!root ? ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] : []),
  ]);
  const selected = properties
    .filter((property) => allowed.has(property.name))
    .map((property) => ({
      ...property,
      ...(property.name.startsWith('item')
        ? { category: 'Menu size', inspectorGroup: undefined }
        : {}),
      ...(property.name === 'floatingHorizontalAnchor'
        ? {
            label: 'Horizontal side',
            category: 'Menu placement',
            options: ['left', 'center', 'right'],
          }
        : {}),
      ...(property.name === 'floatingVerticalAnchor'
        ? {
            label: 'Vertical side',
            category: 'Menu placement',
            options: ['top', 'center', 'bottom'],
          }
        : {}),
    }));
  return selected.some((property) => property.name === 'configuration')
    ? selected
    : [...selected, MENU_CONFIGURATION_PROPERTY];
}

export function menuDesignSurface(
  node: RegisteredComponentNode,
  context: ComponentLayoutContext,
): { width?: number; height?: number } | undefined {
  if (context.document?.rootComponentId !== node.id) return undefined;
  const menu = menuInspectorTarget(node, context);
  if (!menu || menu.id === node.id) return undefined;
  const horizontal =
    (menu.props.configuration as { orientation?: unknown } | undefined)?.orientation ===
    'horizontal';
  return {
    width: horizontal ? undefined : (context.document.width ?? node.bounds.width),
    height: context.document.height ?? node.bounds.height,
  };
}
