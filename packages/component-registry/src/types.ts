export type ComponentPropertyType =
  'string' | 'string-list' | 'number' | 'boolean' | 'enum' | 'color' | 'component';

export type ComponentPropertySource =
  'node' | 'bounds' | 'props' | 'page' | 'layout-container' | 'layout-item';

export interface ComponentPropertyDefinition {
  readonly name: string;
  readonly label?: string;
  readonly type: ComponentPropertyType;
  readonly category?: string;
  readonly source?: ComponentPropertySource;
  readonly defaultValue?: unknown;
  readonly options?: readonly string[];
  readonly description?: string;
  readonly readOnly?: boolean;
  /** Enables an explicit null value for structural numeric controls. */
  readonly nullable?: boolean;
}

export interface ComponentEventDefinition {
  readonly name: string;
  readonly label?: string;
  readonly category?: string;
  readonly description?: string;
}

export interface PaletteMetadata {
  readonly category: string;
  readonly caption: string;
}

export interface DefaultComponentBounds {
  readonly width: number;
  readonly height: number;
}

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

export interface ComponentDefinition {
  readonly type: string;
  readonly displayName: string;
  readonly namePrefix: string;
  readonly palette: PaletteMetadata;
  /** Symbolic identifier resolved by the IDE's own icon theme. */
  readonly icon: string;
  readonly visual: boolean;
  readonly canHaveChildren: boolean;
  readonly defaultEvent: string | null;
  readonly defaultBounds: DefaultComponentBounds;
  /** Default values materialized into ComponentNode.props. */
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly properties: readonly ComponentPropertyDefinition[];
  readonly events: readonly ComponentEventDefinition[];
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
