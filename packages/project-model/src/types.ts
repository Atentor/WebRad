import type { ProjectSourceFile, ProjectAsset } from './project-resources.js';
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
export const LAYOUT_ALIGN_SELF_VALUES = ['auto', ...LAYOUT_ALIGN_ITEMS_VALUES] as const;
export type LayoutAlignSelf = (typeof LAYOUT_ALIGN_SELF_VALUES)[number];

/** Instance placement modes for a `WebReusableElement` wrapper. */
export const REUSABLE_ELEMENT_PLACEMENTS = ['in-flow', 'floating'] as const;
export type ReusableElementPlacement = (typeof REUSABLE_ELEMENT_PLACEMENTS)[number];

/** Viewport edges used by floating reusable-component instances. */
export const REUSABLE_ELEMENT_HORIZONTAL_ANCHORS = ['left', 'center', 'right'] as const;
export type ReusableElementHorizontalAnchor = (typeof REUSABLE_ELEMENT_HORIZONTAL_ANCHORS)[number];

/** Viewport edges used by floating reusable-component instances. */
export const REUSABLE_ELEMENT_VERTICAL_ANCHORS = ['top', 'center', 'bottom'] as const;
export type ReusableElementVerticalAnchor = (typeof REUSABLE_ELEMENT_VERTICAL_ANCHORS)[number];

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
  /** Optional per-item cross-axis override for row/column parents. */
  readonly alignSelf?: LayoutAlignSelf;
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
  'buttonIconSize',
  'buttonIconColor',
  'textColor',
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
  'dataGridHorizontalLineVisibility',
  'dataGridHorizontalLineColor',
  'dataGridHorizontalLineWidth',
  'dataGridHorizontalLineStyle',
  'dataGridVerticalLineVisibility',
  'dataGridVerticalLineColor',
  'dataGridVerticalLineWidth',
  'dataGridVerticalLineStyle',
  'dataGridHeaderBackgroundColor',
  'dataGridHeaderTextColor',
  'dataGridHeaderBorderColor',
  'dataGridHeaderBorderWidth',
  'dataGridHeaderBorderStyle',
  'dataGridHeaderHeight',
  'dataGridHeaderPaddingX',
  'dataGridHeaderPaddingY',
  'dataGridHeaderFontWeight',
  'dataGridFooterBackgroundColor',
  'dataGridFooterTextColor',
  'dataGridFooterBorderColor',
  'dataGridFooterBorderWidth',
  'dataGridFooterBorderStyle',
  'dataGridFooterHeight',
  'dataGridFooterPaddingX',
  'dataGridFooterPaddingY',
  'dataGridFooterFontWeight',
  'dataGridButtonContentMode',
  'dataGridButtonIconPosition',
  'dataGridButtonIconSize',
  'dataGridButtonIconColor',
  'dataGridButtonBackgroundColor',
  'dataGridButtonTextColor',
  'dataGridButtonBorderColor',
  'dataGridButtonBorderWidth',
  'dataGridButtonBorderStyle',
  'dataGridButtonBorderRadius',
  'dataGridButtonPaddingX',
  'dataGridButtonPaddingY',
  'dataGridButtonFontWeight',
  'dataGridCheckboxAccentColor',
  'dataGridCheckboxSize',
  'dataGridCheckboxTextColor',
  'dataGridCheckboxFontWeight',
  'dataGridCheckboxGap',
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

/**
 * A reusable composition. It intentionally has the same document shape
 * as a page so the Designer can edit it with the same responsive-layout and
 * history commands. It is kept in a separate project collection and is never
 * a navigable application route.
 */
export type ReusableElementModel = PageModel;

export const PROJECT_ENVIRONMENTS = ['development', 'production'] as const;
export type ProjectEnvironment = (typeof PROJECT_ENVIRONMENTS)[number];

export const PROJECT_APPLICATION_ICON_MEDIA_TYPES = ['image/svg+xml', 'image/png'] as const;
export type ProjectApplicationIconMediaType = (typeof PROJECT_APPLICATION_ICON_MEDIA_TYPES)[number];

export const PROJECT_SOCIAL_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg'] as const;
export type ProjectSocialImageMediaType = (typeof PROJECT_SOCIAL_IMAGE_MEDIA_TYPES)[number];

/** A portable browser icon stored with the project and emitted by the compiler. */
export interface ProjectApplicationIcon {
  /** Original file name, used only for identification in Project Settings. */
  readonly fileName: string;
  readonly mediaType: ProjectApplicationIconMediaType;
  /** Base64 data URL so the project remains self-contained and portable. */
  readonly dataUrl: string;
}

/** A portable image emitted for Open Graph and Twitter sharing cards. */
export interface ProjectSocialImage {
  /** Original file name, kept only for identification in Project Settings. */
  readonly fileName: string;
  readonly mediaType: ProjectSocialImageMediaType;
  /** Base64 data URL so the source image travels with the project. */
  readonly dataUrl: string;
}

/**
 * Search-engine and social-card metadata emitted with the generated HTML.
 * URLs are optional because a project can be designed and previewed before it
 * has a public deployment address.
 */
export interface ProjectSeoSettings {
  /** Optional public URL used for the canonical and shared page URL. */
  readonly canonicalUrl: string;
  /** Optional comma-separated terms emitted as the document keywords metadata. */
  readonly keywords: string;
  /** Whether crawlers should be allowed to index and follow the application. */
  readonly allowIndexing: boolean;
  /** Optional Open Graph and Twitter card title; applicationName is the fallback. */
  readonly socialTitle: string;
  /** Optional Open Graph and Twitter card description; applicationDescription is the fallback. */
  readonly socialDescription: string;
  /** Optional local image emitted for Open Graph and Twitter cards. */
  readonly socialImage: ProjectSocialImage | null;
}

/** A browser-visible value for every environment supported by a project. */
export interface ProjectEnvironmentVariable {
  /** Uppercase identifier used as `Env.NAME` in authored TypeScript. */
  readonly name: string;
  readonly values: Readonly<Record<ProjectEnvironment, string>>;
}

/**
 * Global browser scrollbar styling emitted with a generated application.
 * WebKit browsers support the complete projection; Firefox applies the
 * thumb/track color and selects its closest supported thickness.
 */
export interface ProjectScrollbarStyle {
  /** Vertical scrollbar thickness in CSS pixels. */
  readonly width: number;
  /** Horizontal scrollbar thickness in CSS pixels. */
  readonly height: number;
  readonly trackColor: string;
  readonly trackBorderColor: string;
  readonly trackBorderWidth: number;
  readonly trackBorderRadius: number;
  readonly thumbColor: string;
  readonly thumbHoverColor: string;
  readonly thumbActiveColor: string;
  readonly thumbBorderColor: string;
  readonly thumbBorderWidth: number;
  readonly thumbBorderRadius: number;
  readonly cornerColor: string;
}

/** Browser configuration saved with the project, including the optional application API token. */
export interface RestGoProjectSettings {
  readonly enabled: boolean;
  /** Instance URL, including an optional reverse-proxy base path. */
  readonly baseUrl: string;
  /** Raw application API token used without Bearer before user authentication. Included in browser output. */
  readonly apiToken: string;
  readonly apiVersion: number;
  /** Optional database slug used when invoking a published dynamic endpoint. */
  readonly defaultDatabase: string;
  /** Whether the SDK may keep the user's session between client instances. */
  readonly persistSession: boolean;
  readonly sessionStorage: 'local' | 'session' | 'memory';
  /** Browser storage namespace. JWT validity and expiration are controlled by RestGO. */
  readonly storageKey: string;
}

export interface ProjectPaletteColor {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

/** Aurora's primary, accent and neutral colors, with stable project identities. */
export const DEFAULT_PROJECT_COLOR_PALETTE: readonly ProjectPaletteColor[] = Object.freeze(
  [
    { id: 'aurora-blue', name: 'Aurora Blue', color: '#2563eb' },
    { id: 'aurora-violet', name: 'Aurora Violet', color: '#7c3aed' },
    { id: 'aurora-sky', name: 'Aurora Sky', color: '#60a5fa' },
    { id: 'aurora-lavender', name: 'Aurora Lavender', color: '#a78bfa' },
    { id: 'aurora-white', name: 'Aurora White', color: '#ffffff' },
    { id: 'aurora-surface', name: 'Aurora Surface', color: '#f8fbff' },
    { id: 'aurora-mist', name: 'Aurora Mist', color: '#eef2ff' },
    { id: 'aurora-border', name: 'Aurora Border', color: '#dbeafe' },
    { id: 'aurora-graphite', name: 'Aurora Graphite', color: '#334155' },
    { id: 'aurora-ink', name: 'Aurora Ink', color: '#0f172a' },
  ].map((entry) => Object.freeze(entry)),
);

export interface ProjectSettings {
  /** Up to ten named colors with stable identities shared by all color fields. */
  readonly colorPalette: readonly ProjectPaletteColor[];
  /** Human-facing application title. It may differ from the project file name. */
  readonly applicationName: string;
  /** Optional plain-text description emitted as browser metadata. */
  readonly applicationDescription: string;
  /** BCP 47 locale used by the generated document, for example `pt-BR`. */
  readonly locale: string;
  /** IANA time-zone identifier selected as the project's default. */
  readonly timeZone: string;
  /** Optional browser icon used as the generated application's favicon. */
  readonly applicationIcon: ProjectApplicationIcon | null;
  /** Search-engine and social sharing metadata for the generated document. */
  readonly seo: ProjectSeoSettings;
  /** Environment whose values are embedded in Preview and the next Build. */
  readonly environment: ProjectEnvironment;
  /** Browser-visible variables, each with one value per environment. */
  readonly environmentVariables: readonly ProjectEnvironmentVariable[];
  /** Native integration used by Preview and generated browser applications. */
  readonly restGo: RestGoProjectSettings;
  /** The global scrollbar appearance used by Preview and generated browser output. */
  readonly scrollbar: ProjectScrollbarStyle;
  readonly gridSize: number;
  readonly snapToGrid: boolean;
  readonly showGrid: boolean;
  /** POSIX-style relative path persisted in the project, independent of the host OS. */
  readonly outputDirectory: string;
}

export interface ProjectDebugBreakpoint {
  readonly path: string;
  readonly line: number;
  readonly column?: number;
  readonly enabled: boolean;
  readonly condition?: string;
}

/** IDE debugging preferences; runtime pause state is never persisted. */
export interface ProjectDebuggerSettings {
  readonly version: 1;
  readonly breakpoints: readonly ProjectDebugBreakpoint[];
  readonly watches: readonly string[];
  readonly pauseOnExceptions: 'none' | 'uncaught' | 'all';
}

export interface WebRadProject {
  readonly formatVersion: ProjectFormatVersion;
  readonly id: string;
  readonly name: string;
  /** ID of the page that starts the generated application. */
  readonly entryPage: string;
  /** Complete in-memory aggregate and the single source of truth. */
  readonly pages: readonly PageModel[];
  /**
   * Reusable visual definitions. Page components reference these by stable ID;
   * their child nodes are not copied into each instance.
   */
  readonly reusableElements: readonly ReusableElementModel[];
  /** Reusable Tailwind styles shared by compatible components across all pages. */
  readonly styles: readonly ComponentStyleModel[];
  readonly sourceFiles?: readonly ProjectSourceFile[];
  readonly assets?: readonly ProjectAsset[];
  readonly debugger?: ProjectDebuggerSettings;
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
  /**
   * Small reusable documents are stored with the manifest. Their generated and
   * authored classes use deterministic paths under `reusables/`.
   */
  readonly reusableElements: readonly ReusableElementModel[];
  /** Styles remain inline because they are small project-level metadata. */
  readonly styles: readonly ComponentStyleModel[];
  readonly sourceFiles?: readonly ProjectSourceFile[];
  readonly assets?: readonly ProjectAsset[];
  readonly debugger?: ProjectDebuggerSettings;
  readonly settings: ProjectSettings;
}

export type IdFactory = () => string;

export const DEFAULT_PROJECT_SEO_SETTINGS: Readonly<ProjectSeoSettings> = Object.freeze({
  canonicalUrl: '',
  keywords: '',
  allowIndexing: true,
  socialTitle: '',
  socialDescription: '',
  socialImage: null,
});

/** Aurora palette used for global scrollbars in every newly created project. */
export const DEFAULT_PROJECT_SCROLLBAR_STYLE: Readonly<ProjectScrollbarStyle> = Object.freeze({
  width: 10,
  height: 10,
  trackColor: '#f8fafc',
  trackBorderColor: '#e2e8f0',
  trackBorderWidth: 1,
  trackBorderRadius: 8,
  thumbColor: '#93c5fd',
  thumbHoverColor: '#60a5fa',
  thumbActiveColor: '#2563eb',
  thumbBorderColor: '#eff6ff',
  thumbBorderWidth: 2,
  thumbBorderRadius: 8,
  cornerColor: '#f8fafc',
});

export const DEFAULT_REST_GO_PROJECT_SETTINGS: Readonly<RestGoProjectSettings> = Object.freeze({
  enabled: false,
  baseUrl: '',
  apiToken: '',
  apiVersion: 1,
  defaultDatabase: '',
  persistSession: true,
  sessionStorage: 'local',
  storageKey: 'webrad-restgo-session',
});

export const DEFAULT_PROJECT_SETTINGS: Readonly<ProjectSettings> = Object.freeze({
  colorPalette: DEFAULT_PROJECT_COLOR_PALETTE,
  applicationName: 'WebRAD Application',
  applicationDescription: '',
  locale: 'pt-BR',
  timeZone: 'America/Sao_Paulo',
  applicationIcon: null,
  seo: DEFAULT_PROJECT_SEO_SETTINGS,
  environment: 'development',
  environmentVariables: [],
  restGo: DEFAULT_REST_GO_PROJECT_SETTINGS,
  scrollbar: DEFAULT_PROJECT_SCROLLBAR_STYLE,
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
  alignSelf: 'auto',
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
