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

/** Browser-safe structural counterpart of the versioned project style model. */
export type ComponentStyleStateName = 'base' | 'hover' | 'focus' | 'active' | 'disabled';
export type StyleLengthUnit = 'px' | 'rem' | '%' | 'vw' | 'vh';

export interface StyleLengthValue {
  readonly value: number;
  readonly unit: StyleLengthUnit;
}

export type LinearGradientDirection =
  | 'to-right'
  | 'to-bottom-right'
  | 'to-bottom'
  | 'to-bottom-left'
  | 'to-left'
  | 'to-top-left'
  | 'to-top'
  | 'to-top-right';

/** Browser-safe counterpart of the validated project-model gradient value. */
export interface BackgroundGradientValue {
  readonly kind: 'linear';
  readonly direction: LinearGradientDirection;
  readonly from: string;
  readonly to: string;
}

export type StylePropertyValue = string | number | StyleLengthValue | BackgroundGradientValue;
export type TailwindStyleProperties = Readonly<Record<string, StylePropertyValue | undefined>>;

export interface TailwindStyleSource {
  readonly states: Readonly<Record<ComponentStyleStateName, TailwindStyleProperties>>;
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

function isStyleLengthValue(value: unknown): value is StyleLengthValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    Math.abs(value.value) <= 1_000_000 &&
    'unit' in value &&
    (value.unit === 'px' ||
      value.unit === 'rem' ||
      value.unit === '%' ||
      value.unit === 'vw' ||
      value.unit === 'vh')
  );
}

const LINEAR_GRADIENT_DIRECTIONS: ReadonlySet<LinearGradientDirection> = new Set([
  'to-right',
  'to-bottom-right',
  'to-bottom',
  'to-bottom-left',
  'to-left',
  'to-top-left',
  'to-top',
  'to-top-right',
]);

function isBackgroundGradientValue(value: unknown): value is BackgroundGradientValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'linear' &&
    'direction' in value &&
    typeof value.direction === 'string' &&
    LINEAR_GRADIENT_DIRECTIONS.has(value.direction as LinearGradientDirection) &&
    'from' in value &&
    typeof value.from === 'string' &&
    /^#[\da-f]{6}$/iu.test(value.from) &&
    'to' in value &&
    typeof value.to === 'string' &&
    /^#[\da-f]{6}$/iu.test(value.to)
  );
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

function lengthClass(prefix: string, value: unknown, important = false): string | undefined {
  const suffix = important ? '!' : '';
  if (typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    return `${prefix}-${value}${suffix}`;
  }
  if (!isStyleLengthValue(value)) return undefined;
  return `${prefix}-[${formatNumber(value.value)}${value.unit}]${suffix}`;
}

function percentageFractionClass(prefix: string, value: unknown): string | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : `${prefix}-[${formatNumber(number / 100)}]`;
}

function degreeClass(prefix: string, value: unknown): string | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : `${prefix}-[${formatNumber(number)}deg]`;
}

function millisecondsClass(prefix: string, value: unknown): string | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : `${prefix}-[${formatNumber(number)}ms]`;
}

function prefixedEnumClass(prefix: string, value: unknown): string | undefined {
  const name = stringValue(value);
  return name === undefined ? undefined : `${prefix}-${name}`;
}

function mappedEnumClass(
  value: unknown,
  values: Readonly<Record<string, string>>,
): string | undefined {
  const name = stringValue(value);
  return name === undefined ? undefined : values[name];
}

function colorClass(prefix: string, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'current') return `${prefix}-current`;
  if (value === 'transparent' || value === 'inherit') return `${prefix}-${value}`;
  return /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.test(value)
    ? `${prefix}-[${value}]`
    : undefined;
}

function backgroundGradientClass(value: unknown): string | undefined {
  if (!isBackgroundGradientValue(value)) return undefined;
  const direction = value.direction.replaceAll('-', '_');
  return `bg-[linear-gradient(${direction},${value.from.toLowerCase()},${value.to.toLowerCase()})]`;
}

const FLEX_DIRECTION_CLASSES: Readonly<Record<string, string>> = {
  row: 'flex-row',
  'row-reverse': 'flex-row-reverse',
  column: 'flex-col',
  'column-reverse': 'flex-col-reverse',
};

const FLEX_WRAP_CLASSES: Readonly<Record<string, string>> = {
  nowrap: 'flex-nowrap',
  wrap: 'flex-wrap',
  'wrap-reverse': 'flex-wrap-reverse',
};

const TEXT_TRANSFORM_CLASSES: Readonly<Record<string, string>> = {
  none: 'normal-case',
  uppercase: 'uppercase',
  lowercase: 'lowercase',
  capitalize: 'capitalize',
};

const TEXT_DECORATION_CLASSES: Readonly<Record<string, string>> = {
  none: 'no-underline',
  underline: 'underline',
  overline: 'overline',
  lineThrough: 'line-through',
};

const FONT_STYLE_CLASSES: Readonly<Record<string, string>> = {
  normal: 'not-italic',
  italic: 'italic',
};

const WHITE_SPACE_CLASSES: Readonly<Record<string, string>> = {
  normal: 'whitespace-normal',
  nowrap: 'whitespace-nowrap',
  pre: 'whitespace-pre',
  preLine: 'whitespace-pre-line',
  preWrap: 'whitespace-pre-wrap',
  breakSpaces: 'whitespace-break-spaces',
};

const TIMING_CLASSES: Readonly<Record<string, string>> = {
  linear: 'ease-linear',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
};

const ANIMATION_TIMING_VALUES: Readonly<Record<string, string>> = {
  linear: 'linear',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
};

const ANIMATION_ITERATIONS: Readonly<Record<string, string>> = {
  once: '1',
  twice: '2',
  three: '3',
  infinite: 'infinite',
};

/** Converts one validated visual property to its exact Tailwind v4 candidate. */
export function resolveStylePropertyCandidate(
  propertyName: string,
  value: StylePropertyValue,
): string | undefined {
  switch (propertyName) {
    case 'display':
      return stringValue(value);
    case 'overflow':
      return prefixedEnumClass('overflow', value);
    case 'flexDirection':
      return mappedEnumClass(value, FLEX_DIRECTION_CLASSES);
    case 'flexWrap':
      return mappedEnumClass(value, FLEX_WRAP_CLASSES);
    case 'justifyContent':
      return prefixedEnumClass('justify', value);
    case 'alignItems':
      return prefixedEnumClass('items', value);
    case 'alignContent':
      return prefixedEnumClass('content', value);
    case 'gridColumns': {
      const number = finiteNumber(value);
      return number === undefined || !Number.isInteger(number)
        ? undefined
        : `grid-cols-${formatNumber(number)}`;
    }
    case 'gridRows': {
      const number = finiteNumber(value);
      return number === undefined || !Number.isInteger(number)
        ? undefined
        : `grid-rows-${formatNumber(number)}`;
    }
    case 'gap':
      return lengthClass('gap', value);
    case 'rowGap':
      return lengthClass('gap-y', value);
    case 'columnGap':
      return lengthClass('gap-x', value);
    case 'width':
      return lengthClass('w', value, true);
    case 'height':
      return lengthClass('h', value, true);
    case 'minWidth':
      return lengthClass('min-w', value, true);
    case 'maxWidth':
      return lengthClass('max-w', value, true);
    case 'minHeight':
      return lengthClass('min-h', value, true);
    case 'maxHeight':
      return lengthClass('max-h', value, true);
    case 'marginTop':
      return lengthClass('mt', value);
    case 'marginRight':
      return lengthClass('mr', value);
    case 'marginBottom':
      return lengthClass('mb', value);
    case 'marginLeft':
      return lengthClass('ml', value);
    case 'paddingTop':
      return lengthClass('pt', value);
    case 'paddingRight':
      return lengthClass('pr', value);
    case 'paddingBottom':
      return lengthClass('pb', value);
    case 'paddingLeft':
      return lengthClass('pl', value);
    case 'fontFamily':
      return prefixedEnumClass('font', value);
    case 'fontSize':
      return lengthClass('text', value);
    case 'fontWeight':
      return prefixedEnumClass('font', value);
    case 'lineHeight':
      return lengthClass('leading', value);
    case 'letterSpacing':
      return lengthClass('tracking', value);
    case 'textAlign':
      return prefixedEnumClass('text', value);
    case 'textTransform':
      return mappedEnumClass(value, TEXT_TRANSFORM_CLASSES);
    case 'textDecoration':
      return mappedEnumClass(value, TEXT_DECORATION_CLASSES);
    case 'fontStyle':
      return mappedEnumClass(value, FONT_STYLE_CLASSES);
    case 'whiteSpace':
      return mappedEnumClass(value, WHITE_SPACE_CLASSES);
    case 'textColor':
      return colorClass('text', value);
    case 'backgroundColor':
      return colorClass('bg', value);
    case 'backgroundGradient':
      return backgroundGradientClass(value);
    case 'borderWidth':
      return lengthClass('border', value);
    case 'borderStyle':
      return prefixedEnumClass('border', value);
    case 'borderColor':
      return colorClass('border', value);
    case 'borderRadius':
      return lengthClass('rounded', value);
    case 'outlineWidth':
      return lengthClass('outline', value);
    case 'outlineStyle':
      return prefixedEnumClass('outline', value);
    case 'outlineColor':
      return colorClass('outline', value);
    case 'outlineOffset':
      return lengthClass('outline-offset', value);
    case 'ringWidth':
      return lengthClass('ring', value);
    case 'ringColor':
      return colorClass('ring', value);
    case 'ringOffsetWidth':
      return lengthClass('ring-offset', value);
    case 'ringOffsetColor':
      return colorClass('ring-offset', value);
    case 'boxShadow':
      return prefixedEnumClass('shadow', value);
    case 'opacity':
      return percentageFractionClass('opacity', value);
    case 'blur':
      return lengthClass('blur', value);
    case 'brightness':
      return percentageFractionClass('brightness', value);
    case 'contrast':
      return percentageFractionClass('contrast', value);
    case 'grayscale':
      return percentageFractionClass('grayscale', value);
    case 'saturate':
      return percentageFractionClass('saturate', value);
    case 'translateX':
      return lengthClass('translate-x', value);
    case 'translateY':
      return lengthClass('translate-y', value);
    case 'scale':
      return percentageFractionClass('scale', value);
    case 'rotate':
      return degreeClass('rotate', value);
    case 'skewX':
      return degreeClass('skew-x', value);
    case 'skewY':
      return degreeClass('skew-y', value);
    case 'transformOrigin':
      return prefixedEnumClass('origin', value);
    case 'transitionProperty':
      return prefixedEnumClass('transition', value);
    case 'transitionDuration':
      return millisecondsClass('duration', value);
    case 'transitionDelay':
      return millisecondsClass('delay', value);
    case 'transitionTimingFunction':
      return mappedEnumClass(value, TIMING_CLASSES);
    case 'animationName':
      return prefixedEnumClass('animate', value);
    case 'animationDuration': {
      const number = finiteNumber(value);
      return number === undefined ? undefined : `[animation-duration:${formatNumber(number)}ms]!`;
    }
    case 'animationIterationCount': {
      const name = stringValue(value);
      const count = name === undefined ? undefined : ANIMATION_ITERATIONS[name];
      return count === undefined ? undefined : `[animation-iteration-count:${count}]!`;
    }
    case 'animationTimingFunction': {
      const name = stringValue(value);
      const timing = name === undefined ? undefined : ANIMATION_TIMING_VALUES[name];
      return timing === undefined ? undefined : `[animation-timing-function:${timing}]!`;
    }
    case 'cursor':
      return prefixedEnumClass('cursor', value);
    case 'userSelect':
      return prefixedEnumClass('select', value);
    case 'pointerEvents':
      return prefixedEnumClass('pointer-events', value);
    case 'objectFit':
    case 'objectPosition':
      return prefixedEnumClass('object', value);
    default:
      return undefined;
  }
}

/** Returns raw candidates for a single state, preserving metadata order from the model object. */
export function resolveComponentStyleStateClassNames(
  properties: TailwindStyleProperties | null | undefined,
): readonly string[] {
  if (properties === undefined || properties === null || typeof properties !== 'object') return [];
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const [propertyName, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    const candidate = resolveStylePropertyCandidate(propertyName, value);
    if (candidate === undefined || seen.has(candidate)) continue;
    seen.add(candidate);
    resolved.push(candidate);
  }
  return resolved;
}

function stateProperties(
  style: TailwindStyleSource | null | undefined,
  stateName: ComponentStyleStateName,
): TailwindStyleProperties | undefined {
  if (style === undefined || style === null || typeof style.states !== 'object') return undefined;
  const properties: unknown = style.states[stateName];
  return typeof properties === 'object' && properties !== null
    ? (properties as TailwindStyleProperties)
    : undefined;
}

/** Resolves the exact real-state class candidates applied to a styled component. */
export function resolveComponentStyleClassNames(
  style: TailwindStyleSource | null | undefined,
): readonly string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  const appendState = (stateName: ComponentStyleStateName, variants: readonly string[]): void => {
    for (const candidate of resolveComponentStyleStateClassNames(
      stateProperties(style, stateName),
    )) {
      for (const variant of variants) {
        const className = variant.length === 0 ? candidate : `${variant}:${candidate}`;
        if (seen.has(className)) continue;
        seen.add(className);
        resolved.push(className);
      }
    }
  };

  appendState('base', ['']);
  appendState('hover', ['hover']);
  // focus-within supports compound controls such as WebCheckBox.
  appendState('focus', ['focus', 'focus-within']);
  appendState('active', ['active']);
  // Every visual root exposes aria-disabled; native controls also expose :disabled.
  appendState('disabled', ['disabled', 'aria-disabled']);
  return resolved;
}

export function resolveComponentStyleClassName(
  style: TailwindStyleSource | null | undefined,
): string {
  return resolveComponentStyleClassNames(style).join(' ');
}

/**
 * Resolves the forced Designer preview. The selected state overrides base by
 * property before candidates are generated, so CSS source order cannot make a
 * base value win accidentally.
 */
export function resolveComponentStylePreviewClassName(
  style: TailwindStyleSource | null | undefined,
  stateName: ComponentStyleStateName,
): string {
  const base = stateProperties(style, 'base') ?? {};
  const selected = stateName === 'base' ? {} : (stateProperties(style, stateName) ?? {});
  return resolveComponentStyleStateClassNames({ ...base, ...selected }).join(' ');
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
