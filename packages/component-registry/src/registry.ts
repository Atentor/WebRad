import {
  ComponentRegistryError,
  DuplicateComponentTypeError,
  InvalidComponentDefinitionError,
  UnknownComponentTypeError,
} from './errors.js';
import type {
  ComponentDefinition,
  CreateRegisteredComponentOptions,
  RegisteredComponentNode,
} from './types.js';

const TYPE_PATTERN = /^[$A-Z_a-z][$\w]*$/;
const RESERVED_IDENTIFIERS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'constructor',
]);

function isSafeIdentifier(value: string): boolean {
  return TYPE_PATTERN.test(value) && !RESERVED_IDENTIFIERS.has(value);
}

function copyDefinition(definition: ComponentDefinition): ComponentDefinition {
  return {
    ...definition,
    styleDependencies:
      definition.styleDependencies === undefined ? undefined : [...definition.styleDependencies],
    palette: { ...definition.palette },
    styleEditor:
      definition.styleEditor === undefined
        ? undefined
        : {
            ...definition.styleEditor,
            essentialProperties: [...definition.styleEditor.essentialProperties],
            ...(definition.styleEditor.previewProps === undefined
              ? {}
              : { previewProps: structuredClone(definition.styleEditor.previewProps) }),
          },
    defaultBounds: { ...definition.defaultBounds },
    defaults: structuredClone(definition.defaults),
    properties: definition.properties.map((property) => ({
      ...property,
      defaultValue:
        property.defaultValue === undefined ? undefined : structuredClone(property.defaultValue),
      options: property.options === undefined ? undefined : [...property.options],
    })),
    events: definition.events.map((event) => ({
      ...event,
      eventDetailProperties:
        event.eventDetailProperties === undefined ? undefined : [...event.eventDetailProperties],
    })),
  };
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || visited.has(value)) return value;
  visited.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), visited);
  return Object.freeze(value);
}

function assertUniqueNames(
  values: readonly { readonly name: string }[],
  description: string,
): void {
  const names = new Set<string>();
  for (const value of values) {
    if (names.has(value.name)) {
      throw new InvalidComponentDefinitionError(
        `${description} name "${value.name}" is declared more than once.`,
      );
    }
    names.add(value.name);
  }
}

export function validateComponentDefinition(definition: ComponentDefinition): void {
  if (definition.styleDependencies !== undefined) {
    assertUniqueNames(
      definition.styleDependencies.map((name) => ({ name })),
      'Style dependency',
    );
    for (const type of definition.styleDependencies) {
      if (!isSafeIdentifier(type))
        throw new InvalidComponentDefinitionError(
          'Style dependencies must be TypeScript-safe component types.',
        );
    }
  }

  if (!isSafeIdentifier(definition.type)) {
    throw new InvalidComponentDefinitionError(
      `Component type "${definition.type}" must be a TypeScript-safe identifier.`,
    );
  }
  if (!isSafeIdentifier(definition.namePrefix)) {
    throw new InvalidComponentDefinitionError(
      `Name prefix "${definition.namePrefix}" must be a TypeScript-safe identifier.`,
    );
  }
  if (
    definition.displayName.trim().length === 0 ||
    definition.palette.caption.trim().length === 0
  ) {
    throw new InvalidComponentDefinitionError('Component display names cannot be empty.');
  }
  if (definition.palette.category.trim().length === 0 || definition.icon.trim().length === 0) {
    throw new InvalidComponentDefinitionError(
      'Palette category and icon identifier cannot be empty.',
    );
  }
  if (
    definition.designerPresentation !== undefined &&
    definition.designerPresentation !== 'canvas' &&
    definition.designerPresentation !== 'tray'
  ) {
    throw new InvalidComponentDefinitionError(
      `Designer presentation "${String(definition.designerPresentation)}" is not supported.`,
    );
  }
  if (
    !Number.isFinite(definition.defaultBounds.width) ||
    definition.defaultBounds.width <= 0 ||
    !Number.isFinite(definition.defaultBounds.height) ||
    definition.defaultBounds.height <= 0
  ) {
    throw new InvalidComponentDefinitionError(
      'Default component dimensions must be finite and positive.',
    );
  }

  assertUniqueNames(definition.properties, 'Property');
  assertUniqueNames(definition.events, 'Event');
  if (definition.styleEditor !== undefined) {
    assertUniqueNames(
      definition.styleEditor.essentialProperties.map((name) => ({ name })),
      'Essential style property',
    );
    for (const name of definition.styleEditor.essentialProperties) {
      if (!isSafeIdentifier(name)) {
        throw new InvalidComponentDefinitionError(
          `Essential style property "${name}" must be a TypeScript-safe identifier.`,
        );
      }
    }
  }
  for (const event of definition.events) {
    if (
      event.eventType !== undefined &&
      !['Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'InputEvent'].includes(
        event.eventType,
      )
    ) {
      throw new InvalidComponentDefinitionError(`Invalid native event type for "${event.name}".`);
    }
    if (event.eventDetailType !== undefined && !isSafeIdentifier(event.eventDetailType)) {
      throw new InvalidComponentDefinitionError(
        `Event detail type "${event.eventDetailType}" for "${event.name}" must be a TypeScript-safe identifier.`,
      );
    }
    const detailProperties = event.eventDetailProperties ?? [];
    if (detailProperties.length > 0 && event.eventDetailType === undefined) {
      throw new InvalidComponentDefinitionError(
        `Event "${event.name}" detail properties require an event detail type.`,
      );
    }
    assertUniqueNames(
      detailProperties.map((name) => ({ name })),
      `Event "${event.name}" detail property`,
    );
    for (const property of detailProperties) {
      if (!isSafeIdentifier(property)) {
        throw new InvalidComponentDefinitionError(
          `Event detail property "${property}" for "${event.name}" must be a TypeScript-safe identifier.`,
        );
      }
    }
  }
  for (const property of definition.properties) {
    if (!isSafeIdentifier(property.name)) {
      throw new InvalidComponentDefinitionError(
        `Property name "${property.name}" must be a TypeScript-safe identifier.`,
      );
    }
    if (
      (property.type === 'enum' || property.type === 'icon') &&
      (property.options === undefined || property.options.length === 0)
    ) {
      throw new InvalidComponentDefinitionError(
        `Enum property "${property.name}" must declare at least one option.`,
      );
    }
  }

  if (
    definition.defaultEvent !== null &&
    !definition.events.some((event) => event.name === definition.defaultEvent)
  ) {
    throw new InvalidComponentDefinitionError(
      `Default event "${definition.defaultEvent}" is not declared by ${definition.type}.`,
    );
  }
}

function namesFrom(
  existing: Iterable<string | { readonly name: string }> | undefined,
): Set<string> {
  const names = new Set<string>();
  if (existing === undefined) return names;
  for (const item of existing) names.add(typeof item === 'string' ? item : item.name);
  return names;
}

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new ComponentRegistryError('crypto.randomUUID() is required to create component IDs.');
  }
  return globalThis.crypto.randomUUID();
}

function createDefaultLayout(): RegisteredComponentNode['layout'] {
  return {
    container: {
      mode: 'fixed',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      gap: 0,
      wrap: false,
      justifyContent: 'start',
      alignItems: 'start',
    },
    item: {
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
    },
  };
}

export class ComponentRegistry {
  readonly #definitions = new Map<string, ComponentDefinition>();

  public constructor(definitions: Iterable<ComponentDefinition> = []) {
    this.registerMany(definitions);
  }

  public register(definition: ComponentDefinition): this {
    validateComponentDefinition(definition);
    if (this.#definitions.has(definition.type)) {
      throw new DuplicateComponentTypeError(definition.type);
    }
    this.#definitions.set(definition.type, deepFreeze(copyDefinition(definition)));
    return this;
  }

  public registerMany(definitions: Iterable<ComponentDefinition>): this {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  public unregister(type: string): boolean {
    return this.#definitions.delete(type);
  }

  public clear(): void {
    this.#definitions.clear();
  }

  public has(type: string): boolean {
    return this.#definitions.has(type);
  }

  public get(type: string): ComponentDefinition | undefined {
    return this.#definitions.get(type);
  }

  public require(type: string): ComponentDefinition {
    const definition = this.get(type);
    if (definition === undefined) throw new UnknownComponentTypeError(type);
    return definition;
  }

  public list(): readonly ComponentDefinition[] {
    return [...this.#definitions.values()];
  }

  public listByCategory(category: string): readonly ComponentDefinition[] {
    return this.list().filter((definition) => definition.palette.category === category);
  }

  public categories(): readonly string[] {
    return [...new Set(this.list().map((definition) => definition.palette.category))];
  }

  public suggestName(
    type: string,
    existing?: Iterable<string | { readonly name: string }>,
  ): string {
    const definition = this.require(type);
    const occupied = namesFrom(existing);
    let sequence = 1;
    while (occupied.has(`${definition.namePrefix}${String(sequence)}`)) sequence += 1;
    return `${definition.namePrefix}${String(sequence)}`;
  }

  public createComponent(
    type: string,
    options: CreateRegisteredComponentOptions = {},
  ): RegisteredComponentNode {
    const definition = this.require(type);
    const occupied = namesFrom(options.existingNames);
    const name = options.name ?? this.suggestName(type, occupied);
    if (!isSafeIdentifier(name)) {
      throw new ComponentRegistryError(`Component name "${name}" is not a TypeScript identifier.`);
    }
    if (occupied.has(name)) {
      throw new ComponentRegistryError(`Component name "${name}" is already in use.`);
    }
    const width = options.width ?? definition.defaultBounds.width;
    const height = options.height ?? definition.defaultBounds.height;
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new ComponentRegistryError('Component dimensions must be finite and positive.');
    }

    return {
      id: options.id ?? (options.idFactory ?? createId)(),
      type,
      name,
      parentId: options.parentId ?? null,
      layout: createDefaultLayout(),
      bounds: {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width,
        height,
      },
      props: { ...structuredClone(definition.defaults), ...structuredClone(options.props ?? {}) },
      events: {
        ...Object.fromEntries(definition.events.map((event) => [event.name, null])),
        ...options.events,
      },
      children: [],
    };
  }

  public get size(): number {
    return this.#definitions.size;
  }

  public static register(definition: ComponentDefinition): ComponentRegistry {
    return componentRegistry.register(definition);
  }

  public static has(type: string): boolean {
    return componentRegistry.has(type);
  }

  public static get(type: string): ComponentDefinition | undefined {
    return componentRegistry.get(type);
  }

  public static require(type: string): ComponentDefinition {
    return componentRegistry.require(type);
  }

  public static list(): readonly ComponentDefinition[] {
    return componentRegistry.list();
  }

  public static suggestName(
    type: string,
    existing?: Iterable<string | { readonly name: string }>,
  ): string {
    return componentRegistry.suggestName(type, existing);
  }

  public static createComponent(
    type: string,
    options?: CreateRegisteredComponentOptions,
  ): RegisteredComponentNode {
    return componentRegistry.createComponent(type, options);
  }
}

/** Process-wide built-in registry used by metadata-driven IDE consumers. */
export const componentRegistry = new ComponentRegistry();
