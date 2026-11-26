import type { WebApiAccessContext, WebApiRequests } from './api-client-accessors.js';
import { WebApiConnectionSettings, WebApiRequest } from './api-client-accessors.js';
import type { WebApiClientConfiguration } from './api-client.js';

/** Per-instance request selection; catalog projections never become component globals. */
export class WebApiSelection<
  TOutputs extends object,
  TInputs extends object,
  TDefaultHeaders extends object,
> {
  readonly #requests = new Map<string, WebApiRequest>();
  #selectedId: string | undefined;
  public readonly Connection: WebApiConnectionSettings<TDefaultHeaders>;
  public readonly Requests: WebApiRequests<TOutputs, TInputs>;

  public constructor(private readonly context: WebApiAccessContext) {
    this.#selectedId = context.readConfiguration().operations[0]?.id;
    this.Connection = new WebApiConnectionSettings<TDefaultHeaders>(context);
    this.Requests = new Proxy(Object.create(null) as object, {
      get: (_target, property) => {
        if (typeof property !== 'string') return undefined;
        const operation = context
          .readConfiguration()
          .operations.find((entry) => entry.name === property);
        return operation === undefined ? undefined : this.byId(operation.id);
      },
      has: (_target, property) =>
        typeof property === 'string' &&
        context.readConfiguration().operations.some((entry) => entry.name === property),
      ownKeys: () => context.readConfiguration().operations.map((entry) => entry.name),
      getOwnPropertyDescriptor: (_target, property) => {
        if (typeof property !== 'string') return undefined;
        const operation = context
          .readConfiguration()
          .operations.find((entry) => entry.name === property);
        return operation === undefined
          ? undefined
          : {
              configurable: true,
              enumerable: true,
              writable: false,
              value: this.byId(operation.id),
            };
      },
      set: () => {
        throw new TypeError('Modify request properties instead of replacing request instances.');
      },
      deleteProperty: () => {
        throw new TypeError('Modify the client configuration to remove a request.');
      },
      defineProperty: () => {
        throw new TypeError('Modify the client configuration to add requests.');
      },
      preventExtensions: () => false,
    }) as WebApiRequests<TOutputs, TInputs>;
  }

  public get selectedName(): string | undefined {
    return this.context
      .readConfiguration()
      .operations.find((operation) => operation.id === this.#selectedId)?.name;
  }

  public set selectedName(value: string | undefined) {
    if (value === undefined) {
      this.#selectedId = undefined;
      return;
    }
    const operation = this.context
      .readConfiguration()
      .operations.find((entry) => entry.name === value);
    if (operation === undefined) throw new RangeError(`API request "${value}" is not configured.`);
    this.#selectedId = operation.id;
  }

  public get active(): WebApiRequest {
    if (this.#selectedId === undefined)
      throw new RangeError('Select a configured API request before accessing its settings.');
    return this.byId(this.#selectedId);
  }

  public byName(name: string): WebApiRequest {
    const operation = this.context
      .readConfiguration()
      .operations.find((entry) => entry.name === name);
    if (operation === undefined) throw new RangeError(`API request "${name}" is not configured.`);
    return this.byId(operation.id);
  }

  private byId(id: string): WebApiRequest {
    this.context.readOperation(id);
    const existing = this.#requests.get(id);
    if (existing !== undefined) return existing;
    const request = new WebApiRequest(this.context, id);
    this.#requests.set(id, request);
    return request;
  }

  public changed(configuration: WebApiClientConfiguration): void {
    const ids = new Set(configuration.operations.map((operation) => operation.id));
    if (this.#selectedId !== undefined && !ids.has(this.#selectedId)) {
      this.#selectedId = configuration.operations[0]?.id;
    }
    for (const id of this.#requests.keys()) if (!ids.has(id)) this.#requests.delete(id);
  }
}
