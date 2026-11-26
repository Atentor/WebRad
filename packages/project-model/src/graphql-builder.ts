import type {
  WebGraphQLOperationKind,
  WebGraphQLParameter,
  WebGraphQLParameterKind,
  WebGraphQLSelection,
  WebGraphQLValue,
} from '@webrad/runtime';
import { z } from 'zod';
import type { ApiClientFieldType, ApiClientSchemaNode } from './api-client.js';
import {
  GraphQLNameSchema,
  ProjectGraphQLOperationDraftSchema,
  ProjectGraphQLOperationSchema,
  type GraphQLConditionGroup,
  type GraphQLInput,
  type ProjectGraphQLOperation,
  type ProjectGraphQLOperationDraft,
} from './graphql.js';

interface GraphQLTypeRef {
  readonly kind: string;
  readonly name: string | null;
  readonly ofType?: GraphQLTypeRef | null;
}

interface GraphQLInputField {
  readonly name: string;
  readonly type: GraphQLTypeRef;
  readonly defaultValue?: string | null;
}

interface GraphQLField {
  readonly name: string;
  readonly type: GraphQLTypeRef;
  readonly args: readonly GraphQLInputField[];
  readonly description?: string | null;
  readonly isDeprecated?: boolean;
}

interface GraphQLType {
  readonly kind: string;
  readonly name: string;
  readonly fields?: readonly GraphQLField[] | null;
  readonly inputFields?: readonly GraphQLInputField[] | null;
  readonly enumValues?:
    readonly { readonly name: string; readonly isDeprecated?: boolean }[] | null;
}

export interface GraphQLSchema {
  readonly queryType: { readonly name: string } | null;
  readonly mutationType?: { readonly name: string } | null;
  readonly types: readonly GraphQLType[];
}

const typeRefSchema: z.ZodType<GraphQLTypeRef> = z.lazy(() =>
  z.object({
    kind: z.string(),
    name: GraphQLNameSchema.nullable(),
    ofType: typeRefSchema.nullish(),
  }),
);
const inputFieldSchema = z.object({
  name: GraphQLNameSchema,
  type: typeRefSchema,
  defaultValue: z.string().nullish(),
});
const fieldSchema = z.object({
  name: GraphQLNameSchema,
  type: typeRefSchema,
  args: z.array(inputFieldSchema),
  description: z.string().nullish(),
  isDeprecated: z.boolean().optional(),
});
const schemaType = z.object({ name: GraphQLNameSchema });
const graphQLSchema: z.ZodType<GraphQLSchema> = z.object({
  queryType: schemaType.nullable(),
  mutationType: schemaType.nullish(),
  types: z.array(
    z.object({
      kind: z.string(),
      name: GraphQLNameSchema,
      fields: z.array(fieldSchema).nullish(),
      inputFields: z.array(inputFieldSchema).nullish(),
      enumValues: z
        .array(z.object({ name: GraphQLNameSchema, isDeprecated: z.boolean().optional() }))
        .nullish(),
    }),
  ),
});
const schemaEnvelope = z.object({ data: z.object({ __schema: graphQLSchema }) });

/** Read a RestGo admin schema response, including the response saved across IPC. */
export function readGraphQLSchema(value: unknown): GraphQLSchema {
  const result = schemaEnvelope.safeParse(value);
  if (result.success) return result.data.data.__schema;
  const direct = graphQLSchema.safeParse(value);
  if (direct.success) return direct.data;
  throw new Error('RestGo did not return a valid published GraphQL schema.');
}

export interface GraphQLValueChoice {
  readonly type: string;
  readonly kind: WebGraphQLParameterKind;
  readonly enumValues: readonly string[];
  readonly list: boolean;
  readonly nullable: boolean;
}

export interface GraphQLSelectionChoice extends GraphQLValueChoice {
  readonly path: string;
  readonly label: string;
}

export interface GraphQLFilterChoice {
  readonly field: string;
  readonly operators: readonly (GraphQLValueChoice & { readonly operator: string })[];
}

export interface GraphQLOrderChoice {
  readonly field: string;
  readonly directions: readonly string[];
}

export interface GraphQLInputChoice extends GraphQLValueChoice {
  readonly field: string;
  readonly required: boolean;
}

export interface GraphQLOperationChoice {
  readonly rootField: string;
  readonly table: string;
  readonly description: string;
  readonly selection: readonly GraphQLSelectionChoice[];
  readonly filters: readonly GraphQLFilterChoice[];
  readonly orderBy: readonly GraphQLOrderChoice[];
  readonly inputs: readonly GraphQLInputChoice[];
  readonly supportsAnd: boolean;
  readonly supportsOr: boolean;
  readonly pagination: boolean;
}

type SchemaLookup = ReadonlyMap<string, GraphQLType>;
type ObjectSelectionKind = 'object' | 'list' | 'connection';

interface Selection {
  readonly field: GraphQLField;
  readonly nested?: {
    readonly kind: ObjectSelectionKind;
    readonly type: GraphQLType;
  };
  readonly children: ReadonlyMap<string, Selection>;
}

function describeType(ref: GraphQLTypeRef): string {
  if (ref.kind === 'NON_NULL' && ref.ofType) return `${describeType(ref.ofType)}!`;
  if (ref.kind === 'LIST' && ref.ofType) return `[${describeType(ref.ofType)}]`;
  if (ref.name) return ref.name;
  throw new Error('The published GraphQL schema contains an incomplete type.');
}

function unwrapNonNull(ref: GraphQLTypeRef): GraphQLTypeRef {
  return ref.kind === 'NON_NULL' && ref.ofType ? ref.ofType : ref;
}

function namedType(ref: GraphQLTypeRef): string | null {
  return ref.name ?? (ref.ofType ? namedType(ref.ofType) : null);
}

function lookupType(index: SchemaLookup, ref: GraphQLTypeRef | undefined): GraphQLType | undefined {
  const name = ref ? namedType(ref) : null;
  return name ? index.get(name) : undefined;
}

function outputField(type: GraphQLType | undefined, name: string): GraphQLField | undefined {
  return type?.fields?.find((field) => field.name === name);
}

function arg(field: GraphQLField, name: string): GraphQLInputField | undefined {
  return field.args.find((candidate) => candidate.name === name);
}

function isRequired(field: GraphQLInputField): boolean {
  return field.type.kind === 'NON_NULL' && field.defaultValue == null;
}

function connectionNode(index: SchemaLookup, field: GraphQLField): GraphQLType | undefined {
  const edges = outputField(lookupType(index, field.type), 'edges');
  return lookupType(index, outputField(lookupType(index, edges?.type), 'node')?.type);
}

function scalarKind(type: GraphQLType | undefined): WebGraphQLParameterKind {
  if (type?.kind === 'ENUM') return 'string';
  if (type?.kind !== 'SCALAR') return 'json';
  switch (type.name) {
    case 'Int':
      return 'integer';
    case 'Float':
      return 'number';
    case 'Boolean':
      return 'boolean';
    case 'ID':
    case 'String':
    case 'UUID':
    case 'Date':
    case 'Datetime':
    case 'DateTime':
    case 'Time':
    case 'Cursor':
    case 'BigInt':
    case 'BigFloat':
      return 'string';
    default:
      return 'json';
  }
}

function valueChoice(index: SchemaLookup, ref: GraphQLTypeRef): GraphQLValueChoice {
  const type = lookupType(index, ref);
  return {
    type: describeType(ref),
    kind: scalarKind(type),
    enumValues:
      type?.enumValues?.filter((value) => !value.isDeprecated).map(({ name }) => name) ?? [],
    list: unwrapNonNull(ref).kind === 'LIST',
    nullable: ref.kind !== 'NON_NULL',
  };
}

function selectableFields(
  index: SchemaLookup,
  type: GraphQLType | undefined,
): readonly Pick<Selection, 'field' | 'nested'>[] {
  return (type?.fields ?? []).flatMap<Pick<Selection, 'field' | 'nested'>>((field) => {
    if (field.isDeprecated || field.name.startsWith('__') || field.args.some(isRequired)) return [];
    const type = lookupType(index, field.type);
    if (!type) return [];
    if (type.kind === 'SCALAR' || type.kind === 'ENUM') return [{ field }];
    if (type.kind !== 'OBJECT') return [];
    const node = connectionNode(index, field);
    const kind: ObjectSelectionKind = node
      ? 'connection'
      : unwrapNonNull(field.type).kind === 'LIST'
        ? 'list'
        : 'object';
    return [{ field, nested: { kind, type: node ?? type } }];
  });
}

function selectionChoices(
  index: SchemaLookup,
  type: GraphQLType | undefined,
): GraphQLSelectionChoice[] {
  const result: GraphQLSelectionChoice[] = [];
  function visit(
    current: GraphQLType | undefined,
    path: readonly string[],
    remainingDepth: number,
  ): void {
    for (const { field, nested } of selectableFields(index, current)) {
      if (result.length >= 1000) break;
      const nextPath = [...path, field.name];
      if (!nested) {
        result.push({
          ...valueChoice(index, field.type),
          path: nextPath.join('.'),
          label: nextPath.join(' › '),
        });
      } else if (remainingDepth > 0) {
        visit(nested.type, nextPath, remainingDepth - (nested.kind === 'connection' ? 2 : 1));
      }
    }
  }
  visit(type, [], 4);
  return result;
}

function recordsField(index: SchemaLookup, field: GraphQLField): GraphQLField | undefined {
  return outputField(lookupType(index, field.type), 'records');
}

const mutationPrefixes = { insert: 'insertInto', update: 'update', delete: 'deleteFrom' } as const;

function roots(
  index: SchemaLookup,
  schema: GraphQLSchema,
  kind: WebGraphQLOperationKind,
): readonly GraphQLField[] {
  const rootName = (kind === 'query' ? schema.queryType : schema.mutationType)?.name;
  const fields = rootName ? (index.get(rootName)?.fields ?? []) : [];
  return fields.filter((field) => {
    if (field.isDeprecated) return false;
    if (kind === 'query') return !!connectionNode(index, field);
    if (!field.name.startsWith(mutationPrefixes[kind]) || !field.name.endsWith('Collection'))
      return false;
    if (!outputField(lookupType(index, field.type), 'affectedCount')) return false;
    if (kind === 'insert') return !!arg(field, 'objects');
    return !!(
      arg(field, 'filter') &&
      arg(field, 'atMost') &&
      (kind !== 'update' || arg(field, 'set'))
    );
  });
}

function operationRecord(
  index: SchemaLookup,
  field: GraphQLField,
  kind: WebGraphQLOperationKind,
): GraphQLType | undefined {
  return kind === 'query'
    ? connectionNode(index, field)
    : lookupType(index, recordsField(index, field)?.type);
}

function describeOperation(
  index: SchemaLookup,
  schema: GraphQLSchema,
  field: GraphQLField,
  kind: WebGraphQLOperationKind,
): GraphQLOperationChoice {
  const record = operationRecord(index, field, kind);
  const filter = lookupType(index, arg(field, 'filter')?.type);
  const orders = kind === 'query' ? lookupType(index, arg(field, 'orderBy')?.type) : undefined;
  const input =
    kind === 'insert' || kind === 'update'
      ? lookupType(index, arg(field, kind === 'insert' ? 'objects' : 'set')?.type)
      : undefined;
  const connection = lookupType(index, field.type);
  const pageInfo = lookupType(index, outputField(connection, 'pageInfo')?.type);
  const after = arg(field, 'after');
  const pagination =
    kind === 'query' &&
    !!arg(field, 'first') &&
    !!after &&
    !isRequired(after) &&
    !!outputField(pageInfo, 'endCursor') &&
    !!outputField(pageInfo, 'hasNextPage');
  const logical = (name: string): boolean =>
    filter !== undefined &&
    (filter.inputFields?.some(
      (item) =>
        item.name === name &&
        namedType(item.type) === filter.name &&
        unwrapNonNull(item.type).kind === 'LIST',
    ) ??
      false);
  const collectionName =
    kind === 'query' ? field.name : field.name.slice(mutationPrefixes[kind].length);
  const sameCollection = record
    ? undefined
    : roots(index, schema, 'query').find(
        (candidate) => candidate.name.toLowerCase() === collectionName.toLowerCase(),
      );
  let selection: GraphQLSelectionChoice[] | undefined;
  return {
    rootField: field.name,
    table:
      record?.name ??
      (sameCollection && connectionNode(index, sameCollection)?.name) ??
      collectionName,
    description: field.description ?? '',
    get selection() {
      return (selection ??= selectionChoices(index, record));
    },
    filters: (filter?.inputFields ?? []).flatMap((item) => {
      const type = lookupType(index, item.type);
      const operators = type === filter ? [] : (type?.inputFields ?? []);
      return operators.length > 0
        ? [
            {
              field: item.name,
              operators: operators.map((operator) => ({
                ...valueChoice(index, operator.type),
                operator: operator.name,
              })),
            },
          ]
        : [];
    }),
    orderBy: (orders?.inputFields ?? []).flatMap((item) => {
      const directions = valueChoice(index, item.type).enumValues;
      return directions.length > 0 ? [{ field: item.name, directions }] : [];
    }),
    inputs: (input?.inputFields ?? []).map((item) => ({
      ...valueChoice(index, item.type),
      field: item.name,
      required: isRequired(item),
    })),
    supportsAnd: logical('and'),
    supportsOr: logical('or'),
    pagination,
  };
}

/** List the generated operations and only fields that the published schema actually exposes. */
export function describeGraphQLOperations(
  schema: GraphQLSchema,
  kind: WebGraphQLOperationKind,
): readonly GraphQLOperationChoice[] {
  const index = new Map(schema.types.map((type) => [type.name, type]));
  return roots(index, schema, kind).map((field) => describeOperation(index, schema, field, kind));
}

function selectPaths(
  index: SchemaLookup,
  root: GraphQLType | undefined,
  paths: readonly string[],
): ReadonlyMap<string, Selection> {
  const selection = new Map<string, Selection>();
  function add(
    current: Map<string, Selection>,
    type: GraphQLType | undefined,
    parts: readonly string[],
    path: string,
  ): void {
    const [name, ...rest] = parts;
    const available = selectableFields(index, type).find(({ field }) => field.name === name);
    if (!name || !available || rest.length > 0 !== !!available.nested) {
      throw new Error(`Published field "${path}" is unavailable.`);
    }
    const selected = current.get(name);
    const children = new Map(selected?.children);
    if (available.nested) add(children, available.nested.type, rest, path);
    current.set(name, { ...available, children });
  }
  for (const path of paths) add(selection, root, path.split('.'), path);
  return selection;
}

function selectionDocument(selection: ReadonlyMap<string, Selection>): string {
  return [...selection.values()]
    .map(({ field, nested, children }) => {
      if (!nested) return field.name;
      const subtree = selectionDocument(children);
      return nested.kind === 'connection'
        ? `${field.name} { edges { node { ${subtree} } } }`
        : `${field.name} { ${subtree} }`;
    })
    .join(' ');
}

function selectionProjection(selection: ReadonlyMap<string, Selection>): WebGraphQLSelection[] {
  return [...selection.values()].flatMap(({ field, nested, children }) =>
    nested
      ? [{ name: field.name, kind: nested.kind, children: selectionProjection(children) }]
      : [],
  );
}

function responseFieldType(index: SchemaLookup, ref: GraphQLTypeRef): ApiClientFieldType {
  const type = lookupType(index, ref);
  if (type?.name === 'Date') return 'date';
  if (type?.name === 'Datetime' || type?.name === 'DateTime') return 'datetime';
  const kind = scalarKind(type);
  return kind === 'json' ? 'unknown' : kind;
}

function responseSchemaRoot(
  index: SchemaLookup,
  selection: ReadonlyMap<string, Selection>,
): ApiClientSchemaNode {
  let sequence = 0;
  const nodeId = (): string => `graphql-result-${++sequence}`;
  function leaf(name: string, path: string, ref: GraphQLTypeRef): ApiClientSchemaNode {
    const type = unwrapNonNull(ref);
    const nullable = ref.kind !== 'NON_NULL';
    if (type.kind === 'LIST' && type.ofType) {
      return {
        id: nodeId(),
        name,
        path,
        kind: 'list',
        fieldType: 'list',
        nullable,
        children: [leaf('$item', `${path}/*`, type.ofType)],
      };
    }
    return {
      id: nodeId(),
      name,
      path,
      kind: 'field',
      fieldType: responseFieldType(index, ref),
      nullable,
      children: [],
    };
  }
  function fields(path: string, selected: ReadonlyMap<string, Selection>): ApiClientSchemaNode[] {
    return [...selected.values()].map(({ field, nested, children }) => {
      const childPath = `${path}/${field.name}`;
      if (!nested) return leaf(field.name, childPath, field.type);
      const nullable = field.type.kind !== 'NON_NULL';
      if (nested.kind !== 'object') return list(field.name, childPath, nullable, children);
      return {
        id: nodeId(),
        name: field.name,
        path: childPath,
        kind: 'object',
        fieldType: 'object',
        nullable,
        children: fields(childPath, children),
      };
    });
  }
  function list(
    name: string,
    path: string,
    nullable: boolean,
    selected: ReadonlyMap<string, Selection>,
  ): ApiClientSchemaNode {
    return {
      id: nodeId(),
      name,
      path,
      kind: 'list',
      fieldType: 'list',
      nullable,
      children: fields(`${path}/*`, selected),
    };
  }
  return list('Rows', '', false, selection);
}

function validDefault(value: WebGraphQLValue, type: string, choice: GraphQLValueChoice): boolean {
  if (value === null) return !type.endsWith('!');
  const nullable = type.replace(/!$/, '');
  if (nullable.startsWith('[')) {
    return (
      Array.isArray(value) &&
      value.every((item: WebGraphQLValue) => validDefault(item, nullable.slice(1, -1), choice))
    );
  }
  if (choice.enumValues.length > 0)
    return typeof value === 'string' && choice.enumValues.includes(value);
  if (choice.kind === 'json') return true;
  if (choice.kind === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  return typeof value === choice.kind;
}

/** Compile a declarative edit into the browser operation and stable response choices. */
export function buildProjectGraphQLOperation(
  schema: GraphQLSchema,
  input: ProjectGraphQLOperationDraft,
  maxPageSize = 30,
): ProjectGraphQLOperation {
  const parsed = ProjectGraphQLOperationDraftSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue ? `${issue.path.join('.')}: ${issue.message}` : 'Check the GraphQL operation.',
    );
  }
  const { id, name, database, spec } = parsed.data;
  const index = new Map(schema.types.map((type) => [type.name, type]));
  const field = roots(index, schema, spec.kind).find(
    (candidate) => candidate.name === spec.rootField,
  );
  if (!field) throw new Error(`Published operation "${spec.rootField}" is unavailable.`);
  const choice = describeOperation(index, schema, field, spec.kind);
  const mutation = spec.kind !== 'query';
  const selection = selectPaths(
    index,
    operationRecord(index, field, spec.kind),
    spec.selectionPaths,
  );
  if (!mutation && selection.size === 0) throw new Error('Select at least one field to return.');
  const selected = selectionDocument(selection);
  const variables = new Map<string, WebGraphQLParameter>();
  const declarations: string[] = [];
  const argumentsList: string[] = [];

  function param(
    input: GraphQLInput,
    value: GraphQLValueChoice,
    source: WebGraphQLParameter['source'],
    required: boolean,
  ): string {
    const name = input.parameter;
    if (variables.has(name))
      throw new Error(`Choose a unique name for GraphQL parameter "${name}".`);
    const type = required && value.nullable ? `${value.type}!` : value.type;
    if (input.defaultValue !== undefined && !validDefault(input.defaultValue, type, value)) {
      throw new Error(`Default value for "${name}" must be ${type}.`);
    }
    variables.set(name, {
      name,
      type,
      kind: value.kind,
      required: type.endsWith('!'),
      enumValues: value.enumValues,
      defaultValue: input.defaultValue,
      source,
    });
    declarations.push(`$${name}: ${type}`);
    return `$${name}`;
  }

  function conditions(group: GraphQLConditionGroup, identityEligible: boolean): string {
    if (group.items.length === 0) throw new Error('Add at least one condition to each group.');
    const constrained = identityEligible && (group.logic === 'and' || group.items.length === 1);
    const expressions = group.items.map((item) => {
      if ('items' in item) return conditions(item, constrained);
      const available = choice.filters
        .find(({ field }) => field === item.field)
        ?.operators.find(({ operator }) => operator === item.operator);
      if (!available)
        throw new Error(`Published filter "${item.field}.${item.operator}" is unavailable.`);
      const value = param(
        item,
        available,
        {
          role: 'filter',
          fieldPath: `/${item.field}`,
          operator: item.operator,
          identityEligible: constrained && item.operator === 'eq' && !available.list,
        },
        mutation || item.required,
      );
      return `{ ${item.field}: { ${item.operator}: ${value} } }`;
    });
    if (expressions.length === 1) return expressions[0]!;
    const literal = group.logic === 'and' ? choice.supportsAnd : choice.supportsOr;
    if (!literal) {
      if (
        group.logic === 'and' &&
        group.items.every((item) => !('items' in item)) &&
        new Set(group.items.map((item) => ('field' in item ? item.field : ''))).size ===
          expressions.length
      ) {
        return `{ ${expressions.map((expression) => expression.slice(2, -2)).join(', ')} }`;
      }
      throw new Error(
        `The published schema does not support a group with ${group.logic.toUpperCase()} conditions.`,
      );
    }
    return `{ ${group.logic}: [${expressions.join(', ')}] }`;
  }

  if (spec.conditions.items.length > 0) {
    if (!arg(field, 'filter')) throw new Error('The published operation does not accept filters.');
    argumentsList.push(`filter: ${conditions(spec.conditions, true)}`);
  } else if (spec.kind === 'update' || spec.kind === 'delete') {
    throw new Error('Add a condition that identifies the record to change.');
  }

  if (spec.kind === 'insert' || spec.kind === 'update') {
    const fields = new Set(spec.inputs.map(({ field }) => field));
    if (fields.size !== spec.inputs.length)
      throw new Error('Each write field can be selected once.');
    const missing = choice.inputs.find(({ required, field }) => required && !fields.has(field));
    if (missing) throw new Error(`Select a value for required write field "${missing.field}".`);
    if (spec.kind === 'update' && spec.inputs.length === 0)
      throw new Error('Select at least one field to update.');
    const values = spec.inputs
      .map((input) => {
        const available = choice.inputs.find(({ field }) => field === input.field);
        if (!available) throw new Error(`Published write field "${input.field}" is unavailable.`);
        return `${input.field}: ${param(input, available, { role: 'input', fieldPath: `/${input.field}` }, input.required || available.required)}`;
      })
      .join(', ');
    argumentsList.push(spec.kind === 'insert' ? `objects: [{ ${values} }]` : `set: { ${values} }`);
  } else if (spec.inputs.length > 0) {
    throw new Error('The published operation does not accept write values.');
  }

  if (spec.kind === 'update' || spec.kind === 'delete') argumentsList.push('atMost: 1');
  if (spec.orderBy.length > 0) {
    const seen = new Set<string>();
    const order = spec.orderBy.map(({ field, direction }) => {
      if (!choice.orderBy.find((item) => item.field === field)?.directions.includes(direction)) {
        throw new Error(`Published ordering "${field} ${direction}" is unavailable.`);
      }
      if (seen.has(field)) throw new Error(`Order field "${field}" can be selected once.`);
      seen.add(field);
      return `{ ${field}: ${direction} }`;
    });
    argumentsList.push(`orderBy: [${order.join(', ')}]`);
  }

  const pagination = choice.pagination
    ? { defaultSize: spec.pageSize, maxSize: maxPageSize }
    : undefined;
  if (pagination) {
    if (!Number.isInteger(maxPageSize) || maxPageSize < 1 || maxPageSize > 100) {
      throw new Error('RestGo returned an invalid maximum page size.');
    }
    if (spec.pageSize > maxPageSize)
      throw new Error(`Choose a page size from 1 to ${maxPageSize}.`);
    const first = arg(field, 'first')!;
    const after = arg(field, 'after')!;
    declarations.push(
      `$_wrFirst: ${describeType(unwrapNonNull(first.type))}!`,
      `$_wrAfter: ${describeType(after.type)}`,
    );
    argumentsList.push('first: $_wrFirst', 'after: $_wrAfter');
  }
  const count = !!outputField(lookupType(index, field.type), 'totalCount');
  const resultFields = mutation
    ? `affectedCount${selected ? ` records { ${selected} }` : ''}`
    : `edges { node { ${selected} } }${pagination ? ' pageInfo { endCursor hasNextPage }' : ''}${count ? ' totalCount' : ''}`;
  const document = `${mutation ? 'mutation' : 'query'} ${name}${declarations.length ? `(${declarations.join(', ')})` : ''} {\n  ${field.name}${argumentsList.length ? `(${argumentsList.join(', ')})` : ''} { ${resultFields} }\n}`;
  return ProjectGraphQLOperationSchema.parse({
    id,
    name,
    database,
    spec,
    runtime: {
      id,
      name,
      database,
      kind: spec.kind,
      rootField: field.name,
      table: choice.table,
      document,
      parameters: [...variables.values()],
      selections: selectionProjection(selection),
      pagination,
    },
    responseSchema: { version: 1, root: responseSchemaRoot(index, selection) },
  });
}
