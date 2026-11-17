import type { ComponentDefinition, ComponentPropertyDefinition } from './types.js';

const paintProperties = new Set(['backgroundColor', 'color', 'borderColor']);

const visualInternalProperties: readonly ComponentPropertyDefinition[] = Object.freeze([
  Object.freeze({
    name: 'webradPaintOverrides',
    type: 'string-list' as const,
    source: 'props' as const,
    readOnly: true,
    description: 'Instance paint precedence maintained by the Designer.',
    validateValue: (value: unknown): boolean =>
      Array.isArray(value) &&
      value.length <= paintProperties.size &&
      value.every((name: unknown) => typeof name === 'string' && paintProperties.has(name)) &&
      new Set(value).size === value.length,
  }),
]);

const noInternalProperties: readonly ComponentPropertyDefinition[] = Object.freeze([]);

/** Persisted metadata is validated separately from the public authoring API. */
export function getComponentInternalProperties(
  definition: Pick<ComponentDefinition, 'visual'>,
): readonly ComponentPropertyDefinition[] {
  return definition.visual ? visualInternalProperties : noInternalProperties;
}
