import { failure, isRecord, success, type RestGoResult } from './errors';
import type {
  RestGoClientOptions,
  RestGoCredentialMode,
  RestGoRequestOptions,
  RestGoSession,
} from './types';

export interface TransportRequest extends RestGoRequestOptions {
  method?: string;
  body?: unknown;
  auth?: RestGoCredentialMode;
  token?: string;
  responseType?: 'json' | 'blob';
  /** A 401 from this endpoint definitively rejects the user session. */
  sessionAuthority?: boolean;
  skipUnauthorized?: boolean;
}

export class RestGoTransport {
  readonly baseUrl: string;
  readonly apiVersion: number;
  readonly defaultDatabase: string;
  readonly apiToken: string | undefined;
  private readonly fetcher: typeof fetch;
  session: () => RestGoSession | null = () => null;
  sessionVersion: () => number = () => 0;
  prepareSession: () => Promise<RestGoResult<null>> = async () => success(null);
  unauthorized: (
    token: string,
    authoritative: boolean,
  ) => Promise<RestGoResult<RestGoSession | null>> = async () => success(null);

  constructor(baseUrl: string, options: RestGoClientOptions) {
    if (/[\\?#]/.test(baseUrl)) {
      throw new TypeError('RestGo baseUrl cannot contain a backslash, query or hash.');
    }
    const parsed = new URL(baseUrl);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new TypeError(
        'RestGo baseUrl must be an HTTP(S) URL without credentials, query or hash.',
      );
    }
    this.baseUrl = parsed.href.replace(/\/+$/, '');
    this.apiVersion = options.apiVersion ?? 1;
    if (!Number.isSafeInteger(this.apiVersion) || this.apiVersion < 1) {
      throw new TypeError('RestGo apiVersion must be a positive safe integer.');
    }
    this.defaultDatabase = options.defaultDatabase ?? '';
    this.apiToken = options.apiToken;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  url(path: string, options: RestGoRequestOptions = {}): string {
    const result = new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`);
    for (const [name, input] of Object.entries(options.query ?? {})) {
      for (const value of Array.isArray(input) ? input : [input]) {
        if (value !== undefined && value !== null) result.searchParams.append(name, String(value));
      }
    }
    return result.href;
  }

  async request<T>(path: string, options: TransportRequest = {}): Promise<RestGoResult<T>> {
    let usedSessionToken: string | undefined;
    let usedSessionVersion: number | undefined;
    try {
      if (options.signal?.aborted) return failure('RestGo request was aborted.', 'ABORTED');
      const mode = options.auth ?? 'auto';
      const headers = new Headers(options.headers);
      if (headers.has('Authorization')) {
        return failure('Use the auth option to choose credentials.', 'INVALID_ARGUMENT');
      }
      if (!options.token && (mode === 'session' || (mode === 'auto' && this.session()))) {
        const prepared = await this.prepareSession();
        if (prepared.error) return prepared;
        if (options.signal?.aborted) return failure('RestGo request was aborted.', 'ABORTED');
      }
      const session = this.session();
      let credential: string | undefined;
      if (options.token) {
        credential = `Bearer ${options.token}`;
        usedSessionToken = options.token;
      } else if (mode === 'session' || (mode === 'auto' && session)) {
        if (!session) return failure('A user session is required.', 'AUTH_REQUIRED', 401);
        credential = `Bearer ${session.token}`;
        usedSessionToken = session.token;
      } else if (mode === 'apiToken' || (mode === 'auto' && this.apiToken)) {
        if (!this.apiToken)
          return failure('An active API token is required.', 'API_TOKEN_REQUIRED', 401);
        credential = this.apiToken;
      }
      if (credential) headers.set('Authorization', credential);
      if (usedSessionToken) usedSessionVersion = this.sessionVersion();
      let body: BodyInit | undefined;
      if (options.body instanceof FormData || options.body instanceof Blob) {
        body = options.body;
        headers.delete('Content-Type');
      } else if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        headers.set('Content-Type', 'application/json');
      }
      const response = await this.fetcher(this.url(path, options), {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: options.signal,
        // The SDK uses explicit JWT/API-token headers, never ambient dashboard cookies.
        credentials: 'omit',
        redirect: 'error',
      });
      if (!response.ok) {
        let details: unknown;
        try {
          details = JSON.parse(await response.text());
        } catch {
          details = undefined;
        }
        if (response.status === 401 && usedSessionToken && !options.skipUnauthorized) {
          if (options.signal?.aborted) return failure('RestGo request was aborted.', 'ABORTED');
          if (usedSessionVersion !== this.sessionVersion())
            return failure(
              'The session changed while the request was in flight.',
              'AUTH_OPERATION_CANCELLED',
            );
          const renewed = await this.unauthorized(
            usedSessionToken,
            options.sessionAuthority ?? false,
          );
          if (usedSessionVersion !== this.sessionVersion())
            return failure(
              'The session changed while the request was in flight.',
              'AUTH_OPERATION_CANCELLED',
            );
          if (renewed.error) return renewed;
          if (renewed.data && renewed.data.token !== usedSessionToken) {
            return this.request<T>(path, {
              ...options,
              token: renewed.data.token,
              skipUnauthorized: true,
            });
          }
        }
        const message =
          isRecord(details) && typeof details.error === 'string'
            ? details.error
            : `RestGo request failed (${response.status}).`;
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const retryAfterMs =
          retryAfter === null
            ? undefined
            : Math.max(
                0,
                Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now(),
              );
        return failure(
          message,
          'HTTP_ERROR',
          response.status,
          details,
          retryAfterMs !== undefined && Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
        );
      }
      if (options.responseType === 'blob') return success((await response.blob()) as T);
      if (response.status === 204 || options.method === 'HEAD') return success(null as T);
      const content = await response.text();
      if (content === '') return success(null as T);
      try {
        return success(JSON.parse(content) as T);
      } catch {
        return failure('RestGo returned invalid JSON.', 'INVALID_RESPONSE', response.status);
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return failure(
        aborted ? 'RestGo request was aborted.' : 'Unable to reach RestGo.',
        aborted ? 'ABORTED' : 'NETWORK_ERROR',
        0,
        error,
      );
    }
  }
}
