import { copyApiClientInput, getApiClientBodyInputs } from './api-client-inputs.js';
import type {
  WebApiRequestBody,
  WebApiClientConfiguration,
  WebApiOperation,
  WebApiOperationState,
  WebApiParameter,
  WebApiRequestOptions,
  WebApiResponseType,
} from './api-client.js';
import type {
  WebApiParameterValue,
  WebApiAccessContext,
  WebApiQueryValue,
} from './api-client-accessors.js';
import {
  parseApiClientTemplateTestValue,
  resolveApiClientBodyTemplate,
  WEB_API_TEMPLATE_PARAMETER_TYPES,
  type WebApiTemplateParameterType,
  type WebApiTemplateValue,
  type WebApiTemplateParameter,
} from './api-client-template.js';

interface StoreCallbacks {
  normalize(value: WebApiClientConfiguration): WebApiClientConfiguration;
  validateEndpoint(value: string): void;
  readBaseUrl(): string;
  writeBaseUrl(value: string): void;
  readHeaders(): Headers;
  deleteHeader(name: string): void;
  readState(name: string): WebApiOperationState;
  execute(name: string, options: WebApiRequestOptions): Promise<unknown>;
  changed(previous: WebApiClientConfiguration, current: WebApiClientConfiguration): void;
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function bound(configuration: WebApiClientConfiguration): boolean {
  return configuration.connection !== undefined && configuration.connection !== 'custom';
}

function validQuery(value: unknown): value is WebApiQueryValue {
  const scalar = (item: unknown): boolean =>
    item === undefined ||
    item === null ||
    typeof item === 'string' ||
    typeof item === 'boolean' ||
    (typeof item === 'number' && Number.isFinite(item));
  return Array.isArray(value) ? value.length <= 200 && value.every(scalar) : scalar(value);
}

function fieldName(name: string): void {
  if (typeof name !== 'string' || !name.trim() || name.length > 256) {
    throw new TypeError('Use a nonempty API field name of at most 256 characters.');
  }
}

function timeout(value: number | null, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 120000) {
    throw new RangeError('Timeout must be an integer between 1 and 120000 milliseconds.');
  }
}

function validateFields(fields: readonly WebApiParameter[]): void {
  if (!Array.isArray(fields) || fields.length > 200) throw new RangeError('Too many API fields.');
  for (const field of fields) {
    fieldName(field.name);
    if (
      typeof field.id !== 'string' ||
      !field.id ||
      typeof field.value !== 'string' ||
      field.value.length > 32768 ||
      typeof field.enabled !== 'boolean'
    ) {
      throw new TypeError('Invalid API field definition.');
    }
  }
}

/** Runtime settings and input values are isolated from the saved Project Model. */
interface BodySnapshot {
  readonly body: WebApiRequestBody;
  readonly types: ReadonlyMap<string, WebApiTemplateParameterType>;
}

export class WebApiRequestStore implements WebApiAccessContext {
  #configuration: WebApiClientConfiguration;
  readonly #bodyValues = new Map<string, Map<string, WebApiTemplateValue>>();
  readonly #assignedBodyValues = new Map<string, Set<string>>();
  readonly #bodyTypes = new Map<string, Map<string, WebApiTemplateParameterType>>();
  readonly #queryValues = new Map<string, Map<string, WebApiQueryValue>>();
  readonly #queryTypes = new Map<string, Map<string, WebApiTemplateParameterType>>();
  readonly #responseTypes = new Map<string, WebApiResponseType>();

  public constructor(
    configuration: WebApiClientConfiguration,
    private readonly callbacks: StoreCallbacks,
  ) {
    this.#configuration = freeze(configuration);
  }

  public readConfiguration(): WebApiClientConfiguration {
    return this.#configuration;
  }

  public writeConfiguration(value: WebApiClientConfiguration): void {
    if (
      value.schemaVersion !== 1 ||
      !['custom', 'restgo-session', 'restgo-api-token', 'restgo-public'].includes(
        value.connection ?? 'custom',
      ) ||
      !Array.isArray(value.operations) ||
      value.operations.length > 100
    ) {
      throw new TypeError('Invalid API Client configuration.');
    }
    timeout(value.timeoutMs);
    validateFields(value.defaultHeaders);
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const operation of value.operations) {
      if (
        !operation.id ||
        !operation.name?.trim() ||
        operation.name.length > 120 ||
        ids.has(operation.id) ||
        names.has(operation.name) ||
        typeof operation.method !== 'string' ||
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(operation.method) ||
        typeof operation.path !== 'string' ||
        operation.path.length > 4096 ||
        !['none', 'json', 'text', 'form-urlencoded', 'form-data'].includes(operation.body.kind) ||
        typeof operation.body.content !== 'string' ||
        operation.body.content.length > 1000000 ||
        !['omit', 'same-origin', 'include'].includes(operation.credentials)
      ) {
        throw new TypeError('Invalid or duplicated API request definition.');
      }
      ids.add(operation.id);
      names.add(operation.name);
      timeout(operation.timeoutMs, true);
      if (
        operation.apiVersion != null &&
        (!Number.isSafeInteger(operation.apiVersion) || operation.apiVersion < 1)
      ) {
        throw new RangeError('API version must be a positive safe integer.');
      }
      validateFields(operation.query);
      validateFields(operation.headers);
      if (bound(value)) this.callbacks.validateEndpoint(operation.path);
    }
    if (
      bound(value) &&
      [...value.defaultHeaders, ...value.operations.flatMap((operation) => operation.headers)].some(
        (header) => header.enabled && header.name.toLowerCase() === 'authorization',
      )
    ) {
      throw new TypeError('RestGo connections manage the Authorization header automatically.');
    }
    const normalized = freeze(this.callbacks.normalize(value));
    const previous = this.#configuration;
    for (const operation of normalized.operations) {
      const old = previous.operations.find((entry) => entry.id === operation.id);
      const inputs = getApiClientBodyInputs(operation.body);
      if (old !== undefined && JSON.stringify(old.query) !== JSON.stringify(operation.query))
        this.#queryValues.delete(operation.id);
      if (old !== undefined && JSON.stringify(old.body) !== JSON.stringify(operation.body)) {
        this.#bodyTypes.delete(operation.id);
        const names = new Set(inputs.map((input) => input.name));
        const values = this.#bodyValues.get(operation.id);
        const explicit = this.#assignedBodyValues.get(operation.id);
        for (const name of values?.keys() ?? []) {
          if (!names.has(name) || !explicit?.has(name)) values?.delete(name);
        }
        for (const name of explicit ?? []) if (!names.has(name)) explicit?.delete(name);
      }
    }
    for (const id of this.#assignedBodyValues.keys())
      if (!ids.has(id)) this.#assignedBodyValues.delete(id);
    for (const id of this.#bodyTypes.keys()) if (!ids.has(id)) this.#bodyTypes.delete(id);

    this.#configuration = normalized;
    for (const id of this.#bodyValues.keys()) if (!ids.has(id)) this.#bodyValues.delete(id);
    for (const id of this.#queryValues.keys()) if (!ids.has(id)) this.#queryValues.delete(id);
    for (const id of this.#queryTypes.keys()) if (!ids.has(id)) this.#queryTypes.delete(id);
    for (const id of this.#responseTypes.keys()) if (!ids.has(id)) this.#responseTypes.delete(id);
    this.callbacks.changed(previous, normalized);
  }

  public readOperation(id: string): WebApiOperation {
    const operation = this.#configuration.operations.find((candidate) => candidate.id === id);
    if (operation === undefined) throw new RangeError('This API request is no longer configured.');
    return operation;
  }

  public patchOperation(id: string, patch: Partial<Omit<WebApiOperation, 'id'>>): void {
    const current = this.readOperation(id);
    this.writeConfiguration({
      ...this.#configuration,
      operations: this.#configuration.operations.map((operation) =>
        operation.id === id ? { ...current, ...patch, id } : operation,
      ),
    });
  }

  public readBaseUrl(): string {
    return this.callbacks.readBaseUrl();
  }

  public writeBaseUrl(value: string): void {
    if (typeof value !== 'string') throw new TypeError('Base URL must be a string.');
    this.callbacks.writeBaseUrl(value);
  }

  public parameterNames(id: string): readonly string[] {
    const operation = this.readOperation(id);
    return [
      ...new Set([
        ...getApiClientBodyInputs(operation.body).map((input) => input.name),
        ...operation.query.map((input) => input.name),
      ]),
    ];
  }

  public readParameter(id: string, name: string): WebApiParameterValue | undefined {
    const input = getApiClientBodyInputs(this.readOperation(id).body).find(
      (field) => field.name === name,
    );
    if (input !== undefined) {
      if (this.readParameterType(id, name) === 'null' && !input.inferred) return null;
      const values = this.#bodyValues.get(id) ?? new Map<string, WebApiTemplateValue>();
      if (!values.has(name) && input.defaultValue !== undefined) {
        let value = copyApiClientInput(input.defaultValue);
        const override = this.#bodyTypes.get(id)?.get(name);
        if (override !== undefined) {
          try {
            value = parseApiClientTemplateTestValue(
              { name, type: override },
              typeof value === 'string' ? value : JSON.stringify(value),
            );
          } catch {
            return undefined;
          }
        }
        values.set(name, value);
        this.#bodyValues.set(id, values);
      }
      return values.get(name);
    }
    const value = this.readQuery(id, name);
    return value;
  }

  public writeParameter(id: string, name: string, value: WebApiParameterValue | undefined): void {
    const operation = this.readOperation(id);
    if (!this.parameterNames(id).includes(name))
      throw new RangeError('Parameter <' + name + '> is not configured.');
    const input = getApiClientBodyInputs(operation.body).find((field) => field.name === name);
    const copied =
      value === undefined
        ? undefined
        : copyApiClientInput(
            (input === undefined && Array.isArray(value)
              ? value.filter((item) => item !== undefined)
              : value) as WebApiTemplateValue,
          );
    if (
      input !== undefined &&
      copied !== undefined &&
      !(input.inferred && input.defaultValue === null && !this.#bodyTypes.get(id)?.has(name))
    ) {
      resolveApiClientBodyTemplate(
        {
          kind: 'json',
          content: '<value>',
          parameters: [{ name: 'value', type: this.readParameterType(id, name) }],
        },
        { value: copied },
      );
    }
    if (input === undefined && copied !== undefined && this.#queryTypes.get(id)?.has(name)) {
      resolveApiClientBodyTemplate(
        {
          kind: 'json',
          content: '<value>',
          parameters: [{ name: 'value', type: this.readParameterType(id, name) }],
        },
        { value: copied },
      );
    }
    if (operation.query.some((query) => query.name === name))
      this.writeQuery(id, name, validQuery(copied) ? copied : JSON.stringify(copied));
    if (input !== undefined) {
      const values = this.#bodyValues.get(id) ?? new Map<string, WebApiTemplateValue>();
      if (copied === undefined) values.delete(name);
      else values.set(name, copied);
      this.#bodyValues.set(id, values);
      const explicit = this.#assignedBodyValues.get(id) ?? new Set<string>();
      if (copied === undefined) explicit.delete(name);
      else explicit.add(name);
      this.#assignedBodyValues.set(id, explicit);
    }
  }

  public readParameterType(id: string, name: string): WebApiTemplateParameterType {
    if (!this.parameterNames(id).includes(name))
      throw new RangeError('Parameter <' + name + '> is not configured.');
    return (
      this.#bodyTypes.get(id)?.get(name) ??
      getApiClientBodyInputs(this.readOperation(id).body).find((field) => field.name === name)
        ?.type ??
      this.#queryTypes.get(id)?.get(name) ??
      'string'
    );
  }

  public writeParameterType(id: string, name: string, type: WebApiTemplateParameterType): void {
    if (!WEB_API_TEMPLATE_PARAMETER_TYPES.includes(type))
      throw new TypeError('Invalid parameter type.');
    if (!this.parameterNames(id).includes(name))
      throw new RangeError('Parameter <' + name + '> is not configured.');
    if (getApiClientBodyInputs(this.readOperation(id).body).some((input) => input.name === name)) {
      const types = this.#bodyTypes.get(id) ?? new Map<string, WebApiTemplateParameterType>();
      types.set(name, type);
      this.#bodyTypes.set(id, types);
      this.#bodyValues.get(id)?.delete(name);
    } else {
      const types = this.#queryTypes.get(id) ?? new Map<string, WebApiTemplateParameterType>();
      types.set(name, type);
      this.#queryTypes.set(id, types);
      const current = this.readQuery(id, name);
      try {
        this.writeParameter(
          id,
          name,
          parseApiClientTemplateTestValue(
            { name, type },
            typeof current === 'string' ? current : (JSON.stringify(current) ?? ''),
          ),
        );
      } catch {
        this.writeQuery(id, name, undefined);
      }
    }
  }

  public clearParameters(id: string): void {
    for (const name of this.parameterNames(id)) this.writeParameter(id, name, undefined);
  }

  public readQuery(id: string, name: string): WebApiQueryValue {
    if (this.#queryValues.get(id)?.has(name)) return this.#queryValues.get(id)?.get(name);
    const values = this.readOperation(id)
      .query.filter((parameter) => parameter.name === name && parameter.enabled)
      .map((parameter) => parameter.value);
    return values.length > 1 ? values : values[0];
  }

  public writeQuery(id: string, name: string, value: WebApiQueryValue): void {
    fieldName(name);
    if (!validQuery(value))
      throw new TypeError('Query fields require finite scalar values or arrays of them.');
    const operation = this.readOperation(id);
    const previous = operation.query.filter((parameter) => parameter.name === name);
    const source = Array.isArray(value) ? value : [value];
    const values = source.filter((item) => item !== undefined && item !== null);
    const replacements: WebApiParameter[] =
      values.length === 0
        ? previous.map((parameter) => ({ ...parameter, enabled: false }))
        : values.map((item, index) => ({
            id: previous[index]?.id ?? `${id}-query-${encodeURIComponent(name)}-${String(index)}`,
            name,
            value: String(item),
            enabled: true,
          }));
    this.patchOperation(id, {
      query: [...operation.query.filter((parameter) => parameter.name !== name), ...replacements],
    });
    const cached = this.#queryValues.get(id) ?? new Map<string, WebApiQueryValue>();
    cached.set(name, Array.isArray(value) ? [...value] : value);
    this.#queryValues.set(id, cached);
  }

  public headerNames(id?: string): readonly string[] {
    if (id !== undefined) return this.readOperation(id).headers.map((header) => header.name);
    return [
      ...new Set([
        ...this.callbacks.readHeaders().keys(),
        ...this.#configuration.defaultHeaders.map((header) => header.name),
      ]),
    ];
  }

  public readHeader(name: string, id?: string): string | undefined {
    const fields =
      id === undefined ? this.#configuration.defaultHeaders : this.readOperation(id).headers;
    const field = fields
      .filter((header) => header.name.toLowerCase() === name.toLowerCase() && header.enabled)
      .at(-1);
    return (
      field?.value ??
      (id === undefined ? (this.callbacks.readHeaders().get(name) ?? undefined) : undefined)
    );
  }

  public writeHeader(name: string, value: string | undefined, id?: string): void {
    fieldName(name);
    if (value !== undefined && typeof value !== 'string')
      throw new TypeError('Headers require string values.');
    if (bound(this.#configuration) && name.toLowerCase() === 'authorization')
      throw new TypeError('RestGo connections manage the Authorization header automatically.');
    if (value !== undefined) new Headers({ [name]: value });
    const fields =
      id === undefined ? this.#configuration.defaultHeaders : this.readOperation(id).headers;
    const existing = fields.find((header) => header.name.toLowerCase() === name.toLowerCase());
    const replacement: WebApiParameter = {
      id: existing?.id ?? `${id ?? 'default'}-header-${encodeURIComponent(name)}`,
      name,
      value: value ?? '',
      enabled: value !== undefined,
    };
    const next = [
      ...fields.filter((header) => header.name.toLowerCase() !== name.toLowerCase()),
      replacement,
    ];
    if (id === undefined) {
      this.writeConfiguration({ ...this.#configuration, defaultHeaders: next });
      this.callbacks.deleteHeader(name);
    } else this.patchOperation(id, { headers: next });
  }

  public readResponseType(id: string): WebApiResponseType {
    this.readOperation(id);
    return this.#responseTypes.get(id) ?? 'auto';
  }

  public writeResponseType(id: string, value: WebApiResponseType): void {
    this.readOperation(id);
    if (!['auto', 'json', 'text', 'blob', 'arrayBuffer'].includes(value))
      throw new TypeError('Invalid response type.');
    this.#responseTypes.set(id, value);
  }

  public readState(id: string): WebApiOperationState {
    return this.callbacks.readState(this.readOperation(id).name);
  }

  public async execute(id: string, options: WebApiRequestOptions): Promise<unknown> {
    return this.callbacks.execute(this.readOperation(id).name, options);
  }

  public parameterValues(id: string): Readonly<Record<string, WebApiTemplateValue>> {
    return Object.fromEntries(this.#bodyValues.get(id) ?? []);
  }
  public bodyParameters(id: string): readonly WebApiTemplateParameter[] {
    return getApiClientBodyInputs(this.readOperation(id).body).map((input) => ({
      name: input.name,
      type: this.readParameterType(id, input.name),
    }));
  }
  public bodySnapshot(id: string): BodySnapshot {
    return { body: this.readOperation(id).body, types: new Map(this.#bodyTypes.get(id)) };
  }

  public materializeBody(
    snapshot: BodySnapshot,
    values: Readonly<Record<string, WebApiTemplateValue>>,
  ): WebApiRequestBody {
    const body = snapshot.body;
    const inputs = getApiClientBodyInputs(body);
    const parameters = inputs.map((input) => ({
      name: input.name,
      type: snapshot.types.get(input.name) ?? input.type,
    }));
    if (inputs.some((input) => input.required)) return { ...body, parameters: parameters };
    if (body.kind === 'none' || inputs.length === 0) return body;
    const supplied = new Map<string, WebApiTemplateValue>();
    for (const input of inputs) {
      if (!Object.hasOwn(values, input.name)) continue;
      const value = copyApiClientInput(values[input.name] as WebApiTemplateValue);
      if (!(input.inferred && input.defaultValue === null && !snapshot.types.has(input.name)))
        resolveApiClientBodyTemplate(
          {
            kind: 'json',
            content: '<value>',
            parameters: [{ name: 'value', type: snapshot.types.get(input.name) ?? input.type }],
          },
          { value },
        );
      supplied.set(input.name, value);
    }
    if (body.kind === 'json') {
      const data = JSON.parse(body.content) as Record<string, WebApiTemplateValue>;
      const entries = Object.entries(data).map(([name, value]) => [
        name,
        supplied.has(name) ? supplied.get(name) : value,
      ]);
      const content = JSON.stringify(Object.fromEntries(entries))
        .replaceAll('<', '\u003c')
        .replaceAll('>', '\u003e');
      return { ...body, content };
    }
    const form = new URLSearchParams(body.content);
    for (const [name, value] of supplied) {
      form.delete(name);
      const fields = Array.isArray(value) ? value : [value];
      for (const field of fields)
        form.append(name, typeof field === 'string' ? field : JSON.stringify(field));
    }
    return { ...body, content: form.toString() };
  }
}
