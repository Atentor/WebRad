import { paletteColorId, paletteColorReference } from '@webrad/runtime/visual';
import type {
  ComponentStyleProperties,
  ComponentStylePropertyName,
  ProjectPaletteColor,
} from './types.js';
import { COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME } from './style-properties.js';

export { paletteColorId, paletteColorReference };

/** Resolves a linked value for native color inputs without losing its identity. */
export function resolvePaletteColor(value: string, colors: readonly ProjectPaletteColor[]): string {
  const id = paletteColorId(value);
  return id === undefined ? value : (colors.find((color) => color.id === id)?.color ?? '#000000');
}

/** The same CSS variables drive Designer, style previews and browser builds. */
export function projectColorPaletteCss(colors: readonly ProjectPaletteColor[]): string {
  const declarations = colors.map((entry) => {
    paletteColorReference(entry.id);
    if (!/^#[0-9a-fA-F]{6}$/.test(entry.color)) throw new Error('Invalid palette color.');
    return `  --wr-palette-${entry.id}: ${entry.color};`;
  });
  return `:root {\n${declarations.join('\n')}\n}`;
}

/** Seeded Aurora styles bind matching colors to the project's actual palette. */
export function bindStyleColorsToPalette(
  properties: ComponentStyleProperties,
  colors: readonly ProjectPaletteColor[],
): ComponentStyleProperties {
  const bind = (value: string): string => {
    const entry = colors.find((color) => color.color.toLowerCase() === value.toLowerCase());
    return entry === undefined ? value : paletteColorReference(entry.id);
  };
  return Object.fromEntries(
    Object.entries(properties).map(([name, value]) => {
      const definition = COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME.get(
        name as ComponentStylePropertyName,
      );
      if (definition?.editor.kind === 'color' && typeof value === 'string')
        return [name, bind(value)];
      if (definition?.editor.kind === 'gradient' && typeof value === 'object' && 'from' in value)
        return [name, { ...value, from: bind(value.from), to: bind(value.to) }];
      return [name, value];
    }),
  );
}

/** Removing a swatch detaches its references and preserves their last color. */
export function detachPaletteColors(value: unknown, removed: ReadonlyMap<string, string>): unknown {
  const id = paletteColorId(value);
  if (id !== undefined && removed.has(id)) return removed.get(id);
  if (Array.isArray(value)) return value.map((entry) => detachPaletteColors(entry, removed));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, detachPaletteColors(entry, removed)]),
    );
  return value;
}
