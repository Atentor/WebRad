// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  prepareRestGoApiRequest,
  WebApiClient,
  WebApiTimeoutError,
  type RestGoApiSessionSource,
  type WebApiClientConfiguration,
  type WebApiRequestBody,
} from '../src/api-client.js';
import { configureRestGo, type RestGoRuntimeConfiguration } from '../src/restgo.js';

const integration: RestGoRuntimeConfiguration = {
  enabled: true,
  baseUrl: 'https://restgo.example.test/gateway',
  apiToken: 'rgo.raw-token-must-not-be-used',
  apiVersion: 2,
  defaultDatabase: 'demo',
  persistSession: false,
  sessionStorage: 'memory',
  storageKey: 'api-client-restgo-test',
};

const user = {
  id: 'user-ana',
  email: 'ana@example.test',
  fullName: 'Ana',
  avatarUrl: null,
  active: true,
  emailConfirmed: true,
};

function operationConfiguration(
  body: WebApiRequestBody = { kind: 'none', content: '' },
  connection: 'custom' | 'restgo-session' = 'custom',
): WebApiClientConfiguration {
  return {
    schemaVersion: 1,
    connection,
    defaultHeaders: [],
    timeoutMs: 30_000,
    operations: [
      {
        id: 'load',
        name: 'Load',
        method: body.kind === 'none' ? 'GET' : 'POST',
        path: '/v2/demo/customers',
        headers: [],
        query: [],
        body,
        credentials: 'include',
        timeoutMs: null,
        responseSchema: null,
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sessionSource(): RestGoApiSessionSource {
  return {
    baseUrl: integration.baseUrl,
    getSession: vi.fn(async () => ({ data: { token: 'test-only-jwt' }, error: null })),
  };
}

afterEach(() => {
  configureRestGo({ ...integration, enabled: false });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('REST request support', () => {
  it('sends all browser-supported REST verbs and valid custom methods', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ success: true }));
    const api = new WebApiClient({ baseUrl: 'https://api.example.test', fetch });
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'propfind']) {
      await api.request('/resource', { method });
    }
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
      'PROPFIND',
    ]);
    await expect(api.head('/resource', { responseType: 'json' })).resolves.toBeUndefined();
    await expect(api.options('/resource')).resolves.toEqual({ success: true });
  });

  it.each(['CONNECT', 'TRACE', 'TRACK'])(
    'explains why %s cannot run in a browser',
    async (method) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const api = new WebApiClient({ fetch });
      await expect(api.request('/resource', { method })).rejects.toThrow(
        'prohibited by browser Fetch',
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid HTTP methods and GET/HEAD request bodies before fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const api = new WebApiClient({ fetch });
    await expect(api.request('/resource', { method: 'GET POST' })).rejects.toThrow(
      'valid HTTP token',
    );
    await expect(api.get('/resource', { body: { invalid: true } })).rejects.toThrow(
      'GET requests cannot',
    );
    await expect(api.head('/resource', { body: '' })).rejects.toThrow('HEAD requests cannot');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([204, 205])('does not parse a JSON body for HTTP %s', async (status) => {
    const api = new WebApiClient({ fetch: async () => new Response(null, { status }) });
    await expect(api.get('/resource', { responseType: 'json' })).resolves.toBeUndefined();
  });

  it('materializes multipart fields and lets Fetch generate its boundary', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get('name')).toBe('Ana Silva');
      expect(form.getAll('tag')).toEqual(['first', 'second']);
      return jsonResponse({ success: true });
    });
    const api = new WebApiClient({
      fetch,
      headers: { 'Content-Type': 'multipart/form-data;boundary=wrong' },
      apiClientConfig: operationConfiguration({
        kind: 'form-data',
        content: 'name=Ana+Silva&tag=first&tag=second',
      }),
    });
    await api.execute('Load');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('accepts files through native FormData overrides without a persisted multipart header', async () => {
    const form = new FormData();
    const file = new File(['avatar'], 'ana.txt', { type: 'text/plain' });
    form.append('file', file);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect(init?.body).toBe(form);
      expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
      expect((init?.body as FormData).get('file')).toBe(file);
      return new Response(null, { status: 204 });
    });
    const api = new WebApiClient({ fetch, apiClientConfig: operationConfiguration() });
    await api.execute('Load', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('reports configured body errors through operation state and completion events', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const api = new WebApiClient({
      fetch,
      apiClientConfig: operationConfiguration({ kind: 'json', content: '{invalid' }),
    });
    const events: string[] = [];
    for (const name of ['OnRequest', 'OnError', 'OnComplete'] as const) {
      api.bindEvent(name, () => {
        events.push(name);
      });
    }
    await expect(api.execute('Load')).rejects.toThrow('configured JSON request body is invalid');
    expect(api.status).toBe('error');
    expect(events).toEqual(['OnRequest', 'OnError', 'OnComplete']);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('authenticated RestGo binding', () => {
  it('pins URL and credentials to the configured integration and current user JWT', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname === '/gateway/auth/token') {
        return jsonResponse({ token: 'jwt-ana', expiresAt: '2099-01-01T00:00:00Z', user });
      }
      if (pathname === '/gateway/auth/session') return jsonResponse({ success: true, user });
      return jsonResponse({ customers: ['Ana'] });
    });
    vi.stubGlobal('fetch', fetch);
    const shared = configureRestGo(integration);
    expect((await shared!.login(user.email, 'secret')).error).toBeNull();
    const api = new WebApiClient({
      baseUrl: 'https://wrong.example.test',
      headers: { Authorization: 'rgo.wrong', 'X-Tenant': 'demo' },
      apiClientConfig: operationConfiguration(undefined, 'restgo-session'),
    });
    expect(api.baseUrl).toBe(integration.baseUrl);
    expect(() => {
      api.baseUrl = 'https://other.example.test';
    }).toThrow('fixed URL');
    await expect(
      api.execute('Load', {
        headers: { authorization: 'Bearer caller-override' },
        credentials: 'include',
        redirect: 'follow',
        query: { redirect: 'https://other.example.test/path', page: [1, 2] },
      }),
    ).resolves.toEqual({ customers: ['Ana'] });
    const [url, init] = fetch.mock.calls.at(-1)!;
    expect(String(url)).toBe(
      'https://restgo.example.test/gateway/v2/demo/customers?redirect=https%3A%2F%2Fother.example.test%2Fpath&page=1&page=2',
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt-ana');
    expect(new Headers(init?.headers).get('X-Tenant')).toBe('demo');
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
  });

  it('applies per-operation API versions beneath the bound integration prefix', async () => {
    const fetcher = vi.fn<typeof globalThis.fetch>(async () => jsonResponse({ customers: [] }));
    const shared = configureRestGo(integration)!;
    vi.spyOn(shared, 'getSession').mockResolvedValue({
      data: { token: 'jwt-current', expiresAt: '2099-01-01T00:00:00Z', user },
      error: null,
    });
    const configuration = operationConfiguration(undefined, 'restgo-session');
    const api = new WebApiClient({
      fetch: fetcher,
      apiClientConfig: {
        ...configuration,
        operations: configuration.operations.map((operation) => ({
          ...operation,
          path: '/v1/demo/customers',
          apiVersion: 3,
        })),
      },
    });
    await api.execute('Load');
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://restgo.example.test/gateway/v3/demo/customers',
    );
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jwt-current',
    );
  });

  it('uses rotated JWTs and refuses to fall back to a raw API token after logout', async () => {
    let rejectFirstJwt = false;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      if (pathname.endsWith('/auth/token')) {
        return jsonResponse({
          token: 'jwt-first',
          expiresAt: '2099-01-01T00:00:00Z',
          refreshToken: 'refresh-first',
          refreshExpiresAt: '2099-02-01T00:00:00Z',
          user,
        });
      }
      if (pathname.endsWith('/auth/refresh')) {
        expect(init?.body).toBe('{"refreshToken":"refresh-first"}');
        return jsonResponse({
          token: 'jwt-rotated',
          expiresAt: '2099-01-01T00:00:00Z',
          refreshToken: 'refresh-rotated',
          refreshExpiresAt: '2099-02-01T00:00:00Z',
          user,
        });
      }
      if (pathname.endsWith('/auth/session')) {
        if (
          rejectFirstJwt &&
          new Headers(init?.headers).get('Authorization') === 'Bearer jwt-first'
        ) {
          return jsonResponse({ error: 'expired' }, 401);
        }
        return jsonResponse({ success: true, user });
      }
      return jsonResponse({ success: true });
    });
    vi.stubGlobal('fetch', fetch);
    const shared = configureRestGo(integration)!;
    await shared.login(user.email, 'secret');
    const api = new WebApiClient({
      apiClientConfig: operationConfiguration(undefined, 'restgo-session'),
    });
    await api.execute('Load');
    rejectFirstJwt = true;
    await api.execute('Load');
    const apiCalls = fetch.mock.calls.filter(([input]) =>
      String(input).includes('/v2/demo/customers'),
    );
    expect(apiCalls.map(([, init]) => new Headers(init?.headers).get('Authorization'))).toEqual([
      'Bearer jwt-first',
      'Bearer jwt-rotated',
    ]);
    await shared.logout();
    const callsAfterLogout = fetch.mock.calls.length;
    await expect(api.execute('Load')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(api.status).toBe('error');
    expect(fetch).toHaveBeenCalledTimes(callsAfterLogout);
  });

  it('refuses anonymous and disabled integrations without an API request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    configureRestGo(integration);
    const api = new WebApiClient({
      apiClientConfig: operationConfiguration(undefined, 'restgo-session'),
    });
    await expect(api.execute('Load')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    configureRestGo({ ...integration, enabled: false });
    await expect(api.execute('Load')).rejects.toMatchObject({ name: 'RestGoNotConfiguredError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://other.example.test/steal',
    '//other.example.test/steal',
    '\\other.example.test/steal',
    '/items\\..\\steal',
    '/items/../steal',
    './steal',
    '/items/%2e%2e/steal',
    '/items/%252e%252e/steal',
    '/items/%2f..%2fsteal',
    ' https://other.example.test',
    '/items\n/steal',
    '/items#fragment',
    '/items/%oops',
    '/items/%00',
    '/items/%7f',
  ])('rejects unsafe endpoint %j before obtaining a user token', async (endpoint) => {
    const source = sessionSource();
    await expect(prepareRestGoApiRequest(endpoint, {}, source)).rejects.toBeInstanceOf(TypeError);
    expect(source.getSession).not.toHaveBeenCalled();
  });

  it('allows a safe endpoint below a reverse-proxy prefix with ordinary query values', async () => {
    const prepared = await prepareRestGoApiRequest(
      '/items?next=https://example.test/../ok',
      {},
      sessionSource(),
    );
    expect(prepared.url).toBe(
      'https://restgo.example.test/gateway/items?next=https://example.test/../ok',
    );
    expect(new Headers(prepared.init.headers).get('Authorization')).toBe('Bearer test-only-jwt');
    expect(prepared.init.credentials).toBe('omit');
    expect(prepared.init.redirect).toBe('error');
  });

  it('forces CORS so no-cors cannot silently remove the required Authorization header', async () => {
    const prepared = await prepareRestGoApiRequest('/items', { mode: 'no-cors' }, sessionSource());
    expect(prepared.init.mode).toBe('cors');
    expect(new Headers(prepared.init.headers).get('Authorization')).toBe('Bearer test-only-jwt');
  });

  it('covers asynchronous session validation with the request timeout and never sends after abort', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const shared = configureRestGo(integration)!;
    await shared.auth.ready;
    let complete: ((value: Awaited<ReturnType<typeof shared.getSession>>) => void) | undefined;
    vi.spyOn(shared, 'getSession').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const api = new WebApiClient({
      apiClientConfig: operationConfiguration(undefined, 'restgo-session'),
    });
    const timedOut = expect(api.execute('Load', { timeoutMs: 10 })).rejects.toBeInstanceOf(
      WebApiTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(10);
    await timedOut;
    complete?.({
      data: { token: 'late-jwt', expiresAt: '2099-01-01T00:00:00Z', user },
      error: null,
    });
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    expect(api.status).toBe('error');
  });

  it('does not validate a session or send a request when the caller has already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled by caller', 'AbortError'));
    const source = sessionSource();
    await expect(
      prepareRestGoApiRequest('/items', { signal: controller.signal }, source),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(source.getSession).not.toHaveBeenCalled();
  });
});
