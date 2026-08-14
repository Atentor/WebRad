import { WebNonvisualComponent, type WebNonvisualComponentOptions } from './component.js';

export type QueryValue = string | number | boolean | null | undefined;

export interface WebApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  readonly body?: unknown;
  readonly headers?: HeadersInit;
  readonly query?: Readonly<Record<string, QueryValue | readonly QueryValue[]>>;
}

export interface WebApiClientOptions extends WebNonvisualComponentOptions {
  readonly baseUrl?: string;
  readonly headers?: HeadersInit;
  readonly fetch?: typeof globalThis.fetch;
}

export class WebApiError<TBody = unknown> extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
    public readonly body: TBody,
    public readonly response: Response,
  ) {
    super(message);
    this.name = 'WebApiError';
  }
}

function isAbsoluteUrl(value: string): boolean {
  try {
    return new URL(value).protocol.length > 0;
  } catch {
    return false;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  if (baseUrl.length === 0 || isAbsoluteUrl(path)) return path;
  if (isAbsoluteUrl(baseUrl)) {
    const relativePath = path.startsWith('/') ? path.slice(1) : path;
    return new URL(relativePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
  }
  const left = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const right = path.startsWith('/') ? path.slice(1) : path;
  return `${left}/${right}`;
}

function appendQuery(
  inputUrl: string,
  query: Readonly<Record<string, QueryValue | readonly QueryValue[]>> | undefined,
): string {
  if (query === undefined) return inputUrl;
  const hashIndex = inputUrl.indexOf('#');
  const hash = hashIndex >= 0 ? inputUrl.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? inputUrl.slice(0, hashIndex) : inputUrl;
  const separator = withoutHash.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  for (const [name, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== null && value !== undefined) params.append(name, String(value));
    }
  }
  const encoded = params.toString();
  return encoded.length === 0 ? inputUrl : `${withoutHash}${separator}${encoded}${hash}`;
}

function isNativeBody(value: unknown): value is BodyInit {
  return (
    typeof value === 'string' ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof ReadableStream
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (text.length === 0) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) return JSON.parse(text) as unknown;
  return text;
}

export class WebApiClient extends WebNonvisualComponent {
  #baseUrl: string;
  readonly #headers: Headers;
  readonly #fetch: typeof globalThis.fetch;

  public constructor(options: WebApiClientOptions | string = {}) {
    const normalized = typeof options === 'string' ? { baseUrl: options } : options;
    super(normalized);
    this.#baseUrl = normalized.baseUrl ?? '';
    this.#headers = new Headers(normalized.headers);
    this.#fetch = normalized.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public get baseUrl(): string {
    return this.#baseUrl;
  }

  public set baseUrl(value: string) {
    this.#baseUrl = value;
  }

  public async request<T>(path: string, options: WebApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(this.#headers);
    new Headers(options.headers).forEach((value, name) => headers.set(name, value));
    let body: BodyInit | null | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (isNativeBody(options.body)) body = options.body;
      else {
        body = JSON.stringify(options.body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
    } else {
      body = options.body;
    }

    const url = appendQuery(joinUrl(this.#baseUrl, path), options.query);
    const { query: _query, ...requestOptions } = options;
    void _query;
    const response = await this.#fetch(url, { ...requestOptions, body, headers });
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new WebApiError(
        `HTTP ${String(response.status)} ${response.statusText}`.trim(),
        response.status,
        response.statusText,
        response.url || url,
        responseBody,
        response,
      );
    }
    return responseBody as T;
  }

  public get<T>(path: string, options: WebApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T>(path: string, body?: unknown, options: WebApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  public put<T>(path: string, body?: unknown, options: WebApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  public patch<T>(path: string, body?: unknown, options: WebApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  public delete<T>(path: string, options: WebApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}
