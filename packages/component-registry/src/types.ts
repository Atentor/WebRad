export type ComponentPropertyType =
  'string' | 'string-list' | 'number' | 'boolean' | 'enum' | 'color' | 'component';

export type ComponentPropertySource = 'node' | 'bounds' | 'props' | 'form';

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
