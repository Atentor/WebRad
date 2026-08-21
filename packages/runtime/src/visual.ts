/**
 * Browser-safe visual contract shared by the generated runtime and design-time
 * projections. Layout positioning and designer interaction intentionally stay
 * outside this module.
 */
export interface VisualPropertySource {
  readonly props: Readonly<Record<string, unknown>>;
}

export interface VisualComponentSource extends VisualPropertySource {
  readonly type: string;
  readonly bounds: {
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Tailwind class groups stored by the project model. This deliberately uses a
 * structural browser-safe contract so the runtime does not depend on the
 * versioned project-model package.
 */
export interface TailwindClassGroups {
  readonly base?: string;
  readonly hover?: string;
  readonly focus?: string;
  readonly active?: string;
  readonly disabled?: string;
  readonly animation?: string;
  readonly advanced?: string;
}

export interface TailwindStyleSource {
  readonly classes: TailwindClassGroups;
}

/**
 * Splits a Tailwind class expression while understanding arbitrary values,
 * functions and quotes. Internal whitespace is normalized to Tailwind's `_`
 * representation so every result is a valid DOM class token.
 */
export function tokenizeTailwindClasses(value: string): readonly string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: "'" | '"' | '`' | undefined;
  let escaped = false;
  const delimiters: string[] = [];
  const closingDelimiter: Readonly<Record<string, string>> = {
    '[': ']',
    '(': ')',
    '{': '}',
  };

  const commit = (): void => {
    // A DOM class token cannot contain whitespace. Tailwind uses underscores to
    // represent spaces inside arbitrary values (for example content strings).
    const normalized = token.trim().replace(/\s+/gu, '_');
    if (normalized.length > 0) tokens.push(normalized);
    token = '';
  };

  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      token += character;
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      token += character;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      token += character;
      quote = character;
      continue;
    }
    const closing = closingDelimiter[character];
    if (closing !== undefined) {
      token += character;
      delimiters.push(closing);
      continue;
    }
    if (delimiters.at(-1) === character) {
      token += character;
      delimiters.pop();
      continue;
    }
    if (/\s/u.test(character) && delimiters.length === 0) {
      commit();
      continue;
    }
    token += character;
  }
  commit();
  return tokens;
}

function stringClassGroup(groups: TailwindClassGroups, name: keyof TailwindClassGroups): string {
  const value: unknown = groups[name];
  return typeof value === 'string' ? value : '';
}

/** Resolves the exact class candidates applied to a styled component. */
export function resolveComponentStyleClassNames(
  style: TailwindStyleSource | null | undefined,
): readonly string[] {
  if (style === undefined || style === null || typeof style.classes !== 'object') return [];
  const classes = style.classes;
  const resolved: string[] = [];
  const seen = new Set<string>();
  const append = (className: string): void => {
    if (className.length === 0 || seen.has(className)) return;
    seen.add(className);
    resolved.push(className);
  };
  const appendGroup = (name: keyof TailwindClassGroups, variants: readonly string[]): void => {
    for (const className of tokenizeTailwindClasses(stringClassGroup(classes, name))) {
      for (const variant of variants)
        append(variant.length === 0 ? className : `${variant}:${className}`);
    }
  };

  appendGroup('base', ['']);
  appendGroup('animation', ['']);
  appendGroup('advanced', ['']);
  appendGroup('hover', ['hover']);
  // focus-within makes focus styling work for compound controls such as WebCheckBox.
  appendGroup('focus', ['focus', 'focus-within']);
  appendGroup('active', ['active']);
  // Every visual root exposes aria-disabled; native controls also expose :disabled.
  appendGroup('disabled', ['disabled', 'aria-disabled']);
  return resolved;
}

export function resolveComponentStyleClassName(
  style: TailwindStyleSource | null | undefined,
): string {
  return resolveComponentStyleClassNames(style).join(' ');
}

export type VisualSizingMode = 'bounds' | 'fill';

export interface ComponentVisualStyle {
  readonly width: string;
  readonly height: string;
  readonly backgroundColor?: string;
  readonly color?: string;
  readonly borderColor?: string;
  readonly borderStyle?: 'solid';
  readonly borderWidth?: string;
}

export interface ComponentVisualProjection {
  readonly classNames: readonly [base: 'wr-component', type: string];
  readonly style: ComponentVisualStyle;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly title?: string;
  readonly tabIndex?: number;
}

export function readStringProperty(
  source: VisualPropertySource,
  name: string,
  fallback = '',
): string {
  const value = source.props[name];
  return typeof value === 'string' ? value : fallback;
}

export function readBooleanProperty(
  source: VisualPropertySource,
  name: string,
  fallback = false,
): boolean {
  const value = source.props[name];
  return typeof value === 'boolean' ? value : fallback;
}

export function readIntegerProperty(source: VisualPropertySource, name: string): number | undefined;
export function readIntegerProperty(
  source: VisualPropertySource,
  name: string,
  fallback: number,
): number;
export function readIntegerProperty(
  source: VisualPropertySource,
  name: string,
  fallback?: number,
): number | undefined {
  const value = source.props[name];
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

export function readStringListProperty(
  source: VisualPropertySource,
  name: string,
): readonly string[] {
  const value = source.props[name];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

export function projectComponentVisual(
  source: VisualComponentSource,
  sizing: VisualSizingMode = 'bounds',
): ComponentVisualProjection {
  const backgroundColor = readStringProperty(source, 'backgroundColor');
  const color = readStringProperty(source, 'color');
  const borderColor = readStringProperty(source, 'borderColor');
  const title = readStringProperty(source, 'title');
  const tabIndex = readIntegerProperty(source, 'tabIndex');
  const style: ComponentVisualStyle = {
    width: sizing === 'fill' ? '100%' : `${String(source.bounds.width)}px`,
    height: sizing === 'fill' ? '100%' : `${String(source.bounds.height)}px`,
    ...(backgroundColor.length > 0 ? { backgroundColor } : {}),
    ...(color.length > 0 ? { color } : {}),
    ...(borderColor.length > 0
      ? { borderColor, borderStyle: 'solid' as const, borderWidth: '1px' }
      : {}),
  };

  return {
    classNames: ['wr-component', `wr-${source.type.toLowerCase()}`],
    style,
    visible: readBooleanProperty(source, 'visible', true),
    enabled: readBooleanProperty(source, 'enabled', true),
    ...(title.length > 0 ? { title } : {}),
    ...(tabIndex === undefined ? {} : { tabIndex }),
  };
}

/** Shared component styling. Hosts may override the custom properties to theme it. */
export const WEBRAD_COMPONENT_CSS = `
.wr-component { box-sizing: border-box; font: inherit; }
.wr-component[hidden] { display: none !important; }
.wr-webpage { overflow: hidden; }
.wr-weblabel { display: flex; align-items: center; color: inherit; overflow: hidden; white-space: nowrap; }
.wr-webpanel { border: 1px solid var(--wr-control-border, #677184); background: var(--wr-control-surface, #262b35); padding: 6px; overflow: hidden; }
.wr-webedit, .wr-webtextarea, .wr-webcombobox, .wr-weblistbox { border: 1px solid var(--wr-control-border, #677184); border-radius: 3px; background: var(--wr-input-bg, #11151c); color: inherit; padding: 5px 7px; outline: none; }
.wr-webedit:focus, .wr-webtextarea:focus, .wr-webcombobox:focus, .wr-weblistbox:focus { border-color: var(--wr-accent, #4da3ff); box-shadow: 0 0 0 1px var(--wr-accent, #4da3ff); }
.wr-webbutton { border: 1px solid var(--wr-control-border, #677184); border-radius: 4px; background: var(--wr-button-bg, #343b49); color: inherit; padding: 4px 12px; }
.wr-webbutton:hover:not(:disabled) { background: var(--wr-button-hover, #414a5a); }
.wr-webcheckbox { display: flex; align-items: center; gap: 7px; }
.wr-webimage { display: block; object-fit: contain; border: 1px dashed var(--wr-control-border, #677184); color: var(--wr-muted-text, #8e98aa); }
`.trim();
