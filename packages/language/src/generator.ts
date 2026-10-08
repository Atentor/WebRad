import { getApiClientBodyInputs, type WebApiBodyInput } from '@webrad/runtime';
import { defaultComponentRegistry, type ComponentRegistry } from '@webrad/component-registry';
import {
  ApiClientConfigurationSchema,
  DataGridConfigurationSchema,
  parsePage,
  parseReusableElement,
  type ApiClientSchemaNode,
  type ComponentNode,
  type PageModel,
  type ReusableElementModel,
} from '@webrad/project-model';
import { COMPONENT_SCOPE_PREFIX, componentReferenceScope } from './component-references.js';

export interface GeneratePageOptions {
  readonly registry?: ComponentRegistry;
  readonly runtimeModule?: string;
  readonly generatedSuffix?: string;
}

export interface GeneratedPageArtifacts {
  readonly generatedFileName: string;
  readonly declarationFileName: string;
  readonly userFileName: string;
  readonly source: string;
  readonly typings: string;
  readonly userSource: string;
}

type GeneratedDocumentKind = 'page' | 'reusable';

export class LanguageGenerationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'LanguageGenerationError';
  }
}

function generatedClassName(page: PageModel, suffix: string): string {
  return `${page.name}${suffix}`;
}

function runtimeTypes(page: PageModel, kind: GeneratedDocumentKind): readonly string[] {
  return [
    ...new Set([
      kind === 'page' ? 'WebPage' : 'WebComponent',
      ...(kind === 'page' ? [] : ['WebReusableElementInstance']),
      ...page.components.map((component) => component.type),
      ...(page.components.some((component) => component.type === 'WebApiClient')
        ? ['WebApiTemplateValue', 'WebApiQueryValue', 'WebApiClientInstance']
        : []),
    ]),
  ].sort();
}

interface ApiClientTypeDeclarations {
  readonly declarations: readonly string[];
  readonly typeByComponentId: ReadonlyMap<string, string>;
}

interface SchemaTypeBuilder {
  readonly declarations: string[];
  next: number;
}

function fieldTypeName(node: ApiClientSchemaNode): string {
  switch (node.fieldType) {
    case 'string':
    case 'date':
    case 'datetime':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

function nullableType(typeName: string, nullable: boolean): string {
  return nullable && typeName !== 'null' ? `${typeName} | null` : typeName;
}

function nextSchemaTypeName(builder: SchemaTypeBuilder, prefix: string, suffix: string): string {
  builder.next += 1;
  return `${prefix}${suffix}${String(builder.next)}`;
}

function schemaTypeName(
  node: ApiClientSchemaNode,
  prefix: string,
  builder: SchemaTypeBuilder,
): string {
  if (node.kind === 'field') return nullableType(fieldTypeName(node), node.nullable);

  if (node.kind === 'list') {
    const itemType =
      node.children.length === 0
        ? 'unknown'
        : node.children.length === 1 && node.children[0]?.name === '$item'
          ? schemaTypeName(node.children[0], `${prefix}Item`, builder)
          : schemaObjectTypeName(node.children, `${prefix}Item`, builder);
    return nullableType(`readonly ${itemType}[]`, node.nullable);
  }

  return nullableType(schemaObjectTypeName(node.children, prefix, builder), node.nullable);
}

function schemaObjectTypeName(
  children: readonly ApiClientSchemaNode[],
  prefix: string,
  builder: SchemaTypeBuilder,
): string {
  const typeName = nextSchemaTypeName(builder, prefix, 'Object');
  const properties = children.map(
    (child) =>
      `  readonly ${JSON.stringify(child.name)}: ${schemaTypeName(
        child,
        `${typeName}${child.name.replaceAll(/[^A-Za-z0-9_$]/gu, '') || 'Field'}`,
        builder,
      )};`,
  );
  builder.declarations.push(
    `export interface ${typeName} {`,
    ...(properties.length === 0 ? ['  readonly [key: string]: unknown;'] : properties),
    '}',
    '',
  );
  return typeName;
}

function apiInputType(input: WebApiBodyInput): string {
  if (input.inferred && input.defaultValue === null) return 'WebApiTemplateValue';
  switch (input.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return 'readonly WebApiTemplateValue[]';
    case 'object':
      return 'Readonly<Record<string, WebApiTemplateValue>>';
  }
}
function apiClientTypeDeclarations(page: PageModel): ApiClientTypeDeclarations {
  const declarations: string[] = [];
  const typeByComponentId = new Map<string, string>();
  for (const component of page.components) {
    if (component.type !== 'WebApiClient') continue;
    const configuration = ApiClientConfigurationSchema.safeParse(component.props.apiClientConfig);
    if (!configuration.success) continue;
    const builder: SchemaTypeBuilder = { declarations: [], next: 0 };
    const operationTypes = configuration.data.operations.map((operation) => ({
      name: operation.name,
      type:
        operation.responseSchema === null
          ? 'unknown'
          : schemaTypeName(
              operation.responseSchema.root,
              component.name + operation.name + 'Response',
              builder,
            ),
    }));
    const outputsTypeName = component.name + 'ApiOutputs';
    const inputsTypeName = component.name + 'ApiInputs';
    const headersTypeName = component.name + 'ApiDefaultHeaders';
    declarations.push(...builder.declarations);
    declarations.push(
      'export interface ' + outputsTypeName + ' {',
      ...operationTypes.map(
        (operation) => '  readonly ' + JSON.stringify(operation.name) + ': ' + operation.type + ';',
      ),
      '}',
      '',
    );
    declarations.push('export interface ' + inputsTypeName + ' {');
    for (const operation of configuration.data.operations) {
      const fields = new Map<string, string>();
      const queryNames = [...new Set(operation.query.map((query) => query.name))];
      for (const name of queryNames) fields.set(name, 'WebApiQueryValue');
      for (const input of getApiClientBodyInputs(operation.body))
        fields.set(input.name, apiInputType(input));
      const headerNames = [...new Set(operation.headers.map((header) => header.name))];
      declarations.push(
        '  readonly ' + JSON.stringify(operation.name) + ': {',
        '    readonly Parameter: {',
        ...[...fields].map(
          ([name, type]) => '      readonly ' + JSON.stringify(name) + ': ' + type + ';',
        ),
        '    };',
        '    readonly Query: {',
        ...queryNames.map(
          (name) => '      readonly ' + JSON.stringify(name) + ': WebApiQueryValue;',
        ),
        '    };',
        '    readonly Headers: {',
        ...headerNames.map((name) => '      readonly ' + JSON.stringify(name) + ': string;'),
        '    };',
        '  };',
      );
    }
    declarations.push(
      '}',
      '',
      'export interface ' + headersTypeName + ' {',
      ...[...new Set(configuration.data.defaultHeaders.map((header) => header.name))].map(
        (name) => '  readonly ' + JSON.stringify(name) + ': string;',
      ),
      '}',
      '',
    );
    typeByComponentId.set(
      component.id,
      'WebApiClient<' + outputsTypeName + ', ' + inputsTypeName + ', ' + headersTypeName + '>',
    );
  }
  return { declarations, typeByComponentId };
}

function assignedEvents(page: PageModel): readonly {
  readonly component: ComponentNode;
  readonly eventName: string;
  readonly handlerName: string;
}[] {
  return page.components.flatMap((component) =>
    Object.entries(component.events).flatMap(([eventName, handlerName]) =>
      handlerName === null ? [] : [{ component, eventName, handlerName }],
    ),
  );
}

function dataGridBindings(
  page: PageModel,
): readonly { readonly grid: ComponentNode; readonly apiClient: ComponentNode }[] {
  return page.components.flatMap((grid) => {
    if (grid.type !== 'WebDataGrid') return [];
    const configuration = DataGridConfigurationSchema.safeParse(grid.props.dataGridConfig);
    if (!configuration.success || configuration.data.apiClientId === null) return [];
    const apiClient = page.components.find(
      (component) =>
        component.id === configuration.data.apiClientId && component.type === 'WebApiClient',
    );
    return apiClient === undefined ? [] : [{ grid, apiClient }];
  });
}

function assertKnownComponentTypes(page: PageModel, registry: ComponentRegistry): void {
  for (const component of page.components) {
    if (!registry.has(component.type)) {
      throw new LanguageGenerationError(
        `Cannot generate ${page.name}: component type "${component.type}" is not registered.`,
      );
    }
  }
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function componentConstruction(
  component: ComponentNode,
  registry: ComponentRegistry,
  apiClientTypes: ReadonlyMap<string, string>,
  elementId: string,
): string {
  const definition = registry.require(component.type);
  if (definition.visual) {
    return `new ${component.type}(this.requireComponentElement(${elementId}))`;
  }
  const typeName = apiClientTypes.get(component.id) ?? component.type;
  return `new ${typeName}(${JSON.stringify({
    ...component.props,
    id: component.id,
    name: component.name,
  })})${apiClientTypes.has(component.id) ? '.withRequests()' : ''}`;
}

function componentMemberType(
  component: ComponentNode,
  apiClientTypes: ReadonlyMap<string, string>,
): string {
  const apiType = apiClientTypes.get(component.id);
  return apiType === undefined
    ? component.type
    : 'WebApiClientInstance' + apiType.slice('WebApiClient'.length);
}

/**
 * Visual components are initially projected into the DOM by mountPage(), then
 * wrapped again by the generated page class for authored code. Components with
 * runtime-only state must therefore receive their persisted configuration on
 * the generated wrapper as well. Otherwise a subsequent API binding would use
 * the wrapper's defaults instead of the model-backed Data Grid binding.
 */
function componentInitialization(component: ComponentNode): readonly string[] {
  if (component.type !== 'WebDataGrid') return [];
  return [
    `    this.${component.name}.dataGridConfig = ${JSON.stringify(component.props.dataGridConfig)};`,
  ];
}

function parseGeneratedDocument(documentInput: PageModel, kind: GeneratedDocumentKind): PageModel {
  return kind === 'page' ? parsePage(documentInput) : parseReusableElement(documentInput);
}

function generateDocumentSource(
  documentInput: PageModel,
  kind: GeneratedDocumentKind,
  options: GeneratePageOptions = {},
): string {
  const page = parseGeneratedDocument(documentInput, kind);
  const registry = options.registry ?? defaultComponentRegistry;
  assertKnownComponentTypes(page, registry);
  const runtimeModule = options.runtimeModule ?? '@webrad/runtime';
  const className = generatedClassName(page, options.generatedSuffix ?? 'Generated');
  const components = page.components.filter((component) => component.id !== page.rootComponentId);
  const events = assignedEvents(page);
  const gridBindings = dataGridBindings(page);
  const apiClientTypes = apiClientTypeDeclarations(page);
  const isReusable = kind === 'reusable';
  const baseClass = isReusable ? 'WebReusableElementInstance' : 'WebPage';
  const constructorParameters = isReusable
    ? 'element: HTMLElement, instanceId: string, componentElements: ReadonlyMap<string, WebComponent>, componentIds: ReadonlyMap<string, string>'
    : 'element: HTMLElement';
  const superCall = isReusable
    ? 'super(element, instanceId, componentElements, componentIds);'
    : 'super(element);';
  const lines: string[] = [
    '// Generated by WebRAD. Changes to this file will be replaced.',
    `import { ${runtimeTypes(page, kind)
      .map((name) =>
        ['WebApiTemplateValue', 'WebApiQueryValue', 'WebApiClientInstance'].includes(name)
          ? `type ${name}`
          : name,
      )
      .join(', ')} } from ${quoted(runtimeModule)};`,
    '',
    `export abstract class ${className} extends ${baseClass} {`,
  ];

  for (const component of components) {
    lines.push(
      `  public readonly ${component.name}: ${componentMemberType(
        component,
        apiClientTypes.typeByComponentId,
      )};`,
    );
  }
  if (components.length > 0) lines.push('');
  lines.push(`  public constructor(${constructorParameters}) {`, `    ${superCall}`);
  for (const component of components) {
    lines.push(
      `    this.${component.name} = ${componentConstruction(
        component,
        registry,
        apiClientTypes.typeByComponentId,
        isReusable ? `this.componentId(${quoted(component.id)})` : quoted(component.id),
      )};`,
    );
    lines.push(...componentInitialization(component));
  }
  if ((gridBindings.length > 0 || events.length > 0) && components.length > 0) lines.push('');
  for (const binding of gridBindings) {
    lines.push(`    this.${binding.grid.name}.bindApiClient(this.${binding.apiClient.name});`);
  }
  if (gridBindings.length > 0 && events.length > 0) lines.push('');
  for (const event of events) {
    const sender =
      event.component.id === page.rootComponentId ? 'this' : `this.${event.component.name}`;
    lines.push(
      `    this.bindGeneratedEvent(${sender}, ${quoted(event.eventName)}, ${quoted(event.handlerName)});`,
    );
  }
  lines.push('  }', '}', '');
  if (apiClientTypes.declarations.length > 0) lines.push(...apiClientTypes.declarations);

  return `${lines.join('\n')}\n`;
}

export function generatePageSource(
  pageInput: PageModel,
  options: GeneratePageOptions = {},
): string {
  return generateDocumentSource(pageInput, 'page', options);
}

/** Generates the per-placement class for a reusable definition. */
export function generateReusableElementSource(
  reusableElementInput: ReusableElementModel,
  options: GeneratePageOptions = {},
): string {
  return generateDocumentSource(reusableElementInput, 'reusable', options);
}

function generateDocumentTypings(
  documentInput: PageModel,
  kind: GeneratedDocumentKind,
  options: GeneratePageOptions = {},
): string {
  const page = parseGeneratedDocument(documentInput, kind);
  const registry = options.registry ?? defaultComponentRegistry;
  assertKnownComponentTypes(page, registry);
  const runtimeModule = options.runtimeModule ?? '@webrad/runtime';
  const className = generatedClassName(page, options.generatedSuffix ?? 'Generated');
  const components = page.components.filter((component) => component.id !== page.rootComponentId);
  const apiClientTypes = apiClientTypeDeclarations(page);
  const isReusable = kind === 'reusable';
  const baseClass = isReusable ? 'WebReusableElementInstance' : 'WebPage';
  const constructorParameters = isReusable
    ? 'element: HTMLElement, instanceId: string, componentElements: ReadonlyMap<string, WebComponent>, componentIds: ReadonlyMap<string, string>'
    : 'element: HTMLElement';
  const lines = [
    '// Generated by WebRAD for editor type information.',
    `${COMPONENT_SCOPE_PREFIX}${JSON.stringify({ ...componentReferenceScope(page), generatedClassName: className })}`,
    `import type { ${runtimeTypes(page, kind).join(', ')} } from ${quoted(runtimeModule)};`,
    '',
    `export declare abstract class ${className} extends ${baseClass} {`,
    ...components.map(
      (component) =>
        `  public readonly ${component.name}: ${componentMemberType(
          component,
          apiClientTypes.typeByComponentId,
        )};`,
    ),
    `  public constructor(${constructorParameters});`,
    '}',
    '',
    ...apiClientTypes.declarations,
  ];
  return `${lines.join('\n')}\n`;
}

export function generatePageTypings(
  pageInput: PageModel,
  options: GeneratePageOptions = {},
): string {
  return generateDocumentTypings(pageInput, 'page', options);
}

/** Generates editor typings for a reusable definition's authored class. */
export function generateReusableElementTypings(
  reusableElementInput: ReusableElementModel,
  options: GeneratePageOptions = {},
): string {
  return generateDocumentTypings(reusableElementInput, 'reusable', options);
}

function createUserDocumentSource(
  documentInput: PageModel,
  kind: GeneratedDocumentKind,
  options: Pick<GeneratePageOptions, 'generatedSuffix'> = {},
): string {
  const page = parseGeneratedDocument(documentInput, kind);
  const className = generatedClassName(page, options.generatedSuffix ?? 'Generated');
  const componentTypes = [...new Set(page.components.map((component) => component.type))].sort();
  const lines = [
    `import type { ${componentTypes.join(', ')} } from '@webrad/runtime';`,
    `import { ${className} } from './${page.name}.generated';`,
    '',
    `export class ${page.name} extends ${className} {`,
    '  // Variables and properties: declare class state here.',
    '',
    '  // Functions: methods that return a value.',
    '',
    '  // Procedures: methods without a return value (void).',
    '',
    '  // Events: methods bound to component events.',
    '}',
    '',
  ];
  return lines.join('\n');
}

export function createUserPageSource(
  pageInput: PageModel,
  options: Pick<GeneratePageOptions, 'generatedSuffix'> = {},
): string {
  return createUserDocumentSource(pageInput, 'page', options);
}

/** Creates the editable TypeScript source for a reusable definition. */
export function createUserReusableElementSource(
  reusableElementInput: ReusableElementModel,
  options: Pick<GeneratePageOptions, 'generatedSuffix'> = {},
): string {
  return createUserDocumentSource(reusableElementInput, 'reusable', options);
}

export function generatePageArtifacts(
  pageInput: PageModel,
  options: GeneratePageOptions = {},
): GeneratedPageArtifacts {
  const page = parsePage(pageInput);
  return {
    generatedFileName: `pages/${page.name}.generated.ts`,
    declarationFileName: `pages/${page.name}.generated.d.ts`,
    userFileName: `pages/${page.name}.ts`,
    source: generatePageSource(page, options),
    typings: generatePageTypings(page, options),
    userSource: createUserPageSource(page, options),
  };
}

export const generatePageDeclaration = generatePageTypings;
