import type { RestGoClient } from '@webrad/restgo-sdk';
import { WebNonvisualComponent, type WebNonvisualComponentOptions } from './component.js';
import { getRestGoClient, RestGoNotConfiguredError, subscribeRestGoClient } from './restgo.js';

export type WebGraphQLValue =
  | string
  | number
  | boolean
  | null
  | readonly WebGraphQLValue[]
  | { readonly [key: string]: WebGraphQLValue };
export type WebGraphQLRow = Readonly<Record<string, WebGraphQLValue>>;
export type WebGraphQLParameters = Readonly<Record<string, WebGraphQLValue | undefined>>;
export type WebGraphQLOperationKind = 'query' | 'insert' | 'update' | 'delete';
export type WebGraphQLParameterKind = 'string' | 'number' | 'integer' | 'boolean' | 'json';

export interface WebGraphQLParameter {
  readonly name: string;
  /** GraphQL type notation, including list and non-null wrappers. */
  readonly type: string;
  readonly kind: WebGraphQLParameterKind;
  readonly required: boolean;
  readonly enumValues: readonly string[];
  readonly defaultValue?: WebGraphQLValue;
  readonly source: {
    readonly role: 'filter' | 'input';
    /** JSON Pointer relative to one result row. */
    readonly fieldPath: string;
    readonly operator?: string;
    /** True only for an equality predicate that constrains every filter alternative. */
    readonly identityEligible?: boolean;
  };
}

export interface WebGraphQLSelection {
  readonly name: string;
  readonly kind: 'object' | 'list' | 'connection';
  readonly children: readonly WebGraphQLSelection[];
}

export interface WebGraphQLRuntimeOperation {
  readonly id: string;
  readonly name: string;
  readonly database: string;
  readonly kind: WebGraphQLOperationKind;
  readonly rootField: string;
  /** The published schema's record type, used to match queries and mutations. */
  readonly table: string;
  readonly document: string;
  readonly parameters: readonly WebGraphQLParameter[];
  readonly selections: readonly WebGraphQLSelection[];
  /** Display labels keyed by the record field path used by mutation inputs. */
  readonly fieldLabels?: Readonly<Record<string, string>>;
  readonly pagination?: { readonly defaultSize: number; readonly maxSize: number };
}

export interface WebGraphQLPageInfo {
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

export interface WebGraphQLPage<TRow = WebGraphQLRow> {
  readonly rows: readonly TRow[];
  readonly pageInfo: WebGraphQLPageInfo;
  readonly totalCount: number | null;
}

export interface WebGraphQLMutationResult<TRow = WebGraphQLRow> {
  readonly affectedCount: number;
  readonly records: readonly TRow[];
}

export type WebGraphQLResult = WebGraphQLPage | WebGraphQLMutationResult;

export interface WebGraphQLPageOptions<TVariables = WebGraphQLParameters> {
  readonly first?: number;
  readonly after?: string | null;
  readonly variables?: TVariables;
  readonly signal?: AbortSignal;
  /** Disable result publication when an independent data-bound control owns the request. */
  readonly publish?: boolean;
}

export interface WebGraphQLMutationOptions {
  /** Set false when executing an exact variable snapshot captured earlier. */
  readonly mergeVariables?: boolean;
}

export type WebGraphQLChange =
  | { readonly kind: 'parameters' | 'session'; readonly operationId: string }
  | {
      readonly kind: 'page';
      readonly operationId: string;
      readonly result: WebGraphQLPage;
      readonly variables: WebGraphQLParameters;
      readonly first: number | undefined;
      readonly after: string | null;
    };

export interface WebGraphQLSource {
  readonly id: string;
  readonly operations: readonly WebGraphQLRuntimeOperation[];
  readonly authenticated: boolean;
  getOperation(idOrName: string): WebGraphQLRuntimeOperation | undefined;
  getVariables(idOrName: string): WebGraphQLParameters;
  getPage(idOrName: string): WebGraphQLPage | undefined;
  subscribe(listener: (change: WebGraphQLChange) => void): () => void;
  executePageById(idOrName: string, options?: WebGraphQLPageOptions): Promise<WebGraphQLPage>;
  executeMutationById(
    idOrName: string,
    variables?: WebGraphQLParameters,
    options?: WebGraphQLMutationOptions,
  ): Promise<WebGraphQLMutationResult>;
}

type GraphQLRequestPhase = 'Request' | 'Success' | 'Error' | 'Complete';

export interface WebGraphQLConfig extends WebNonvisualComponentOptions {
  readonly operations?: readonly WebGraphQLRuntimeOperation[];
}

export class WebGraphQLRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: number | null = null,
    public readonly outcome: 'rejected' | 'unknown' = 'rejected',
  ) {
    super(message);
    this.name = 'WebGraphQLRequestError';
  }
}

export interface WebGraphQLEventDetail {
  readonly operationId: string;
  readonly operationName: string;
  readonly result?: WebGraphQLResult;
  readonly error?: Error;
}

export type WebGraphQLEventHandler<TSender> = (
  sender: TSender,
  event: CustomEvent<WebGraphQLEventDetail>,
) => void | Promise<void>;

const emptyPageInfo: WebGraphQLPageInfo = { endCursor: null, hasNextPage: false };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readFailure(value: unknown): { message?: string; code?: string } {
  const body = record(value);
  const first = Array.isArray(body?.errors) ? record(body.errors[0]) : null;
  const code = record(first?.extensions)?.code ?? body?.code;
  const message = first?.message ?? body?.error;
  return {
    message: typeof message === 'string' ? message : undefined,
    code: typeof code === 'string' ? code : undefined,
  };
}

function projectRecord(
  value: unknown,
  selections: readonly WebGraphQLSelection[],
): WebGraphQLRow | null {
  const source = record(value);
  if (!source) return null;
  const projected = { ...source } as Record<string, WebGraphQLValue>;
  for (const selection of selections) {
    const nested = source[selection.name];
    if (nested === null || nested === undefined) continue;
    projected[selection.name] =
      selection.kind === 'connection'
        ? connectionRows(record(nested), selection.children)
        : selection.kind === 'list'
          ? projectRows(nested, selection.children)
          : projectRecord(nested, selection.children);
  }
  return projected;
}

function projectRows(value: unknown, selections: readonly WebGraphQLSelection[]): WebGraphQLRow[] {
  return Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        const projected = projectRecord(item, selections);
        return projected ? [projected] : [];
      })
    : [];
}

function connectionRows(
  value: Record<string, unknown> | null,
  selections: readonly WebGraphQLSelection[],
): WebGraphQLRow[] {
  return Array.isArray(value?.edges)
    ? projectRows(
        value.edges.map((edge: unknown) => record(edge)?.node),
        selections,
      )
    : [];
}

/** Check an input as JSON and enforce the scalar/list shape visible to the project. */
function isParameterValue(
  value: WebGraphQLValue,
  parameter: WebGraphQLParameter,
  type: string,
): boolean {
  if (value === null) return !type.endsWith('!');
  const nullableType = type.replace(/!$/, '');
  if (nullableType.startsWith('[')) {
    return (
      Array.isArray(value) &&
      value.every((item: WebGraphQLValue) =>
        isParameterValue(item, parameter, nullableType.slice(1, -1)),
      )
    );
  }
  if (parameter.enumValues.length > 0)
    return typeof value === 'string' && parameter.enumValues.includes(value);
  switch (parameter.kind) {
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    case 'json':
      return true;
  }
}

type OperationName<TParameters, TResults> = Extract<keyof TParameters & keyof TResults, string>;
const graphQLOperationReference: unique symbol = Symbol('GraphQL operation reference');

export interface WebGraphQLOperationReference<
  TName extends string = string,
  TParameters = object,
  TResult = unknown,
> {
  readonly [graphQLOperationReference]: true;
  readonly name: TName;
  readonly id: string;
  readonly parameter: { [TKey in keyof TParameters & string]: TParameters[TKey] | undefined };
  execute(
    parameters?: TParameters,
    options?: WebGraphQLExecutionOptions<TResult>,
  ): Promise<TResult>;
}

export type WebGraphQLExecutionOptions<TResult> =
  TResult extends WebGraphQLPage<unknown>
    ? Omit<WebGraphQLPageOptions, 'variables'>
    : WebGraphQLMutationOptions;

/** Runs project-authored GraphQL operations through the signed-in RestGo user. */
export class WebGraphQLClient<
  TParameters extends object = Record<string, WebGraphQLParameters>,
  TResults extends object = Record<string, WebGraphQLResult>,
>
  extends WebNonvisualComponent
  implements WebGraphQLSource
{
  public readonly operations: readonly WebGraphQLRuntimeOperation[];
  public readonly operation: {
    readonly [TName in OperationName<TParameters, TResults>]: WebGraphQLOperationReference<
      TName,
      TParameters[TName],
      TResults[TName]
    >;
  };
  readonly #variables = new Map<string, WebGraphQLParameters>();
  readonly #preparedParameters = new Map<string, WebGraphQLParameters>();
  readonly #pages = new Map<string, WebGraphQLPage>();
  readonly #revisions = new Map<string, number>();
  readonly #listeners = new Set<(change: WebGraphQLChange) => void>();
  readonly #disposeClientListener: () => void;
  #client: RestGoClient | null = null;
  #disposeAuthListener: (() => void) | undefined;
  #identity: string | null = null;
  #sessionRevision = 0;
  #disposed = false;

  public constructor(configuration: WebGraphQLConfig = {}) {
    super(configuration);
    this.operations = Object.freeze([...(configuration.operations ?? [])]);
    const references: Record<
      string,
      WebGraphQLOperationReference<string, WebGraphQLParameters, WebGraphQLResult>
    > = Object.create(null);
    for (const operation of this.operations) {
      const { name, id } = operation;
      references[name] = Object.freeze({
        [graphQLOperationReference]: true as const,
        name,
        id,
        parameter: this.#createParameterView(operation),
        execute: (
          parameters?: WebGraphQLParameters,
          options?: WebGraphQLExecutionOptions<WebGraphQLResult>,
        ) => this.#executeOperation(operation, parameters, options),
      });
    }
    this.operation = Object.freeze(references) as typeof this.operation;
    this.#disposeClientListener = subscribeRestGoClient((client) => this.#bindClient(client));
    try {
      this.#bindClient(getRestGoClient());
    } catch (error) {
      if (!(error instanceof RestGoNotConfiguredError)) throw error;
    }
  }

  public get authenticated(): boolean {
    return this.#identity !== null;
  }

  public getOperation(idOrName: string): WebGraphQLRuntimeOperation | undefined {
    return (
      this.operations.find((operation) => operation.id === idOrName) ??
      this.operations.find((operation) => operation.name === idOrName)
    );
  }

  public getVariables(idOrName: string): WebGraphQLParameters {
    const operation = this.#requireOperation(idOrName);
    return structuredClone({
      ...Object.fromEntries(
        operation.parameters
          .filter((parameter) => parameter.defaultValue !== undefined)
          .map((parameter) => [parameter.name, parameter.defaultValue]),
      ),
      ...this.#variables.get(operation.id),
    });
  }

  public setVariables<TName extends OperationName<TParameters, TResults>>(
    reference: WebGraphQLOperationReference<TName, TParameters[TName], TResults[TName]>,
    variables: TParameters[NoInfer<TName>],
  ): void {
    const operation = this.#resolveReference(reference);
    const values = this.#checkedVariables(operation, variables as WebGraphQLParameters, false);
    this.#variables.set(operation.id, values);
    this.#invalidate(operation.id, 'parameters');
  }

  #createParameterView(
    operation: WebGraphQLRuntimeOperation,
  ): Record<string, WebGraphQLValue | undefined> {
    const view: Record<string, WebGraphQLValue | undefined> = Object.create(null);
    for (const { name } of operation.parameters) {
      Object.defineProperty(view, name, {
        enumerable: true,
        get: () => {
          const prepared = this.#preparedParameters.get(operation.id);
          if (prepared !== undefined && Object.hasOwn(prepared, name)) {
            return structuredClone(prepared[name]);
          }
          const configured = this.getVariables(operation.id);
          return Object.hasOwn(configured, name) ? configured[name] : undefined;
        },
        set: (value: WebGraphQLValue | undefined) => {
          const parameters = { ...this.#preparedParameters.get(operation.id), [name]: value };
          const checked = this.#checkedVariables(operation, parameters, false);
          this.#preparedParameters.set(operation.id, checked);
        },
      });
    }
    return Object.freeze(view);
  }

  public getPage(idOrName: string): WebGraphQLPage | undefined {
    return this.#pages.get(this.#requireOperation(idOrName).id);
  }

  public subscribe(listener: (change: WebGraphQLChange) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public async execute<TName extends OperationName<TParameters, TResults>>(
    operation: WebGraphQLOperationReference<TName, TParameters[TName], TResults[TName]>,
    parameters?: TParameters[NoInfer<TName>],
    options?: WebGraphQLExecutionOptions<TResults[NoInfer<TName>]>,
  ): Promise<TResults[TName]> {
    const selected = this.#resolveReference(operation);
    return (await this.#executeOperation(
      selected,
      parameters as WebGraphQLParameters | undefined,
      options,
    )) as TResults[TName];
  }

  #executeOperation(
    operation: WebGraphQLRuntimeOperation,
    parameters?: WebGraphQLParameters,
    options?: WebGraphQLExecutionOptions<WebGraphQLResult>,
  ): Promise<WebGraphQLResult> {
    const variables = {
      ...this.#preparedParameters.get(operation.id),
      ...parameters,
    };
    return operation.kind === 'query'
      ? this.executePageById(operation.id, { ...options, variables })
      : this.executeMutationById(operation.id, variables, options as WebGraphQLMutationOptions);
  }

  public async executePageById(
    idOrName: string,
    options: WebGraphQLPageOptions = {},
  ): Promise<WebGraphQLPage> {
    const operation = this.#requireOperation(idOrName);
    if (operation.kind !== 'query') throw new TypeError(`${operation.name} is a mutation.`);
    const publish = options.publish !== false;
    const revision = publish ? this.#nextRevision(operation.id) : undefined;
    return this.#run(operation, async () => {
      const variables = this.#checkedVariables(
        operation,
        { ...this.getVariables(operation.id), ...options.variables },
        true,
      );
      const pagination = this.#pageVariables(operation, options);
      const response = await this.#request(
        operation,
        { ...variables, ...pagination },
        options.signal,
      );
      const rawPage = record(response.pageInfo);
      const result: WebGraphQLPage = {
        rows: connectionRows(response, operation.selections),
        pageInfo: rawPage
          ? {
              endCursor: typeof rawPage.endCursor === 'string' ? rawPage.endCursor : null,
              hasNextPage: rawPage.hasNextPage === true,
            }
          : emptyPageInfo,
        totalCount: typeof response.totalCount === 'number' ? response.totalCount : null,
      };
      if (!this.#disposed && publish && this.#revisions.get(operation.id) === revision) {
        this.#pages.set(operation.id, result);
        this.#notify({
          kind: 'page',
          operationId: operation.id,
          result,
          variables,
          first: pagination._wrFirst,
          after: pagination._wrAfter ?? null,
        });
      }
      return result;
    });
  }

  public async executeMutationById(
    idOrName: string,
    variables?: WebGraphQLParameters,
    options: WebGraphQLMutationOptions = {},
  ): Promise<WebGraphQLMutationResult> {
    const operation = this.#requireOperation(idOrName);
    if (operation.kind === 'query') throw new TypeError(`${operation.name} is a query.`);
    return this.#run(operation, async () => {
      const values = this.#checkedVariables(
        operation,
        {
          ...(options.mergeVariables === false ? {} : this.getVariables(operation.id)),
          ...variables,
        },
        true,
      );
      const response = await this.#request(operation, values);
      if (typeof response.affectedCount !== 'number') {
        throw new WebGraphQLRequestError(
          'RestGo did not return a mutation row count.',
          'INVALID_RESPONSE',
          200,
          'unknown',
        );
      }
      return {
        affectedCount: response.affectedCount,
        records: projectRows(response.records, operation.selections),
      };
    });
  }

  public set onRequest(handler: WebGraphQLEventHandler<this> | null) {
    this.#bindGraphQLEvent('OnRequest', handler);
  }

  public set onSuccess(handler: WebGraphQLEventHandler<this> | null) {
    this.#bindGraphQLEvent('OnSuccess', handler);
  }

  public set onError(handler: WebGraphQLEventHandler<this> | null) {
    this.#bindGraphQLEvent('OnError', handler);
  }

  public set onComplete(handler: WebGraphQLEventHandler<this> | null) {
    this.#bindGraphQLEvent('OnComplete', handler);
  }

  public override dispose(): void {
    this.#disposed = true;
    this.#disposeAuthListener?.();
    this.#disposeClientListener();
    this.#listeners.clear();
    this.#pages.clear();
    this.#variables.clear();
    this.#preparedParameters.clear();
    super.dispose();
  }

  #bindGraphQLEvent(eventName: string, handler: WebGraphQLEventHandler<this> | null): void {
    this.bindEvent(
      eventName,
      handler
        ? (sender, event) => handler(sender, event as CustomEvent<WebGraphQLEventDetail>)
        : null,
    );
  }

  #bindClient(client: RestGoClient | null): void {
    if (this.#client === client) return;
    this.#disposeAuthListener?.();
    this.#client = client;
    this.#updateIdentity(client?.CurrentUser?.id ?? null);
    this.#disposeAuthListener = client?.onAuthStateChange((event, session) => {
      if (this.#client !== client) return;
      this.#updateIdentity(session?.user.id ?? null, event === 'SIGNED_OUT');
    }).unsubscribe;
  }

  #updateIdentity(identity: string | null, signedOut = false): void {
    if (identity === this.#identity && !signedOut) return;
    if (this.#identity !== null || signedOut) {
      this.#sessionRevision++;
      this.#variables.clear();
      this.#preparedParameters.clear();
    }
    this.#identity = identity;
    for (const operation of this.operations) this.#invalidate(operation.id, 'session');
  }

  #notify(change: WebGraphQLChange): void {
    for (const listener of [...this.#listeners]) listener(change);
  }

  #invalidate(operationId: string, kind: 'parameters' | 'session'): void {
    this.#nextRevision(operationId);
    this.#pages.delete(operationId);
    this.#notify({ kind, operationId });
  }

  #nextRevision(operationId: string): number {
    const revision = (this.#revisions.get(operationId) ?? 0) + 1;
    this.#revisions.set(operationId, revision);
    return revision;
  }

  #requireOperation(idOrName: string): WebGraphQLRuntimeOperation {
    if (this.#disposed) throw new Error('This GraphQL Client was disposed.');
    const operation = this.getOperation(idOrName);
    if (!operation) throw new RangeError(`GraphQL operation "${idOrName}" is unavailable.`);
    return operation;
  }

  #resolveReference<TName extends OperationName<TParameters, TResults>>(
    reference: WebGraphQLOperationReference<TName, TParameters[TName], TResults[TName]>,
  ): WebGraphQLRuntimeOperation {
    if (this.operation[reference.name] !== reference) {
      throw new TypeError('Select an operation from this GraphQL Client.');
    }
    return this.#requireOperation(reference.id);
  }

  #checkedVariables(
    operation: WebGraphQLRuntimeOperation,
    variables: WebGraphQLParameters,
    requireAll: boolean,
  ): WebGraphQLParameters {
    const names = new Set(operation.parameters.map(({ name }) => name));
    for (const name of Object.keys(variables)) {
      if (!names.has(name)) throw new TypeError(`Unknown GraphQL parameter "${name}".`);
    }
    const values: [string, WebGraphQLValue][] = [];
    for (const parameter of operation.parameters) {
      const value = Object.hasOwn(variables, parameter.name)
        ? variables[parameter.name]
        : undefined;
      if (value === undefined) {
        if (requireAll && parameter.required)
          throw new TypeError(`GraphQL parameter "${parameter.name}" is required.`);
        continue;
      }
      if (!isParameterValue(value, parameter, parameter.type))
        throw new TypeError(`GraphQL parameter "${parameter.name}" must be ${parameter.type}.`);
      values.push([parameter.name, value]);
    }
    return structuredClone(Object.fromEntries(values));
  }

  #pageVariables(
    operation: WebGraphQLRuntimeOperation,
    options: WebGraphQLPageOptions,
  ): { readonly _wrFirst?: number; readonly _wrAfter?: string | null } {
    if (!operation.pagination) return {};
    const size = options.first ?? operation.pagination.defaultSize;
    if (!Number.isInteger(size) || size < 1 || size > operation.pagination.maxSize)
      throw new RangeError(`GraphQL page size must be 1 to ${operation.pagination.maxSize}.`);
    return { _wrFirst: size, _wrAfter: options.after ?? null };
  }

  #emitLifecycle(phase: GraphQLRequestPhase, detail: WebGraphQLEventDetail): boolean {
    return this.emit(`On${phase}`, detail);
  }

  async #run<TResult extends WebGraphQLResult>(
    operation: WebGraphQLRuntimeOperation,
    execute: () => Promise<TResult>,
  ): Promise<TResult> {
    const detail = { operationId: operation.id, operationName: operation.name };
    const client = this.#client;
    const revision = this.#sessionRevision;
    if (!this.#emitLifecycle('Request', detail)) {
      throw new WebGraphQLRequestError('GraphQL execution was cancelled.', 'CANCELLED');
    }
    let completed: WebGraphQLEventDetail = detail;
    try {
      if (this.#disposed || client !== this.#client || revision !== this.#sessionRevision) {
        throw new WebGraphQLRequestError(
          'The RestGo session changed before GraphQL ran.',
          'SESSION_CHANGED',
        );
      }
      const result = await execute();
      completed = { ...detail, result };
      if (!this.#disposed) this.#emitLifecycle('Success', completed);
      return result;
    } catch (problem) {
      const error = problem instanceof Error ? problem : new Error(String(problem));
      completed = { ...detail, error };
      if (!this.#disposed) this.#emitLifecycle('Error', completed);
      throw error;
    } finally {
      if (!this.#disposed) this.#emitLifecycle('Complete', completed);
    }
  }

  async #request(
    operation: WebGraphQLRuntimeOperation,
    variables: WebGraphQLParameters,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const client = getRestGoClient();
    const revision = this.#sessionRevision;
    const mutation = operation.kind !== 'query';
    const result = await client.executeGraphQL(
      operation.database,
      { query: operation.document, operationName: operation.name, variables },
      signal,
    );
    if (result.error) {
      const { status, code, message, details } = result.error;
      const failure = readFailure(details);
      const uncertain =
        mutation && (code === 'NETWORK_ERROR' || code === 'INVALID_RESPONSE' || status >= 500);
      throw new WebGraphQLRequestError(
        failure.message ?? message,
        failure.code ?? code,
        status || null,
        uncertain ? 'unknown' : 'rejected',
      );
    }
    if (client !== this.#client || revision !== this.#sessionRevision) {
      throw new WebGraphQLRequestError(
        'The RestGo user changed while GraphQL was running.',
        'SESSION_CHANGED',
        null,
        mutation ? 'unknown' : 'rejected',
      );
    }
    const body = record(result.data);
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      const failure = readFailure(body);
      throw new WebGraphQLRequestError(
        failure.message ?? 'RestGo could not execute the operation.',
        failure.code ?? 'GRAPHQL_EXECUTION_ERROR',
        200,
      );
    }
    const response = record(record(body?.data)?.[operation.rootField]);
    if (!response || (!mutation && !Array.isArray(response.edges))) {
      throw new WebGraphQLRequestError(
        'RestGo returned an invalid GraphQL result.',
        'INVALID_RESPONSE',
        200,
        mutation ? 'unknown' : 'rejected',
      );
    }
    return response;
  }
}
