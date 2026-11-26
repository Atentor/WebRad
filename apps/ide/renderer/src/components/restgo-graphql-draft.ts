import {
  defaultIdFactory,
  describeGraphQLOperations,
  type GraphQLCondition,
  type GraphQLConditionGroup,
  type GraphQLInput,
  type GraphQLOperationChoice,
  type GraphQLOperationSpec,
  type GraphQLSchema,
  type GraphQLValueChoice,
  type ProjectGraphQLEndpoint,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';

export const GRAPHQL_ACTIONS = ['query', 'insert', 'update', 'delete'] as const;
export type GraphQLAction = GraphQLOperationSpec['kind'];
type TableActions<T> = Partial<Record<GraphQLAction, readonly T[]>>;

export interface GraphQLTableDraft {
  readonly name: string;
  readonly database: string;
  readonly table: string;
  readonly fieldLabels: Readonly<Record<string, string>>;
  readonly actions: TableActions<OperationDraft>;
}

export function describeGraphQLTables(
  schema: GraphQLSchema,
): ReadonlyMap<string, TableActions<GraphQLOperationChoice>> {
  const tables = new Map<string, TableActions<GraphQLOperationChoice>>();
  for (const kind of GRAPHQL_ACTIONS) {
    for (const choice of describeGraphQLOperations(schema, kind)) {
      const actions = tables.get(choice.table) ?? {};
      actions[kind] = [...(actions[kind] ?? []), choice];
      tables.set(choice.table, actions);
    }
  }
  return tables;
}

export function editGraphQLTable({
  name,
  database,
  table,
  operations,
}: Omit<ProjectGraphQLEndpoint, 'key'>): GraphQLTableDraft {
  const actions: TableActions<OperationDraft> = {};
  for (const operation of operations) {
    const { kind } = operation.spec;
    actions[kind] = [...(actions[kind] ?? []), editGraphQLOperation(operation)];
  }
  return { name, database, table, actions, fieldLabels: operations[0]?.runtime.fieldLabels ?? {} };
}

export function graphQLActionName(
  endpointName: string,
  kind: GraphQLAction,
  usedNames: ReadonlySet<string>,
): string {
  const identifier = endpointName.replace(/[^_a-zA-Z0-9]+/g, '_').replace(/^([0-9])/, '_$1');
  const base = `${identifier.slice(0, 240)}_${kind}`;
  let name = base;
  for (let number = 2; usedNames.has(name.toLowerCase()); number++) {
    const suffix = `_${number}`;
    name = base + suffix;
  }
  return name;
}

export function newGraphQLAction(
  kind: GraphQLAction,
  choice: GraphQLOperationChoice,
  pageSize: number,
): OperationDraft {
  return { id: defaultIdFactory(), name: '', spec: newGraphQLSpec(kind, pageSize, choice) };
}

export interface ParameterDraft {
  readonly field: string;
  readonly parameter: string;
  readonly required: boolean;
  readonly source: 'application' | 'default' | 'null';
  readonly value: string;
}

export interface ConditionDraft extends ParameterDraft {
  readonly operator: string;
}

export interface ConditionGroupDraft {
  readonly logic: 'and' | 'or';
  readonly items: readonly (ConditionDraft | ConditionGroupDraft)[];
}

export interface OperationDraft {
  readonly id: string;
  readonly name: string;
  readonly spec: Omit<GraphQLOperationSpec, 'conditions' | 'inputs'> & {
    readonly conditions: ConditionGroupDraft;
    readonly inputs: readonly ParameterDraft[];
  };
}

type RuntimeParameters = ProjectGraphQLOperation['runtime']['parameters'];

function parameterDraft(input: GraphQLInput, parameters: RuntimeParameters): ParameterDraft {
  const { field, parameter, required, defaultValue } = input;
  const runtime = parameters.find((item) => item.name === parameter);
  return {
    field,
    parameter,
    required,
    source: defaultValue === undefined ? 'application' : defaultValue === null ? 'null' : 'default',
    value:
      typeof defaultValue === 'string' && runtime?.kind !== 'json'
        ? defaultValue
        : (JSON.stringify(defaultValue) ?? ''),
  };
}

function conditionGroupDraft(
  group: GraphQLConditionGroup,
  parameters: RuntimeParameters,
): ConditionGroupDraft {
  return {
    logic: group.logic,
    items: group.items.map((item) =>
      'items' in item
        ? conditionGroupDraft(item, parameters)
        : { ...parameterDraft(item, parameters), operator: item.operator },
    ),
  };
}

function editGraphQLOperation(operation: ProjectGraphQLOperation): OperationDraft {
  const { id, name, spec, runtime } = operation;
  return {
    id,
    name,
    spec: {
      ...spec,
      conditions: conditionGroupDraft(spec.conditions, runtime.parameters),
      inputs: spec.inputs.map((input) => parameterDraft(input, runtime.parameters)),
    },
  };
}

export function newGraphQLSpec(
  kind: GraphQLOperationSpec['kind'],
  pageSize: number,
  operation: GraphQLOperationChoice,
): OperationDraft['spec'] {
  const fields = kind === 'query' ? operation.selection : [];
  const firstField =
    fields.find(({ path }) => path === 'id') ??
    fields.find(({ path }) => !path.includes('.')) ??
    fields[0];
  return {
    kind,
    pageSize,
    rootField: operation.rootField,
    selectionPaths: firstField ? [firstField.path] : [],
    conditions: { logic: 'and', items: [] },
    orderBy: [],
    inputs: operation.inputs
      .filter((input) => input.required)
      .map((input) => newGraphQLParameter(input.field, input.required)),
  };
}

export function newGraphQLParameter(field: string, required = true): ParameterDraft {
  return { field, parameter: field, required, source: 'application', value: '' };
}

function parseParameterValue(
  draft: ParameterDraft,
  choice: GraphQLValueChoice,
): GraphQLInput['defaultValue'] {
  if (draft.source === 'application') return undefined;
  if (draft.source === 'null') return null;
  const value = draft.value;
  if (choice.list || choice.kind === 'json') {
    try {
      const parsed = JSON.parse(value) as GraphQLInput['defaultValue'];
      if (choice.list && !Array.isArray(parsed)) throw new Error('expected a list');
      return parsed;
    } catch {
      throw new Error(
        `Enter a valid JSON ${choice.list ? 'list' : 'value'} for ${draft.parameter}.`,
      );
    }
  }
  if (choice.kind === 'boolean') return value === 'true';
  if (choice.kind === 'number' || choice.kind === 'integer') {
    const number = Number(value);
    if (
      !value.trim() ||
      !Number.isFinite(number) ||
      (choice.kind === 'integer' && !Number.isInteger(number))
    ) {
      throw new Error(
        `Enter a valid ${choice.kind === 'integer' ? 'integer' : 'number'} for ${draft.parameter}.`,
      );
    }
    return number;
  }
  return value;
}

function buildParameter(
  draft: ParameterDraft,
  choice: GraphQLValueChoice | undefined,
): GraphQLInput {
  if (!choice) throw new Error(`The published schema no longer accepts ${draft.field}.`);
  const { field, required } = draft;
  const parameter = draft.parameter.trim();
  const defaultValue = parseParameterValue(draft, choice);
  return { field, parameter, required, ...(defaultValue === undefined ? {} : { defaultValue }) };
}

function buildConditions(
  group: ConditionGroupDraft,
  operation: GraphQLOperationChoice,
): GraphQLConditionGroup {
  return {
    logic: group.logic,
    items: group.items.map((item): GraphQLCondition | GraphQLConditionGroup => {
      if ('items' in item) return buildConditions(item, operation);
      const filter = operation.filters.find((candidate) => candidate.field === item.field);
      return {
        ...buildParameter(
          item,
          filter?.operators.find((candidate) => candidate.operator === item.operator),
        ),
        operator: item.operator,
      };
    }),
  };
}

export function buildGraphQLSpec(
  draft: OperationDraft['spec'],
  operation: GraphQLOperationChoice,
): GraphQLOperationSpec {
  return {
    ...draft,
    conditions: buildConditions(draft.conditions, operation),
    inputs: draft.inputs.map((input) =>
      buildParameter(
        input,
        operation.inputs.find((choice) => choice.field === input.field),
      ),
    ),
  };
}
