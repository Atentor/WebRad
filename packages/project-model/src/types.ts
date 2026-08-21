export const CURRENT_PROJECT_FORMAT_VERSION = 1 as const;
export const CURRENT_PAGE_FORMAT_VERSION = 1 as const;

/** Aggregate project format version. */
export const PROJECT_FORMAT_VERSION = CURRENT_PROJECT_FORMAT_VERSION;

export type ProjectFormatVersion = typeof CURRENT_PROJECT_FORMAT_VERSION;
export type PageFormatVersion = typeof CURRENT_PAGE_FORMAT_VERSION;
export type LayoutMode = 'absolute' | 'flex' | 'grid';

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComponentNode {
  /** Immutable identity. User-facing renames must never change this value. */
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly bounds: Bounds;
  readonly props: Readonly<Record<string, unknown>>;
  readonly events: Readonly<Record<string, string | null>>;
  /** Optional project-level style compatible with this component type. */
  readonly styleId?: string;
  /** Ordered child IDs; this order is also the visual stacking order. */
  readonly children: readonly string[];
}

export const COMPONENT_STYLE_STATE_NAMES = [
  'base',
  'hover',
  'focus',
  'active',
  'disabled',
] as const;

export type ComponentStyleStateName = (typeof COMPONENT_STYLE_STATE_NAMES)[number];

export const COMPONENT_STYLE_PROPERTY_NAMES = [
  'display',
  'overflow',
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignContent',
  'gridColumns',
  'gridRows',
  'gap',
  'rowGap',
  'columnGap',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textTransform',
  'textDecoration',
  'fontStyle',
  'whiteSpace',
  'textColor',
  'backgroundColor',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderRadius',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'outlineOffset',
  'ringWidth',
  'ringColor',
  'ringOffsetWidth',
  'ringOffsetColor',
  'boxShadow',
  'opacity',
  'blur',
  'brightness',
  'contrast',
  'grayscale',
  'saturate',
  'translateX',
  'translateY',
  'scale',
  'rotate',
  'skewX',
  'skewY',
  'transformOrigin',
  'transitionProperty',
  'transitionDuration',
  'transitionDelay',
  'transitionTimingFunction',
  'animationName',
  'animationDuration',
  'animationIterationCount',
  'animationTimingFunction',
  'cursor',
  'userSelect',
  'pointerEvents',
  'objectFit',
  'objectPosition',
] as const;

export type ComponentStylePropertyName = (typeof COMPONENT_STYLE_PROPERTY_NAMES)[number];
export type StyleLengthUnit = 'px' | 'rem' | '%' | 'vw' | 'vh';

export interface StyleLengthValue {
  readonly value: number;
  readonly unit: StyleLengthUnit;
}

export type StylePropertyValue = string | number | StyleLengthValue;
export type ComponentStyleProperties = Readonly<
  Partial<Record<ComponentStylePropertyName, StylePropertyValue>>
>;

export type ComponentStyleStates = Readonly<
  Record<ComponentStyleStateName, ComponentStyleProperties>
>;

/** Reusable project-level style. Its immutable ID is referenced by component nodes. */
export interface ComponentStyleModel {
  readonly id: string;
  readonly name: string;
  readonly componentType: string;
  readonly states: ComponentStyleStates;
}

export interface PageModel {
  readonly formatVersion: PageFormatVersion;
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly layoutMode: LayoutMode;
  readonly components: readonly ComponentNode[];
  readonly rootComponentId: string;
}

export interface ProjectSettings {
  readonly gridSize: number;
  readonly snapToGrid: boolean;
  readonly showGrid: boolean;
  /** POSIX-style relative path persisted in the project, independent of the host OS. */
  readonly outputDirectory: string;
}

export interface WebRadProject {
  readonly formatVersion: ProjectFormatVersion;
  readonly id: string;
  readonly name: string;
  /** ID of the page that starts the generated application. */
  readonly entryPage: string;
  /** Complete in-memory aggregate and the single source of truth. */
  readonly pages: readonly PageModel[];
  /** Reusable Tailwind styles shared by compatible components across all pages. */
  readonly styles: readonly ComponentStyleModel[];
  readonly settings: ProjectSettings;
}

/** A page entry stored in the lightweight `.wrproj` manifest. */
export interface PageDescriptor {
  readonly id: string;
  readonly name: string;
  readonly pageFile: string;
  readonly generatedFile: string;
  readonly codeFile: string;
}

/** Disk manifest. Page contents live in the descriptor's `.wrpage` file. */
export interface ProjectManifest {
  readonly formatVersion: ProjectFormatVersion;
  readonly id: string;
  readonly name: string;
  readonly entryPage: string;
  readonly pages: readonly PageDescriptor[];
  /** Styles remain inline because they are small project-level metadata. */
  readonly styles: readonly ComponentStyleModel[];
  readonly settings: ProjectSettings;
}

export type IdFactory = () => string;

export const DEFAULT_PROJECT_SETTINGS: Readonly<ProjectSettings> = Object.freeze({
  gridSize: 8,
  snapToGrid: true,
  showGrid: true,
  outputDirectory: 'dist',
});

export const EMPTY_COMPONENT_STYLE_PROPERTIES: ComponentStyleProperties = Object.freeze({});
export const EMPTY_COMPONENT_STYLE_STATES: ComponentStyleStates = Object.freeze({
  base: EMPTY_COMPONENT_STYLE_PROPERTIES,
  hover: EMPTY_COMPONENT_STYLE_PROPERTIES,
  focus: EMPTY_COMPONENT_STYLE_PROPERTIES,
  active: EMPTY_COMPONENT_STYLE_PROPERTIES,
  disabled: EMPTY_COMPONENT_STYLE_PROPERTIES,
});

export const DEFAULT_PAGE_WIDTH = 800;
export const DEFAULT_PAGE_HEIGHT = 600;
