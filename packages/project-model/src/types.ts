export const CURRENT_PROJECT_FORMAT_VERSION = 2 as const;
export const CURRENT_PAGE_FORMAT_VERSION = 2 as const;

/** Aggregate project format version. */
export const PROJECT_FORMAT_VERSION = CURRENT_PROJECT_FORMAT_VERSION;

export type ProjectFormatVersion = typeof CURRENT_PROJECT_FORMAT_VERSION;
export type PageFormatVersion = typeof CURRENT_PAGE_FORMAT_VERSION;

export const CONTAINER_LAYOUT_MODES = ['fixed', 'align-to-parent', 'row', 'column'] as const;
export type ContainerLayoutMode = (typeof CONTAINER_LAYOUT_MODES)[number];

export const LAYOUT_ITEM_SIZING_MODES = ['fixed', 'stretch', 'fit-content'] as const;
export type LayoutItemSizingMode = (typeof LAYOUT_ITEM_SIZING_MODES)[number];

export const LAYOUT_ANCHORS = ['start', 'center', 'end', 'stretch'] as const;
export type LayoutAnchor = (typeof LAYOUT_ANCHORS)[number];

export const LAYOUT_JUSTIFY_CONTENT_VALUES = [
  'start',
  'center',
  'end',
  'space-between',
  'space-around',
] as const;
export type LayoutJustifyContent = (typeof LAYOUT_JUSTIFY_CONTENT_VALUES)[number];

export const LAYOUT_ALIGN_ITEMS_VALUES = ['start', 'center', 'end', 'stretch'] as const;
export type LayoutAlignItems = (typeof LAYOUT_ALIGN_ITEMS_VALUES)[number];

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Rules a visual container applies to its direct children. */
export interface ContainerLayout {
  readonly mode: ContainerLayoutMode;
  readonly paddingTop: number;
  readonly paddingRight: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
  readonly gap: number;
  readonly wrap: boolean;
  readonly justifyContent: LayoutJustifyContent;
  readonly alignItems: LayoutAlignItems;
}

/** Rules that determine how a component participates in its parent's layout. */
export interface LayoutItem {
  readonly width: LayoutItemSizingMode;
  readonly height: LayoutItemSizingMode;
  readonly minWidth: number;
  readonly maxWidth: number | null;
  readonly minHeight: number;
  readonly maxHeight: number | null;
  readonly grow: number;
  readonly shrink: boolean;
  readonly horizontalAnchor: LayoutAnchor;
  readonly verticalAnchor: LayoutAnchor;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Complete persisted responsive-layout contract for a component node. */
export interface ComponentLayout {
  readonly container: ContainerLayout;
  readonly item: LayoutItem;
}

export interface ComponentNode {
  /** Immutable identity. User-facing renames must never change this value. */
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  /** Responsive container and item rules. Bounds remain the fixed-layout fallback. */
  readonly layout: ComponentLayout;
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

/** Built-in style families that are seeded with every newly created project. */
export const COMPONENT_STYLE_PRESETS = ['default'] as const;

export type ComponentStylePreset = (typeof COMPONENT_STYLE_PRESETS)[number];

export const LINEAR_GRADIENT_DIRECTIONS = [
  'to-right',
  'to-bottom-right',
  'to-bottom',
  'to-bottom-left',
  'to-left',
  'to-top-left',
  'to-top',
  'to-top-right',
] as const;

export type LinearGradientDirection = (typeof LINEAR_GRADIENT_DIRECTIONS)[number];

/** A bounded, serializable linear background gradient; arbitrary CSS is never persisted. */
export interface BackgroundGradientValue {
  readonly kind: 'linear';
  readonly direction: LinearGradientDirection;
  readonly from: string;
  readonly to: string;
}

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
  'buttonContentMode',
  'buttonIconPosition',
  'textColor',
  'buttonIconColor',
  'textGradient',
  'backgroundColor',
  'backgroundGradient',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderGradient',
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

export type StylePropertyValue = string | number | StyleLengthValue | BackgroundGradientValue;
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
  /** Identifies a protected built-in style seeded by the project factory. */
  readonly preset?: ComponentStylePreset;
  readonly states: ComponentStyleStates;
}

export interface PageModel {
  readonly formatVersion: PageFormatVersion;
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
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

export const DEFAULT_CONTAINER_LAYOUT: Readonly<ContainerLayout> = Object.freeze({
  mode: 'fixed',
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  gap: 0,
  wrap: false,
  justifyContent: 'start',
  alignItems: 'start',
});

export const DEFAULT_LAYOUT_ITEM: Readonly<LayoutItem> = Object.freeze({
  width: 'fixed',
  height: 'fixed',
  minWidth: 0,
  maxWidth: null,
  minHeight: 0,
  maxHeight: null,
  grow: 0,
  shrink: true,
  horizontalAnchor: 'start',
  verticalAnchor: 'start',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

export const DEFAULT_COMPONENT_LAYOUT: Readonly<ComponentLayout> = Object.freeze({
  container: DEFAULT_CONTAINER_LAYOUT,
  item: DEFAULT_LAYOUT_ITEM,
});

/** Returns a fresh layout object suitable for a newly created component node. */
export function createDefaultComponentLayout(): ComponentLayout {
  return {
    container: { ...DEFAULT_CONTAINER_LAYOUT },
    item: { ...DEFAULT_LAYOUT_ITEM },
  };
}

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
