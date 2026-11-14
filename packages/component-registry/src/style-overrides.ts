import {
  COMPONENT_STYLE_PROPERTY_NAMES,
  type ComponentStylePropertyName,
} from '@webrad/project-model';
import type { ComponentPropertyDefinition } from './types.js';

const styleProperties = new Set<string>(COMPONENT_STYLE_PROPERTY_NAMES);
const aliases: Readonly<Record<string, ComponentStylePropertyName>> = {
  color: 'textColor',
  textWrap: 'whiteSpace',
};
const resetProperties = new Set<string>([
  ...COMPONENT_STYLE_PROPERTY_NAMES,
  ...Object.keys(aliases),
  'margin',
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
  'backgroundRepeat',
  'webradPaintOverrides',
]);

/** Selecting a style relinquishes instance visual overrides to the style catalog. */
export function resetComponentStyleOverrides(
  props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(props).filter(([name]) => !resetProperties.has(name)));
}

/** Project representable style values into existing Inspector editors without copying them. */
export function inspectorStylePropertyValue(
  property: ComponentPropertyDefinition,
  base: Readonly<Record<string, unknown>>,
): unknown {
  if ((property.source ?? 'props') !== 'props') return undefined;
  const name = aliases[property.name] ?? property.name;
  if (!styleProperties.has(name)) return undefined;
  const value = base[name];
  if (property.name === 'textWrap' && typeof value === 'string') {
    return value === 'nowrap' ? 'none' : 'word';
  }
  if (property.type === 'number' && typeof value === 'object' && value !== null) {
    return 'unit' in value && value.unit === 'px' && 'value' in value ? value.value : undefined;
  }
  return value;
}
