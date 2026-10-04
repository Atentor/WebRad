import { failure, isRecord, success, type RestGoResult } from './errors';
import { type RestGoTransport } from './transport';
import type { RestGoDynamicMetadata, RestGoDynamicOptions } from './types';

export type RestGoDynamicResult<T> = RestGoResult<T> & RestGoDynamicMetadata;
export type RestGoHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export interface RestGoEndpointOptions {
  database?: string;
  version?: number;
}

export class RestGoEndpoint<T = unknown> {
  constructor(
    private readonly transport: RestGoTransport,
    private readonly database: string,
    private readonly name: string,
    private readonly version?: number,
  ) {}

  get<U = T>(options: RestGoDynamicOptions = {}): Promise<RestGoDynamicResult<U>> {
    return this.request('GET', undefined, options);
  }
  post<U = T>(body?: unknown, options: RestGoDynamicOptions = {}): Promise<RestGoDynamicResult<U>> {
    return this.request('POST', body, options);
  }
  put<U = T>(body?: unknown, options: RestGoDynamicOptions = {}): Promise<RestGoDynamicResult<U>> {
    return this.request('PUT', body, options);
  }
  patch<U = T>(
    body?: unknown,
    options: RestGoDynamicOptions = {},
  ): Promise<RestGoDynamicResult<U>> {
    return this.request('PATCH', body, options);
  }
  delete<U = T>(
    body?: unknown,
    options: RestGoDynamicOptions = {},
  ): Promise<RestGoDynamicResult<U>> {
    return this.request('DELETE', body, options);
  }
  head(options: RestGoDynamicOptions = {}): Promise<RestGoDynamicResult<null>> {
    return this.request('HEAD', undefined, options);
  }
  options<U = T>(options: RestGoDynamicOptions = {}): Promise<RestGoDynamicResult<U>> {
    return this.request('OPTIONS', undefined, options);
  }

  async request<U = T>(
    method: RestGoHttpMethod,
    body?: unknown,
    options: RestGoDynamicOptions = {},
  ): Promise<RestGoDynamicResult<U>> {
    const version = options.version ?? this.version ?? this.transport.apiVersion;
    if (
      !/^[A-Za-z0-9_-]+$/.test(this.database) ||
      !/^[A-Za-z0-9_-]+$/.test(this.name) ||
      !Number.isSafeInteger(version) ||
      version < 1
    ) {
      return failure(
        'A valid database slug, endpoint slug and API version are required.',
        'INVALID_ARGUMENT',
      );
    }
    if (options.page !== undefined && (!Number.isSafeInteger(options.page) || options.page < 1)) {
      return failure('page must be a positive safe integer.', 'INVALID_ARGUMENT');
    }
    if (
      options.pagination === 'cursor' &&
      (!options.cursorColumn ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(options.cursorColumn) ||
        (options.page !== undefined && options.page !== 1))
    ) {
      return failure(
        'Cursor pagination requires a valid cursorColumn and page 1.',
        'INVALID_ARGUMENT',
      );
    }
    if (options.cursor && options.cursor.length > 4096) {
      return failure('Cursor must contain at most 4096 characters.', 'INVALID_ARGUMENT');
    }
    const headers = new Headers(options.headers);
    if (options.pagination) headers.set('X-RestGo-Pagination', options.pagination);
    if (options.cursorColumn) headers.set('X-RestGo-Cursor-Column', options.cursorColumn);
    if (options.cursor) headers.set('X-RestGo-Cursor', options.cursor);
    const query = { ...options.query };
    if (options.page !== undefined) query.page = options.page;
    const result = await this.transport.request<unknown>(
      `/v${version}/${encodeURIComponent(this.database)}/${encodeURIComponent(this.name)}`,
      { method, body, headers, query, signal: options.signal, auth: options.auth },
    );
    if (result.error) return result;
    if (method === 'HEAD') return success(null as U);
    if (!isRecord(result.data) || typeof result.data.success !== 'boolean') {
      return failure('RestGo returned an invalid dynamic API envelope.', 'INVALID_RESPONSE');
    }
    if (!result.data.success) {
      return failure(
        typeof result.data.error === 'string' ? result.data.error : 'RestGo operation failed.',
        'HTTP_ERROR',
        200,
        result.data,
      );
    }
    const metadata: RestGoDynamicMetadata = {};
    if (typeof result.data.page === 'number') metadata.page = result.data.page;
    if (typeof result.data.total_pages === 'number') metadata.total_pages = result.data.total_pages;
    if (typeof result.data.has_more === 'boolean') metadata.has_more = result.data.has_more;
    if (typeof result.data.next_cursor === 'string') metadata.next_cursor = result.data.next_cursor;
    return { data: (result.data.data ?? null) as U, error: null, ...metadata };
  }
}

export class RestGoDatabase {
  constructor(
    private readonly transport: RestGoTransport,
    private readonly database: string,
  ) {}
  endpoint<T = unknown>(name: string, options: { version?: number } = {}): RestGoEndpoint<T> {
    return new RestGoEndpoint<T>(this.transport, this.database, name, options.version);
  }
}

/** Calls published endpoints. RestGo does not expose Supabase table/SQL operations. */
export class RestGoApiClient {
  constructor(private readonly transport: RestGoTransport) {}
  from(database: string = this.transport.defaultDatabase): RestGoDatabase {
    return new RestGoDatabase(this.transport, database);
  }
  endpoint<T = unknown>(name: string, options: RestGoEndpointOptions = {}): RestGoEndpoint<T> {
    return new RestGoEndpoint<T>(
      this.transport,
      options.database ?? this.transport.defaultDatabase,
      name,
      options.version,
    );
  }
}
