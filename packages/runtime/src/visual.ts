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
 * Browser-safe sizing subset shared by the Data Grid renderer and its
 * design-time projection. Dynamic tracks use a weighted distribution after
 * fixed tracks and minimum widths are reserved.
 */
export interface DataGridColumnTrackSource {
  readonly widthMode: 'fixed' | 'dynamic';
  readonly width: number;
  readonly minWidth: number;
  readonly maxWidth: number | null;
  readonly flex: number;
}

function safeDataGridSize(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Resolves fixed and weighted dynamic Data Grid columns to pixel tracks for a
 * particular viewport. A dynamic maximum is a real cap: once reached, the
 * remaining width is redistributed among the other dynamic columns.
 */
export function resolveDataGridColumnTrackWidths(
  columns: readonly DataGridColumnTrackSource[],
  availableWidth: number,
): readonly number[] {
  const widths = columns.map((column) =>
    column.widthMode === 'fixed'
      ? safeDataGridSize(column.width, 0)
      : safeDataGridSize(column.minWidth, 0),
  );
  const minimumWidth = widths.reduce((total, width) => total + width, 0);
  let remainingWidth = Math.max(0, safeDataGridSize(availableWidth, minimumWidth) - minimumWidth);
  let expandable = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column, index }) => {
      const currentWidth = widths[index] ?? 0;
      return (
        column.widthMode === 'dynamic' &&
        (column.maxWidth === null || currentWidth < column.maxWidth)
      );
    });

  while (remainingWidth > 0.001 && expandable.length > 0) {
    const totalFlex = expandable.reduce(
      (total, { column }) => total + Math.max(0.1, safeDataGridSize(column.flex, 1)),
      0,
    );
    let consumedWidth = 0;
    for (const { column, index } of expandable) {
      const desiredWidth =
        (remainingWidth * Math.max(0.1, safeDataGridSize(column.flex, 1))) / totalFlex;
      const maximumWidth = column.maxWidth === null ? Number.POSITIVE_INFINITY : column.maxWidth;
      const currentWidth = widths[index] ?? 0;
      const addition = Math.min(desiredWidth, Math.max(0, maximumWidth - currentWidth));
      widths[index] = currentWidth + addition;
      consumedWidth += addition;
    }
    if (consumedWidth <= 0.001) break;
    remainingWidth -= consumedWidth;
    expandable = expandable.filter(({ column, index }) => {
      const currentWidth = widths[index] ?? 0;
      return column.maxWidth === null || currentWidth < column.maxWidth - 0.001;
    });
  }

  return widths.map((width) => Math.round(width * 1000) / 1000);
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

function cssColorValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'current') return 'currentColor';
  if (value === 'transparent' || value === 'inherit') return value;
  return /^#[\da-f]{6}$/iu.test(value) ? value.toLowerCase() : undefined;
}

function cssLengthValue(value: unknown): string | undefined {
  if (typeof value === 'string' && /^[a-z][a-z0-9-]*$/u.test(value)) return value;
  return isStyleLengthValue(value) ? `${formatNumber(value.value)}${value.unit}` : undefined;
}

function cssVariableClass(variableName: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `[${variableName}:${value}]`;
}

const DATA_GRID_FONT_WEIGHT_VALUES: Readonly<Record<string, string>> = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
};

function dataGridLineVisibilityClass(
  axis: 'horizontal' | 'vertical',
  value: unknown,
): string | undefined {
  const mode = stringValue(value);
  const prefix = `--wr-data-grid-${axis}-line`;
  if (mode === 'hide') return cssVariableClass(`${prefix}-override-width`, '0px');
  if (mode === 'show') {
    return cssVariableClass(`${prefix}-override-width`, `var(${prefix}-width,1px)`);
  }
  return undefined;
}

function linearGradientValue(value: unknown): string | undefined {
  if (!isBackgroundGradientValue(value)) return undefined;
  const direction = value.direction.replaceAll('-', '_');
  return `linear-gradient(${direction},${value.from.toLowerCase()},${value.to.toLowerCase()})`;
}

function backgroundGradientClass(value: unknown): string | undefined {
  const gradient = linearGradientValue(value);
  return gradient === undefined ? undefined : `bg-[${gradient}]`;
}

function textGradientClass(value: unknown): string | undefined {
  const background = backgroundGradientClass(value);
  if (background === undefined) return undefined;
  const target = '[&_[data-webrad-text-content]]';
  return `${target}:${background} ${target}:bg-clip-text ${target}:text-transparent`;
}

const DEFAULT_BORDER_GRADIENT_FILL =
  'linear-gradient(var(--webrad-border-gradient-surface,transparent),var(--webrad-border-gradient-surface,transparent))';

function backgroundColorValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/^#[\da-f]{6}$/iu.test(value)) return value.toLowerCase();
  if (value === 'transparent') return value;
  if (value === 'current') return 'currentColor';
  return undefined;
}

function backgroundFillValue(properties: TailwindStyleProperties): string {
  const gradient = linearGradientValue(properties.backgroundGradient);
  if (gradient !== undefined) return gradient;
  const color = backgroundColorValue(properties.backgroundColor);
  return color === undefined ? DEFAULT_BORDER_GRADIENT_FILL : `linear-gradient(${color},${color})`;
}

function backgroundResetClass(properties: TailwindStyleProperties): string {
  const gradient = linearGradientValue(properties.backgroundGradient);
  if (gradient !== undefined) return `[background:${gradient}]`;
  const color = backgroundColorValue(properties.backgroundColor);
  if (color !== undefined) return `[background:${color}]`;
  if (properties.backgroundColor === 'inherit') return '[background:inherit]';
  return '[background:var(--webrad-border-gradient-surface,transparent)]';
}

function borderGradientClass(value: unknown): string | undefined {
  const gradient = linearGradientValue(value);
  if (gradient === undefined) return undefined;
  return [
    'border',
    'border-transparent',
    '[border-style:solid]',
    `[background:${DEFAULT_BORDER_GRADIENT_FILL}_padding-box,${gradient}_border-box]`,
  ].join(' ');
}

function borderGradientClassForProperties(properties: TailwindStyleProperties): string | undefined {
  const gradient = linearGradientValue(properties.borderGradient);
  if (gradient === undefined) return undefined;
  return [
    'border',
    'border-transparent',
    '[border-style:solid]',
    `[background:${backgroundFillValue(properties)}_padding-box,${gradient}_border-box]`,
  ].join(' ');
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

/** Converts one validated visual property to a Tailwind v4 candidate expression. */
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
    case 'buttonContentMode':
      return mappedEnumClass(value, {
        text: '[&_.wr-button-icon]:hidden',
        'text-icon': '[&_.wr-button-icon]:block',
        icon: '[&_.wr-button-icon]:block [&_.wr-button-text]:sr-only',
      });
    case 'buttonIconPosition':
      return mappedEnumClass(value, {
        left: 'flex-row',
        right: 'flex-row-reverse',
        top: 'flex-col',
        bottom: 'flex-col-reverse',
      });
    case 'buttonIconSize': {
      const width = lengthClass('w', value, true);
      const height = lengthClass('h', value, true);
      return width === undefined || height === undefined
        ? undefined
        : `[&_.wr-button-icon]:${width} [&_.wr-button-icon]:${height}`;
    }
    case 'dataGridHorizontalLineVisibility':
      return dataGridLineVisibilityClass('horizontal', value);
    case 'dataGridHorizontalLineColor':
      return cssVariableClass('--wr-data-grid-horizontal-line-color', cssColorValue(value));
    case 'dataGridHorizontalLineWidth':
      return cssVariableClass('--wr-data-grid-horizontal-line-width', cssLengthValue(value));
    case 'dataGridHorizontalLineStyle':
      return cssVariableClass('--wr-data-grid-horizontal-line-style', stringValue(value));
    case 'dataGridVerticalLineVisibility':
      return dataGridLineVisibilityClass('vertical', value);
    case 'dataGridVerticalLineColor':
      return cssVariableClass('--wr-data-grid-vertical-line-color', cssColorValue(value));
    case 'dataGridVerticalLineWidth':
      return cssVariableClass('--wr-data-grid-vertical-line-width', cssLengthValue(value));
    case 'dataGridVerticalLineStyle':
      return cssVariableClass('--wr-data-grid-vertical-line-style', stringValue(value));
    case 'dataGridHeaderBackgroundColor':
      return cssVariableClass('--wr-data-grid-header-background-color', cssColorValue(value));
    case 'dataGridHeaderTextColor':
      return cssVariableClass('--wr-data-grid-header-text-color', cssColorValue(value));
    case 'dataGridHeaderBorderColor':
      return cssVariableClass('--wr-data-grid-header-border-color', cssColorValue(value));
    case 'dataGridHeaderBorderWidth':
      return cssVariableClass('--wr-data-grid-header-border-width', cssLengthValue(value));
    case 'dataGridHeaderBorderStyle':
      return cssVariableClass('--wr-data-grid-header-border-style', stringValue(value));
    case 'dataGridHeaderHeight':
      return cssVariableClass('--wr-data-grid-header-height', cssLengthValue(value));
    case 'dataGridHeaderPaddingX':
      return cssVariableClass('--wr-data-grid-header-padding-x', cssLengthValue(value));
    case 'dataGridHeaderPaddingY':
      return cssVariableClass('--wr-data-grid-header-padding-y', cssLengthValue(value));
    case 'dataGridHeaderFontWeight': {
      const weight = stringValue(value);
      return cssVariableClass(
        '--wr-data-grid-header-font-weight',
        weight === undefined ? undefined : DATA_GRID_FONT_WEIGHT_VALUES[weight],
      );
    }
    case 'dataGridFooterBackgroundColor':
      return cssVariableClass('--wr-data-grid-footer-background-color', cssColorValue(value));
    case 'dataGridFooterTextColor':
      return cssVariableClass('--wr-data-grid-footer-text-color', cssColorValue(value));
    case 'dataGridFooterBorderColor':
      return cssVariableClass('--wr-data-grid-footer-border-color', cssColorValue(value));
    case 'dataGridFooterBorderWidth':
      return cssVariableClass('--wr-data-grid-footer-border-width', cssLengthValue(value));
    case 'dataGridFooterBorderStyle':
      return cssVariableClass('--wr-data-grid-footer-border-style', stringValue(value));
    case 'dataGridFooterHeight':
      return cssVariableClass('--wr-data-grid-footer-height', cssLengthValue(value));
    case 'dataGridFooterPaddingX':
      return cssVariableClass('--wr-data-grid-footer-padding-x', cssLengthValue(value));
    case 'dataGridFooterPaddingY':
      return cssVariableClass('--wr-data-grid-footer-padding-y', cssLengthValue(value));
    case 'dataGridFooterFontWeight': {
      const weight = stringValue(value);
      return cssVariableClass(
        '--wr-data-grid-footer-font-weight',
        weight === undefined ? undefined : DATA_GRID_FONT_WEIGHT_VALUES[weight],
      );
    }
    case 'dataGridButtonContentMode':
      return mappedEnumClass(value, {
        text: '[&_.wr-data-grid-button-icon-slot]:hidden',
        'text-icon':
          '[&_.wr-data-grid-button-icon-slot]:block [&_.wr-data-grid-button_.wr-data-grid-button-caption]:block',
        icon: '[&_.wr-data-grid-button-icon-slot]:block [&_.wr-data-grid-button_.wr-data-grid-button-caption]:sr-only',
      });
    case 'dataGridButtonIconPosition':
      return mappedEnumClass(value, {
        left: '[&_.wr-data-grid-button]:flex-row',
        right: '[&_.wr-data-grid-button]:flex-row-reverse',
        top: '[&_.wr-data-grid-button]:flex-col',
        bottom: '[&_.wr-data-grid-button]:flex-col-reverse',
      });
    case 'dataGridButtonIconSize': {
      const width = lengthClass('w', value, true);
      const height = lengthClass('h', value, true);
      return width === undefined || height === undefined
        ? undefined
        : `[&_.wr-data-grid-button_.wr-button-icon]:${width} [&_.wr-data-grid-button_.wr-button-icon]:${height}`;
    }
    case 'dataGridButtonIconColor': {
      const color = colorClass('text', value);
      return color === undefined ? undefined : `[&_.wr-data-grid-button_.wr-button-icon]:${color}`;
    }
    case 'dataGridButtonBackgroundColor':
      return cssVariableClass('--wr-data-grid-button-background-color', cssColorValue(value));
    case 'dataGridButtonTextColor':
      return cssVariableClass('--wr-data-grid-button-text-color', cssColorValue(value));
    case 'dataGridButtonBorderColor':
      return cssVariableClass('--wr-data-grid-button-border-color', cssColorValue(value));
    case 'dataGridButtonBorderWidth':
      return cssVariableClass('--wr-data-grid-button-border-width', cssLengthValue(value));
    case 'dataGridButtonBorderStyle':
      return cssVariableClass('--wr-data-grid-button-border-style', stringValue(value));
    case 'dataGridButtonBorderRadius':
      return cssVariableClass('--wr-data-grid-button-border-radius', cssLengthValue(value));
    case 'dataGridButtonPaddingX':
      return cssVariableClass('--wr-data-grid-button-padding-x', cssLengthValue(value));
    case 'dataGridButtonPaddingY':
      return cssVariableClass('--wr-data-grid-button-padding-y', cssLengthValue(value));
    case 'dataGridButtonFontWeight': {
      const weight = stringValue(value);
      return cssVariableClass(
        '--wr-data-grid-button-font-weight',
        weight === undefined ? undefined : DATA_GRID_FONT_WEIGHT_VALUES[weight],
      );
    }
    case 'dataGridCheckboxAccentColor':
      return cssVariableClass('--wr-data-grid-checkbox-accent-color', cssColorValue(value));
    case 'dataGridCheckboxSize':
      return cssVariableClass('--wr-data-grid-checkbox-size', cssLengthValue(value));
    case 'dataGridCheckboxTextColor':
      return cssVariableClass('--wr-data-grid-checkbox-text-color', cssColorValue(value));
    case 'dataGridCheckboxFontWeight': {
      const weight = stringValue(value);
      return cssVariableClass(
        '--wr-data-grid-checkbox-font-weight',
        weight === undefined ? undefined : DATA_GRID_FONT_WEIGHT_VALUES[weight],
      );
    }
    case 'dataGridCheckboxGap':
      return cssVariableClass('--wr-data-grid-checkbox-gap', cssLengthValue(value));
    case 'textColor':
      return colorClass('text', value);
    case 'buttonIconColor': {
      const color = colorClass('text', value);
      return color === undefined ? undefined : `[&_.wr-button-icon]:${color}`;
    }
    case 'textGradient':
      return textGradientClass(value);
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
    case 'borderGradient':
      return borderGradientClass(value);
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

const ROOT_PAINT_PROPERTY_NAMES = new Set([
  'backgroundColor',
  'backgroundGradient',
  'borderColor',
  'borderGradient',
]);

function isRootPaintProperty(propertyName: string): boolean {
  return ROOT_PAINT_PROPERTY_NAMES.has(propertyName);
}

function appendCandidateExpression(
  target: string[],
  seen: Set<string>,
  candidateExpression: string | undefined,
): void {
  if (candidateExpression === undefined) return;
  for (const candidate of tokenizeTailwindClasses(candidateExpression)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    target.push(candidate);
  }
}

function resolveRootPaintClassNames(
  properties: TailwindStyleProperties,
  forceBackgroundReset: boolean,
): readonly string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();

  const borderGradient = borderGradientClassForProperties(properties);
  if (borderGradient !== undefined) {
    appendCandidateExpression(resolved, seen, borderGradient);
    return resolved;
  }

  if (forceBackgroundReset) {
    appendCandidateExpression(resolved, seen, backgroundResetClass(properties));
  } else {
    appendCandidateExpression(resolved, seen, colorClass('bg', properties.backgroundColor));
    appendCandidateExpression(
      resolved,
      seen,
      backgroundGradientClass(properties.backgroundGradient),
    );
  }
  appendCandidateExpression(resolved, seen, colorClass('border', properties.borderColor));
  return resolved;
}

function resolveComponentStyleStateClassNamesInternal(
  properties: TailwindStyleProperties | null | undefined,
  rootPaintProperties: TailwindStyleProperties | null | undefined = properties,
  forceBackgroundReset = false,
): readonly string[] {
  if (properties === undefined || properties === null || typeof properties !== 'object') return [];
  const rootPaint =
    rootPaintProperties === undefined || rootPaintProperties === null
      ? properties
      : rootPaintProperties;
  const resolved: string[] = [];
  const seen = new Set<string>();
  let appendedRootPaint = false;
  for (const [propertyName, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (isRootPaintProperty(propertyName)) {
      if (appendedRootPaint) continue;
      appendedRootPaint = true;
      for (const candidate of resolveRootPaintClassNames(rootPaint, forceBackgroundReset)) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        resolved.push(candidate);
      }
      continue;
    }
    const candidateExpression = resolveStylePropertyCandidate(propertyName, value);
    appendCandidateExpression(resolved, seen, candidateExpression);
  }
  return resolved;
}

/** Returns raw candidates for a single state, preserving metadata order from the model object. */
export function resolveComponentStyleStateClassNames(
  properties: TailwindStyleProperties | null | undefined,
): readonly string[] {
  return resolveComponentStyleStateClassNamesInternal(properties);
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

function mergeStateProperties(
  base: TailwindStyleProperties,
  selected: TailwindStyleProperties,
): TailwindStyleProperties {
  const merged: Record<string, StylePropertyValue | undefined> = { ...base, ...selected };

  // A state-specific solid paint replaces the inherited gradient (and vice
  // versa), even though the two values live under different property keys.
  // This avoids leaving a base background image or border gradient behind.
  if (selected.backgroundColor !== undefined) delete merged.backgroundGradient;
  if (selected.backgroundGradient !== undefined) delete merged.backgroundColor;
  if (selected.borderColor !== undefined) delete merged.borderGradient;
  if (selected.borderGradient !== undefined) delete merged.borderColor;

  return merged;
}

function hasRootPaintProperties(properties: TailwindStyleProperties): boolean {
  return Object.entries(properties).some(
    ([propertyName, value]) => value !== undefined && isRootPaintProperty(propertyName),
  );
}

function hasBorderGradient(properties: TailwindStyleProperties): boolean {
  return linearGradientValue(properties.borderGradient) !== undefined;
}

function hasBackgroundGradient(properties: TailwindStyleProperties): boolean {
  return linearGradientValue(properties.backgroundGradient) !== undefined;
}

function requiresBackgroundReset(
  base: TailwindStyleProperties,
  selected: TailwindStyleProperties,
  effective: TailwindStyleProperties,
): boolean {
  if (!hasRootPaintProperties(selected)) return false;
  if (hasBorderGradient(base) && !hasBorderGradient(effective)) return true;
  return hasBackgroundGradient(base) && selected.backgroundColor !== undefined;
}

/** Resolves the exact real-state class candidates applied to a styled component. */
export function resolveComponentStyleClassNames(
  style: TailwindStyleSource | null | undefined,
): readonly string[] {
  const resolved: string[] = [];
  const seen = new Set<string>();
  const base = stateProperties(style, 'base') ?? {};
  const appendState = (stateName: ComponentStyleStateName, variants: readonly string[]): void => {
    const selected = stateName === 'base' ? base : (stateProperties(style, stateName) ?? {});
    const effective = stateName === 'base' ? base : mergeStateProperties(base, selected);
    const candidates = resolveComponentStyleStateClassNamesInternal(
      selected,
      effective,
      stateName !== 'base' && requiresBackgroundReset(base, selected, effective),
    );
    for (const candidate of candidates) {
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
  return resolveComponentStyleStateClassNames(mergeStateProperties(base, selected)).join(' ');
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
  readonly classNames: readonly string[];
  readonly style: ComponentVisualStyle;
  readonly visible: boolean;
  readonly collapseWhenHidden: boolean;
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
    classNames: [
      'wr-component',
      `wr-${source.type.toLowerCase()}`,
      ...(source.type === 'WebButton'
        ? ['wr-button-content-text-icon', 'wr-button-icon-left']
        : []),
    ],
    style,
    visible: readBooleanProperty(source, 'visible', true),
    collapseWhenHidden: readBooleanProperty(source, 'collapseWhenHidden', true),
    enabled: readBooleanProperty(source, 'enabled', true),
    ...(title.length > 0 ? { title } : {}),
    ...(tabIndex === undefined ? {} : { tabIndex }),
  };
}

/** Shared component styling. Hosts may override the custom properties to theme it. */
export const WEBRAD_COMPONENT_CSS = `
.wr-component { --webrad-border-gradient-surface: transparent; box-sizing: border-box; font: inherit; }
.wr-component[hidden] { display: none !important; }
.wr-webpage { --webrad-border-gradient-surface: var(--wr-page-surface, #ffffff); overflow: hidden; }
.wr-webreusableelement { border: 0; background: transparent; overflow: visible; }
.wr-floating-layer { position: static; width: 0; height: 0; overflow: visible; }
.wr-reusable-definition-root { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; }
.wr-reusable-definition-root > .wr-component { position: relative !important; width: 100% !important; height: 100% !important; min-width: 0; min-height: 0; }
.wr-weblabel { display: flex; align-items: center; color: inherit; overflow: hidden; white-space: nowrap; }
.wr-webpanel { --webrad-border-gradient-surface: var(--wr-control-surface, #262b35); border: 1px solid var(--wr-control-border, #677184); background: var(--wr-control-surface, #262b35); padding: 6px; overflow: hidden; }
.wr-webpopup { --webrad-border-gradient-surface: var(--wr-control-surface, #262b35); border: 1px solid var(--wr-control-border, #677184); border-radius: 8px; background: var(--wr-control-surface, #262b35); color: inherit; overflow: hidden; padding: 0; }
.wr-webpopup::backdrop { background: rgb(15 23 42 / .48); }
.wr-popup-children { box-sizing: border-box; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; }
.wr-webedit, .wr-webtextarea, .wr-webcombobox, .wr-weblistbox { --webrad-border-gradient-surface: var(--wr-input-bg, #11151c); border: 1px solid var(--wr-control-border, #677184); border-radius: 3px; background: var(--wr-input-bg, #11151c); color: inherit; padding: 5px 7px; outline: none; }
.wr-webedit:focus, .wr-webtextarea:focus, .wr-webcombobox:focus, .wr-weblistbox:focus { border-color: var(--wr-accent, #4da3ff); box-shadow: 0 0 0 1px var(--wr-accent, #4da3ff); }
.wr-webbutton { --webrad-border-gradient-surface: var(--wr-button-bg, #343b49); display: inline-flex; align-items: center; justify-content: center; gap: .45em; border: 1px solid var(--wr-control-border, #677184); border-radius: 4px; background: var(--wr-button-bg, #343b49); color: inherit; padding: 4px 12px; }
.wr-webbutton:hover:not(:disabled) { --webrad-border-gradient-surface: var(--wr-button-hover, #414a5a); background: var(--wr-button-hover, #414a5a); }
.wr-button-icon { display: block; width: 1em; height: 1em; flex: none; }
.wr-button-content-text .wr-button-icon { display: none; }
.wr-button-icon-left { flex-direction: row; }
.wr-webcheckbox { display: flex; align-items: center; gap: 7px; }
.wr-webimage { display: block; object-fit: contain; border: 1px dashed var(--wr-control-border, #677184); color: var(--wr-muted-text, #8e98aa); }
.wr-webdatagrid { --webrad-border-gradient-surface: var(--wr-control-surface, #262b35); display: block; overflow: hidden; border: 1px solid var(--wr-control-border, #677184); background: var(--wr-control-surface, #262b35); color: inherit; }
.wr-data-grid-scroll { width: 100%; height: 100%; overflow: auto; }
.wr-data-grid-content { width: 100%; min-width: var(--wr-data-grid-min-width, 0); }
.wr-data-grid-row { display: grid; grid-template-columns: var(--wr-data-grid-columns); min-width: var(--wr-data-grid-min-width, 0); }
.wr-data-grid-cell { box-sizing: border-box; min-width: 0; min-height: 0; padding: var(--wr-data-grid-cell-padding-y, 8px) var(--wr-data-grid-cell-padding-x, 10px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-data-grid-body-row > .wr-data-grid-cell { border-bottom-width: var(--wr-data-grid-horizontal-line-override-width, var(--wr-data-grid-horizontal-line-width, var(--wr-data-grid-config-horizontal-line-width, 1px))); border-bottom-style: var(--wr-data-grid-horizontal-line-style, solid); border-bottom-color: var(--wr-data-grid-horizontal-line-color, color-mix(in srgb, currentColor 15%, transparent)); }
.wr-data-grid-has-footer .wr-data-grid-body-row:last-child > .wr-data-grid-cell { border-bottom-width: 0; }
.wr-data-grid-row > .wr-data-grid-cell:not(:first-child) { border-inline-start-width: var(--wr-data-grid-vertical-line-override-width, var(--wr-data-grid-vertical-line-width, var(--wr-data-grid-config-vertical-line-width, 0px))); border-inline-start-style: var(--wr-data-grid-vertical-line-style, solid); border-inline-start-color: var(--wr-data-grid-vertical-line-color, color-mix(in srgb, currentColor 15%, transparent)); }
.wr-data-grid-body-row > .wr-data-grid-cell:focus-visible { outline: 2px solid var(--wr-accent, #4da3ff); outline-offset: -2px; }
.wr-data-grid-content[data-webrad-wrap-text='true'] .wr-data-grid-cell { overflow-wrap: anywhere; text-overflow: clip; white-space: normal; }
.wr-data-grid-header-cell { height: var(--wr-data-grid-header-height, auto); border-bottom-width: var(--wr-data-grid-header-border-width, var(--wr-data-grid-horizontal-line-override-width, var(--wr-data-grid-horizontal-line-width, var(--wr-data-grid-config-horizontal-line-width, 1px)))); border-bottom-style: var(--wr-data-grid-header-border-style, var(--wr-data-grid-horizontal-line-style, solid)); border-bottom-color: var(--wr-data-grid-header-border-color, #c7d2fe); background: var(--wr-data-grid-header-background-color, #e0e7ff); color: var(--wr-data-grid-header-text-color, #1e3a8a); font-weight: var(--wr-data-grid-header-font-weight, 600); padding: var(--wr-data-grid-header-padding-y, var(--wr-data-grid-cell-padding-y, 8px)) var(--wr-data-grid-header-padding-x, var(--wr-data-grid-cell-padding-x, 10px)); }
.wr-data-grid-footer-cell { height: var(--wr-data-grid-footer-height, auto); border-top-width: var(--wr-data-grid-footer-border-width, var(--wr-data-grid-horizontal-line-override-width, var(--wr-data-grid-horizontal-line-width, var(--wr-data-grid-config-horizontal-line-width, 1px)))); border-top-style: var(--wr-data-grid-footer-border-style, var(--wr-data-grid-horizontal-line-style, solid)); border-top-color: var(--wr-data-grid-footer-border-color, #dbeafe); background: var(--wr-data-grid-footer-background-color, #f8fafc); color: var(--wr-data-grid-footer-text-color, #334155); font-weight: var(--wr-data-grid-footer-font-weight, 600); padding: var(--wr-data-grid-footer-padding-y, var(--wr-data-grid-cell-padding-y, 8px)) var(--wr-data-grid-footer-padding-x, var(--wr-data-grid-cell-padding-x, 10px)); }
.wr-data-grid-sticky-header { position: sticky; z-index: 1; top: 0; }
.wr-data-grid-sticky-footer { position: sticky; z-index: 1; bottom: 0; }
.wr-data-grid-content[data-webrad-row-height-mode='fixed'] .wr-data-grid-body-row { height: var(--wr-data-grid-fixed-row-height, 40px); max-height: var(--wr-data-grid-fixed-row-height, 40px); }
.wr-data-grid-content[data-webrad-row-height-mode='fixed'] .wr-data-grid-body-row > .wr-data-grid-cell { height: var(--wr-data-grid-fixed-row-height, 40px); }
.wr-data-grid-content[data-webrad-row-height-mode='dynamic'] .wr-data-grid-body-row { min-height: var(--wr-data-grid-min-row-height, 36px); max-height: var(--wr-data-grid-max-row-height, none); }
.wr-data-grid-striped .wr-data-grid-body-row:nth-child(even) > .wr-data-grid-cell { background: color-mix(in srgb, currentColor 5%, transparent); }
.wr-data-grid-image { display: block; width: 100%; max-width: 100%; height: 36px; max-height: 100%; object-fit: contain; }
.wr-data-grid-button { display: inline-flex; max-width: 100%; align-items: center; justify-content: center; gap: .45em; border-width: var(--wr-data-grid-button-border-width, 1px); border-style: var(--wr-data-grid-button-border-style, solid); border-color: var(--wr-data-grid-button-border-color, #c7d2fe); border-radius: var(--wr-data-grid-button-border-radius, 6px); background: var(--wr-data-grid-button-background-color, #e0e7ff); color: var(--wr-data-grid-button-text-color, #1e3a8a); cursor: pointer; font-weight: var(--wr-data-grid-button-font-weight, 600); padding: var(--wr-data-grid-button-padding-y, 4px) var(--wr-data-grid-button-padding-x, 8px); }
.wr-data-grid-button-icon-slot { position: relative; display: block; flex: 0 0 16px; min-width: 0; min-height: 0; width: 16px; height: 16px; line-height: 0; }
.wr-data-grid-button-icon-slot > .wr-data-grid-button-icon { position: absolute; top: 50%; left: 50%; display: block; transform: translate(-50%, -50%); }
.wr-data-grid-button-caption { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-data-grid-checkbox-control { display: inline-flex; max-width: 100%; align-items: center; gap: var(--wr-data-grid-checkbox-gap, 6px); color: var(--wr-data-grid-checkbox-text-color, #334155); font-weight: var(--wr-data-grid-checkbox-font-weight, 500); }
.wr-data-grid-checkbox { flex: none; width: var(--wr-data-grid-checkbox-size, 16px); height: var(--wr-data-grid-checkbox-size, 16px); margin: 0; accent-color: var(--wr-data-grid-checkbox-accent-color, #2563eb); }
.wr-data-grid-checkbox-caption { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr-data-grid-empty { color: var(--wr-muted-text, #8e98aa); font-style: italic; text-align: center !important; }
`.trim();
