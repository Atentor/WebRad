import type { ComponentDefinition, ComponentPropertyDefinition } from './types.js';
import type { ApiClientFieldType } from '@webrad/project-model';

export const CURRENT_ROW_BINDINGS_PROPERTY: ComponentPropertyDefinition = {
  name: 'currentRowBindings',
  label: 'Current row',
  type: 'current-row-bindings',
  category: 'Data',
  source: 'props',
  defaultValue: [],
  designerAction: 'current-row-bindings',
  description: 'Bind writable visual values to fields of this repeated row.',
};

/** Registry metadata is the single catalogue of visual values offered for binding. */
export function getCurrentRowBindableProperties(
  definition: ComponentDefinition,
): readonly ComponentPropertyDefinition[] {
  if (!definition.visual) return [];
  return definition.properties.filter(
    (property) =>
      property.source === 'props' &&
      !property.readOnly &&
      ['string', 'number', 'boolean', 'enum', 'icon', 'color'].includes(property.type) &&
      ![
        'margin',
        'marginTop',
        'marginRight',
        'marginBottom',
        'marginLeft',
        'reusableElementId',
        'placement',
        'floatingHorizontalAnchor',
        'floatingVerticalAnchor',
        'floatingZIndex',
      ].includes(property.name),
  );
}

/** The Inspector and compiler use the same scalar assignment contract. */
export function isCurrentRowFieldCompatible(
  property: ComponentPropertyDefinition,
  fieldType: ApiClientFieldType,
): boolean {
  if (property.type === 'number') return fieldType === 'number' || fieldType === 'integer';
  if (property.type === 'boolean') return fieldType === 'boolean';
  if (['enum', 'icon', 'color'].includes(property.type)) return fieldType === 'string';
  return ['string', 'number', 'integer', 'boolean', 'date', 'datetime', 'null'].includes(fieldType);
}
