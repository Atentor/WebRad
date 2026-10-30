import { createDefaultReportTemplate, parseReportTemplate } from '@webrad/runtime/report-template';
import { getApiClientBodyInputs, type WebApiBodyInput } from '@webrad/runtime';
import { defaultComponentRegistry, type ComponentRegistry } from '@webrad/component-registry';
import {
  pageClassName,
  ApiClientConfigurationSchema,
  DataGridConfigurationSchema,
  ComboBoxConfigurationSchema,
  ChartsConfigurationSchema,
  RepeatingGroupConfigurationSchema,
  parsePage,
  parseReusableElement,
  MenuDefinitionModelSchema,
  type ApiClientSchemaNode,
  type ComponentNode,
  type PageModel,
  type ReusableElementModel,
  type MenuDefinitionModel,
} from '@webrad/project-model';
import { COMPONENT_SCOPE_PREFIX, componentReferenceScope } from './component-references.js';
import { repeatingGroupForComponent } from './repeating-context.js';
import ts from 'typescript';

export interface GeneratePageOptions {
  readonly menus?: readonly MenuDefinitionModel[];
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

type GeneratedDocumentKind = 'page' | 'reusable' | 'menu';

export class LanguageGenerationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'LanguageGenerationError';
  }
}

function generatedClassName(page: PageModel, suffix: string): string {
  return `${pageClassName(page.name)}${suffix}`;
}

function runtimeTypes(page: PageModel, kind: GeneratedDocumentKind): readonly string[] {
  return [
    ...new Set([
      kind === 'page' ? 'WebPage' : 'WebComponent',
      ...(kind === 'page' ? [] : ['WebReusableElementInstance']),
      ...page.components
        .filter((component) => component.id !== page.rootComponentId)
        .map((component) => component.type),
      ...(page.components.some((component) => component.type === 'WebApiClient')
        ? ['WebApiTemplateValue', 'WebApiQueryValue', 'WebApiClientInstance']
        : []),
      ...(page.components.some((component) => component.type === 'WebRepeatingGroup')
        ? ['WebRepeatingGroupCurrentRow']
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
        : node.children.length === 1 &&
            (node.children[0]?.name === '$item' || node.children[0]?.path === `${node.path}/*`)
          ? schemaTypeName(node.children[0], `${prefix}Item`, builder)
          : schemaObjectTypeName(node.children, `${prefix}Item`, builder);
    return nullableType(`ReadonlyArray<${itemType}>`, node.nullable);
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
        ...apiInputRecord(
          'Parameter',
          [...fields].map(([name, type]) => [name, type]),
        ),
        ...apiInputRecord(
          'Query',
          queryNames.map((name) => [name, 'WebApiQueryValue']),
        ),
        ...apiInputRecord(
          'Headers',
          headerNames.map((name) => [name, 'string']),
        ),
        '  };',
      );
    }
    const defaultHeaderNames = [
      ...new Set(configuration.data.defaultHeaders.map((header) => header.name)),
    ];
    declarations.push(
      '}',
      '',
      ...(defaultHeaderNames.length === 0
        ? ['export type ' + headersTypeName + ' = Readonly<Record<string, never>>;']
        : [
            'export interface ' + headersTypeName + ' {',
            ...defaultHeaderNames.map((name) => '  readonly ' + JSON.stringify(name) + ': string;'),
            '}',
          ]),
      '',
    );
    typeByComponentId.set(
      component.id,
      'WebApiClient<' + outputsTypeName + ', ' + inputsTypeName + ', ' + headersTypeName + '>',
    );
  }
  return { declarations, typeByComponentId };
}

function apiInputRecord(name: string, fields: readonly (readonly [string, string])[]): string[] {
  return fields.length === 0
    ? [`    readonly ${name}: Readonly<Record<string, never>>;`]
    : [
        `    readonly ${name}: {`,
        ...fields.map(([field, type]) => `      readonly ${JSON.stringify(field)}: ${type};`),
        '    };',
      ];
}

function repeatingGroupTypeDeclarations(page: PageModel): ApiClientTypeDeclarations {
  const declarations: string[] = [];
  const typeByComponentId = new Map<string, string>();
  for (const group of page.components) {
    if (group.type !== 'WebRepeatingGroup') continue;
    const config = RepeatingGroupConfigurationSchema.safeParse(group.props.repeatingGroupConfig);
    const api = config.success
      ? page.components.find((component) => component.id === config.data.apiClientId)
      : undefined;
    const apiConfig = ApiClientConfigurationSchema.safeParse(api?.props.apiClientConfig);
    const operation =
      apiConfig.success && config.success
        ? apiConfig.data.operations.find((candidate) => candidate.id === config.data.operationId)
        : undefined;
    const findList = (node: ApiClientSchemaNode): ApiClientSchemaNode | undefined => {
      if (config.success && node.path === config.data.listPath && node.kind === 'list') return node;
      for (const child of node.children) {
        const match = findList(child);
        if (match !== undefined) return match;
      }
      return undefined;
    };
    const list =
      operation?.responseSchema == null ? undefined : findList(operation.responseSchema.root);
    const builder: SchemaTypeBuilder = { declarations: [], next: 0 };
    const itemType =
      list === undefined || list.children.length === 0
        ? 'unknown'
        : list.children.length === 1 &&
            (list.children[0]?.name === '$item' || list.children[0]?.path === `${list.path}/*`)
          ? schemaTypeName(list.children[0], `${group.name}Row`, builder)
          : schemaObjectTypeName(list.children, `${group.name}Row`, builder);
    declarations.push(
      ...builder.declarations,
      `export type ${group.name}RowValue = ${itemType};`,
      `export type ${group.name}CurrentRow = WebRepeatingGroupCurrentRow<${group.name}RowValue>;`,
      '',
    );
    typeByComponentId.set(group.id, `WebRepeatingGroup<${group.name}RowValue>`);
  }
  return { declarations, typeByComponentId };
}

function reportTypeDeclarations(page: PageModel): ApiClientTypeDeclarations {
  const declarations: string[] = [];
  const typeByComponentId = new Map<string, string>();
  for (const component of page.components) {
    if (component.type !== 'WebReportBuilder') continue;
    const template =
      component.props.reportTemplate === undefined
        ? createDefaultReportTemplate()
        : parseReportTemplate(component.props.reportTemplate);
    if (template.parameters.length === 0) continue;
    const typeName = component.name + 'ReportParameters';
    declarations.push(
      'export type ' + typeName + ' = {',
      ...template.parameters.map(
        (parameter) =>
          '  ' +
          JSON.stringify(parameter.name) +
          ': ' +
          (parameter.type === 'date' ? 'string' : parameter.type) +
          ' | null;',
      ),
      '};',
      '',
    );
    typeByComponentId.set(component.id, 'WebReportBuilder<' + typeName + '>');
  }
  return { declarations, typeByComponentId };
}
function documentTypeDeclarations(
  page: PageModel,
  menus: readonly MenuDefinitionModel[] = [],
): ApiClientTypeDeclarations {
  const api = apiClientTypeDeclarations(page);
  const rows = repeatingGroupTypeDeclarations(page);
  const reports = reportTypeDeclarations(page);
  return {
    declarations: [...api.declarations, ...rows.declarations, ...reports.declarations],
    typeByComponentId: new Map([
      ...api.typeByComponentId,
      ...rows.typeByComponentId,
      ...reports.typeByComponentId,
      ...page.components.flatMap((component) => {
        const index = menus.findIndex((menu) => menu.id === component.props.menuDefinitionId);
        return component.type === 'WebMenu' && index >= 0
          ? [[component.id, `WebRadMenuDefinition${String(index)}`] as const]
          : [];
      }),
    ]),
  };
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

function apiListBindings(
  page: PageModel,
): readonly { readonly grid: ComponentNode; readonly apiClient: ComponentNode }[] {
  return page.components.flatMap((grid) => {
    const configuration =
      grid.type === 'WebDataGrid'
        ? DataGridConfigurationSchema.safeParse(grid.props.dataGridConfig)
        : grid.type === 'WebRepeatingGroup'
          ? RepeatingGroupConfigurationSchema.safeParse(grid.props.repeatingGroupConfig)
          : grid.type === 'WebComboBox' && grid.props.comboBoxConfig != null
            ? ComboBoxConfigurationSchema.safeParse(grid.props.comboBoxConfig)
            : undefined;
    if (configuration === undefined) return [];
    if (!configuration.success || configuration.data.apiClientId === null) return [];
    const apiClient = page.components.find(
      (component) =>
        component.id === configuration.data.apiClientId && component.type === 'WebApiClient',
    );
    return apiClient === undefined ? [] : [{ grid, apiClient }];
  });
}

function apiChartBindings(page: PageModel): readonly {
  readonly chart: ComponentNode;
  readonly apiClient: ComponentNode;
  readonly operationId: string;
  readonly seriesId: string;
}[] {
  return page.components.flatMap((chart) => {
    if (chart.type !== 'WebCharts') return [];
    const configuration = ChartsConfigurationSchema.safeParse(chart.props.chartsConfig);
    if (!configuration.success) return [];
    return configuration.data.series.flatMap((series) => {
      if (series.apiClientId === null || series.operationId === null) return [];
      const apiClient = page.components.find(
        (component) => component.id === series.apiClientId && component.type === 'WebApiClient',
      );
      return apiClient === undefined
        ? []
        : [{ chart, apiClient, operationId: series.operationId, seriesId: series.id }];
    });
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
    if (component.type === 'WebMenu' && typeof component.props.menuDefinitionId === 'string') {
      const menuType = apiClientTypes.get(component.id);
      if (menuType === undefined) throw new LanguageGenerationError('Unknown Menu definition.');
      return `WebMenu.fromElement(this.requireComponentElement(${elementId}), ${menuType})`;
    }
    return `new ${apiClientTypes.get(component.id) ?? component.type}(this.requireComponentElement(${elementId}))`;
  }
  const typeName = apiClientTypes.get(component.id) ?? component.type;
  const props = Object.fromEntries(
    Object.entries(component.props).map(([name, value]) => {
      const projection = definition.properties.find(
        (property) => property.name === name,
      )?.runtimeValue;
      return [name, projection ? projection(value) : value];
    }),
  );
  return `new ${typeName}(${JSON.stringify({
    ...props,
    id: component.id,
    name: component.name,
  })})${component.type === 'WebApiClient' ? '.withRequests()' : ''}`;
}

function componentMemberType(
  component: ComponentNode,
  apiClientTypes: ReadonlyMap<string, string>,
): string {
  const apiType = apiClientTypes.get(component.id);
  return apiType === undefined
    ? component.type
    : component.type === 'WebApiClient'
      ? 'WebApiClientInstance' + apiType.slice('WebApiClient'.length)
      : apiType;
}

/**
 * Visual components are initially projected into the DOM by mountPage(), then
 * wrapped again by the generated page class for authored code. Components with
 * runtime-only state must therefore receive their persisted configuration on
 * the generated wrapper as well. Otherwise a subsequent API binding would use
 * the wrapper's defaults instead of the model-backed Data Grid binding.
 */
function componentInitialization(component: ComponentNode): readonly string[] {
  if (component.type === 'WebCharts')
    return [
      `    this.${component.name}.chartsConfig = ${JSON.stringify(component.props.chartsConfig)};`,
    ];
  if (component.type === 'WebRepeatingGroup')
    return [
      `    this.${component.name}.repeatingGroupConfig = ${JSON.stringify(component.props.repeatingGroupConfig)};`,
    ];
  if (component.type === 'WebComboBox' && component.props.comboBoxConfig != null) {
    return [
      `    this.${component.name}.comboBoxConfig = ${JSON.stringify(component.props.comboBoxConfig)};`,
      `    this.${component.name}.value = ${JSON.stringify(component.props.value ?? '')};`,
    ];
  }
  if (component.type !== 'WebDataGrid') return [];
  return [
    `    this.${component.name}.dataGridConfig = ${JSON.stringify(component.props.dataGridConfig)};`,
  ];
}

function parseGeneratedDocument(documentInput: PageModel, kind: GeneratedDocumentKind): PageModel {
  if (kind === 'menu') return MenuDefinitionModelSchema.parse(documentInput);
  return kind === 'page' ? parsePage(documentInput) : parseReusableElement(documentInput);
}

/** Keep generated imports aligned with actual constructor and type references. */
function normalizeRuntimeImports(text: string): string {
  const source = ts.createSourceFile('generated.ts', text, ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(ts.isImportDeclaration);
  const bindings = declaration?.importClause?.namedBindings;
  if (!declaration || !declaration.importClause || !bindings || !ts.isNamedImports(bindings))
    return text;
  const used = new Set<string>();
  const values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      used.add(node.text);
      if (
        (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) ||
        (ts.isNewExpression(node.parent) && node.parent.expression === node) ||
        (ts.isExpressionWithTypeArguments(node.parent) &&
          ts.isHeritageClause(node.parent.parent) &&
          node.parent.parent.token === ts.SyntaxKind.ExtendsKeyword)
      )
        values.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of source.statements)
    if (!ts.isImportDeclaration(statement)) visit(statement);
  const updated = ts.factory.updateImportDeclaration(
    declaration,
    declaration.modifiers,
    ts.factory.updateImportClause(
      declaration.importClause,
      false,
      undefined,
      ts.factory.updateNamedImports(
        bindings,
        bindings.elements
          .filter((item) => used.has(item.name.text))
          .map((item) =>
            ts.factory.updateImportSpecifier(
              item,
              !values.has(item.name.text),
              item.propertyName,
              item.name,
            ),
          ),
      ),
    ),
    declaration.moduleSpecifier,
    declaration.attributes,
  );
  return (
    text.slice(0, declaration.getStart(source)) +
    ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printNode(ts.EmitHint.Unspecified, updated, source) +
    text.slice(declaration.end)
  );
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
  const gridBindings = apiListBindings(page);
  const chartBindings = apiChartBindings(page);
  const apiClientTypes = documentTypeDeclarations(page, options.menus);
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
      .filter(
        (name) =>
          !['WebApiTemplateValue', 'WebApiQueryValue'].includes(name) ||
          apiClientTypes.declarations.some((line) => line.includes(name)),
      )
      .map((name) =>
        [
          'WebApiTemplateValue',
          'WebApiQueryValue',
          'WebApiClientInstance',
          'WebRepeatingGroupCurrentRow',
        ].includes(name) ||
        (isReusable && name === 'WebComponent')
          ? `type ${name}`
          : name,
      )
      .join(', ')} } from ${quoted(runtimeModule)};`,
    '',
    ...menuDefinitionImports(page, options.menus, false),
    `export abstract class ${className} extends ${baseClass} {`,
  ];

  for (const component of components) {
    const rowGroup = repeatingGroupForComponent(page, component.id);
    lines.push(
      rowGroup === undefined
        ? `  public readonly ${component.name}: ${componentMemberType(
            component,
            apiClientTypes.typeByComponentId,
          )};`
        : `  public get ${component.name}(): ${componentMemberType(component, apiClientTypes.typeByComponentId)} { return this.${rowGroup.name}.getRow(0).component<${componentMemberType(component, apiClientTypes.typeByComponentId)}>(${isReusable ? `this.componentId(${quoted(component.id)})` : quoted(component.id)}); }`,
    );
  }
  if (components.length > 0) lines.push('');
  lines.push(`  public constructor(${constructorParameters}) {`, `    ${superCall}`);
  for (const component of components) {
    if (repeatingGroupForComponent(page, component.id) !== undefined) continue;
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
  for (const report of components.filter((component) => component.type === 'WebReportBuilder')) {
    for (const client of components.filter((component) => component.type === 'WebApiClient')) {
      lines.push(
        '    this.' +
          report.name +
          '.bindApiClient(' +
          quoted(client.id) +
          ', this.' +
          client.name +
          ');',
      );
      if (client.id !== client.name)
        lines.push(
          '    this.' +
            report.name +
            '.bindApiClient(' +
            quoted(client.name) +
            ', this.' +
            client.name +
            ');',
        );
    }
  }
  for (const binding of gridBindings) {
    if (repeatingGroupForComponent(page, binding.grid.id) !== undefined) continue;
    lines.push(`    this.${binding.grid.name}.bindApiClient(this.${binding.apiClient.name});`);
  }
  for (const binding of chartBindings) {
    if (repeatingGroupForComponent(page, binding.chart.id) !== undefined) continue;
    lines.push(
      `    this.${binding.chart.name}.bindApiClient(this.${binding.apiClient.name}, ${quoted(binding.operationId)}, ${quoted(binding.seriesId)});`,
    );
  }
  if (gridBindings.length > 0 && events.length > 0) lines.push('');
  for (const event of events) {
    if (repeatingGroupForComponent(page, event.component.id) !== undefined) continue;
    const sender =
      event.component.id === page.rootComponentId ? 'this' : `this.${event.component.name}`;
    lines.push(
      `    this.bindGeneratedEvent(${sender}, ${quoted(event.eventName)}, ${quoted(event.handlerName)});`,
    );
  }
  const appendRowSubscription = (
    group: ComponentNode,
    expression: string,
    indent: string,
    depth: number,
  ): void => {
    const rowName = `CurrentRow${String(depth)}`;
    const rowEvents = events.filter(
      (event) => repeatingGroupForComponent(page, event.component.id)?.id === group.id,
    );
    const rowListBindings = gridBindings.filter(
      (binding) => repeatingGroupForComponent(page, binding.grid.id)?.id === group.id,
    );
    const rowChartBindings = chartBindings.filter(
      (binding) => repeatingGroupForComponent(page, binding.chart.id)?.id === group.id,
    );
    const nestedGroups = components.filter(
      (component) =>
        component.type === 'WebRepeatingGroup' &&
        repeatingGroupForComponent(page, component.id)?.id === group.id,
    );
    const idExpression = (component: ComponentNode): string =>
      isReusable ? `this.componentId(${quoted(component.id)})` : quoted(component.id);
    const rowComponent = (component: ComponentNode): string =>
      `${rowName}.component<${componentMemberType(component, apiClientTypes.typeByComponentId)}>(${idExpression(component)})`;
    lines.push(
      `${indent}${depth === 0 ? '' : 'dispose.push('}${expression}.subscribeRows((${rowName}) => {`,
      `${indent}  const dispose: Array<() => void> = [];`,
    );
    for (const binding of rowListBindings)
      lines.push(
        `${indent}  ${rowComponent(binding.grid)}.bindApiClient(this.${binding.apiClient.name});`,
      );
    for (const binding of rowChartBindings)
      lines.push(
        `${indent}  dispose.push(${rowComponent(binding.chart)}.bindApiClient(this.${binding.apiClient.name}, ${quoted(binding.operationId)}, ${quoted(binding.seriesId)}));`,
      );
    for (const event of rowEvents)
      lines.push(
        `${indent}  dispose.push(this.bindGeneratedEvent(${rowComponent(event.component)}, ${quoted(event.eventName)}, ${quoted(event.handlerName)}, ${rowName}));`,
      );
    for (const nested of nestedGroups)
      appendRowSubscription(nested, rowComponent(nested), indent + '  ', depth + 1);
    lines.push(
      `${indent}  return () => { for (const release of dispose) release(); };`,
      `${indent}})${depth === 0 ? ';' : ');'}`,
    );
  };
  for (const group of components.filter(
    (component) =>
      component.type === 'WebRepeatingGroup' &&
      repeatingGroupForComponent(page, component.id) === undefined,
  ))
    appendRowSubscription(group, `this.${group.name}`, '    ', 0);
  lines.push('  }');
  const boundComboBoxes = gridBindings.filter(
    (binding) =>
      binding.grid.type === 'WebComboBox' &&
      repeatingGroupForComponent(page, binding.grid.id) === undefined,
  );
  const rootGroups = components.filter(
    (component) =>
      component.type === 'WebRepeatingGroup' &&
      repeatingGroupForComponent(page, component.id) === undefined,
  );
  const nonvisualComponents = components.filter(
    (component) => !registry.require(component.type).visual,
  );
  const rootCharts = components.filter(
    (component) =>
      component.type === 'WebCharts' &&
      repeatingGroupForComponent(page, component.id) === undefined,
  );
  if (
    boundComboBoxes.length > 0 ||
    nonvisualComponents.length > 0 ||
    rootGroups.length > 0 ||
    rootCharts.length > 0
  ) {
    lines.push('', '  public override dispose(): void {');
    for (const binding of boundComboBoxes) lines.push(`    this.${binding.grid.name}.dispose();`);
    for (const group of rootGroups) lines.push(`    this.${group.name}.dispose();`);
    for (const chart of rootCharts) lines.push(`    this.${chart.name}.dispose();`);
    for (const component of nonvisualComponents)
      lines.push(`    this.${component.name}.dispose();`);
    lines.push('    super.dispose();', '  }');
  }
  lines.push('}', '');
  if (apiClientTypes.declarations.length > 0) lines.push(...apiClientTypes.declarations);

  return normalizeRuntimeImports(`${lines.join('\n')}\n`);
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

function menuDefinitionImports(
  document: PageModel,
  menus: readonly MenuDefinitionModel[] = [],
  typeOnly: boolean,
): string[] {
  return menus.flatMap((menu, index) =>
    document.components.some(
      (node) => node.type === 'WebMenu' && node.props.menuDefinitionId === menu.id,
    )
      ? [
          `import ${typeOnly ? 'type ' : ''}{ ${pageClassName(menu.name)} as WebRadMenuDefinition${String(index)} } from '../menus/${menu.name}';`,
        ]
      : [],
  );
}

/** A Menu definition has a concrete WebMenu root, without a structural wrapper. */
export function generateMenuSource(menuInput: MenuDefinitionModel): string {
  const menu = MenuDefinitionModelSchema.parse(menuInput);
  const root = menu.components.find((node) => node.id === menu.rootComponentId);
  if (!root || menu.components.length !== 1)
    throw new LanguageGenerationError('A Menu definition must have one root.');
  const bindings = Object.entries(root.events).flatMap(([name, handler]) =>
    handler === null ? [] : [`    this.bindDefinitionEvent(${quoted(name)}, ${quoted(handler)});`],
  );
  return [
    '// Generated by WebRAD. Changes to this file will be replaced.',
    "import { WebMenu } from '@webrad/runtime';",
    '',
    `export abstract class ${generatedClassName(menu, 'Generated')} extends WebMenu {`,
    '  public constructor(element: HTMLElement) {',
    '    super(element);',
    ...bindings,
    '  }',
    '}',
    '',
  ].join('\n');
}

export function generateMenuTypings(menuInput: MenuDefinitionModel): string {
  const menu = MenuDefinitionModelSchema.parse(menuInput);
  return [
    '// Generated by WebRAD for editor type information.',
    `${COMPONENT_SCOPE_PREFIX}${JSON.stringify({ ...componentReferenceScope(menu), generatedClassName: generatedClassName(menu, 'Generated') })}`,
    "import type { WebMenu } from '@webrad/runtime';",
    `export declare abstract class ${generatedClassName(menu, 'Generated')} extends WebMenu {`,
    '  public constructor(element: HTMLElement);',
    '}',
    '',
  ].join('\n');
}

export function createUserMenuSource(menu: MenuDefinitionModel): string {
  return createUserDocumentSource(menu, 'menu');
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
  const apiClientTypes = documentTypeDeclarations(page, options.menus);
  const isReusable = kind === 'reusable';
  const baseClass = isReusable ? 'WebReusableElementInstance' : 'WebPage';
  const constructorParameters = isReusable
    ? 'element: HTMLElement, instanceId: string, componentElements: ReadonlyMap<string, WebComponent>, componentIds: ReadonlyMap<string, string>'
    : 'element: HTMLElement';
  const lines = [
    '// Generated by WebRAD for editor type information.',
    `${COMPONENT_SCOPE_PREFIX}${JSON.stringify({ ...componentReferenceScope(page), generatedClassName: className })}`,
    `import type { ${runtimeTypes(page, kind).join(', ')} } from ${quoted(runtimeModule)};`,
    ...menuDefinitionImports(page, options.menus, true),
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
  const lines = [
    `import { ${className} } from './${page.name}.generated';`,
    '',
    `export class ${pageClassName(page.name)} extends ${className} {`,
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
