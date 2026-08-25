import type {
  ComponentStyleStateName,
  ComponentStylePropertyName,
  LinearGradientDirection,
  StyleLengthUnit,
  StylePropertyValue,
} from './types.js';

export type ComponentStylePropertyCategory =
  | 'Layout'
  | 'Dimensions'
  | 'Spacing'
  | 'Typography'
  | 'Content'
  | 'Colors'
  | 'Border'
  | 'Effects'
  | 'Transform'
  | 'Animation'
  | 'Interaction'
  | 'Image';

export interface StyleEditorOption {
  readonly value: string;
  readonly label: string;
}

export type ComponentStylePropertyEditor =
  | {
      readonly kind: 'enum';
      readonly options: readonly StyleEditorOption[];
    }
  | {
      readonly kind: 'length';
      readonly units: readonly StyleLengthUnit[];
      readonly keywords?: readonly StyleEditorOption[];
      readonly allowNegative?: boolean;
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
    }
  | {
      readonly kind: 'color';
      readonly keywords: readonly StyleEditorOption[];
    }
  | {
      readonly kind: 'gradient';
      readonly directions: readonly StyleEditorOption[];
    }
  | {
      readonly kind: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly suffix?: string;
      readonly integer?: boolean;
    };

export interface ComponentStylePropertyDefinition {
  readonly name: ComponentStylePropertyName;
  readonly label: string;
  readonly category: ComponentStylePropertyCategory;
  /** Valid value used when the editor enables this property for the first time. */
  readonly defaultValue: StylePropertyValue;
  readonly description: string;
  readonly editor: ComponentStylePropertyEditor;
  /** Omitted when the property applies to every visual component type. */
  readonly componentTypes?: readonly string[];
  /** Omitted when the property is valid for every interaction state. */
  readonly stateNames?: readonly ComponentStyleStateName[];
}

/** Pairs that cannot be configured together within the same interaction state. */
export const COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS = [
  ['textColor', 'textGradient'],
  ['backgroundColor', 'backgroundGradient'],
  ['borderColor', 'borderGradient'],
] as const satisfies readonly (readonly [ComponentStylePropertyName, ComponentStylePropertyName])[];

const ALL_LENGTH_UNITS = ['px', 'rem', '%', 'vw', 'vh'] as const;
const SPACING_UNITS = ['px', 'rem', '%'] as const;
const GRADIENT_DIRECTIONS = [
  ['to-right', 'To right'],
  ['to-bottom-right', 'To bottom right'],
  ['to-bottom', 'To bottom'],
  ['to-bottom-left', 'To bottom left'],
  ['to-left', 'To left'],
  ['to-top-left', 'To top left'],
  ['to-top', 'To top'],
  ['to-top-right', 'To top right'],
] as const satisfies readonly (readonly [LinearGradientDirection, string])[];

function options(
  values: readonly (readonly [value: string, label: string])[],
): readonly StyleEditorOption[] {
  return values.map(([value, label]) => ({ value, label }));
}

function enumProperty(
  name: ComponentStylePropertyName,
  label: string,
  category: ComponentStylePropertyCategory,
  values: readonly (readonly [value: string, label: string])[],
  componentTypes?: readonly string[],
  stateNames?: readonly ComponentStyleStateName[],
): ComponentStylePropertyDefinition {
  return {
    name,
    label,
    category,
    defaultValue: defaultEnumValue(name, values[0]?.[0] ?? ''),
    description: `Configure ${label.toLocaleLowerCase('en-US')}.`,
    editor: { kind: 'enum', options: options(values) },
    ...(componentTypes === undefined ? {} : { componentTypes }),
    ...(stateNames === undefined ? {} : { stateNames }),
  };
}

function defaultEnumValue(name: ComponentStylePropertyName, fallback: string): string {
  switch (name) {
    case 'borderStyle':
    case 'outlineStyle':
      return 'solid';
    case 'boxShadow':
      return 'md';
    case 'transitionProperty':
      return 'all';
    case 'transitionTimingFunction':
      return 'easeOut';
    case 'animationName':
      return 'pulse';
    case 'animationIterationCount':
      return 'infinite';
    case 'animationTimingFunction':
      return 'easeInOut';
    default:
      return fallback;
  }
}

interface LengthPropertyOptions {
  readonly units?: readonly StyleLengthUnit[];
  readonly keywords?: readonly (readonly [value: string, label: string])[];
  readonly allowNegative?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly defaultValue?: StylePropertyValue;
  readonly componentTypes?: readonly string[];
}

function lengthProperty(
  name: ComponentStylePropertyName,
  label: string,
  category: ComponentStylePropertyCategory,
  settings: LengthPropertyOptions = {},
): ComponentStylePropertyDefinition {
  return {
    name,
    label,
    category,
    defaultValue: settings.defaultValue ?? defaultLengthValue(name),
    description: `Configure ${label.toLocaleLowerCase('en-US')}.`,
    editor: {
      kind: 'length',
      units: settings.units ?? ALL_LENGTH_UNITS,
      ...(settings.keywords === undefined ? {} : { keywords: options(settings.keywords) }),
      ...(settings.allowNegative === undefined ? {} : { allowNegative: settings.allowNegative }),
      ...(settings.min === undefined ? {} : { min: settings.min }),
      ...(settings.max === undefined ? {} : { max: settings.max }),
      ...(settings.step === undefined ? {} : { step: settings.step }),
    },
    ...(settings.componentTypes === undefined ? {} : { componentTypes: settings.componentTypes }),
  };
}

function defaultLengthValue(name: ComponentStylePropertyName): StylePropertyValue {
  if (name === 'width' || name === 'height') return 'auto';
  if (name.startsWith('max')) return 'full';
  if (name === 'fontSize') return { value: 16, unit: 'px' };
  if (name === 'lineHeight') return { value: 24, unit: 'px' };
  if (name.startsWith('padding') || name.endsWith('Gap') || name === 'gap') {
    return { value: 8, unit: 'px' };
  }
  if (
    name === 'borderWidth' ||
    name === 'outlineWidth' ||
    name === 'ringWidth' ||
    name === 'ringOffsetWidth'
  ) {
    return { value: name === 'borderWidth' ? 1 : 2, unit: 'px' };
  }
  if (name === 'borderRadius') return { value: 4, unit: 'px' };
  if (name === 'outlineOffset') return { value: 2, unit: 'px' };
  if (name === 'blur') return { value: 4, unit: 'px' };
  return { value: 0, unit: 'px' };
}

function colorProperty(
  name: ComponentStylePropertyName,
  label: string,
  category: ComponentStylePropertyCategory,
): ComponentStylePropertyDefinition {
  return {
    name,
    label,
    category,
    defaultValue:
      name === 'backgroundColor'
        ? '#ffffff'
        : name === 'ringColor' || name === 'outlineColor'
          ? '#0ea5e9'
          : '#000000',
    description: `Configure ${label.toLocaleLowerCase('en-US')}.`,
    editor: {
      kind: 'color',
      keywords: options([
        ['transparent', 'Transparent'],
        ['current', 'Current color'],
        ['inherit', 'Inherit'],
      ]),
    },
  };
}

function gradientProperty(
  name: ComponentStylePropertyName,
  label: string,
  category: ComponentStylePropertyCategory,
  componentTypes?: readonly string[],
): ComponentStylePropertyDefinition {
  return {
    name,
    label,
    category,
    defaultValue: {
      kind: 'linear',
      direction: 'to-right',
      from: '#2563eb',
      to: '#7c3aed',
    },
    description: `Configure ${label.toLocaleLowerCase('en-US')} without arbitrary CSS.`,
    editor: {
      kind: 'gradient',
      directions: options(GRADIENT_DIRECTIONS),
    },
    ...(componentTypes === undefined ? {} : { componentTypes }),
  };
}

function numberProperty(
  name: ComponentStylePropertyName,
  label: string,
  category: ComponentStylePropertyCategory,
  min: number,
  max: number,
  step: number,
  suffix?: string,
  integer = false,
): ComponentStylePropertyDefinition {
  return {
    name,
    label,
    category,
    defaultValue: defaultNumberValue(name, min),
    description: `Configure ${label.toLocaleLowerCase('en-US')}.`,
    editor: {
      kind: 'number',
      min,
      max,
      step,
      ...(suffix === undefined ? {} : { suffix }),
      ...(integer ? { integer: true } : {}),
    },
  };
}

function defaultNumberValue(name: ComponentStylePropertyName, fallback: number): number {
  switch (name) {
    case 'gridColumns':
    case 'gridRows':
      return 1;
    case 'opacity':
    case 'brightness':
    case 'contrast':
    case 'grayscale':
    case 'saturate':
    case 'scale':
      return 100;
    case 'transitionDuration':
      return 200;
    case 'animationDuration':
      return 1000;
    case 'rotate':
    case 'skewX':
    case 'skewY':
      return 0;
    default:
      return fallback;
  }
}

const DISPLAY_OPTIONS = options([
  ['block', 'Block'],
  ['inline-block', 'Inline block'],
  ['flex', 'Flex'],
  ['inline-flex', 'Inline flex'],
  ['grid', 'Grid'],
  ['inline-grid', 'Inline grid'],
  ['hidden', 'Hidden'],
]);

const DIMENSION_KEYWORDS = [
  ['auto', 'Auto'],
  ['full', 'Full (100%)'],
  ['screen', 'Viewport'],
  ['min', 'Min content'],
  ['max', 'Max content'],
  ['fit', 'Fit content'],
] as const;

const MAX_DIMENSION_KEYWORDS = [
  ['none', 'No maximum'],
  ['full', 'Full (100%)'],
  ['screen', 'Viewport'],
  ['min', 'Min content'],
  ['max', 'Max content'],
  ['fit', 'Fit content'],
] as const;

const TIMING_OPTIONS = [
  ['linear', 'Linear'],
  ['easeIn', 'Ease in'],
  ['easeOut', 'Ease out'],
  ['easeInOut', 'Ease in and out'],
] as const;

export const COMPONENT_STYLE_PROPERTY_DEFINITIONS: readonly ComponentStylePropertyDefinition[] = [
  {
    name: 'display',
    label: 'Display',
    category: 'Layout',
    defaultValue: 'block',
    description: 'Choose how the component participates in layout.',
    editor: { kind: 'enum', options: DISPLAY_OPTIONS },
  },
  enumProperty('overflow', 'Overflow', 'Layout', [
    ['visible', 'Visible'],
    ['hidden', 'Hidden'],
    ['clip', 'Clip'],
    ['auto', 'Auto'],
    ['scroll', 'Scroll'],
  ]),
  enumProperty('flexDirection', 'Flex direction', 'Layout', [
    ['row', 'Row'],
    ['row-reverse', 'Row reverse'],
    ['column', 'Column'],
    ['column-reverse', 'Column reverse'],
  ]),
  enumProperty('flexWrap', 'Flex wrap', 'Layout', [
    ['nowrap', 'No wrap'],
    ['wrap', 'Wrap'],
    ['wrap-reverse', 'Wrap reverse'],
  ]),
  enumProperty('justifyContent', 'Justify content', 'Layout', [
    ['start', 'Start'],
    ['end', 'End'],
    ['center', 'Center'],
    ['between', 'Space between'],
    ['around', 'Space around'],
    ['evenly', 'Space evenly'],
  ]),
  enumProperty('alignItems', 'Align items', 'Layout', [
    ['start', 'Start'],
    ['end', 'End'],
    ['center', 'Center'],
    ['baseline', 'Baseline'],
    ['stretch', 'Stretch'],
  ]),
  enumProperty('alignContent', 'Align content', 'Layout', [
    ['normal', 'Normal'],
    ['start', 'Start'],
    ['end', 'End'],
    ['center', 'Center'],
    ['between', 'Space between'],
    ['around', 'Space around'],
    ['evenly', 'Space evenly'],
    ['stretch', 'Stretch'],
  ]),
  numberProperty('gridColumns', 'Grid columns', 'Layout', 1, 12, 1, undefined, true),
  numberProperty('gridRows', 'Grid rows', 'Layout', 1, 12, 1, undefined, true),
  lengthProperty('gap', 'Gap', 'Layout', { units: SPACING_UNITS, min: 0 }),
  lengthProperty('rowGap', 'Row gap', 'Layout', { units: SPACING_UNITS, min: 0 }),
  lengthProperty('columnGap', 'Column gap', 'Layout', { units: SPACING_UNITS, min: 0 }),

  lengthProperty('width', 'Width', 'Dimensions', { keywords: DIMENSION_KEYWORDS, min: 0 }),
  lengthProperty('height', 'Height', 'Dimensions', { keywords: DIMENSION_KEYWORDS, min: 0 }),
  lengthProperty('minWidth', 'Minimum width', 'Dimensions', {
    keywords: DIMENSION_KEYWORDS,
    min: 0,
  }),
  lengthProperty('maxWidth', 'Maximum width', 'Dimensions', {
    keywords: MAX_DIMENSION_KEYWORDS,
    min: 0,
  }),
  lengthProperty('minHeight', 'Minimum height', 'Dimensions', {
    keywords: DIMENSION_KEYWORDS,
    min: 0,
  }),
  lengthProperty('maxHeight', 'Maximum height', 'Dimensions', {
    keywords: MAX_DIMENSION_KEYWORDS,
    min: 0,
  }),

  lengthProperty('marginTop', 'Margin top', 'Spacing', {
    units: SPACING_UNITS,
    allowNegative: true,
  }),
  lengthProperty('marginRight', 'Margin right', 'Spacing', {
    units: SPACING_UNITS,
    allowNegative: true,
  }),
  lengthProperty('marginBottom', 'Margin bottom', 'Spacing', {
    units: SPACING_UNITS,
    allowNegative: true,
  }),
  lengthProperty('marginLeft', 'Margin left', 'Spacing', {
    units: SPACING_UNITS,
    allowNegative: true,
  }),
  lengthProperty('paddingTop', 'Padding top', 'Spacing', { units: SPACING_UNITS, min: 0 }),
  lengthProperty('paddingRight', 'Padding right', 'Spacing', { units: SPACING_UNITS, min: 0 }),
  lengthProperty('paddingBottom', 'Padding bottom', 'Spacing', { units: SPACING_UNITS, min: 0 }),
  lengthProperty('paddingLeft', 'Padding left', 'Spacing', { units: SPACING_UNITS, min: 0 }),

  enumProperty('fontFamily', 'Font family', 'Typography', [
    ['sans', 'Sans serif'],
    ['serif', 'Serif'],
    ['mono', 'Monospace'],
  ]),
  lengthProperty('fontSize', 'Font size', 'Typography', { units: ['px', 'rem'], min: 0 }),
  enumProperty('fontWeight', 'Font weight', 'Typography', [
    ['thin', 'Thin (100)'],
    ['extralight', 'Extra light (200)'],
    ['light', 'Light (300)'],
    ['normal', 'Normal (400)'],
    ['medium', 'Medium (500)'],
    ['semibold', 'Semi bold (600)'],
    ['bold', 'Bold (700)'],
    ['extrabold', 'Extra bold (800)'],
    ['black', 'Black (900)'],
  ]),
  lengthProperty('lineHeight', 'Line height', 'Typography', { units: ['px', 'rem'], min: 0 }),
  lengthProperty('letterSpacing', 'Letter spacing', 'Typography', {
    units: ['px', 'rem'],
    allowNegative: true,
  }),
  enumProperty('textAlign', 'Text align', 'Typography', [
    ['left', 'Left'],
    ['center', 'Center'],
    ['right', 'Right'],
    ['justify', 'Justify'],
    ['start', 'Start'],
    ['end', 'End'],
  ]),
  enumProperty('textTransform', 'Text transform', 'Typography', [
    ['none', 'None'],
    ['uppercase', 'Uppercase'],
    ['lowercase', 'Lowercase'],
    ['capitalize', 'Capitalize'],
  ]),
  enumProperty('textDecoration', 'Text decoration', 'Typography', [
    ['none', 'None'],
    ['underline', 'Underline'],
    ['overline', 'Overline'],
    ['lineThrough', 'Line through'],
  ]),
  enumProperty('fontStyle', 'Font style', 'Typography', [
    ['normal', 'Normal'],
    ['italic', 'Italic'],
  ]),
  enumProperty('whiteSpace', 'White space', 'Typography', [
    ['normal', 'Normal'],
    ['nowrap', 'No wrap'],
    ['pre', 'Preserve'],
    ['preLine', 'Preserve lines'],
    ['preWrap', 'Preserve and wrap'],
    ['breakSpaces', 'Break spaces'],
  ]),

  enumProperty(
    'buttonContentMode',
    'Button content',
    'Content',
    [
      ['text', 'Text only'],
      ['text-icon', 'Text and icon'],
      ['icon', 'Icon only'],
    ],
    ['WebButton'],
    ['base'],
  ),
  enumProperty(
    'buttonIconPosition',
    'Icon position',
    'Content',
    [
      ['left', 'Left'],
      ['right', 'Right'],
      ['top', 'Top'],
      ['bottom', 'Bottom'],
    ],
    ['WebButton'],
    ['base'],
  ),

  colorProperty('textColor', 'Text color', 'Colors'),
  gradientProperty('textGradient', 'Text gradient', 'Colors', [
    'WebLabel',
    'WebButton',
    'WebCheckBox',
  ]),
  colorProperty('backgroundColor', 'Background color', 'Colors'),
  gradientProperty('backgroundGradient', 'Background gradient', 'Colors'),

  lengthProperty('borderWidth', 'Border width', 'Border', { units: ['px', 'rem'], min: 0 }),
  enumProperty('borderStyle', 'Border style', 'Border', [
    ['none', 'None'],
    ['solid', 'Solid'],
    ['dashed', 'Dashed'],
    ['dotted', 'Dotted'],
    ['double', 'Double'],
  ]),
  colorProperty('borderColor', 'Border color', 'Border'),
  gradientProperty('borderGradient', 'Border gradient', 'Border'),
  lengthProperty('borderRadius', 'Border radius', 'Border', {
    units: ['px', 'rem', '%'],
    min: 0,
    keywords: [
      ['none', 'None'],
      ['sm', 'Small'],
      ['md', 'Medium'],
      ['lg', 'Large'],
      ['xl', 'Extra large'],
      ['2xl', '2XL'],
      ['3xl', '3XL'],
      ['full', 'Full'],
    ],
  }),
  lengthProperty('outlineWidth', 'Outline width', 'Border', { units: ['px', 'rem'], min: 0 }),
  enumProperty('outlineStyle', 'Outline style', 'Border', [
    ['none', 'None'],
    ['solid', 'Solid'],
    ['dashed', 'Dashed'],
    ['dotted', 'Dotted'],
    ['double', 'Double'],
  ]),
  colorProperty('outlineColor', 'Outline color', 'Border'),
  lengthProperty('outlineOffset', 'Outline offset', 'Border', {
    units: ['px', 'rem'],
    allowNegative: true,
  }),
  lengthProperty('ringWidth', 'Focus ring width', 'Border', { units: ['px', 'rem'], min: 0 }),
  colorProperty('ringColor', 'Focus ring color', 'Border'),
  lengthProperty('ringOffsetWidth', 'Ring offset width', 'Border', {
    units: ['px', 'rem'],
    min: 0,
  }),
  colorProperty('ringOffsetColor', 'Ring offset color', 'Border'),

  enumProperty('boxShadow', 'Box shadow', 'Effects', [
    ['none', 'None'],
    ['sm', 'Small'],
    ['md', 'Medium'],
    ['lg', 'Large'],
    ['xl', 'Extra large'],
    ['2xl', '2XL'],
    ['inner', 'Inner'],
  ]),
  numberProperty('opacity', 'Opacity', 'Effects', 0, 100, 1, '%'),
  lengthProperty('blur', 'Blur', 'Effects', { units: ['px', 'rem'], min: 0 }),
  numberProperty('brightness', 'Brightness', 'Effects', 0, 200, 1, '%'),
  numberProperty('contrast', 'Contrast', 'Effects', 0, 200, 1, '%'),
  numberProperty('grayscale', 'Grayscale', 'Effects', 0, 100, 1, '%'),
  numberProperty('saturate', 'Saturation', 'Effects', 0, 200, 1, '%'),

  lengthProperty('translateX', 'Translate X', 'Transform', { allowNegative: true }),
  lengthProperty('translateY', 'Translate Y', 'Transform', { allowNegative: true }),
  numberProperty('scale', 'Scale', 'Transform', 0, 300, 1, '%'),
  numberProperty('rotate', 'Rotate', 'Transform', -360, 360, 1, 'deg'),
  numberProperty('skewX', 'Skew X', 'Transform', -89, 89, 1, 'deg'),
  numberProperty('skewY', 'Skew Y', 'Transform', -89, 89, 1, 'deg'),
  enumProperty('transformOrigin', 'Transform origin', 'Transform', [
    ['center', 'Center'],
    ['top', 'Top'],
    ['top-right', 'Top right'],
    ['right', 'Right'],
    ['bottom-right', 'Bottom right'],
    ['bottom', 'Bottom'],
    ['bottom-left', 'Bottom left'],
    ['left', 'Left'],
    ['top-left', 'Top left'],
  ]),

  enumProperty('transitionProperty', 'Transition property', 'Animation', [
    ['none', 'None'],
    ['all', 'All'],
    ['colors', 'Colors'],
    ['opacity', 'Opacity'],
    ['shadow', 'Shadow'],
    ['transform', 'Transform'],
  ]),
  numberProperty('transitionDuration', 'Transition duration', 'Animation', 0, 5000, 10, 'ms'),
  numberProperty('transitionDelay', 'Transition delay', 'Animation', 0, 5000, 10, 'ms'),
  enumProperty('transitionTimingFunction', 'Transition easing', 'Animation', TIMING_OPTIONS),
  enumProperty('animationName', 'Animation', 'Animation', [
    ['none', 'None'],
    ['spin', 'Spin'],
    ['ping', 'Ping'],
    ['pulse', 'Pulse'],
    ['bounce', 'Bounce'],
  ]),
  numberProperty('animationDuration', 'Animation duration', 'Animation', 0, 10000, 10, 'ms'),
  enumProperty('animationIterationCount', 'Animation repeats', 'Animation', [
    ['once', 'Once'],
    ['twice', 'Twice'],
    ['three', 'Three times'],
    ['infinite', 'Infinite'],
  ]),
  enumProperty('animationTimingFunction', 'Animation easing', 'Animation', TIMING_OPTIONS),

  enumProperty('cursor', 'Cursor', 'Interaction', [
    ['auto', 'Auto'],
    ['default', 'Default'],
    ['pointer', 'Pointer'],
    ['wait', 'Wait'],
    ['text', 'Text'],
    ['move', 'Move'],
    ['help', 'Help'],
    ['not-allowed', 'Not allowed'],
    ['grab', 'Grab'],
    ['grabbing', 'Grabbing'],
  ]),
  enumProperty('userSelect', 'Text selection', 'Interaction', [
    ['auto', 'Auto'],
    ['none', 'None'],
    ['text', 'Text'],
    ['all', 'All'],
  ]),
  enumProperty('pointerEvents', 'Pointer events', 'Interaction', [
    ['auto', 'Auto'],
    ['none', 'None'],
  ]),

  enumProperty(
    'objectFit',
    'Image fit',
    'Image',
    [
      ['contain', 'Contain'],
      ['cover', 'Cover'],
      ['fill', 'Fill'],
      ['none', 'None'],
      ['scale-down', 'Scale down'],
    ],
    ['WebImage'],
  ),
  enumProperty(
    'objectPosition',
    'Image position',
    'Image',
    [
      ['center', 'Center'],
      ['top', 'Top'],
      ['top-right', 'Top right'],
      ['right', 'Right'],
      ['bottom-right', 'Bottom right'],
      ['bottom', 'Bottom'],
      ['bottom-left', 'Bottom left'],
      ['left', 'Left'],
      ['top-left', 'Top left'],
    ],
    ['WebImage'],
  ),
];

export const COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME: ReadonlyMap<
  ComponentStylePropertyName,
  ComponentStylePropertyDefinition
> = new Map(
  COMPONENT_STYLE_PROPERTY_DEFINITIONS.map((definition) => [definition.name, definition]),
);
