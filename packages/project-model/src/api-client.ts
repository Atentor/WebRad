import { z } from 'zod';

import { getTypeScriptIdentifierError } from './naming.js';

/**
 * Version of the API Client configuration stored inside a component's props.
 * It is deliberately independent from the project format version: adding an
 * optional configuration keeps existing v2 projects readable.
 */
export const API_CLIENT_CONFIGURATION_VERSION = 1 as const;

export const API_CLIENT_BODY_KINDS = ['none', 'json', 'text', 'form-urlencoded'] as const;
export type ApiClientBodyKind = (typeof API_CLIENT_BODY_KINDS)[number];

export const API_CLIENT_CREDENTIALS = ['omit', 'same-origin', 'include'] as const;
export type ApiClientCredentials = (typeof API_CLIENT_CREDENTIALS)[number];

export const API_CLIENT_SCHEMA_NODE_KINDS = ['field', 'object', 'list'] as const;
export type ApiClientSchemaNodeKind = (typeof API_CLIENT_SCHEMA_NODE_KINDS)[number];

export const API_CLIENT_FIELD_TYPES = [
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'datetime',
  'null',
  'unknown',
  'object',
  'list',
] as const;
export type ApiClientFieldType = (typeof API_CLIENT_FIELD_TYPES)[number];

/** A enabled/disabled header or query-string entry stored as JSON. */
export interface ApiClientParameter {
  /** Stable identity lets later bindings survive a label/value edit. */
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly enabled: boolean;
}

export interface ApiClientRequestBody {
  readonly kind: ApiClientBodyKind;
  /** Raw JSON, text, or form-urlencoded content according to `kind`. */
  readonly content: string;
}

/**
 * A saved response-contract tree. Paths use JSON Pointer with a wildcard
 * array-item segment, for example `/data/items/<item>/id`.
 */
export interface ApiClientSchemaNode {
  /** Stable node identity used by future data-bound components. */
  readonly id: string;
  /** API field name; the root is conventionally named `Response`. */
  readonly name: string;
  readonly path: string;
  readonly kind: ApiClientSchemaNodeKind;
  readonly fieldType: ApiClientFieldType;
  readonly nullable: boolean;
  readonly children: readonly ApiClientSchemaNode[];
}

export interface ApiClientResponseSchema {
  readonly version: 1;
  readonly root: ApiClientSchemaNode;
}

/** A named endpoint that can be invoked by the generated WebApiClient. */
export interface ApiClientOperation {
  /** Stable operation identity; do not derive it from the editable name. */
  readonly id: string;
  /** TypeScript-safe public operation name, e.g. `LoadCustomers`. */
  readonly name: string;
  /** Any valid HTTP method token, including custom API methods. */
  readonly method: string;
  /** Relative path, or an absolute URL that overrides the client's base URL. */
  readonly path: string;
  readonly headers: readonly ApiClientParameter[];
  readonly query: readonly ApiClientParameter[];
  readonly body: ApiClientRequestBody;
  readonly credentials: ApiClientCredentials;
  /** `null` inherits the API Client-wide timeout. */
  readonly timeoutMs: number | null;
  /** Only the contract is persisted; sampled API data is never saved. */
  readonly responseSchema: ApiClientResponseSchema | null;
}

/** Complete persisted configuration for the nonvisual API Client component. */
export interface ApiClientConfiguration {
  readonly schemaVersion: typeof API_CLIENT_CONFIGURATION_VERSION;
  readonly defaultHeaders: readonly ApiClientParameter[];
  readonly timeoutMs: number;
  readonly operations: readonly ApiClientOperation[];
}

const stableIdSchema = z.string().trim().min(1).max(200);
const parameterNameSchema = z.string().trim().min(1).max(256);
const parameterValueSchema = z.string().max(32_768);
const operationMethodSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u, 'Expected a valid HTTP method token.');
const operationPathSchema = z.string().max(4_096);
const schemaPathSchema = z
  .string()
  .max(4_096)
  .refine((value) => value.length === 0 || value.startsWith('/'), {
    message: 'A response schema path must be empty or start with "/".',
  });
const operationNameSchema = z.string().trim().min(1).max(120).superRefine((value, context) => {
  const error = getTypeScriptIdentifierError(value);
  if (error !== undefined) context.addIssue({ code: 'custom', message: error });
});

export const ApiClientParameterSchema: z.ZodType<ApiClientParameter> = z
  .object({
    id: stableIdSchema,
    name: parameterNameSchema,
    value: parameterValueSchema,
    enabled: z.boolean(),
  })
  .strict();

export const ApiClientRequestBodySchema: z.ZodType<ApiClientRequestBody> = z
  .object({
    kind: z.enum(API_CLIENT_BODY_KINDS),
    content: z.string().max(1_000_000),
  })
  .strict();

function validateSchemaNode(
  node: ApiClientSchemaNode,
  context: z.RefinementCtx,
): void {
  if (node.kind === 'field' && (node.fieldType === 'object' || node.fieldType === 'list')) {
    context.addIssue({
      code: 'custom',
      message: 'A field node must have a scalar or unknown field type.',
      path: ['fieldType'],
    });
  }
  if (node.kind === 'object' && node.fieldType !== 'object') {
    context.addIssue({
      code: 'custom',
      message: 'An object node must use the object field type.',
      path: ['fieldType'],
    });
  }
  if (node.kind === 'list' && node.fieldType !== 'list') {
    context.addIssue({
      code: 'custom',
      message: 'A list node must use the list field type.',
      path: ['fieldType'],
    });
  }
  if (node.kind === 'field' && node.children.length > 0) {
    context.addIssue({
      code: 'custom',
      message: 'A field node cannot have children.',
      path: ['children'],
    });
  }
}

export const ApiClientSchemaNodeSchema: z.ZodType<ApiClientSchemaNode> = z.lazy(() =>
  z
    .object({
      id: stableIdSchema,
      name: z.string().trim().min(1).max(256),
      path: schemaPathSchema,
      kind: z.enum(API_CLIENT_SCHEMA_NODE_KINDS),
      fieldType: z.enum(API_CLIENT_FIELD_TYPES),
      nullable: z.boolean(),
      children: z.array(ApiClientSchemaNodeSchema).max(2_000),
    })
    .strict()
    .superRefine(validateSchemaNode),
);

function collectSchemaNodeIds(
  node: ApiClientSchemaNode,
  ids: Set<string>,
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void {
  if (ids.has(node.id)) {
    context.addIssue({
      code: 'custom',
      message: `Duplicate response schema node ID "${node.id}".`,
      path: [...path, 'id'],
    });
  }
  ids.add(node.id);
  node.children.forEach((child, index) => collectSchemaNodeIds(child, ids, context, [...path, 'children', index]));
}

export const ApiClientResponseSchemaSchema: z.ZodType<ApiClientResponseSchema> = z
  .object({
    version: z.literal(1),
    root: ApiClientSchemaNodeSchema,
  })
  .strict()
  .superRefine((schema, context) => {
    if (schema.root.path.length !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'The response schema root must use the empty JSON Pointer path.',
        path: ['root', 'path'],
      });
    }
    collectSchemaNodeIds(schema.root, new Set<string>(), context, ['root']);
  });

export const ApiClientOperationSchema: z.ZodType<ApiClientOperation> = z
  .object({
    id: stableIdSchema,
    name: operationNameSchema,
    method: operationMethodSchema,
    path: operationPathSchema,
    headers: z.array(ApiClientParameterSchema).max(200),
    query: z.array(ApiClientParameterSchema).max(200),
    body: ApiClientRequestBodySchema,
    credentials: z.enum(API_CLIENT_CREDENTIALS),
    timeoutMs: z.number().int().min(1).max(120_000).nullable(),
    responseSchema: ApiClientResponseSchemaSchema.nullable(),
  })
  .strict();

export const ApiClientConfigurationSchema: z.ZodType<ApiClientConfiguration> = z
  .object({
    schemaVersion: z.literal(API_CLIENT_CONFIGURATION_VERSION),
    defaultHeaders: z.array(ApiClientParameterSchema).max(200),
    timeoutMs: z.number().int().min(1).max(120_000),
    operations: z.array(ApiClientOperationSchema).min(1).max(100),
  })
  .strict()
  .superRefine((configuration, context) => {
    const operationIds = new Set<string>();
    const operationNames = new Set<string>();
    configuration.operations.forEach((operation, index) => {
      if (operationIds.has(operation.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate API operation ID "${operation.id}".`,
          path: ['operations', index, 'id'],
        });
      }
      operationIds.add(operation.id);
      if (operationNames.has(operation.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate API operation name "${operation.name}".`,
          path: ['operations', index, 'name'],
        });
      }
      operationNames.add(operation.name);
    });
  });

function cloneDefault<T>(value: T): T {
  return structuredClone(value);
}

const DEFAULT_API_CLIENT_CONFIGURATION = Object.freeze({
  schemaVersion: API_CLIENT_CONFIGURATION_VERSION,
  defaultHeaders: [],
  timeoutMs: 30_000,
  operations: [
    {
      id: 'operation-1',
      name: 'Request',
      method: 'GET',
      path: '',
      headers: [],
      query: [],
      body: { kind: 'none', content: '' },
      credentials: 'omit',
      timeoutMs: null,
      responseSchema: null,
    },
  ],
} satisfies ApiClientConfiguration);

/** Returns an independent, fully materialized API Client configuration. */
export function createDefaultApiClientConfiguration(): ApiClientConfiguration {
  return cloneDefault(DEFAULT_API_CLIENT_CONFIGURATION);
}

/**
 * Parses the persisted contract. Use this at persistence/compiler boundaries;
 * UI code can use `normalizeApiClientConfiguration` for legacy components.
 */
export function parseApiClientConfiguration(input: unknown): ApiClientConfiguration {
  return ApiClientConfigurationSchema.parse(input);
}

/**
 * Provides backward-compatible defaults for API Clients saved before the
 * structured contract was introduced.
 */
export function normalizeApiClientConfiguration(input: unknown): ApiClientConfiguration {
  const parsed = ApiClientConfigurationSchema.safeParse(input);
  return parsed.success ? parsed.data : createDefaultApiClientConfiguration();
}
