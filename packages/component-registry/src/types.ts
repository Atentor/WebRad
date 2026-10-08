export type ComponentPropertyType =
  | 'string'
  | 'string-list'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'icon'
  | 'color'
  | 'component'
  | 'reusable-element'
  | 'api-client-config'
  | 'data-grid-config';

/** Named design-time actions kept in the Component Registry metadata. */
export type ComponentDesignerAction = 'api-client-tester' | 'data-grid-configurator';

export type ComponentPropertySource =
  'node' | 'bounds' | 'props' | 'page' | 'layout-container' | 'layout-item';

export interface ComponentPropertyDefinition {
  readonly name: string;
  readonly label?: string;
  readonly type: ComponentPropertyType;
  readonly category?: string;
  /** Optional subgroup inside an Inspector section. */
  readonly inspectorGroup?: string;
  /** Pairs related controls with their labels above the editors. */
  readonly editorLayout?: 'compact';
  readonly source?: ComponentPropertySource;
  readonly defaultValue?: unknown;
  /** Fallback derived from saved properties without materializing it in the model. */
  readonly defaultValueWhen?: (props: Readonly<Record<string, unknown>>) => unknown;
  readonly options?: readonly string[];
  readonly description?: string;
  readonly readOnly?: boolean;
  /** Pure design-time rule evaluated against the component's saved property bag. */
  readonly readOnlyWhen?: (props: Readonly<Record<string, unknown>>) => boolean;
  /** Enables an explicit null value for structural numeric controls. */
  readonly nullable?: boolean;
  /** Optional specialized designer workflow associated with this property. */
  readonly designerAction?: ComponentDesignerAction;
}

export interface ComponentEventDefinition {
  readonly name: string;
  readonly label?: string;
  readonly category?: string;
  readonly description?: string;
  /** Runtime detail type supplied through the generated CustomEvent parameter. */
  readonly eventDetailType?: string;
  /** Detail fields introduced as local constants in a newly generated handler. */
  readonly eventDetailProperties?: readonly string[];
}

export interface PaletteMetadata {
  readonly category: string;
  readonly caption: string;
}

export interface DefaultComponentBounds {
  readonly width: number;
  readonly height: number;
}

/** Where the component is represented while editing a page. */
export type ComponentDesignerPresentation = 'canvas' | 'tray';

/** Structural counterpart of the project-model layout contract. */
export interface RegisteredContainerLayout {
  readonly mode: 'fixed' | 'align-to-parent' | 'row' | 'column';
  readonly paddingTop: number;
  readonly paddingRight: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
  readonly gap: number;
  readonly wrap: boolean;
  readonly justifyContent: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  readonly alignItems: 'start' | 'center' | 'end' | 'stretch';
}

/** Structural counterpart of the project-model layout item contract. */
export interface RegisteredLayoutItem {
  readonly width: 'fixed' | 'stretch' | 'fit-content';
  readonly height: 'fixed' | 'stretch' | 'fit-content';
  readonly minWidth: number;
  readonly maxWidth: number | null;
  readonly minHeight: number;
  readonly maxHeight: number | null;
  readonly grow: number;
  readonly shrink: boolean;
  readonly horizontalAnchor: 'start' | 'center' | 'end' | 'stretch';
  readonly verticalAnchor: 'start' | 'center' | 'end' | 'stretch';
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface RegisteredComponentLayout {
  readonly container: RegisteredContainerLayout;
  readonly item: RegisteredLayoutItem;
}

/** Design-time shortcuts for the component's visual style editor. */
export interface ComponentStyleEditorMetadata {
  /** Frequently used property names, independent of the selected interaction state. */
  readonly essentialProperties: readonly string[];
}

export interface ComponentDefinition {
  readonly type: string;
  readonly displayName: string;
  readonly namePrefix: string;
  readonly palette: PaletteMetadata;
  /** Symbolic identifier resolved by the IDE's own icon theme. */
  readonly icon: string;
  /** Whether the component owns a browser DOM projection at runtime. */
  readonly visual: boolean;
  /** Visual style shortcuts; the complete property catalog remains available. */
  readonly styleEditor?: ComponentStyleEditorMetadata;
  /**
   * Optional Designer-only presentation. When omitted, DOM-owning components
   * appear on the canvas and DOM-less services appear in the nonvisual tray.
   */
  readonly designerPresentation?: ComponentDesignerPresentation;
  readonly canHaveChildren: boolean;
  readonly defaultEvent: string | null;
  /** Optional action activated by a double-click in the Designer. */
  readonly designerAction?: ComponentDesignerAction;
  readonly defaultBounds: DefaultComponentBounds;
  /** Default values materialized into ComponentNode.props. */
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly properties: readonly ComponentPropertyDefinition[];
  readonly events: readonly ComponentEventDefinition[];
}

/**
 * Resolves the Designer surface without conflating it with browser rendering.
 * A DOM-owning component may intentionally be authored from the tray, such as
 * a popup that is opened programmatically at runtime.
 */
export function resolveComponentDesignerPresentation(
  definition: Pick<ComponentDefinition, 'visual' | 'designerPresentation'>,
): ComponentDesignerPresentation {
  return definition.designerPresentation ?? (definition.visual ? 'canvas' : 'tray');
}

/** Structural ComponentNode result that is assignable to the project-model node type. */
export interface RegisteredComponentNode {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly layout: RegisteredComponentLayout;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly props: Readonly<Record<string, unknown>>;
  readonly events: Readonly<Record<string, string | null>>;
  readonly children: readonly string[];
}

export interface CreateRegisteredComponentOptions {
  readonly id?: string;
  readonly idFactory?: () => string;
  readonly name?: string;
  readonly existingNames?: Iterable<string | { readonly name: string }>;
  readonly parentId?: string | null;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly events?: Readonly<Record<string, string | null>>;
}
