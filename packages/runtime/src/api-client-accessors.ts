import type {
  QueryValue,
  WebApiBodyKind,
  WebApiClientConfiguration,
  WebApiConnection,
  WebApiCredentials,
  WebApiOperation,
  WebApiOperationState,
  WebApiParameter,
  WebApiRequestOptions,
  WebApiResponseSchema,
  WebApiResponseType,
} from './api-client.js';
import type {
  WebApiTemplateParameter,
  WebApiTemplateParameterType,
  WebApiTemplateValue,
} from './api-client-template.js';

export type WebApiQueryValue = QueryValue | readonly QueryValue[];
export type WebApiParameterValue = WebApiTemplateValue | readonly QueryValue[];
export type WebApiParameterValues<T extends object> = { -readonly [K in keyof T]?: T[K] };
export type WebApiQueryValues<T extends object = Record<string, WebApiQueryValue>> =
  WebApiParameterValues<T> & Record<string, WebApiQueryValue>;
export type WebApiHeaderValues<T extends object = Record<string, string>> =
  WebApiParameterValues<T> & Record<string, string | undefined>;

/** Generated inputs preserve the configured names without an untyped component namespace. */
export interface WebApiRequestInputs {
  readonly Parameter: object;
  readonly Query: object;
  readonly Headers: object;
}
export interface WebApiDefaultInputs extends WebApiRequestInputs {
  readonly Parameter: Record<string, WebApiParameterValue>;
  readonly Query: Record<string, WebApiQueryValue>;
  readonly Headers: Record<string, string>;
}

export type WebApiInputPart<T, K extends keyof WebApiRequestInputs> = T extends {
  readonly [P in K]: infer Values extends object;
}
  ? Values
  : Record<string, K extends 'Headers' ? string : WebApiTemplateValue>;

export type WebApiInputUnion<
  T extends object,
  K extends keyof WebApiRequestInputs,
> = WebApiInputPart<T[keyof T], K>;
export type WebApiUnionKeys<T> = T extends object ? keyof T : never;
export type WebApiUnionValue<T, K extends PropertyKey> = T extends object
  ? K extends keyof T
    ? T[K]
    : never
  : never;
export type WebApiCombinedInputs<T extends object, K extends keyof WebApiRequestInputs> = {
  [P in WebApiUnionKeys<WebApiInputUnion<T, K>>]: WebApiUnionValue<WebApiInputUnion<T, K>, P>;
};

export type WebApiRequests<TOutputs extends object, TInputs extends object> = {
  readonly [K in keyof TOutputs & string]: WebApiRequest<
    WebApiInputPart<K extends keyof TInputs ? TInputs[K] : WebApiDefaultInputs, 'Parameter'>,
    TOutputs[K],
    WebApiInputPart<K extends keyof TInputs ? TInputs[K] : WebApiDefaultInputs, 'Query'>,
    WebApiInputPart<K extends keyof TInputs ? TInputs[K] : WebApiDefaultInputs, 'Headers'>
  >;
};

/** Narrow callbacks keep request objects attached to their owner's stable operation ID. */
export interface WebApiAccessContext {
  readConfiguration(): WebApiClientConfiguration;
  writeConfiguration(value: WebApiClientConfiguration): void;
  readOperation(id: string): WebApiOperation;
  patchOperation(id: string, patch: Partial<Omit<WebApiOperation, 'id'>>): void;
  readBaseUrl(): string;
  writeBaseUrl(value: string): void;
  parameterNames(id: string): readonly string[];
  readParameter(id: string, name: string): WebApiParameterValue | undefined;
  writeParameter(id: string, name: string, value: WebApiParameterValue | undefined): void;
  readParameterType(id: string, name: string): WebApiTemplateParameterType;
  writeParameterType(id: string, name: string, type: WebApiTemplateParameterType): void;
  clearParameters(id: string): void;
  readQuery(id: string, name: string): WebApiQueryValue;
  writeQuery(id: string, name: string, value: WebApiQueryValue): void;
  headerNames(id?: string): readonly string[];
  readHeader(name: string, id?: string): string | undefined;
  writeHeader(name: string, value: string | undefined, id?: string): void;
  readResponseType(id: string): WebApiResponseType;
  writeResponseType(id: string, value: WebApiResponseType): void;
  readState(id: string): WebApiOperationState;
  execute(id: string, options: WebApiRequestOptions): Promise<unknown>;
  bodyParameters(id: string): readonly WebApiTemplateParameter[];
}

function valueView<T extends object, TValue>(
  names: () => readonly string[],
  read: (name: string) => TValue,
  write: (name: string, value: TValue) => void,
): T {
  const target = Object.create(null) as object;
  return new Proxy(target, {
    get: (_target, property) => (typeof property === 'string' ? read(property) : undefined),
    set: (_target, property, value: TValue) => {
      if (typeof property !== 'string') throw new TypeError('Use a named API field.');
      write(property, value);
      return true;
    },
    deleteProperty: (_target, property) => {
      if (typeof property !== 'string') return false;
      write(property, undefined as TValue);
      return true;
    },
    has: (_target, property) => typeof property === 'string' && names().includes(property),
    ownKeys: () => [...new Set(names())],
    getOwnPropertyDescriptor: (_target, property) =>
      typeof property === 'string' && names().includes(property)
        ? { configurable: true, enumerable: true, writable: true, value: read(property) }
        : undefined,
    defineProperty: () => {
      throw new TypeError('Assign API field values directly.');
    },
    preventExtensions: () => false,
  }) as T;
}

/** A FireDAC-style named parameter, backed by the owning runtime request. */
export class WebApiNamedParameter {
  public constructor(
    private readonly context: WebApiAccessContext,
    private readonly operationId: string,
    public readonly Name: string,
  ) {
    if (!context.parameterNames(operationId).includes(Name)) {
      throw new RangeError(`Parameter <${Name}> is not configured for this request.`);
    }
  }

  public get Value(): WebApiParameterValue | undefined {
    return this.context.readParameter(this.operationId, this.Name);
  }

  public set Value(value: WebApiParameterValue | undefined) {
    this.context.writeParameter(this.operationId, this.Name, value);
  }

  public get Type(): WebApiTemplateParameterType {
    return this.context.readParameterType(this.operationId, this.Name);
  }

  public set Type(value: WebApiTemplateParameterType) {
    this.context.writeParameterType(this.operationId, this.Name, value);
  }

  public Clear(): void {
    this.Value = undefined;
  }
}

export class WebApiBodySettings {
  public constructor(
    private readonly context: WebApiAccessContext,
    private readonly operationId: string,
  ) {}

  public get Kind(): WebApiBodyKind {
    return this.context.readOperation(this.operationId).body.kind;
  }

  public set Kind(value: WebApiBodyKind) {
    const body = this.context.readOperation(this.operationId).body;
    this.context.patchOperation(this.operationId, { body: { ...body, kind: value } });
  }

  public get Value(): string {
    return this.context.readOperation(this.operationId).body.content;
  }

  public set Value(value: string) {
    const body = this.context.readOperation(this.operationId).body;
    this.context.patchOperation(this.operationId, { body: { ...body, content: value } });
  }

  public get Parameters(): readonly WebApiTemplateParameter[] {
    return this.context.bodyParameters(this.operationId);
  }

  public set Parameters(value: readonly WebApiTemplateParameter[]) {
    const body = this.context.readOperation(this.operationId).body;
    this.context.patchOperation(this.operationId, { body: { ...body, parameters: value } });
  }
}

export class WebApiRequestSettings {
  public constructor(
    private readonly context: WebApiAccessContext,
    private readonly operationId: string,
  ) {}

  public get Credentials(): WebApiCredentials {
    return this.context.readOperation(this.operationId).credentials;
  }

  public set Credentials(value: WebApiCredentials) {
    this.context.patchOperation(this.operationId, { credentials: value });
  }

  public get Timeout(): number | null {
    return this.context.readOperation(this.operationId).timeoutMs;
  }

  public set Timeout(value: number | null) {
    this.context.patchOperation(this.operationId, { timeoutMs: value });
  }

  public get ResponseType(): WebApiResponseType {
    return this.context.readResponseType(this.operationId);
  }

  public set ResponseType(value: WebApiResponseType) {
    this.context.writeResponseType(this.operationId, value);
  }
}

export class WebApiResponse<T = unknown> {
  public constructor(
    private readonly context: WebApiAccessContext,
    private readonly operationId: string,
  ) {}

  public get Value(): T | undefined {
    return this.context.readState(this.operationId).data as T | undefined;
  }

  public get Status(): WebApiOperationState['status'] {
    return this.context.readState(this.operationId).status;
  }

  public get Error(): unknown {
    return this.context.readState(this.operationId).error;
  }

  public get UpdatedAt(): number | undefined {
    return this.context.readState(this.operationId).updatedAt;
  }

  public get Schema(): WebApiResponseSchema | null {
    return this.context.readOperation(this.operationId).responseSchema;
  }

  public set Schema(value: WebApiResponseSchema | null) {
    this.context.patchOperation(this.operationId, { responseSchema: value });
  }
}

export class WebApiConnectionSettings<THeaders extends object = Record<string, string>> {
  public readonly Headers: WebApiHeaderValues<THeaders>;

  public constructor(private readonly context: WebApiAccessContext) {
    this.Headers = valueView(
      () => context.headerNames(),
      (name) => context.readHeader(name),
      (name, value) => context.writeHeader(name, value),
    );
  }

  public get Mode(): WebApiConnection {
    return this.context.readConfiguration().connection ?? 'custom';
  }

  public set Mode(value: WebApiConnection) {
    const configuration = this.context.readConfiguration();
    const managed = value !== 'custom';
    const filter = (headers: readonly WebApiParameter[]): readonly WebApiParameter[] =>
      managed ? headers.filter((header) => header.name.toLowerCase() !== 'authorization') : headers;
    this.context.writeConfiguration({
      ...configuration,
      connection: value,
      defaultHeaders: filter(configuration.defaultHeaders),
      operations: configuration.operations.map((operation) => ({
        ...operation,
        headers: filter(operation.headers),
        ...(managed ? { credentials: 'omit' as const } : {}),
      })),
    });
  }

  public get BaseURL(): string {
    return this.context.readBaseUrl();
  }

  public set BaseURL(value: string) {
    this.context.writeBaseUrl(value);
  }

  public get Timeout(): number {
    return this.context.readConfiguration().timeoutMs;
  }

  public set Timeout(value: number) {
    this.context.writeConfiguration({ ...this.context.readConfiguration(), timeoutMs: value });
  }

  public get DefaultHeaders(): readonly WebApiParameter[] {
    return this.context.readConfiguration().defaultHeaders;
  }

  public set DefaultHeaders(value: readonly WebApiParameter[]) {
    this.context.writeConfiguration({ ...this.context.readConfiguration(), defaultHeaders: value });
  }
}

/** Stable request object with mutable settings and private per-instance parameter values. */
export class WebApiRequest<
  TParameters extends object = Record<string, WebApiTemplateValue>,
  TResult = unknown,
  TQuery extends object = Record<string, WebApiQueryValue>,
  THeaders extends object = Record<string, string>,
> {
  public readonly parameter: WebApiParameterValues<TParameters>;
  public readonly Query: WebApiQueryValues<TQuery>;
  public readonly Headers: WebApiHeaderValues<THeaders>;
  public readonly Body: WebApiBodySettings;
  public readonly Options: WebApiRequestSettings;
  public readonly Response: WebApiResponse<TResult>;

  public constructor(
    private readonly context: WebApiAccessContext,
    public readonly ID: string,
  ) {
    this.parameter = valueView(
      () => context.parameterNames(ID),
      (name) => context.readParameter(ID, name),
      (name, value) => context.writeParameter(ID, name, value),
    );
    this.Query = valueView(
      () => context.readOperation(ID).query.map((parameter) => parameter.name),
      (name) => context.readQuery(ID, name),
      (name, value) => context.writeQuery(ID, name, value),
    );
    this.Headers = valueView(
      () => context.headerNames(ID),
      (name) => context.readHeader(name, ID),
      (name, value) => context.writeHeader(name, value, ID),
    );
    this.Body = new WebApiBodySettings(context, ID);
    this.Options = new WebApiRequestSettings(context, ID);
    this.Response = new WebApiResponse<TResult>(context, ID);
  }

  public get Name(): string {
    return this.context.readOperation(this.ID).name;
  }

  public set Name(value: string) {
    this.context.patchOperation(this.ID, { name: value });
  }

  public get Method(): string {
    return this.context.readOperation(this.ID).method;
  }

  public set Method(value: string) {
    this.context.patchOperation(this.ID, { method: value });
  }

  public get Endpoint(): string {
    return this.context.readOperation(this.ID).path;
  }

  public set Endpoint(value: string) {
    this.context.patchOperation(this.ID, { path: value });
  }

  public get ApiVersion(): number | null {
    return this.context.readOperation(this.ID).apiVersion ?? null;
  }

  public set ApiVersion(value: number | null) {
    this.context.patchOperation(this.ID, { apiVersion: value });
  }

  public get Definition(): WebApiOperation {
    return this.context.readOperation(this.ID);
  }

  public set Definition(value: WebApiOperation) {
    if (value.id !== this.ID) throw new TypeError('A request ID cannot be replaced.');
    this.context.patchOperation(this.ID, value);
  }

  public ParamByName(name: string): WebApiNamedParameter {
    return new WebApiNamedParameter(this.context, this.ID, name);
  }

  public ClearParameters(): void {
    this.context.clearParameters(this.ID);
  }

  /** Executes this request without changing the client's selected Operation first. */
  public async execute(options: WebApiRequestOptions = {}): Promise<TResult> {
    return (await this.context.execute(this.ID, options)) as TResult;
  }
}
