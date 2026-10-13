import {
  ProjectSourceFilesSchema,
  ProjectAssetsSchema,
  validateProjectResourceIds,
} from './project-resources.js';
import { z } from 'zod';
import { bindStyleColorsToPalette, paletteColorId } from './color-palette.js';

import { ApiClientConfigurationSchema } from './api-client.js';
import { DataGridConfigurationSchema } from './data-grid.js';
import { CurrentRowBindingsSchema, RepeatingGroupConfigurationSchema } from './repeating-group.js';
import { ComboBoxConfigurationSchema } from './combo-box.js';
import { VideoUploadPropertiesSchema } from './video-upload.js';
import { VideoPlayerPropertiesSchema } from './video-player.js';
import { defaultComponentStyleId, DEFAULT_COMPONENT_STYLE_DEFINITIONS } from './default-styles.js';
import { ProjectValidationError } from './errors.js';
import {
  COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME,
  COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS,
} from './style-properties.js';
import {
  getPageNameError,
  getGeneratedPageMemberNameError,
  getProjectNameError,
  getTypeScriptIdentifierError,
  portableFileNameKey,
} from './naming.js';
import {
  CONTAINER_LAYOUT_MODES,
  COMPONENT_STYLE_PRESETS,
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  DEFAULT_PROJECT_SCROLLBAR_STYLE,
  DEFAULT_PROJECT_SETTINGS,
  COMPONENT_STYLE_PROPERTY_NAMES,
  COMPONENT_STYLE_STATE_NAMES,
  LINEAR_GRADIENT_DIRECTIONS,
  type BackgroundGradientValue,
  LAYOUT_ALIGN_ITEMS_VALUES,
  LAYOUT_ALIGN_SELF_VALUES,
  LAYOUT_ANCHORS,
  LAYOUT_ITEM_SIZING_MODES,
  LAYOUT_JUSTIFY_CONTENT_VALUES,
  REUSABLE_ELEMENT_HORIZONTAL_ANCHORS,
  REUSABLE_ELEMENT_PLACEMENTS,
  REUSABLE_ELEMENT_VERTICAL_ANCHORS,
  PROJECT_ENVIRONMENTS,
  PROJECT_APPLICATION_ICON_MEDIA_TYPES,
  PROJECT_SOCIAL_IMAGE_MEDIA_TYPES,
  type Bounds,
  type ComponentLayout,
  type ComponentNode,
  type ComponentStyleModel,
  type ComponentStyleProperties,
  type ComponentStyleStateName,
  type ComponentStyleStates,
  type ContainerLayout,
  type LayoutItem,
  type PageDescriptor,
  type PageModel,
  type ProjectManifest,
  type ProjectPaletteColor,
  type ProjectEnvironmentVariable,
  type ProjectApplicationIcon,
  type ProjectSocialImage,
  type ProjectSeoSettings,
  type ProjectSettings,
  type ProjectBuildSettings,
  type ProjectPwaSettings,
  type RestGoProjectSettings,
  type ProjectScrollbarStyle,
  type ReusableElementModel,
  type StyleLengthValue,
  type StylePropertyValue,
  type WebRadProject,
} from './types.js';

const nonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Must not be empty.',
});

const identifierSchema = z.string().superRefine((value, context) => {
  const error = getTypeScriptIdentifierError(value);
  if (error !== undefined) {
    context.addIssue({ code: 'custom', message: error });
  }
});

const projectNameSchema = z.string().superRefine((value, context) => {
  const error = getProjectNameError(value);
  if (error !== undefined) context.addIssue({ code: 'custom', message: error });
});

const pageNameSchema = z.string().superRefine((value, context) => {
  const error = getPageNameError(value);
  if (error !== undefined) context.addIssue({ code: 'custom', message: error });
});

const componentStyleNameSchema = nonEmptyStringSchema.refine(
  (value) => value === value.trim(),
  'Style names cannot start or end with whitespace.',
);

const finiteCoordinateSchema = z.number().finite();
const positiveDimensionSchema = z.number().finite().positive();
const nonNegativeFiniteSchema = z.number().finite().nonnegative();
const relativeProjectPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\\'), 'Persisted paths must use forward slashes.')
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !/^[A-Za-z]:/.test(value) &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Expected a normalized relative project path.',
  );

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDefaultStyleForComponent(value: unknown, componentType: string): boolean {
  return isRecord(value) && value.componentType === componentType && value.preset === 'default';
}

function uniqueDefaultStyleId(
  projectId: string,
  componentType: string,
  occupied: ReadonlySet<string>,
): string {
  const baseId = defaultComponentStyleId(projectId, componentType);
  if (!occupied.has(baseId)) return baseId;

  let suffix = 2;
  while (occupied.has(`${baseId}-${String(suffix)}`)) suffix += 1;
  return `${baseId}-${String(suffix)}`;
}

function uniqueDefaultStyleName(baseName: string, occupied: ReadonlySet<string>): string {
  if (!occupied.has(portableFileNameKey(baseName))) return baseName;

  let suffix = 2;
  let candidate = `${baseName} ${String(suffix)}`;
  while (occupied.has(portableFileNameKey(candidate))) {
    suffix += 1;
    candidate = `${baseName} ${String(suffix)}`;
  }
  return candidate;
}

function materializeDefaultStyleStates(
  states: Partial<Readonly<Record<ComponentStyleStateName, ComponentStyleProperties>>>,
): Record<ComponentStyleStateName, ComponentStyleProperties> {
  return {
    base: { ...states.base },
    hover: { ...states.hover },
    focus: { ...states.focus },
    active: { ...states.active },
    disabled: { ...states.disabled },
  };
}

interface DefaultStyleMaterialization {
  readonly styles: readonly unknown[];
}

/**
 * Add a newly introduced Aurora visual's protected style deterministically
 * without disturbing a project's other saved styles or component bindings.
 */
function materializeComponentDefaultStyle(
  projectId: string,
  styles: readonly unknown[],
  componentType: string,
  precedingTypes: readonly string[],
  colors?: readonly ProjectPaletteColor[],
): DefaultStyleMaterialization {
  const existingDefault = styles.find((style) => isDefaultStyleForComponent(style, componentType));
  if (existingDefault !== undefined) {
    return { styles };
  }

  const definition = DEFAULT_COMPONENT_STYLE_DEFINITIONS.find(
    (style) => style.componentType === componentType,
  );
  if (definition === undefined) return { styles };

  const occupiedIds = new Set(
    styles.flatMap((style) => (isRecord(style) && typeof style.id === 'string' ? [style.id] : [])),
  );
  const occupiedNames = new Set(
    styles.flatMap((style) =>
      isRecord(style) && typeof style.name === 'string' ? [portableFileNameKey(style.name)] : [],
    ),
  );
  const styleId = uniqueDefaultStyleId(projectId, definition.componentType, occupiedIds);
  const styleName = uniqueDefaultStyleName(definition.name, occupiedNames);
  const states = materializeDefaultStyleStates(definition.states);
  const defaultStyle = {
    id: styleId,
    name: styleName,
    componentType: definition.componentType,
    preset: 'default' as const,
    states:
      colors === undefined
        ? states
        : Object.fromEntries(
            COMPONENT_STYLE_STATE_NAMES.map((state) => [
              state,
              bindStyleColorsToPalette(states[state], colors),
            ]),
          ),
  };
  const precedingIndex = precedingTypes
    .map((type) => styles.findIndex((style) => isDefaultStyleForComponent(style, type)))
    .find((index) => index >= 0);
  const insertionIndex = precedingIndex === undefined ? 0 : precedingIndex + 1;

  return {
    styles: [...styles.slice(0, insertionIndex), defaultStyle, ...styles.slice(insertionIndex)],
  };
}

/**
 * Some additive v2 fields were introduced after projects using the same
 * format version already existed. Materialize their deterministic defaults
 * before strict schema validation, keeping persisted aggregates canonical.
 */
function materializeProjectDefaults(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const candidate = input as Readonly<Record<string, unknown>>;
  const settings = candidate.settings;
  let styles = candidate.styles;
  if (typeof candidate.id === 'string' && Array.isArray(styles)) {
    const popupStyles = materializeComponentDefaultStyle(candidate.id, styles, 'WebPopup', [
      'WebPanel',
      'WebPage',
    ]).styles;
    const palette = ProjectColorPaletteSchema.safeParse(
      isRecord(settings)
        ? (settings.colorPalette ?? DEFAULT_PROJECT_SETTINGS.colorPalette)
        : DEFAULT_PROJECT_SETTINGS.colorPalette,
    );
    const videoStyles = materializeComponentDefaultStyle(
      candidate.id,
      popupStyles,
      'WebVideoPlayer',
      ['WebImage'],
      palette.success ? palette.data : [],
    ).styles;
    const repeatingStyles = materializeComponentDefaultStyle(
      candidate.id,
      videoStyles,
      'WebRepeatingGroup',
      ['WebPanel'],
      palette.success ? palette.data : [],
    ).styles;

    const toggleStyles = materializeComponentDefaultStyle(
      candidate.id,
      repeatingStyles,
      'WebToggle',
      ['WebCheckBox'],
      palette.success ? palette.data : [],
    ).styles;

    styles = materializeComponentDefaultStyle(
      candidate.id,
      toggleStyles,
      'WebProgressBar',
      ['WebToggle'],
      palette.success ? palette.data : [],
    ).styles;
  }
  const applicationName =
    typeof candidate.name === 'string' ? candidate.name : DEFAULT_PROJECT_SETTINGS.applicationName;
  return {
    ...candidate,
    ...(Object.hasOwn(candidate, 'reusableElements') ? {} : { reusableElements: [] }),
    ...(styles === candidate.styles ? {} : { styles }),
    ...(settings !== null && typeof settings === 'object' && !Array.isArray(settings)
      ? {
          settings: materializeProjectSettings({
            ...DEFAULT_PROJECT_SETTINGS,
            applicationName,
            ...settings,
          }),
        }
      : {}),
  };
}

/**
 * Environment variables initially supported a staging value while retaining
 * format version 2. Keep those files readable after reducing the public
 * contract to development and production. If staging was active, carry its
 * value into production so the previously selected runtime value is kept.
 * This also normalizes additive nested SEO settings and removes the brief
 * legacy socialImageUrl field, which cannot represent a portable local asset.
 */
function materializeProjectSettings(settings: Readonly<Record<string, unknown>>): unknown {
  const stagingWasActive = settings.environment === 'staging';
  const environmentVariables = settings.environmentVariables;
  const normalizedVariables = Array.isArray(environmentVariables)
    ? environmentVariables.map((variable) => {
        if (variable === null || typeof variable !== 'object' || Array.isArray(variable)) {
          return variable;
        }
        const candidate = variable as Readonly<Record<string, unknown>>;
        const values = candidate.values;
        if (values === null || typeof values !== 'object' || Array.isArray(values)) {
          return variable;
        }
        const { staging, ...supportedValues } = values as Readonly<Record<string, unknown>>;
        return {
          ...candidate,
          values: {
            ...supportedValues,
            ...(stagingWasActive ? { production: staging } : {}),
          },
        };
      })
    : environmentVariables;
  const seo = settings.seo;
  const normalizedSeo =
    seo !== null && typeof seo === 'object' && !Array.isArray(seo)
      ? (() => {
          const supportedSeo = Object.fromEntries(
            Object.entries(seo as Readonly<Record<string, unknown>>).filter(
              ([key]) => key !== 'socialImageUrl',
            ),
          );
          return { ...DEFAULT_PROJECT_SETTINGS.seo, ...supportedSeo };
        })()
      : seo;
  const scrollbar = settings.scrollbar;
  const normalizedScrollbar =
    scrollbar !== null && typeof scrollbar === 'object' && !Array.isArray(scrollbar)
      ? { ...DEFAULT_PROJECT_SCROLLBAR_STYLE, ...scrollbar }
      : scrollbar;
  const restGo = settings.restGo;
  const normalizedRestGo = isRecord(restGo)
    ? { ...DEFAULT_PROJECT_SETTINGS.restGo, ...restGo }
    : restGo;
  return {
    ...settings,
    ...(settings.environment === 'staging' ? { environment: 'production' } : {}),
    ...(Array.isArray(environmentVariables) ? { environmentVariables: normalizedVariables } : {}),
    ...(seo !== null && typeof seo === 'object' && !Array.isArray(seo)
      ? { seo: normalizedSeo }
      : {}),
    ...(scrollbar !== null && typeof scrollbar === 'object' && !Array.isArray(scrollbar)
      ? { scrollbar: normalizedScrollbar }
      : {}),
    ...(isRecord(restGo) ? { restGo: normalizedRestGo } : {}),
  };
}

export const BoundsSchema: z.ZodType<Bounds> = z
  .object({
    x: finiteCoordinateSchema,
    y: finiteCoordinateSchema,
    width: positiveDimensionSchema,
    height: positiveDimensionSchema,
  })
  .strict();

export const ContainerLayoutSchema: z.ZodType<ContainerLayout> = z
  .object({
    mode: z.enum(CONTAINER_LAYOUT_MODES),
    paddingTop: nonNegativeFiniteSchema,
    paddingRight: nonNegativeFiniteSchema,
    paddingBottom: nonNegativeFiniteSchema,
    paddingLeft: nonNegativeFiniteSchema,
    gap: nonNegativeFiniteSchema,
    wrap: z.boolean(),
    justifyContent: z.enum(LAYOUT_JUSTIFY_CONTENT_VALUES),
    alignItems: z.enum(LAYOUT_ALIGN_ITEMS_VALUES),
  })
  .strict();

export const LayoutItemSchema: z.ZodType<LayoutItem> = z
  .object({
    width: z.enum(LAYOUT_ITEM_SIZING_MODES),
    height: z.enum(LAYOUT_ITEM_SIZING_MODES),
    minWidth: nonNegativeFiniteSchema,
    maxWidth: nonNegativeFiniteSchema.nullable(),
    minHeight: nonNegativeFiniteSchema,
    maxHeight: nonNegativeFiniteSchema.nullable(),
    grow: nonNegativeFiniteSchema,
    shrink: z.boolean(),
    alignSelf: z.enum(LAYOUT_ALIGN_SELF_VALUES).default('auto'),
    horizontalAnchor: z.enum(LAYOUT_ANCHORS),
    verticalAnchor: z.enum(LAYOUT_ANCHORS),
    left: finiteCoordinateSchema,
    right: finiteCoordinateSchema,
    top: finiteCoordinateSchema,
    bottom: finiteCoordinateSchema,
  })
  .strict()
  .superRefine((item, context) => {
    if (item.maxWidth !== null && item.maxWidth < item.minWidth) {
      context.addIssue({
        code: 'custom',
        message: 'Maximum width must be greater than or equal to minimum width.',
        path: ['maxWidth'],
      });
    }
    if (item.maxHeight !== null && item.maxHeight < item.minHeight) {
      context.addIssue({
        code: 'custom',
        message: 'Maximum height must be greater than or equal to minimum height.',
        path: ['maxHeight'],
      });
    }
  });

export const ComponentLayoutSchema: z.ZodType<ComponentLayout> = z
  .object({
    container: ContainerLayoutSchema,
    item: LayoutItemSchema,
  })
  .strict();

/**
 * Materializes versioned component-property values before the component is
 * validated. This makes the Project Model's parsed output the canonical
 * representation, rather than merely accepting an older persisted shape.
 */
function materializeComponentProperties(input: unknown): unknown {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !('type' in input) ||
    !('props' in input) ||
    input.props === null ||
    typeof input.props !== 'object' ||
    Array.isArray(input.props)
  ) {
    return input;
  }

  if (input.type === 'WebPopup') {
    // Popup used to be a message dialog. It is now a pure visual child
    // container, so normalize persisted v2 documents to its current public
    // contract instead of keeping obsolete presentation properties alive.
    const props = Object.fromEntries(
      Object.entries(input.props).filter(
        ([propertyName]) => propertyName !== 'caption' && propertyName !== 'message',
      ),
    );
    return { ...input, props };
  }

  if (input.type === 'WebReusableElement') {
    return {
      ...input,
      props: {
        placement: 'in-flow',
        floatingHorizontalAnchor: 'left',
        floatingVerticalAnchor: 'top',
        floatingZIndex: 100,
        ...input.props,
      },
    };
  }

  if (input.type !== 'WebDataGrid' || !('dataGridConfig' in input.props)) return input;

  const configuration = DataGridConfigurationSchema.safeParse(input.props.dataGridConfig);
  if (!configuration.success) return input;

  return {
    ...input,
    props: {
      ...input.props,
      dataGridConfig: configuration.data,
    },
  };
}

export const ComponentNodeSchema: z.ZodType<ComponentNode> = z.preprocess(
  materializeComponentProperties,
  z
    .object({
      id: nonEmptyStringSchema,
      type: identifierSchema,
      name: identifierSchema,
      parentId: nonEmptyStringSchema.nullable(),
      layout: ComponentLayoutSchema,
      bounds: BoundsSchema,
      props: z.record(z.string(), z.json()),
      events: z.record(z.string(), z.string().min(1).nullable()),
      styleId: nonEmptyStringSchema.optional(),
      children: z.array(nonEmptyStringSchema),
    })
    .strict()
    .superRefine((component, context) => {
      if (component.props.currentRowBindings !== undefined) {
        const result = CurrentRowBindingsSchema.safeParse(component.props.currentRowBindings);
        if (!result.success)
          for (const issue of result.error.issues)
            context.addIssue({
              code: 'custom',
              message: `Invalid current-row binding: ${issue.message}`,
              path: ['props', 'currentRowBindings', ...issue.path],
            });
      }
      if (component.type === 'WebVideoUpload' || component.type === 'WebVideoPlayer') {
        const result = (
          component.type === 'WebVideoUpload'
            ? VideoUploadPropertiesSchema
            : VideoPlayerPropertiesSchema
        ).safeParse(component.props);
        if (!result.success)
          for (const issue of result.error.issues) {
            context.addIssue({
              code: 'custom',
              message: `Invalid ${component.type} configuration: ${issue.message}`,
              path: ['props', ...issue.path],
            });
          }
      }
      const propertyName =
        component.type === 'WebApiClient'
          ? 'apiClientConfig'
          : component.type === 'WebDataGrid'
            ? 'dataGridConfig'
            : component.type === 'WebRepeatingGroup'
              ? 'repeatingGroupConfig'
              : component.type === 'WebComboBox'
                ? 'comboBoxConfig'
                : undefined;
      if (propertyName === undefined || component.props[propertyName] === undefined) return;
      const schema =
        component.type === 'WebApiClient'
          ? ApiClientConfigurationSchema
          : component.type === 'WebDataGrid'
            ? DataGridConfigurationSchema
            : component.type === 'WebRepeatingGroup'
              ? RepeatingGroupConfigurationSchema
              : ComboBoxConfigurationSchema.nullable();
      const result = schema.safeParse(component.props[propertyName]);
      if (result.success) return;
      for (const issue of result.error.issues) {
        context.addIssue({
          code: 'custom',
          message: `Invalid ${component.type === 'WebApiClient' ? 'API Client' : component.type === 'WebDataGrid' ? 'Data Grid' : component.type === 'WebRepeatingGroup' ? 'Repeating Group' : 'ComboBox'} configuration: ${issue.message}`,
          path: ['props', propertyName, ...issue.path],
        });
      }
    }),
);

export const StyleLengthValueSchema: z.ZodType<StyleLengthValue> = z
  .object({
    value: z.number().finite(),
    unit: z.enum(['px', 'rem', '%', 'vw', 'vh']),
  })
  .strict();

const hexColorSchema = z
  .string()
  .regex(/^#[\da-f]{6}$/iu, 'Expected a six-digit hexadecimal color.');

const paletteLinkedColorSchema = z
  .string()
  .refine(
    (value) => hexColorSchema.safeParse(value).success || paletteColorId(value) !== undefined,
    'Expected a hexadecimal color or palette reference.',
  );

export const ProjectColorPaletteSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u, 'Invalid palette color ID.'),
        name: z.string().trim().min(1, 'Enter a color name.').max(40),
        color: hexColorSchema,
      })
      .strict(),
  )
  .max(10, 'Use up to 10 palette colors.')
  .superRefine((colors, context) => {
    const ids = new Set<string>();
    colors.forEach((entry, index) => {
      if (ids.has(entry.id))
        context.addIssue({
          code: 'custom',
          message: 'Palette color IDs must be unique.',
          path: [index, 'id'],
        });
      ids.add(entry.id);
    });
  });

export const BackgroundGradientValueSchema: z.ZodType<BackgroundGradientValue> = z
  .object({
    kind: z.literal('linear'),
    direction: z.enum(LINEAR_GRADIENT_DIRECTIONS),
    from: paletteLinkedColorSchema,
    to: paletteLinkedColorSchema,
  })
  .strict();

export const StylePropertyValueSchema: z.ZodType<StylePropertyValue> = z.union([
  z.string(),
  z.number().finite(),
  StyleLengthValueSchema,
  BackgroundGradientValueSchema,
]);

function validateStylePropertyValue(
  value: StylePropertyValue,
  propertyName: (typeof COMPONENT_STYLE_PROPERTY_NAMES)[number],
  addIssue: (message: string) => void,
): void {
  const definition = COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME.get(propertyName);
  if (definition === undefined) {
    addIssue(`Unknown style property "${propertyName}".`);
    return;
  }

  const { editor } = definition;
  if (editor.kind === 'enum') {
    if (typeof value !== 'string' || !editor.options.some((option) => option.value === value)) {
      addIssue(`Expected one of the supported ${definition.label.toLowerCase()} values.`);
    }
    return;
  }

  if (editor.kind === 'color') {
    const isKeyword =
      typeof value === 'string' && editor.keywords.some((option) => option.value === value);
    const isHexColor = typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value);
    if (!isKeyword && !isHexColor && paletteColorId(value) === undefined) {
      addIssue(
        `${definition.label} must be a hexadecimal color, palette reference, or supported keyword.`,
      );
    }
    return;
  }

  if (editor.kind === 'gradient') {
    if (!BackgroundGradientValueSchema.safeParse(value).success) {
      addIssue(`${definition.label} must be a supported two-color linear gradient.`);
    }
    return;
  }

  if (editor.kind === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < editor.min ||
      value > editor.max ||
      (editor.integer === true && !Number.isInteger(value))
    ) {
      addIssue(
        `${definition.label} must be a${editor.integer === true ? 'n integer' : ' number'} between ${String(editor.min)} and ${String(editor.max)}.`,
      );
    }
    return;
  }

  if (typeof value === 'string') {
    if (editor.keywords?.some((option) => option.value === value) !== true) {
      addIssue(`${definition.label} must use a supported keyword or numeric length.`);
    }
    return;
  }
  if (typeof value !== 'object' || value === null || !('value' in value) || !('unit' in value)) {
    addIssue(`${definition.label} must be a numeric length.`);
    return;
  }

  const length = value as StyleLengthValue;
  if (!editor.units.includes(length.unit)) {
    addIssue(`${definition.label} does not support the ${length.unit} unit.`);
  }
  if (
    !Number.isFinite(length.value) ||
    Math.abs(length.value) > 1_000_000 ||
    (editor.allowNegative !== true && length.value < 0) ||
    (editor.min !== undefined && length.value < editor.min) ||
    (editor.max !== undefined && length.value > editor.max)
  ) {
    addIssue(`${definition.label} is outside its supported numeric range.`);
  }
}

export const ComponentStylePropertiesSchema: z.ZodType<ComponentStyleProperties> = z
  .partialRecord(z.enum(COMPONENT_STYLE_PROPERTY_NAMES), StylePropertyValueSchema)
  .superRefine((properties, context) => {
    for (const [propertyName, value] of Object.entries(properties)) {
      if (value === undefined) continue;
      validateStylePropertyValue(
        value,
        propertyName as (typeof COMPONENT_STYLE_PROPERTY_NAMES)[number],
        (message) => context.addIssue({ code: 'custom', message, path: [propertyName] }),
      );
    }
    for (const [first, second] of COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS) {
      if (properties[first] === undefined || properties[second] === undefined) continue;
      const firstLabel = COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME.get(first)?.label ?? first;
      const secondLabel = COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME.get(second)?.label ?? second;
      context.addIssue({
        code: 'custom',
        message: `${firstLabel} and ${secondLabel} are mutually exclusive.`,
        path: [second],
      });
    }
  });

export const ComponentStyleStatesSchema: z.ZodType<ComponentStyleStates> = z
  .object({
    base: ComponentStylePropertiesSchema,
    hover: ComponentStylePropertiesSchema,
    focus: ComponentStylePropertiesSchema,
    active: ComponentStylePropertiesSchema,
    disabled: ComponentStylePropertiesSchema,
  })
  .strict();

export const ComponentStyleSchema: z.ZodType<ComponentStyleModel> = z
  .object({
    id: nonEmptyStringSchema,
    name: componentStyleNameSchema,
    componentType: identifierSchema,
    preset: z.enum(COMPONENT_STYLE_PRESETS).optional(),
    states: ComponentStyleStatesSchema,
  })
  .strict()
  .superRefine((style, context) => {
    for (const stateName of COMPONENT_STYLE_STATE_NAMES) {
      for (const propertyName of Object.keys(style.states[stateName])) {
        const definition = COMPONENT_STYLE_PROPERTY_DEFINITION_BY_NAME.get(
          propertyName as (typeof COMPONENT_STYLE_PROPERTY_NAMES)[number],
        );
        if (
          definition?.componentTypes !== undefined &&
          !definition.componentTypes.includes(style.componentType)
        ) {
          context.addIssue({
            code: 'custom',
            message: `${definition.label} is not available for ${style.componentType}.`,
            path: ['states', stateName, propertyName],
          });
        }
        if (definition?.stateNames !== undefined && !definition.stateNames.includes(stateName)) {
          context.addIssue({
            code: 'custom',
            message: `${definition.label} is only available in the ${definition.stateNames.join(', ')} state.`,
            path: ['states', stateName, propertyName],
          });
        }
      }
    }
  });

const environmentVariableNameSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Expected an uppercase environment variable name.');

const environmentVariableValueSchema = z
  .string()
  .max(10_000)
  .refine((value) => !value.includes('\0'), 'Environment variable values cannot contain NUL.');

const projectApplicationIconFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) => !value.includes('/') && !value.includes('\\') && !value.includes('\0'),
    'Expected an icon file name without path separators.',
  );

const projectApplicationIconDataUrlSchema = z
  .string()
  .max(1_400_000)
  .regex(
    /^data:image\/(?:svg\+xml|png);base64,(?=.+$)(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    'Expected a base64 SVG or PNG data URL.',
  );

export const ProjectApplicationIconSchema: z.ZodType<ProjectApplicationIcon> = z
  .object({
    fileName: projectApplicationIconFileNameSchema,
    mediaType: z.enum(PROJECT_APPLICATION_ICON_MEDIA_TYPES),
    dataUrl: projectApplicationIconDataUrlSchema,
  })
  .strict()
  .superRefine((icon, context) => {
    if (!icon.dataUrl.startsWith(`data:${icon.mediaType};base64,`)) {
      context.addIssue({
        code: 'custom',
        message: 'Application icon data URL does not match its media type.',
        path: ['dataUrl'],
      });
    }
  });

const projectSocialImageFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (value) =>
      !value.includes('/') &&
      !value.includes('\\') &&
      ![...value].some((character) => character.charCodeAt(0) < 32) &&
      value !== '.' &&
      value !== '..',
    'Expected a portable social image file name.',
  );

const projectSocialImageDataUrlSchema = z
  .string()
  .max(6_700_000)
  .regex(
    /^data:image\/(?:png|jpeg);base64,(?=.+$)(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    'Expected a base64 PNG or JPEG data URL.',
  );

export const ProjectSocialImageSchema: z.ZodType<ProjectSocialImage> = z
  .object({
    fileName: projectSocialImageFileNameSchema,
    mediaType: z.enum(PROJECT_SOCIAL_IMAGE_MEDIA_TYPES),
    dataUrl: projectSocialImageDataUrlSchema,
  })
  .strict()
  .superRefine((image, context) => {
    if (!image.dataUrl.startsWith(`data:${image.mediaType};base64,`)) {
      context.addIssue({
        code: 'custom',
        message: 'Social image data URL does not match its media type.',
        path: ['dataUrl'],
      });
    }
  });

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (value.length === 0) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Expected an absolute HTTP(S) URL or an empty value.');

export const ProjectSeoSettingsSchema: z.ZodType<ProjectSeoSettings> = z
  .object({
    canonicalUrl: optionalHttpUrlSchema,
    keywords: z.string().trim().max(500),
    allowIndexing: z.boolean(),
    socialTitle: z.string().trim().max(120),
    socialDescription: z.string().trim().max(500),
    socialImage: ProjectSocialImageSchema.nullable(),
  })
  .strict();

export const ProjectEnvironmentVariableSchema: z.ZodType<ProjectEnvironmentVariable> = z
  .object({
    name: environmentVariableNameSchema,
    values: z
      .object({
        development: environmentVariableValueSchema,
        production: environmentVariableValueSchema,
      })
      .strict(),
  })
  .strict();

export const ProjectScrollbarStyleSchema: z.ZodType<ProjectScrollbarStyle> = z
  .object({
    width: z.number().int().min(6).max(32),
    height: z.number().int().min(6).max(32),
    trackColor: paletteLinkedColorSchema,
    trackBorderColor: paletteLinkedColorSchema,
    trackBorderWidth: z.number().int().min(0).max(8),
    trackBorderRadius: z.number().int().min(0).max(64),
    thumbColor: paletteLinkedColorSchema,
    thumbHoverColor: paletteLinkedColorSchema,
    thumbActiveColor: paletteLinkedColorSchema,
    thumbBorderColor: paletteLinkedColorSchema,
    thumbBorderWidth: z.number().int().min(0).max(8),
    thumbBorderRadius: z.number().int().min(0).max(64),
    cornerColor: paletteLinkedColorSchema,
  })
  .strict();

const restGoBaseUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((value) => {
    if (value.length === 0) return true;
    if (!/^https?:\/\//i.test(value) || /[\s\\?#]/.test(value)) return false;
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        url.hostname.length > 0 &&
        url.username.length === 0 &&
        url.password.length === 0
      );
    } catch {
      return false;
    }
  }, 'Enter an absolute HTTP(S) RestGO URL without credentials, a query, or a fragment.');

export const RestGoProjectSettingsSchema: z.ZodType<RestGoProjectSettings> = z
  .object({
    enabled: z.boolean(),
    baseUrl: restGoBaseUrlSchema,
    apiToken: z
      .string()
      .trim()
      .max(4096)
      .refine(
        (value) =>
          !/^Bearer(?:\s|$)/i.test(value) &&
          [...value].every((character) => {
            const code = character.charCodeAt(0);
            return code >= 33 && code <= 126;
          }),
        'Enter the Authorization token without Bearer, spaces, or control characters.',
      )
      .default(''),
    apiVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    defaultDatabase: z
      .string()
      .trim()
      .max(128)
      .regex(/^[A-Za-z0-9_-]*$/, 'Use a database slug containing letters, numbers, _ or -.'),
    persistSession: z.boolean(),
    sessionStorage: z.enum(['local', 'session', 'memory']),
    storageKey: z
      .string()
      .trim()
      .min(1, 'Enter a RestGO session storage key.')
      .max(200)
      .refine(
        (value) => ![...value].some((character) => character.charCodeAt(0) < 32),
        'The session storage key cannot contain control characters.',
      ),
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.enabled && settings.baseUrl.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Enter the RestGO instance URL before enabling the integration.',
        path: ['baseUrl'],
      });
    }
  });

export const ProjectBuildSettingsSchema: z.ZodType<ProjectBuildSettings> = z
  .object({
    deployDirectory: z
      .string()
      .trim()
      .max(4096)
      .refine(
        (value) => [...value].every((character) => character.charCodeAt(0) >= 32),
        'The deployment directory cannot contain control characters.',
      )
      .refine((value) => {
        if (value === '') return true;
        if (/^[A-Za-z]:/.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return false;
        return value.split(/[\\/]/).every((segment) => segment !== '.' && segment !== '..');
      }, 'Choose an absolute directory or a relative path without . or .. segments.'),
    environment: z.enum(PROJECT_ENVIRONMENTS),
    minify: z.boolean(),
    sourceMaps: z.boolean(),
  })
  .strict();

export const ProjectPwaSettingsSchema: z.ZodType<ProjectPwaSettings> = z
  .object({
    enabled: z.boolean(),
    shortName: z.string().trim().max(32),
    display: z.enum(['standalone', 'fullscreen', 'minimal-ui']),
    orientation: z.enum(['any', 'portrait', 'landscape']),
    themeColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Choose a six-digit hexadecimal theme color.'),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Choose a six-digit hexadecimal background color.'),
    offline: z.boolean(),
  })
  .strict();

export const ProjectSettingsSchema: z.ZodType<ProjectSettings> = z
  .object({
    colorPalette: ProjectColorPaletteSchema,
    applicationName: z.string().trim().min(1).max(120),
    applicationDescription: z.string().trim().max(500),
    locale: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'Expected a BCP 47 locale.'),
    timeZone: z
      .string()
      .trim()
      .regex(/^(?:UTC|[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)+)$/, 'Expected an IANA time-zone.'),
    applicationIcon: ProjectApplicationIconSchema.nullable(),
    seo: ProjectSeoSettingsSchema,
    environment: z.enum(PROJECT_ENVIRONMENTS),
    environmentVariables: z.array(ProjectEnvironmentVariableSchema).max(100),
    restGo: RestGoProjectSettingsSchema,
    scrollbar: ProjectScrollbarStyleSchema,
    gridSize: z.number().int().positive(),
    snapToGrid: z.boolean(),
    showGrid: z.boolean(),
    build: ProjectBuildSettingsSchema,
    pwa: ProjectPwaSettingsSchema,
    outputDirectory: relativeProjectPathSchema,
  })
  .strict()
  .superRefine((settings, context) => {
    const names = new Set<string>();
    settings.environmentVariables.forEach((variable, index) => {
      if (names.has(variable.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate environment variable "${variable.name}".`,
          path: ['environmentVariables', index, 'name'],
        });
      }
      names.add(variable.name);
    });
  });

function validateDocumentRelationships(
  page: PageModel,
  context: z.RefinementCtx,
  allowedRootTypes: readonly string[],
): void {
  const byId = new Map<string, ComponentNode>();
  const names = new Map<string, number>();

  page.components.forEach((component, index) => {
    const previousIdIndex = byId.has(component.id);
    if (previousIdIndex) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate component ID "${component.id}".`,
        path: ['components', index, 'id'],
      });
    } else {
      byId.set(component.id, component);
    }

    const previousNameIndex = names.get(component.name);
    if (previousNameIndex !== undefined) {
      context.addIssue({
        code: 'custom',
        message: `Component name "${component.name}" must be unique within a page.`,
        path: ['components', index, 'name'],
      });
    } else {
      names.set(component.name, index);
    }

    if (component.id !== page.rootComponentId) {
      const memberNameError = getGeneratedPageMemberNameError(component.name);
      if (memberNameError !== undefined) {
        context.addIssue({
          code: 'custom',
          message: memberNameError,
          path: ['components', index, 'name'],
        });
      }
    }
  });

  const root = byId.get(page.rootComponentId);
  if (root === undefined) {
    context.addIssue({
      code: 'custom',
      message: 'rootComponentId must reference a component in this page.',
      path: ['rootComponentId'],
    });
  } else {
    if (root.parentId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'The root component cannot have a parent.',
        path: ['components', page.components.indexOf(root), 'parentId'],
      });
    }
    if (!allowedRootTypes.includes(root.type)) {
      context.addIssue({
        code: 'custom',
        message: `The root component must have type ${allowedRootTypes.join(' or ')}.`,
        path: ['components', page.components.indexOf(root), 'type'],
      });
    }
  }

  page.components.forEach((component, componentIndex) => {
    if (component.id !== page.rootComponentId && component.parentId === null) {
      context.addIssue({
        code: 'custom',
        message: 'Every non-root component must have a parent.',
        path: ['components', componentIndex, 'parentId'],
      });
    }
    if (component.parentId !== null) {
      const parent = byId.get(component.parentId);
      if (parent === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown parent component ID "${component.parentId}".`,
          path: ['components', componentIndex, 'parentId'],
        });
      } else if (!parent.children.includes(component.id)) {
        context.addIssue({
          code: 'custom',
          message: 'The parent children list must contain this component ID.',
          path: ['components', componentIndex, 'parentId'],
        });
      }
    }

    const childIds = new Set<string>();
    component.children.forEach((childId, childIndex) => {
      if (childIds.has(childId)) {
        context.addIssue({
          code: 'custom',
          message: `Child ID "${childId}" is listed more than once.`,
          path: ['components', componentIndex, 'children', childIndex],
        });
        return;
      }
      childIds.add(childId);

      const child = byId.get(childId);
      if (child === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown child component ID "${childId}".`,
          path: ['components', componentIndex, 'children', childIndex],
        });
      } else if (child.parentId !== component.id) {
        context.addIssue({
          code: 'custom',
          message: 'A child parentId must point back to the owning component.',
          path: ['components', componentIndex, 'children', childIndex],
        });
      }
    });

    const ancestors = new Set<string>([component.id]);
    let parentId = component.parentId;
    while (parentId !== null) {
      if (ancestors.has(parentId)) {
        context.addIssue({
          code: 'custom',
          message: 'Component parent relationships cannot contain a cycle.',
          path: ['components', componentIndex, 'parentId'],
        });
        break;
      }
      ancestors.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  });

  if (root !== undefined) {
    const reachable = new Set<string>();
    const pending = [root.id];
    while (pending.length > 0) {
      const componentId = pending.pop();
      if (componentId === undefined || reachable.has(componentId)) continue;
      reachable.add(componentId);
      const current = byId.get(componentId);
      if (current !== undefined) pending.push(...current.children);
    }
    page.components.forEach((component, componentIndex) => {
      if (!reachable.has(component.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Every component must be reachable from the page root.',
          path: ['components', componentIndex],
        });
      }
    });
  }
}

function validatePageRelationships(page: PageModel, context: z.RefinementCtx): void {
  validateDocumentRelationships(page, context, ['WebPage']);
}

function validateReusableElementRelationships(
  reusableElement: ReusableElementModel,
  context: z.RefinementCtx,
): void {
  validateDocumentRelationships(reusableElement, context, ['WebPanel']);
}

function validateVisualDocumentRelationships(page: PageModel, context: z.RefinementCtx): void {
  validateDocumentRelationships(page, context, ['WebPage', 'WebPanel']);
}

const DocumentModelSchema = z
  .object({
    formatVersion: z.literal(CURRENT_PAGE_FORMAT_VERSION),
    id: nonEmptyStringSchema,
    name: pageNameSchema,
    caption: z.string(),
    width: positiveDimensionSchema,
    height: positiveDimensionSchema,
    components: z.array(ComponentNodeSchema).min(1),
    rootComponentId: nonEmptyStringSchema,
  })
  .strict();

export const PageModelSchema: z.ZodType<PageModel> =
  DocumentModelSchema.superRefine(validatePageRelationships);

export const ReusableElementModelSchema: z.ZodType<ReusableElementModel> =
  DocumentModelSchema.superRefine(validateReusableElementRelationships);

/**
 * Structural document validation for designer commands before their result is
 * committed to either a navigable page or a reusable definition.
 */
export const VisualDocumentModelSchema: z.ZodType<PageModel> = DocumentModelSchema.superRefine(
  validateVisualDocumentRelationships,
);

function indexComponentStyles(
  styles: readonly ComponentStyleModel[],
  context: z.RefinementCtx,
): ReadonlyMap<string, ComponentStyleModel> {
  const byId = new Map<string, ComponentStyleModel>();
  const names = new Set<string>();
  const defaultTypes = new Set<string>();

  styles.forEach((style, index) => {
    if (byId.has(style.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate component style ID "${style.id}".`,
        path: ['styles', index, 'id'],
      });
    } else {
      byId.set(style.id, style);
    }

    const nameKey = portableFileNameKey(style.name);
    if (names.has(nameKey)) {
      context.addIssue({
        code: 'custom',
        message: `Component style name "${style.name}" must be unique within a project.`,
        path: ['styles', index, 'name'],
      });
    }
    names.add(nameKey);

    if (style.preset === 'default') {
      if (defaultTypes.has(style.componentType)) {
        context.addIssue({
          code: 'custom',
          message: `A default component style for ${style.componentType} already exists.`,
          path: ['styles', index, 'preset'],
        });
      }
      defaultTypes.add(style.componentType);
    }
  });

  return byId;
}

function validatePaletteReferences(
  project: {
    readonly styles: readonly ComponentStyleModel[];
    readonly settings: ProjectSettings;
    readonly reusableElements: readonly ReusableElementModel[];
    readonly pages: readonly unknown[];
  },
  context: z.RefinementCtx,
): void {
  const ids = new Set(project.settings.colorPalette.map((entry) => entry.id));
  const walk = (value: unknown, path: (string | number)[]): void => {
    const id = paletteColorId(value);
    if (id !== undefined && !ids.has(id))
      context.addIssue({ code: 'custom', message: `Palette color "${id}" does not exist.`, path });
    if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, [...path, index]));
    else if (isRecord(value))
      Object.entries(value).forEach(([key, entry]) => walk(entry, [...path, key]));
  };
  project.styles.forEach((style, index) => walk(style.states, ['styles', index, 'states']));
  walk(project.settings.scrollbar, ['settings', 'scrollbar']);
  for (const collection of ['pages', 'reusableElements'] as const)
    project[collection].forEach((page, index) => {
      if (!isRecord(page) || !Array.isArray(page.components)) return;
      page.components.forEach((node, nodeIndex) => {
        if (isRecord(node)) walk(node.props, [collection, index, 'components', nodeIndex, 'props']);
      });
    });
}

function validateProjectRelationships(project: WebRadProject, context: z.RefinementCtx): void {
  validateProjectResourceIds(project, context);
  validatePaletteReferences(project, context);
  const ids = new Set<string>();
  const names = new Set<string>();
  const stylesById = indexComponentStyles(project.styles, context);

  project.pages.forEach((page, index) => {
    if (ids.has(page.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate page ID "${page.id}".`,
        path: ['pages', index, 'id'],
      });
    }
    ids.add(page.id);

    const nameKey = portableFileNameKey(page.name);
    if (names.has(nameKey)) {
      context.addIssue({
        code: 'custom',
        message: `Page name "${page.name}" must be unique within a project on portable filesystems.`,
        path: ['pages', index, 'name'],
      });
    }
    names.add(nameKey);

    page.components.forEach((component, componentIndex) => {
      if (component.styleId === undefined) return;
      const style = stylesById.get(component.styleId);
      if (style === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown component style ID "${component.styleId}".`,
          path: ['pages', index, 'components', componentIndex, 'styleId'],
        });
      } else if (style.componentType !== component.type) {
        context.addIssue({
          code: 'custom',
          message: `Component style "${style.name}" targets ${style.componentType}, not ${component.type}.`,
          path: ['pages', index, 'components', componentIndex, 'styleId'],
        });
      }
    });
  });

  const reusableById = new Map<string, ReusableElementModel>();
  project.reusableElements.forEach((reusableElement, index) => {
    if (ids.has(reusableElement.id)) {
      context.addIssue({
        code: 'custom',
        message: `Reusable component ID "${reusableElement.id}" conflicts with an existing page or reusable component.`,
        path: ['reusableElements', index, 'id'],
      });
    }
    ids.add(reusableElement.id);
    reusableById.set(reusableElement.id, reusableElement);

    const nameKey = portableFileNameKey(reusableElement.name);
    if (names.has(nameKey)) {
      context.addIssue({
        code: 'custom',
        message: `Reusable component name "${reusableElement.name}" must be unique within a project on portable filesystems.`,
        path: ['reusableElements', index, 'name'],
      });
    }
    names.add(nameKey);

    const root = reusableElement.components.find(
      (component) => component.id === reusableElement.rootComponentId,
    );
    if (root?.type !== 'WebPanel') {
      context.addIssue({
        code: 'custom',
        message: 'A reusable component must have a WebPanel root.',
        path: ['reusableElements', index, 'rootComponentId'],
      });
    }

    reusableElement.components.forEach((component, componentIndex) => {
      if (component.styleId === undefined) return;
      const style = stylesById.get(component.styleId);
      if (style === undefined) {
        context.addIssue({
          code: 'custom',
          message: `Unknown component style ID "${component.styleId}".`,
          path: ['reusableElements', index, 'components', componentIndex, 'styleId'],
        });
      } else if (style.componentType !== component.type) {
        context.addIssue({
          code: 'custom',
          message: `Component style "${style.name}" targets ${style.componentType}, not ${component.type}.`,
          path: ['reusableElements', index, 'components', componentIndex, 'styleId'],
        });
      }
    });
  });

  const reusableReferences = new Map<string, readonly string[]>();
  const validateReusableInstanceProperties = (
    component: ComponentNode,
    path: readonly (string | number)[],
  ): void => {
    const placement = component.props.placement;
    if (
      typeof placement !== 'string' ||
      !REUSABLE_ELEMENT_PLACEMENTS.includes(
        placement as (typeof REUSABLE_ELEMENT_PLACEMENTS)[number],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A reusable component placement must be in-flow or floating.',
        path: [...path, 'placement'],
      });
    }

    const horizontalAnchor = component.props.floatingHorizontalAnchor;
    if (
      typeof horizontalAnchor !== 'string' ||
      !REUSABLE_ELEMENT_HORIZONTAL_ANCHORS.includes(
        horizontalAnchor as (typeof REUSABLE_ELEMENT_HORIZONTAL_ANCHORS)[number],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A reusable component floating horizontal anchor is invalid.',
        path: [...path, 'floatingHorizontalAnchor'],
      });
    }

    const verticalAnchor = component.props.floatingVerticalAnchor;
    if (
      typeof verticalAnchor !== 'string' ||
      !REUSABLE_ELEMENT_VERTICAL_ANCHORS.includes(
        verticalAnchor as (typeof REUSABLE_ELEMENT_VERTICAL_ANCHORS)[number],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A reusable component floating vertical anchor is invalid.',
        path: [...path, 'floatingVerticalAnchor'],
      });
    }

    const layer = component.props.floatingZIndex;
    if (typeof layer !== 'number' || !Number.isFinite(layer) || !Number.isInteger(layer)) {
      context.addIssue({
        code: 'custom',
        message: 'A reusable component floating layer must be a finite integer.',
        path: [...path, 'floatingZIndex'],
      });
    }
  };
  const validateReusableReferences = (
    document: PageModel,
    documentPath: 'pages' | 'reusableElements',
    documentIndex: number,
  ): readonly string[] => {
    const references: string[] = [];
    document.components.forEach((component, componentIndex) => {
      if (component.type !== 'WebReusableElement') return;
      const componentPropsPath = [
        documentPath,
        documentIndex,
        'components',
        componentIndex,
        'props',
      ] as const;
      validateReusableInstanceProperties(component, componentPropsPath);
      const reusableId = component.props.reusableElementId;
      if (typeof reusableId !== 'string' || reusableId.length === 0) {
        context.addIssue({
          code: 'custom',
          message: 'A reusable component instance must reference a reusable component.',
          path: [...componentPropsPath, 'reusableElementId'],
        });
        return;
      }
      if (!reusableById.has(reusableId)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown reusable component ID "${reusableId}".`,
          path: [...componentPropsPath, 'reusableElementId'],
        });
        return;
      }
      references.push(reusableId);
    });
    return references;
  };

  project.pages.forEach((page, index) => {
    validateReusableReferences(page, 'pages', index);
  });
  project.reusableElements.forEach((reusableElement, index) => {
    reusableReferences.set(
      reusableElement.id,
      validateReusableReferences(reusableElement, 'reusableElements', index),
    );
  });

  const active = new Set<string>();
  const completed = new Set<string>();
  const cyclicIds = new Set<string>();
  const visitReusable = (reusableId: string, trail: readonly string[]): void => {
    if (completed.has(reusableId)) return;
    if (active.has(reusableId)) {
      const cycleStart = trail.indexOf(reusableId);
      for (const id of trail.slice(cycleStart < 0 ? 0 : cycleStart)) cyclicIds.add(id);
      return;
    }
    active.add(reusableId);
    for (const reference of reusableReferences.get(reusableId) ?? []) {
      visitReusable(reference, [...trail, reusableId]);
    }
    active.delete(reusableId);
    completed.add(reusableId);
  };
  for (const reusableId of reusableById.keys()) visitReusable(reusableId, []);
  if (cyclicIds.size > 0) {
    project.reusableElements.forEach((reusableElement, reusableIndex) => {
      if (!cyclicIds.has(reusableElement.id)) return;
      reusableElement.components.forEach((component, componentIndex) => {
        if (
          component.type === 'WebReusableElement' &&
          typeof component.props.reusableElementId === 'string' &&
          cyclicIds.has(component.props.reusableElementId)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Reusable components cannot reference each other recursively.',
            path: [
              'reusableElements',
              reusableIndex,
              'components',
              componentIndex,
              'props',
              'reusableElementId',
            ],
          });
        }
      });
    });
  }

  if (!ids.has(project.entryPage)) {
    context.addIssue({
      code: 'custom',
      message: 'entryPage must reference a page in this project.',
      path: ['entryPage'],
    });
  }
}

export const ProjectDebuggerSettingsSchema = z
  .object({
    version: z.literal(1),
    breakpoints: z
      .array(
        z
          .object({
            path: relativeProjectPathSchema.refine(
              (value) => value.endsWith('.ts') && !value.endsWith('.generated.ts'),
              'Breakpoints must reference authored TypeScript files.',
            ),
            line: z.number().int().min(1).max(10_000_000),
            column: z.number().int().min(1).max(10_000_000).optional(),
            enabled: z.boolean(),
            condition: z.string().max(4096).optional(),
          })
          .strict(),
      )
      .max(500),
    watches: z.array(z.string().trim().min(1).max(4096)).max(100),
    pauseOnExceptions: z.enum(['none', 'uncaught', 'all']),
  })
  .strict()
  .superRefine((settings, context) => {
    const keys = new Set<string>();
    for (const [index, breakpoint] of settings.breakpoints.entries()) {
      const key = `${breakpoint.path}:${breakpoint.line}:${breakpoint.column ?? 1}`;
      if (keys.has(key))
        context.addIssue({
          code: 'custom',
          message: 'Duplicate breakpoint.',
          path: ['breakpoints', index],
        });
      keys.add(key);
    }
  });

export const WebRadProjectSchema: z.ZodType<WebRadProject> = z.preprocess(
  materializeProjectDefaults,
  z
    .object({
      formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),
      id: nonEmptyStringSchema,
      name: projectNameSchema,
      entryPage: nonEmptyStringSchema,
      pages: z.array(PageModelSchema).min(1),
      reusableElements: z.array(ReusableElementModelSchema),
      styles: z.array(ComponentStyleSchema),
      sourceFiles: ProjectSourceFilesSchema,
      assets: ProjectAssetsSchema,
      debugger: ProjectDebuggerSettingsSchema.optional(),
      settings: ProjectSettingsSchema,
    })
    .strict()
    .superRefine(validateProjectRelationships),
);

export const PageDescriptorSchema: z.ZodType<PageDescriptor> = z
  .object({
    id: nonEmptyStringSchema,
    name: pageNameSchema,
    pageFile: relativeProjectPathSchema,
    generatedFile: relativeProjectPathSchema,
    codeFile: relativeProjectPathSchema,
  })
  .strict();

export const ProjectManifestSchema: z.ZodType<ProjectManifest> = z.preprocess(
  materializeProjectDefaults,
  z
    .object({
      formatVersion: z.literal(CURRENT_PROJECT_FORMAT_VERSION),
      id: nonEmptyStringSchema,
      name: projectNameSchema,
      entryPage: nonEmptyStringSchema,
      pages: z.array(PageDescriptorSchema).min(1),
      reusableElements: z.array(ReusableElementModelSchema),
      styles: z.array(ComponentStyleSchema),
      sourceFiles: ProjectSourceFilesSchema,
      assets: ProjectAssetsSchema,
      debugger: ProjectDebuggerSettingsSchema.optional(),
      settings: ProjectSettingsSchema,
    })
    .strict()
    .superRefine((manifest, context) => {
      validateProjectResourceIds(manifest, context);
      validatePaletteReferences(manifest, context);
      indexComponentStyles(manifest.styles, context);
      const ids = new Set<string>();
      const names = new Set<string>();
      const paths = new Set<string>();

      manifest.pages.forEach((descriptor, index) => {
        if (ids.has(descriptor.id)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate page ID "${descriptor.id}".`,
            path: ['pages', index, 'id'],
          });
        }
        ids.add(descriptor.id);

        const nameKey = portableFileNameKey(descriptor.name);
        if (names.has(nameKey)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate page name "${descriptor.name}".`,
            path: ['pages', index, 'name'],
          });
        }
        names.add(nameKey);

        for (const key of ['pageFile', 'generatedFile', 'codeFile'] as const) {
          const filePath = descriptor[key];
          const pathKey = portableFileNameKey(filePath);
          if (paths.has(pathKey)) {
            context.addIssue({
              code: 'custom',
              message: `Project file path "${filePath}" is used more than once.`,
              path: ['pages', index, key],
            });
          }
          paths.add(pathKey);
        }
      });

      if (!ids.has(manifest.entryPage)) {
        context.addIssue({
          code: 'custom',
          message: 'entryPage must reference a page descriptor.',
          path: ['entryPage'],
        });
      }
      const reusableIds = new Set<string>();
      const reusableNames = new Set<string>();
      manifest.reusableElements.forEach((reusableElement, index) => {
        if (ids.has(reusableElement.id) || reusableIds.has(reusableElement.id)) {
          context.addIssue({
            code: 'custom',
            message: `Reusable component ID "${reusableElement.id}" conflicts with a page or reusable component.`,
            path: ['reusableElements', index, 'id'],
          });
        }
        reusableIds.add(reusableElement.id);
        const nameKey = portableFileNameKey(reusableElement.name);
        if (names.has(nameKey) || reusableNames.has(nameKey)) {
          context.addIssue({
            code: 'custom',
            message: `Duplicate reusable component name "${reusableElement.name}".`,
            path: ['reusableElements', index, 'name'],
          });
        }
        reusableNames.add(nameKey);
      });
    }),
);

function issuesFrom(error: z.ZodError): ProjectValidationError {
  return new ProjectValidationError(
    'The WebRAD model failed validation.',
    error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path,
    })),
  );
}

export function safeParseBounds(input: unknown): ReturnType<typeof BoundsSchema.safeParse> {
  return BoundsSchema.safeParse(input);
}

export function safeParseComponentLayout(
  input: unknown,
): ReturnType<typeof ComponentLayoutSchema.safeParse> {
  return ComponentLayoutSchema.safeParse(input);
}

export function safeParseComponentNode(
  input: unknown,
): ReturnType<typeof ComponentNodeSchema.safeParse> {
  return ComponentNodeSchema.safeParse(input);
}

export function safeParseComponentStyle(
  input: unknown,
): ReturnType<typeof ComponentStyleSchema.safeParse> {
  return ComponentStyleSchema.safeParse(input);
}

export function safeParsePage(input: unknown): ReturnType<typeof PageModelSchema.safeParse> {
  return PageModelSchema.safeParse(input);
}

export function safeParseReusableElement(
  input: unknown,
): ReturnType<typeof ReusableElementModelSchema.safeParse> {
  return ReusableElementModelSchema.safeParse(input);
}

export function safeParseVisualDocument(
  input: unknown,
): ReturnType<typeof VisualDocumentModelSchema.safeParse> {
  return VisualDocumentModelSchema.safeParse(input);
}

export function safeParseProject(input: unknown): ReturnType<typeof WebRadProjectSchema.safeParse> {
  return WebRadProjectSchema.safeParse(input);
}

export function safeParseProjectManifest(
  input: unknown,
): ReturnType<typeof ProjectManifestSchema.safeParse> {
  return ProjectManifestSchema.safeParse(input);
}

export const validatePage = safeParsePage;
export const validateReusableElement = safeParseReusableElement;
export const validateProject = safeParseProject;
export const validateProjectManifest = safeParseProjectManifest;

export function parseBounds(input: unknown): Bounds {
  const result = safeParseBounds(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseComponentLayout(input: unknown): ComponentLayout {
  const result = safeParseComponentLayout(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseComponentNode(input: unknown): ComponentNode {
  const result = safeParseComponentNode(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseComponentStyle(input: unknown): ComponentStyleModel {
  const result = safeParseComponentStyle(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parsePage(input: unknown): PageModel {
  const result = safeParsePage(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseReusableElement(input: unknown): ReusableElementModel {
  const result = safeParseReusableElement(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseVisualDocument(input: unknown): PageModel {
  const result = safeParseVisualDocument(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseProject(input: unknown): WebRadProject {
  const result = safeParseProject(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

export function parseProjectManifest(input: unknown): ProjectManifest {
  const result = safeParseProjectManifest(input);
  if (!result.success) throw issuesFrom(result.error);
  return result.data;
}

// Lowercase aliases keep schema imports ergonomic without weakening the canonical names.
export const boundsSchema = BoundsSchema;
export const containerLayoutSchema = ContainerLayoutSchema;
export const layoutItemSchema = LayoutItemSchema;
export const componentLayoutSchema = ComponentLayoutSchema;
export const componentNodeSchema = ComponentNodeSchema;
export const componentStylePropertiesSchema = ComponentStylePropertiesSchema;
export const componentStyleStatesSchema = ComponentStyleStatesSchema;
export const componentStyleSchema = ComponentStyleSchema;
export const pageModelSchema = PageModelSchema;
export const reusableElementModelSchema = ReusableElementModelSchema;
export const visualDocumentModelSchema = VisualDocumentModelSchema;
export const projectSettingsSchema = ProjectSettingsSchema;
export const webRadProjectSchema = WebRadProjectSchema;
export const pageDescriptorSchema = PageDescriptorSchema;
export const projectManifestSchema = ProjectManifestSchema;
