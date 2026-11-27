import type {
  WebGraphQLOperationKind,
  WebGraphQLParameter,
  WebGraphQLRuntimeOperation,
  WebGraphQLSelection,
  WebGraphQLValue,
} from '@webrad/runtime';
import { z } from 'zod';
import { WEB_DATA_GRID_LABEL_MAX_LENGTH } from '@webrad/runtime/data-grid-labels';
import { ApiClientResponseSchemaSchema, type ApiClientResponseSchema } from './api-client.js';
import type { ComponentNode } from './types.js';

export const GraphQLClientOperationIdsSchema = z
  .array(z.string().trim().min(1).max(200))
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'GraphQL operation IDs must be unique within a client.',
  );

export const GraphQLClientConfigurationSchema = z.union([
  GraphQLClientOperationIdsSchema,
  z
    .object({
      endpoint: z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,29}:[_A-Za-z][_0-9A-Za-z]{0,255}$/)
        .nullable(),
    })
    .strict(),
]);

export type GraphQLClientConfiguration = z.infer<typeof GraphQLClientConfigurationSchema>;

export function graphQLClientConfiguration(component: ComponentNode): GraphQLClientConfiguration {
  return component.type === 'WebGraphQLClient'
    ? (GraphQLClientConfigurationSchema.safeParse(component.props.graphQLOperationIds).data ?? [])
    : [];
}

/** Explicit IDs stored by clients configured before endpoint selection. */
export function graphQLClientOperationIds(component: ComponentNode): readonly string[] {
  const configuration = graphQLClientConfiguration(component);
  return Array.isArray(configuration) ? configuration : [];
}

export function graphQLEndpointKey(database: string, table: string): string {
  return `${database}:${table}`;
}

export function graphQLEndpointName(operation: ProjectGraphQLOperation): string {
  return operation.endpointName ?? operation.runtime.table;
}

export interface ProjectGraphQLEndpoint {
  readonly key: string;
  readonly name: string;
  readonly database: string;
  readonly table: string;
  readonly operations: readonly ProjectGraphQLOperation[];
}

export function groupGraphQLEndpoints(
  operations: readonly ProjectGraphQLOperation[],
): readonly ProjectGraphQLEndpoint[] {
  const groups = new Map<
    string,
    ProjectGraphQLEndpoint & { operations: ProjectGraphQLOperation[] }
  >();
  for (const operation of operations) {
    const { database, runtime } = operation;
    const { table } = runtime;
    const key = graphQLEndpointKey(database, table);
    const group = groups.get(key);
    if (group) group.operations.push(operation);
    else {
      groups.set(key, {
        key,
        name: graphQLEndpointName(operation),
        database,
        table,
        operations: [operation],
      });
    }
  }
  return [...groups.values()];
}

export function selectComponentGraphQLOperations(
  component: ComponentNode,
  operations: readonly ProjectGraphQLOperation[],
): readonly ProjectGraphQLOperation[] {
  if (operations.length === 0) return [];
  const configuration = graphQLClientConfiguration(component);
  if (!Array.isArray(configuration)) {
    return operations.filter(
      ({ database, runtime }) =>
        graphQLEndpointKey(database, runtime.table) === configuration.endpoint,
    );
  }
  const ids = new Set(configuration);
  return operations.filter(({ id }) => ids.has(id));
}

export interface GraphQLCondition {
  readonly field: string;
  readonly operator: string;
  readonly parameter: string;
  readonly required: boolean;
  readonly defaultValue?: WebGraphQLValue;
}

export interface GraphQLConditionGroup {
  readonly logic: 'and' | 'or';
  readonly items: readonly (GraphQLCondition | GraphQLConditionGroup)[];
}

export interface GraphQLInput {
  readonly field: string;
  readonly parameter: string;
  readonly required: boolean;
  readonly defaultValue?: WebGraphQLValue;
}

export interface GraphQLOrderBy {
  readonly field: string;
  readonly direction: string;
}

export interface GraphQLOperationSpec {
  readonly kind: WebGraphQLOperationKind;
  readonly rootField: string;
  /** Dot-separated paths into the published type; connection wrappers are added automatically. */
  readonly selectionPaths: readonly string[];
  readonly conditions: GraphQLConditionGroup;
  readonly orderBy: readonly GraphQLOrderBy[];
  readonly inputs: readonly GraphQLInput[];
  readonly pageSize: number;
}

export interface ProjectGraphQLOperationDraft {
  readonly id: string;
  readonly name: string;
  readonly database: string;
  readonly spec: GraphQLOperationSpec;
}

/** A project-local operation with the generated document and result contract for offline builds. */
export interface ProjectGraphQLOperation extends ProjectGraphQLOperationDraft {
  /** Display name shared by the actions configured for this database and table. */
  readonly endpointName?: string;
  readonly runtime: WebGraphQLRuntimeOperation;
  /** Result records have the same normalized shape as runtime rows. */
  readonly responseSchema: ApiClientResponseSchema;
}

export const GraphQLNameSchema = z
  .string()
  .max(256)
  .regex(/^[_A-Za-z][_0-9A-Za-z]*$/);
const databaseSlug = z.string().regex(/^[a-z][a-z0-9_]{0,29}$/);
const operationKind = z.enum(['query', 'insert', 'update', 'delete']);
const scalarKind = z.enum(['string', 'number', 'integer', 'boolean', 'json']);
const id = z.string().trim().min(1).max(128);
const fieldPath = z
  .string()
  .max(4096)
  .regex(/^[_A-Za-z][_0-9A-Za-z]*(?:\.[_A-Za-z][_0-9A-Za-z]*)*$/);
const variable = {
  parameter: GraphQLNameSchema.refine((name) => name !== '_wrFirst' && name !== '_wrAfter', {
    message: 'Choose a parameter name other than _wrFirst or _wrAfter.',
  }),
  required: z.boolean(),
  defaultValue: z.json().optional(),
};
const conditionSchema = z
  .object({ field: GraphQLNameSchema, operator: GraphQLNameSchema, ...variable })
  .strict();
const conditionGroup: z.ZodType<GraphQLConditionGroup> = z.lazy(() =>
  z
    .object({
      logic: z.enum(['and', 'or']),
      items: z.array(z.union([conditionSchema, conditionGroup])).max(100),
    })
    .strict(),
);

const specSchema: z.ZodType<GraphQLOperationSpec> = z
  .object({
    kind: operationKind,
    rootField: GraphQLNameSchema,
    selectionPaths: z.array(fieldPath).max(1000),
    conditions: conditionGroup,
    orderBy: z
      .array(z.object({ field: GraphQLNameSchema, direction: GraphQLNameSchema }).strict())
      .max(100),
    inputs: z.array(z.object({ field: GraphQLNameSchema, ...variable }).strict()).max(100),
    pageSize: z.number().int().min(1).max(100),
  })
  .strict();

export const ProjectGraphQLOperationDraftSchema: z.ZodType<ProjectGraphQLOperationDraft> = z
  .object({ id, name: GraphQLNameSchema, database: databaseSlug, spec: specSchema })
  .strict();

function isGraphQLTypeReference(value: string): boolean {
  const type = value.endsWith('!') ? value.slice(0, -1) : value;
  return type.startsWith('[') && type.endsWith(']')
    ? isGraphQLTypeReference(type.slice(1, -1))
    : GraphQLNameSchema.safeParse(type).success;
}

const parameterSchema: z.ZodType<WebGraphQLParameter> = z
  .object({
    name: variable.parameter,
    type: z.string().min(1).max(260).refine(isGraphQLTypeReference),
    kind: scalarKind,
    required: z.boolean(),
    enumValues: z.array(GraphQLNameSchema).max(1000),
    defaultValue: z.json().optional(),
    source: z
      .object({
        role: z.enum(['filter', 'input']),
        fieldPath: z
          .string()
          .regex(/^\/[_A-Za-z][_0-9A-Za-z]*$/)
          .max(257),
        operator: GraphQLNameSchema.optional(),
        identityEligible: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()
  .refine(({ required, type }) => required === type.endsWith('!'), {
    message: 'The parameter required flag must match its GraphQL type.',
  });
const selectionSchema: z.ZodType<WebGraphQLSelection> = z.lazy(() =>
  z
    .object({
      name: GraphQLNameSchema,
      kind: z.enum(['object', 'list', 'connection']),
      children: z.array(selectionSchema).max(1000),
    })
    .strict(),
);
const runtimeSchema: z.ZodType<WebGraphQLRuntimeOperation> = z
  .object({
    id,
    name: GraphQLNameSchema,
    database: databaseSlug,
    kind: operationKind,
    rootField: GraphQLNameSchema,
    table: GraphQLNameSchema,
    document: z
      .string()
      .min(1)
      .max(32 * 1024),
    parameters: z.array(parameterSchema).max(200),
    selections: z.array(selectionSchema).max(1000),
    fieldLabels: z
      .record(
        z.string().regex(/^\/[_A-Za-z][_0-9A-Za-z]{0,255}$/),
        z.string().trim().min(1).max(WEB_DATA_GRID_LABEL_MAX_LENGTH),
      )
      .optional(),
    pagination: z
      .object({ defaultSize: z.number().int().min(1), maxSize: z.number().int().min(1).max(100) })
      .strict()
      .refine(({ defaultSize, maxSize }) => defaultSize <= maxSize)
      .optional(),
  })
  .strict();

export const ProjectGraphQLOperationSchema: z.ZodType<ProjectGraphQLOperation> = z
  .object({
    id,
    name: GraphQLNameSchema,
    database: databaseSlug,
    endpointName: z.string().trim().min(1).max(256).optional(),
    spec: specSchema,
    runtime: runtimeSchema,
    responseSchema: ApiClientResponseSchemaSchema,
  })
  .strict()
  .superRefine((operation, context) => {
    const { runtime, spec } = operation;
    if (
      runtime.id !== operation.id ||
      runtime.name !== operation.name ||
      runtime.database !== operation.database ||
      runtime.rootField !== spec.rootField ||
      runtime.kind !== spec.kind ||
      (runtime.pagination !== undefined &&
        (runtime.kind !== 'query' || runtime.pagination.defaultSize !== spec.pageSize))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['runtime'],
        message: 'The generated GraphQL operation does not match its project definition.',
      });
    }
    if (operation.responseSchema.root.kind !== 'list') {
      context.addIssue({
        code: 'custom',
        path: ['responseSchema', 'root'],
        message: 'A GraphQL response contract must describe a list of rows.',
      });
    }
  });

export const ProjectGraphQLOperationsSchema = z
  .array(ProjectGraphQLOperationSchema)
  .superRefine((operations, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const endpointNames = new Map<string, string>();
    operations.forEach((operation, index) => {
      const key = graphQLEndpointKey(operation.database, operation.runtime.table);
      const endpointName = graphQLEndpointName(operation);
      const previousName = endpointNames.get(key);
      if (previousName !== undefined && previousName !== endpointName) {
        context.addIssue({
          code: 'custom',
          path: [index, 'endpointName'],
          message: 'Actions for the same GraphQL endpoint must share its name.',
        });
      }
      endpointNames.set(key, endpointName);
      for (const [used, property] of [
        [ids, 'id'],
        [names, 'name'],
      ] as const) {
        const value = operation[property];
        if (used.has(value)) {
          context.addIssue({
            code: 'custom',
            path: [index, property],
            message: `Duplicate GraphQL operation ${property} "${value}".`,
          });
        }
        used.add(value);
      }
    });
  });
