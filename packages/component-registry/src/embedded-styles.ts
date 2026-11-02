import { resolveComponentStyleClassName, type RuntimeComponentStyle } from '@webrad/runtime/visual';
import type { ComponentStyleModel } from '@webrad/project-model';
import type { ComponentDefinition, RegisteredComponentNode } from './types.js';

/** Registered property paths keep composite control knowledge out of IDE and compiler branches. */
export function embeddedComponentStyleCatalog(
  definition: ComponentDefinition,
  node: Pick<RegisteredComponentNode, 'props'>,
  styles: readonly ComponentStyleModel[],
): readonly RuntimeComponentStyle[] | undefined {
  const metadata = definition.embeddedStyles;
  if (!metadata) return undefined;
  const rootProperty = metadata.propertyPath[0];
  let bindings: unknown =
    rootProperty !== undefined && node.props[rootProperty] === undefined
      ? definition.defaults
      : node.props;
  for (const key of metadata.propertyPath) {
    if (typeof bindings !== 'object' || bindings === null) return undefined;
    bindings = Reflect.get(bindings, key) as unknown;
  }
  if (bindings === undefined) return undefined;
  const types = new Set(metadata.slots.map((slot) => slot.componentType));
  return styles
    .filter((style) => types.has(style.componentType))
    .map((style) => ({
      id: style.id,
      componentType: style.componentType,
      ...(style.preset === undefined ? {} : { preset: style.preset }),
      className: resolveComponentStyleClassName(style),
    }));
}
