export class ComponentRegistryError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class DuplicateComponentTypeError extends ComponentRegistryError {
  public readonly componentType: string;

  public constructor(componentType: string) {
    super(`Component type "${componentType}" is already registered.`);
    this.componentType = componentType;
  }
}

export class UnknownComponentTypeError extends ComponentRegistryError {
  public readonly componentType: string;

  public constructor(componentType: string) {
    super(`Unknown component type "${componentType}".`);
    this.componentType = componentType;
  }
}

export class InvalidComponentDefinitionError extends ComponentRegistryError {}
