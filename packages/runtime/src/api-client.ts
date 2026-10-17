import { WebApiRequestStore } from './api-client-store.js';
import { WebApiSelection } from './api-client-selection.js';
import type {
  WebApiBodySettings,
  WebApiCombinedInputs,
  WebApiConnectionSettings,
  WebApiHeaderValues,
  WebApiNamedParameter,
  WebApiParameterValues,
  WebApiQueryValues,
  WebApiRequest,
  WebApiDefaultInputs,
  WebApiRequests,
  WebApiRequestSettings,
  WebApiResponse,
} from './api-client-accessors.js';
import {
  resolveApiClientBodyTemplate,
  WEB_API_TEMPLATE_PARAMETER_TYPES,
  type WebApiTemplateParameter,
  type WebApiTemplateParameterType,
  type WebApiTemplateValues,
} from './api-client-template.js';
import { WebNonvisualComponent, type WebNonvisualComponentOptions } from './component.js';
import { RestGoError, type RestGoResult, type RestGoSession } from '@webrad/restgo-sdk';
import { getRestGoApplicationToken, getRestGoClient } from './restgo.js';

/** Names that must never turn an API client into a thenable or replace object behavior. */
export const WEB_API_REQUEST_RESERVED_NAMES = [
  'then',
  'constructor',
  '__proto__',
  'prototype',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
] as const;

/** Named request access with the client's existing public members protected. */
export type WebApiClientInstance<
  TOutputs extends object = Record<string, unknown>,
  TInputs extends object = Record<string, WebApiDefaultInputs>,
  TDefaultHeaders extends object = Record<string, string>,
> = WebApiClient<TOutputs, TInputs, TDefaultHeaders> &
  (string extends keyof TOutputs
    ? object
    : Pick<
        WebApiRequests<TOutputs, TInputs>,
        Exclude<
          keyof TOutputs & string,
          | keyof WebApiClient<TOutputs, TInputs, TDefaultHeaders>
          | (typeof WEB_API_REQUEST_RESERVED_NAMES)[number]
        >
      >);

export type QueryValue = string | number | boolean | null | undefined;

/** Shared by the browser tester and generated runtime for versioned requests. */
export function apiOperationPath(path: string, version?: number | null): string {
  if (version == null) return path;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError('API version must be a positive safe integer.');
  }
  const relative = path.trim();
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(relative) || relative.startsWith('//')) {
    throw new TypeError('Use a relative path when selecting an API version.');
  }
  const endpoint = relative.replace(/^\/?v\d+(?=\/|\?|#|$)/u, '').replace(/^\//u, '');
  return `/v${String(version)}/${endpoint}`;
}

export const WEB_API_RESPONSE_TYPES = ['auto', 'json', 'text', 'blob', 'arrayBuffer'] as const;
export type WebApiResponseType = (typeof WEB_API_RESPONSE_TYPES)[number];

export type WebApiBodyKind = 'none' | 'json' | 'text' | 'form-urlencoded' | 'form-data';
export type WebApiConnection = 'custom' | 'restgo-session' | 'restgo-api-token' | 'restgo-public';
export type WebApiCredentials = 'omit' | 'same-origin' | 'include';
export type WebApiOperationStatus = 'idle' | 'loading' | 'success' | 'error';

/** Structural, browser-safe counterpart of a persisted API parameter. */
export interface WebApiParameter {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly enabled: boolean;
}

export interface WebApiRequestBody {
  readonly kind: WebApiBodyKind;
  readonly content: string;
  readonly parameters?: readonly WebApiTemplateParameter[];
}

/** Structural contract consumed at runtime; it intentionally has no IDE dependency. */
export interface WebApiResponseSchemaNode {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind: 'field' | 'object' | 'list';
  readonly fieldType: string;
  readonly nullable: boolean;
  readonly children: readonly WebApiResponseSchemaNode[];
}

export interface WebApiResponseSchema {
  readonly version: 1;
  readonly root: WebApiResponseSchemaNode;
}

export interface WebApiOperation {
  readonly id: string;
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly apiVersion?: number | null;
  readonly headers: readonly WebApiParameter[];
  readonly query: readonly WebApiParameter[];
  readonly body: WebApiRequestBody;
  readonly credentials: WebApiCredentials;
  readonly timeoutMs: number | null;
  readonly responseSchema: WebApiResponseSchema | null;
}

export interface WebApiClientConfiguration {
  readonly schemaVersion: number;
  /** Omitted in existing projects, which continue to use their custom base URL. */
  readonly connection?: WebApiConnection;
  readonly defaultHeaders: readonly WebApiParameter[];
  readonly timeoutMs: number;
  readonly operations: readonly WebApiOperation[];
}

export interface WebApiRequestOptions extends Omit<RequestInit, 'body' | 'headers' | 'signal'> {
  readonly body?: unknown;
  /** Values supplied to <name> placeholders in the configured body for execute(). */
  readonly parameters?: WebApiTemplateValues;
  readonly headers?: HeadersInit;
  readonly query?: Readonly<Record<string, QueryValue | readonly QueryValue[]>>;
  readonly signal?: AbortSignal | null;
  /** Cancels the request after this duration without changing the component default. */
  readonly timeoutMs?: number | null;
  readonly responseType?: WebApiResponseType;
}

export interface WebApiClientOptions extends WebNonvisualComponentOptions {
  readonly baseUrl?: string;
  /** Programmatic default headers, kept compatible with the original client API. */
  readonly headers?: HeadersInit;
  readonly fetch?: typeof globalThis.fetch;
  /** Configuration materialized by the Project Model for named operations. */
  readonly apiClientConfig?: WebApiClientConfiguration;
}

export interface WebApiOperationState<T = unknown> {
  readonly status: WebApiOperationStatus;
  readonly data?: T;
  readonly error?: unknown;
  readonly updatedAt?: number;
}

/** Details supplied by the WebApiClient request lifecycle events. */
export interface WebApiOperationEventDetail<T = unknown> {
  readonly operation: WebApiOperation;
  readonly state: WebApiOperationState<T>;
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

export class WebApiTimeoutError extends Error {
  public constructor(
    public readonly timeoutMs: number,
    public readonly url: string,
  ) {
    super(`The API request to ${url} timed out after ${String(timeoutMs)} ms.`);
    this.name = 'WebApiTimeoutError';
  }
}

/** A real shared SDK client or an explicitly supplied, transient test-session source. */
export interface RestGoApiSessionSource {
  readonly baseUrl: string;
  getSession(): Promise<RestGoResult<Pick<RestGoSession, 'token'> | null>>;
}

export interface RestGoApplicationApiSource {
  readonly baseUrl: string;
  readonly apiToken?: string;
}

function isRestGoConnection(connection: unknown): boolean {
  return (
    connection === 'restgo-session' ||
    connection === 'restgo-api-token' ||
    connection === 'restgo-public'
  );
}

function requestMethod(method: string | undefined): string {
  const normalized = (method ?? 'GET').toUpperCase();
  if (!/^[!#$%&'*+.^_`|~\dA-Z-]+$/u.test(normalized)) {
    throw new TypeError('The HTTP method must be a valid HTTP token without spaces.');
  }
  if (normalized === 'CONNECT' || normalized === 'TRACE' || normalized === 'TRACK') {
    throw new TypeError(`${normalized} is prohibited by browser Fetch and cannot be sent.`);
  }
  return normalized;
}

function assertRequestBody(method: string, body: unknown): void {
  if ((method === 'GET' || method === 'HEAD') && body !== undefined && body !== null) {
    throw new TypeError(`${method} requests cannot have a body in browser Fetch.`);
  }
}

function hasUrlControlCharacters(value: string, includeSpace = false): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= (includeSpace ? 0x20 : 0x1f) || code === 0x7f;
  });
}

function restGoRequestUrl(baseUrl: string, endpoint: string): string {
  const base = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    /[\s\\]/u.test(baseUrl) ||
    hasUrlControlCharacters(baseUrl, true)
  ) {
    throw new TypeError(
      'The RestGo base URL must be an HTTP(S) URL without credentials, query or hash.',
    );
  }
  if (
    /^[a-z][a-z\d+.-]*:/iu.test(endpoint) ||
    endpoint.startsWith('//') ||
    /[\s\\#]/u.test(endpoint) ||
    hasUrlControlCharacters(endpoint, true)
  ) {
    throw new TypeError(
      'RestGo requests require an endpoint inside the configured integration URL.',
    );
  }
  const pathname = endpoint.split('?')[0] ?? '';
  for (const segment of pathname.split('/')) {
    let decoded = segment;
    try {
      // Also reject repeatedly encoded traversal, which proxies may decode more than once.
      for (let round = 0; round < segment.length + 1; round += 1) {
        if (
          decoded === '.' ||
          decoded === '..' ||
          /[\\/]/u.test(decoded) ||
          hasUrlControlCharacters(decoded)
        ) {
          throw new TypeError(
            'RestGo endpoints cannot contain path traversal or encoded separators.',
          );
        }
        let next: string;
        try {
          next = decodeURIComponent(decoded);
        } catch (error) {
          if (round === 0) throw error;
          break;
        }
        if (next === decoded) break;
        decoded = next;
      }
    } catch (error) {
      throw new TypeError('RestGo endpoints cannot contain path traversal or malformed encoding.', {
        cause: error,
      });
    }
  }
  const basePath = `${base.pathname.replace(/\/+$/u, '')}/`;
  const result = new URL(`${base.origin}${basePath}${endpoint.replace(/^\//u, '')}`);
  if (result.origin !== base.origin || !result.pathname.startsWith(basePath)) {
    throw new TypeError('The endpoint must remain inside the configured RestGo integration URL.');
  }
  return result.href;
}

function withAbort<T>(
  operation: () => Promise<T>,
  signal: AbortSignal | null | undefined,
): Promise<T> {
  signal?.throwIfAborted();
  if (signal === undefined || signal === null) return operation();
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    operation().then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Pins a REST request to the RestGo integration and validates its current user session.
 * The SDK validates/renews the session before the request; raw API tokens never qualify.
 * The optional source lets the IDE test with a transient JWT without persisting it.
 */
export async function prepareRestGoApiRequest(
  endpoint: string,
  options: RequestInit = {},
  source?: RestGoApiSessionSource,
): Promise<{ readonly url: string; readonly init: RequestInit }> {
  const client = source ?? getRestGoClient();
  const url = restGoRequestUrl(client.baseUrl, endpoint);
  const method = requestMethod(options.method);
  assertRequestBody(method, options.body);
  const result = await withAbort(() => client.getSession(), options.signal);
  options.signal?.throwIfAborted();
  if (result.error !== null) throw result.error;
  if (!result.data?.token.trim()) {
    throw new RestGoError('Sign in to RestGo before using this API client.', 'AUTH_REQUIRED', 401);
  }
  if (source === undefined && getRestGoClient() !== client) {
    throw new RestGoError(
      'The RestGo integration changed before the request.',
      'AUTH_OPERATION_CANCELLED',
    );
  }
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${result.data.token}`);
  if (options.body instanceof FormData) headers.delete('Content-Type');
  return {
    url,
    init: { ...options, method, headers, mode: 'cors', credentials: 'omit', redirect: 'error' },
  };
}

/** Prepares public or application-token requests without borrowing a user or admin credential. */
export function prepareRestGoApplicationApiRequest(
  endpoint: string,
  authentication: 'public' | 'api-token',
  options: RequestInit = {},
  source?: RestGoApplicationApiSource,
): { readonly url: string; readonly init: RequestInit } {
  if (authentication !== 'public' && authentication !== 'api-token') {
    throw new TypeError('Choose public access or an application API token for this request.');
  }
  const connection = source ?? {
    baseUrl: getRestGoClient().baseUrl,
    apiToken: getRestGoApplicationToken(),
  };
  const url = restGoRequestUrl(connection.baseUrl, endpoint);
  const method = requestMethod(options.method);
  assertRequestBody(method, options.body);
  options.signal?.throwIfAborted();
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  if (authentication === 'api-token') {
    const token = connection.apiToken?.trim();
    if (!token) {
      throw new RestGoError(
        'Configure an application API token in the RestGo connection.',
        'API_TOKEN_REQUIRED',
        401,
      );
    }
    if (/[\r\n]/u.test(token) || /^Bearer\s/iu.test(token)) {
      throw new TypeError('Use a raw application API token without Bearer.');
    }
    headers.set('Authorization', token);
  }
  if (options.body instanceof FormData) headers.delete('Content-Type');
  return {
    url,
    init: { ...options, method, headers, mode: 'cors', credentials: 'omit', redirect: 'error' },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function appendParameters(inputUrl: string, parameters: readonly WebApiParameter[]): string {
  const enabled = parameters.filter(
    (parameter) => parameter.enabled && parameter.name.trim().length > 0,
  );
  if (enabled.length === 0) return inputUrl;
  const hashIndex = inputUrl.indexOf('#');
  const hash = hashIndex >= 0 ? inputUrl.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? inputUrl.slice(0, hashIndex) : inputUrl;
  const separator = withoutHash.includes('?') ? '&' : '?';
  const query = new URLSearchParams();
  for (const parameter of enabled) query.append(parameter.name, parameter.value);
  return `${withoutHash}${separator}${query.toString()}${hash}`;
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

function responseType(value: unknown): WebApiResponseType {
  return WEB_API_RESPONSE_TYPES.includes(value as WebApiResponseType)
    ? (value as WebApiResponseType)
    : 'auto';
}

async function readResponseBody(
  response: Response,
  requestedType: WebApiResponseType,
  method: string,
): Promise<unknown> {
  if (method === 'HEAD' || response.status === 204 || response.status === 205) return undefined;
  switch (requestedType) {
    case 'blob':
      return response.blob();
    case 'arrayBuffer':
      return response.arrayBuffer();
    case 'text':
      return response.text();
    case 'json':
      return response.json() as Promise<unknown>;
    case 'auto': {
      const text = await response.text();
      if (text.length === 0) return undefined;
      const contentType = response.headers.get('content-type') ?? '';
      if (/[/+]json(?:;|$)/iu.test(contentType)) return JSON.parse(text) as unknown;
      return text;
    }
  }
}

function finiteTimeout(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 120_000
    ? value
    : fallback;
}

function normalizeParameters(value: unknown): readonly WebApiParameter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.name !== 'string' ||
      typeof candidate.value !== 'string'
    ) {
      return [];
    }
    return [
      {
        id:
          typeof candidate.id === 'string' && candidate.id.length > 0
            ? candidate.id
            : `parameter-${String(index + 1)}`,
        name: candidate.name,
        value: candidate.value,
        enabled: candidate.enabled !== false,
      },
    ];
  });
}

function normalizeBody(value: unknown): WebApiRequestBody {
  if (!isRecord(value)) return { kind: 'none', content: '' };
  const kind = value.kind;
  const supported =
    kind === 'none' ||
    kind === 'json' ||
    kind === 'text' ||
    kind === 'form-urlencoded' ||
    kind === 'form-data';
  let parameters: readonly WebApiTemplateParameter[] | undefined;
  if (value.parameters !== undefined) {
    if (!Array.isArray(value.parameters) || value.parameters.length > 200)
      throw new TypeError('Invalid request-body parameter definitions.');
    const names = new Set<string>();
    parameters = value.parameters.map((parameter: unknown) => {
      if (
        !isRecord(parameter) ||
        typeof parameter.name !== 'string' ||
        !/^[\p{L}_$][\p{L}\p{N}_$.-]{0,119}$/u.test(parameter.name) ||
        !WEB_API_TEMPLATE_PARAMETER_TYPES.some((type) => type === parameter.type) ||
        names.has(parameter.name)
      )
        throw new TypeError('Invalid request-body parameter definitions.');
      names.add(parameter.name);
      return { name: parameter.name, type: parameter.type as WebApiTemplateParameterType };
    });
  }
  return {
    kind: supported ? kind : 'none',
    content: typeof value.content === 'string' ? value.content : '',
    ...(parameters === undefined ? {} : { parameters }),
  };
}

function normalizeSchemaNode(value: unknown): WebApiResponseSchemaNode | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  if (kind !== 'field' && kind !== 'object' && kind !== 'list') return null;
  const children = Array.isArray(value.children)
    ? value.children.flatMap((child) => {
        const normalized = normalizeSchemaNode(child);
        return normalized === null ? [] : [normalized];
      })
    : [];
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.path !== 'string' ||
    typeof value.fieldType !== 'string'
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    path: value.path,
    kind,
    fieldType: value.fieldType,
    nullable: value.nullable === true,
    children,
  };
}

function normalizeResponseSchema(value: unknown): WebApiResponseSchema | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const root = normalizeSchemaNode(value.root);
  return root === null ? null : { version: 1, root };
}

function normalizeOperation(value: unknown, index: number): WebApiOperation | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.method !== 'string')
    return null;
  const credentials = value.credentials;
  const apiVersion = value.apiVersion;
  if (
    apiVersion != null &&
    (typeof apiVersion !== 'number' || !Number.isSafeInteger(apiVersion) || apiVersion < 1)
  ) {
    throw new RangeError('API version must be a positive safe integer.');
  }
  return {
    id:
      typeof value.id === 'string' && value.id.length > 0
        ? value.id
        : `operation-${String(index + 1)}`,
    name: value.name,
    method: value.method,
    path: typeof value.path === 'string' ? value.path : '',
    apiVersion,
    headers: normalizeParameters(value.headers),
    query: normalizeParameters(value.query),
    body: normalizeBody(value.body),
    credentials:
      credentials === 'omit' || credentials === 'same-origin' || credentials === 'include'
        ? credentials
        : 'omit',
    timeoutMs:
      typeof value.timeoutMs === 'number' &&
      Number.isInteger(value.timeoutMs) &&
      value.timeoutMs >= 1
        ? Math.min(value.timeoutMs, 120_000)
        : null,
    responseSchema: normalizeResponseSchema(value.responseSchema),
  };
}

function normalizeConfiguration(value: unknown): WebApiClientConfiguration {
  if (!isRecord(value)) {
    return { schemaVersion: 1, defaultHeaders: [], timeoutMs: 30_000, operations: [] };
  }
  return {
    schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : 1,
    ...(isRestGoConnection(value.connection) || value.connection === 'custom'
      ? { connection: value.connection as WebApiConnection }
      : {}),
    defaultHeaders: normalizeParameters(value.defaultHeaders),
    timeoutMs: finiteTimeout(value.timeoutMs, 30_000),
    operations: Array.isArray(value.operations)
      ? value.operations.flatMap((operation, index) => {
          const normalized = normalizeOperation(operation, index);
          return normalized === null ? [] : [normalized];
        })
      : [],
  };
}

function configuredBody(
  body: WebApiRequestBody,
  headers: Headers,
  parameters?: WebApiTemplateValues,
): unknown {
  const content = resolveApiClientBodyTemplate(body, parameters);
  switch (body.kind) {
    case 'none':
      return undefined;
    case 'json':
      if (content.trim().length === 0) return undefined;
      try {
        return JSON.parse(content) as unknown;
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : '';
        throw new TypeError(`The configured JSON request body is invalid.${detail}`, {
          cause: error,
        });
      }
    case 'text':
      if (!headers.has('content-type')) headers.set('content-type', 'text/plain;charset=UTF-8');
      return content;
    case 'form-urlencoded':
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
      }
      return new URLSearchParams(content);
    case 'form-data': {
      const form = new FormData();
      for (const [name, value] of new URLSearchParams(content)) form.append(name, value);
      // Fetch sets the boundary for the actual multipart payload.
      headers.delete('content-type');
      return form;
    }
  }
}

interface TimeoutSignal {
  readonly signal: AbortSignal | undefined;
  readonly cleanUp: () => void;
  readonly timedOut: () => boolean;
}

function timeoutSignal(
  signal: AbortSignal | null | undefined,
  timeoutMs: number | null,
): TimeoutSignal {
  if (timeoutMs === null || timeoutMs === undefined) {
    return { signal: signal ?? undefined, cleanUp: () => undefined, timedOut: () => false };
  }
  const controller = new AbortController();
  let hasTimedOut = false;
  const abortForSignal = (): void => controller.abort(signal?.reason);
  if (signal?.aborted) abortForSignal();
  else signal?.addEventListener('abort', abortForSignal, { once: true });
  const timeout = globalThis.setTimeout(() => {
    hasTimedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanUp: () => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortForSignal);
    },
    timedOut: () => hasTimedOut,
  };
}

function pointerTokens(pointer: string): readonly string[] {
  if (pointer.length === 0) return [];
  if (!pointer.startsWith('/')) return [];
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function resolvePointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const token of pointerTokens(pointer)) {
    if (token === '*') return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (isRecord(current)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

function findSchemaNode(
  node: WebApiResponseSchemaNode,
  idOrPathOrName: string,
): WebApiResponseSchemaNode | undefined {
  if (node.id === idOrPathOrName || node.path === idOrPathOrName || node.name === idOrPathOrName) {
    return node;
  }
  for (const child of node.children) {
    const found = findSchemaNode(child, idOrPathOrName);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Browser-safe HTTP client with direct requests and Project-Model backed named
 * operations. The latter retain transient state so future data components can
 * bind to an API result without using the DOM as a data store.
 */
export class WebApiClient<
  TOutputs extends object = Record<string, unknown>,
  TInputs extends object = Record<string, WebApiDefaultInputs>,
  TDefaultHeaders extends object = Record<string, string>,
> extends WebNonvisualComponent {
  #baseUrl: string;
  readonly #headers: Headers;
  readonly #fetch: typeof globalThis.fetch;
  readonly #store: WebApiRequestStore;
  readonly #selection: WebApiSelection<TOutputs, TInputs, TDefaultHeaders>;
  #states = new Map<string, WebApiOperationState<unknown>>();
  #data: Partial<TOutputs> = {};
  #lastOperationName: string | undefined;
  readonly #listeners = new Set<() => void>();

  readonly #directRequests = new Set<string>();

  public constructor(options: WebApiClientOptions | string = {}) {
    const normalized = typeof options === 'string' ? { baseUrl: options } : options;
    super(normalized);
    this.#baseUrl = normalized.baseUrl ?? '';
    this.#headers = new Headers(normalized.headers);
    this.#fetch = normalized.fetch ?? globalThis.fetch.bind(globalThis);
    this.#store = new WebApiRequestStore(normalizeConfiguration(normalized.apiClientConfig), {
      normalize: normalizeConfiguration,
      validateEndpoint: (value) => {
        restGoRequestUrl('https://restgo.invalid/', value);
      },
      readBaseUrl: () => this.baseUrl,
      writeBaseUrl: (value) => {
        this.baseUrl = value;
      },
      readHeaders: () => new Headers(this.#headers),
      deleteHeader: (name) => {
        this.#headers.delete(name);
      },
      readState: (name) => this.getOperationState(name),
      execute: (name, options) => this.execute(name, options),
      changed: (previous, current) => {
        const states = new Map(this.#states);
        const data: Record<string, unknown> = { ...this.#data };
        const lastId = previous.operations.find(
          (entry) => entry.name === this.#lastOperationName,
        )?.id;
        this.#states.clear();
        const nextData: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        for (const operation of current.operations) {
          const previousOperation = previous.operations.find(
            (candidate) => candidate.id === operation.id,
          );
          if (previousOperation !== undefined) {
            const state = states.get(previousOperation.name);
            if (state !== undefined) this.#states.set(operation.name, state);
            if (Object.hasOwn(data, previousOperation.name))
              nextData[operation.name] = data[previousOperation.name];
          }
        }
        this.#lastOperationName = current.operations.find((entry) => entry.id === lastId)?.name;
        this.#data = nextData as Partial<TOutputs>;
        this.#selection.changed(current);
        this.#syncDirectRequests();
        this.#notify();
      },
    });
    this.#selection = new WebApiSelection<TOutputs, TInputs, TDefaultHeaders>(this.#store);
    this.#syncDirectRequests();
  }

  /** Typed view of the same instance, used by generated page and reusable code. */
  public withRequests(): WebApiClientInstance<TOutputs, TInputs, TDefaultHeaders> {
    return this as WebApiClientInstance<TOutputs, TInputs, TDefaultHeaders>;
  }

  #syncDirectRequests(): void {
    const names = new Set(
      this.#store.readConfiguration().operations.map((operation) => operation.name),
    );
    for (const name of this.#directRequests) {
      if (!names.has(name)) {
        Reflect.deleteProperty(this, name);
        this.#directRequests.delete(name);
      }
    }
    for (const name of names) {
      if (
        this.#directRequests.has(name) ||
        name in this ||
        WEB_API_REQUEST_RESERVED_NAMES.some((reserved) => reserved === name)
      )
        continue;
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        get: () => this.#selection.byName(name),
      });
      this.#directRequests.add(name);
    }
  }

  public get baseUrl(): string {
    return isRestGoConnection(this.#store.readConfiguration().connection)
      ? getRestGoClient().baseUrl
      : this.#baseUrl;
  }

  public set baseUrl(value: string) {
    if (isRestGoConnection(this.#store.readConfiguration().connection)) {
      throw new TypeError('This API client uses the fixed URL from the RestGo integration.');
    }
    this.#baseUrl = value;
  }

  /** Immutable normalized contract configured for this client instance. */
  public get apiClientConfig(): WebApiClientConfiguration {
    return this.#store.readConfiguration();
  }
  public set apiClientConfig(value: WebApiClientConfiguration) {
    this.#store.writeConfiguration(value);
  }

  public get Configuration(): WebApiClientConfiguration {
    return this.apiClientConfig;
  }
  public set Configuration(value: WebApiClientConfiguration) {
    this.apiClientConfig = value;
  }
  public get Connection(): WebApiConnectionSettings<TDefaultHeaders> {
    return this.#selection.Connection;
  }
  public get Operation(): (keyof TOutputs & string) | undefined {
    return this.#selection.selectedName as (keyof TOutputs & string) | undefined;
  }
  public set Operation(value: (keyof TOutputs & string) | undefined) {
    this.#selection.selectedName = value;
  }

  public get Requests(): WebApiRequests<TOutputs, TInputs> {
    return this.#selection.Requests;
  }
  public get Request(): WebApiRequest<
    WebApiCombinedInputs<TInputs, 'Parameter'>,
    TOutputs[keyof TOutputs],
    WebApiCombinedInputs<TInputs, 'Query'>,
    WebApiCombinedInputs<TInputs, 'Headers'>
  > {
    return this.#selection.active as unknown as WebApiRequest<
      WebApiCombinedInputs<TInputs, 'Parameter'>,
      TOutputs[keyof TOutputs],
      WebApiCombinedInputs<TInputs, 'Query'>,
      WebApiCombinedInputs<TInputs, 'Headers'>
    >;
  }
  public get parameter(): WebApiParameterValues<WebApiCombinedInputs<TInputs, 'Parameter'>> {
    return this.Request.parameter;
  }
  public get Query(): WebApiQueryValues<WebApiCombinedInputs<TInputs, 'Query'>> {
    return this.Request.Query;
  }
  public get Headers(): WebApiHeaderValues<WebApiCombinedInputs<TInputs, 'Headers'>> {
    return this.Request.Headers;
  }
  public get Body(): WebApiBodySettings {
    return this.Request.Body;
  }
  public get Options(): WebApiRequestSettings {
    return this.Request.Options;
  }
  public get Response(): WebApiResponse<TOutputs[keyof TOutputs]> {
    return this.Request.Response;
  }
  public get Method(): string {
    return this.Request.Method;
  }
  public set Method(value: string) {
    this.Request.Method = value;
  }
  public get Endpoint(): string {
    return this.Request.Endpoint;
  }
  public set Endpoint(value: string) {
    this.Request.Endpoint = value;
  }
  public get ApiVersion(): number | null {
    return this.Request.ApiVersion;
  }
  public set ApiVersion(value: number | null) {
    this.Request.ApiVersion = value;
  }

  public RequestByName<K extends keyof TOutputs & string>(
    name: K,
  ): WebApiRequests<TOutputs, TInputs>[K];
  public RequestByName(name: string): WebApiRequest;
  public RequestByName(
    name: string,
  ): WebApiRequest | WebApiRequests<TOutputs, TInputs>[keyof TOutputs & string] {
    return this.#selection.byName(name);
  }
  public ParamByName(name: string): WebApiNamedParameter {
    return this.Request.ParamByName(name);
  }
  public ClearParameters(): void {
    this.Request.ClearParameters();
  }

  /** Saved operation metadata, safe for a Table or another consumer to inspect. */
  public get operations(): readonly WebApiOperation[] {
    return this.#store.readConfiguration().operations;
  }
  public set operations(value: readonly WebApiOperation[]) {
    this.#store.writeConfiguration({ ...this.apiClientConfig, operations: value });
  }

  /** Latest successful data, keyed by the configured operation name. */
  public get data(): Readonly<Partial<TOutputs>> {
    return this.#data;
  }

  /** State of the most recently executed operation. */
  public get status(): WebApiOperationStatus {
    return this.#lastOperationName === undefined
      ? 'idle'
      : (this.#states.get(this.#lastOperationName)?.status ?? 'idle');
  }

  public get error(): unknown {
    return this.#lastOperationName === undefined
      ? undefined
      : this.#states.get(this.#lastOperationName)?.error;
  }

  public getOperationState<T = unknown>(operationName: string): WebApiOperationState<T> {
    return (this.#states.get(operationName) ?? { status: 'idle' }) as WebApiOperationState<T>;
  }

  /** Notifies runtime consumers whenever a named operation changes state. */
  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  public async request<T>(path: string, options: WebApiRequestOptions = {}): Promise<T> {
    const method = requestMethod(options.method);
    assertRequestBody(method, options.body);
    const headers = new Headers(this.#headers);
    for (const parameter of this.#store.readConfiguration().defaultHeaders) {
      if (parameter.enabled && parameter.name.trim().length > 0) {
        headers.set(parameter.name, parameter.value);
      }
    }
    new Headers(options.headers).forEach((value, name) => headers.set(name, value));
    let body: BodyInit | null | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (isNativeBody(options.body)) body = options.body;
      else {
        body = JSON.stringify(options.body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
    } else {
      body = options.body as null | undefined;
    }
    if (body instanceof FormData) headers.delete('content-type');

    const {
      parameters: _parameters,
      query: _query,
      timeoutMs,
      responseType: requestedResponseType,
      signal,
      ...requestOptions
    } = options;
    void _query;
    void _parameters;
    const boundToRestGo = isRestGoConnection(this.#store.readConfiguration().connection);
    let url = boundToRestGo
      ? restGoRequestUrl(getRestGoClient().baseUrl, appendQuery(path, options.query))
      : appendQuery(joinUrl(this.#baseUrl, path), options.query);
    const effectiveTimeout =
      timeoutMs === undefined ? this.#store.readConfiguration().timeoutMs : timeoutMs;
    const timeout = timeoutSignal(signal, effectiveTimeout);
    try {
      let init: RequestInit = {
        ...requestOptions,
        method,
        body,
        headers,
        ...(timeout.signal === undefined ? {} : { signal: timeout.signal }),
      };
      if (boundToRestGo) {
        const prepared =
          this.#store.readConfiguration().connection === 'restgo-session'
            ? await prepareRestGoApiRequest(appendQuery(path, options.query), init)
            : prepareRestGoApplicationApiRequest(
                appendQuery(path, options.query),
                this.#store.readConfiguration().connection === 'restgo-api-token'
                  ? 'api-token'
                  : 'public',
                init,
              );
        url = prepared.url;
        init = prepared.init;
      }
      timeout.signal?.throwIfAborted();
      const response = await this.#fetch(url, init);
      const responseBody = await readResponseBody(
        response,
        responseType(requestedResponseType),
        method,
      );
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
    } catch (error) {
      if (timeout.timedOut()) throw new WebApiTimeoutError(effectiveTimeout ?? 0, url);
      throw error;
    } finally {
      timeout.cleanUp();
    }
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

  public head(path: string, options: WebApiRequestOptions = {}): Promise<void> {
    return this.request<void>(path, { ...options, method: 'HEAD' });
  }

  public options<T>(path: string, options: WebApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'OPTIONS' });
  }

  public async execute<K extends keyof TOutputs & string>(
    operationName: K,
    options?: WebApiRequestOptions,
  ): Promise<TOutputs[K]>;
  public async execute(options?: WebApiRequestOptions): Promise<TOutputs[keyof TOutputs]>;
  public async execute<T = unknown>(
    operationName: string,
    options?: WebApiRequestOptions,
  ): Promise<T>;
  public async execute<T = unknown>(
    nameOrOptions: string | WebApiRequestOptions = {},
    explicitOptions: WebApiRequestOptions = {},
  ): Promise<T> {
    const operationName =
      typeof nameOrOptions === 'string' ? nameOrOptions : this.#selection.selectedName;
    if (operationName === undefined)
      throw new RangeError('Select a configured API request before executing.');
    let options = typeof nameOrOptions === 'string' ? explicitOptions : nameOrOptions;

    const operation = this.#store
      .readConfiguration()
      .operations.find((candidate) => candidate.name === operationName);
    if (operation === undefined) {
      throw new RangeError(
        `API operation "${operationName}" is not configured for ${this.name || 'this client'}.`,
      );
    }
    this.#selection.selectedName = operation.name;
    options = {
      ...options,
      responseType: options.responseType ?? this.#store.readResponseType(operation.id),
      parameters: { ...this.#store.parameterValues(operation.id), ...options.parameters },
    };
    const stateName = (): string =>
      this.operations.find((candidate) => candidate.id === operation.id)?.name ?? operation.name;
    const bodySnapshot = this.#store.bodySnapshot(operation.id);
    const current = this.#states.get(operation.name);
    const previousData = current?.data as T | undefined;
    this.#lastOperationName = operation.name;
    const loadingState: WebApiOperationState<T> = {
      status: 'loading',
      ...(previousData === undefined ? {} : { data: previousData }),
    };
    this.#states.set(stateName(), loadingState);
    this.#notify();
    this.emit('OnRequest', {
      operation,
      state: loadingState,
    } satisfies WebApiOperationEventDetail<T>);

    try {
      const headers = new Headers(this.#headers);
      for (const parameter of [
        ...this.#store.readConfiguration().defaultHeaders,
        ...operation.headers,
      ]) {
        if (parameter.enabled && parameter.name.trim().length > 0) {
          headers.set(parameter.name, parameter.value);
        }
      }
      new Headers(options.headers).forEach((value, name) => headers.set(name, value));
      const body =
        options.body === undefined
          ? configuredBody(
              this.#store.materializeBody(bodySnapshot, options.parameters ?? {}),
              headers,
              options.parameters,
            )
          : options.body;
      const timeoutMs =
        options.timeoutMs === undefined
          ? (operation.timeoutMs ?? this.#store.readConfiguration().timeoutMs)
          : options.timeoutMs;
      const path = appendParameters(
        apiOperationPath(operation.path, operation.apiVersion),
        operation.query,
      );
      const result = await this.request<T>(path, {
        ...options,
        method: options.method ?? operation.method,
        headers,
        body,
        credentials: options.credentials ?? operation.credentials,
        timeoutMs,
      });
      this.#data = { ...this.#data, [stateName()]: result } as Partial<TOutputs>;
      const successState: WebApiOperationState<T> = {
        status: 'success',
        data: result,
        updatedAt: Date.now(),
      };
      this.#states.set(stateName(), successState);
      this.#notify();
      const detail = { operation, state: successState } satisfies WebApiOperationEventDetail<T>;
      this.emit('OnSuccess', detail);
      this.emit('OnComplete', detail);
      return result;
    } catch (error) {
      const errorState: WebApiOperationState<T> = {
        status: 'error',
        ...(previousData === undefined ? {} : { data: previousData }),
        error,
        updatedAt: Date.now(),
      };
      this.#states.set(stateName(), errorState);
      this.#notify();
      const detail = { operation, state: errorState } satisfies WebApiOperationEventDetail<T>;
      this.emit('OnError', detail);
      this.emit('OnComplete', detail);
      throw error;
    }
  }

  /** Resolves any saved schema node from the latest result of one operation. */
  public getOutputById<T = unknown>(
    operationName: string,
    schemaNodeIdOrPath: string,
  ): T | undefined {
    const operation = this.#store
      .readConfiguration()
      .operations.find((candidate) => candidate.name === operationName);
    if (operation?.responseSchema === null || operation?.responseSchema === undefined)
      return undefined;
    const node = findSchemaNode(operation.responseSchema.root, schemaNodeIdOrPath);
    if (node === undefined) return undefined;
    return resolvePointer(this.#data[operationName as keyof TOutputs], node.path) as T | undefined;
  }

  /** Returns a saved list output, or an empty readonly list when it is unavailable. */
  public getList<T = unknown>(operationName: string, schemaNodeIdOrPath: string): readonly T[] {
    const operation = this.#store
      .readConfiguration()
      .operations.find((candidate) => candidate.name === operationName);
    if (operation?.responseSchema === null || operation?.responseSchema === undefined) return [];
    const node = findSchemaNode(operation.responseSchema.root, schemaNodeIdOrPath);
    if (node?.kind !== 'list') return [];
    const value = resolvePointer(this.#data[operationName as keyof TOutputs], node.path);
    return Array.isArray(value) ? (value as readonly T[]) : [];
  }
}
