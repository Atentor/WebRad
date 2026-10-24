import type { ComponentPropertyDefinition } from '@webrad/component-registry';

export type ResponsiveLayoutPropertyTarget = 'container' | 'item';

interface ResponsiveLayoutPropertyReference {
  readonly target: ResponsiveLayoutPropertyTarget | 'bounds';
  readonly field: string;
}

/** Resolves Inspector metadata names such as `containerGap` to persisted layout fields. */
export function responsiveLayoutPropertyReference(
  property: ComponentPropertyDefinition,
): ResponsiveLayoutPropertyReference | undefined {
  if (property.layoutCoordinate !== undefined)
    return { target: 'bounds', field: property.layoutCoordinate };
  const source = property.source;
  const prefix =
    source === 'layout-container' ? 'container' : source === 'layout-item' ? 'item' : '';
  if (prefix.length === 0 || !property.name.startsWith(prefix)) return undefined;
  const suffix = property.name.slice(prefix.length);
  if (suffix.length === 0) return undefined;
  return {
    target: source === 'layout-container' ? 'container' : 'item',
    field: `${suffix.slice(0, 1).toLocaleLowerCase()}${suffix.slice(1)}`,
  };
}
