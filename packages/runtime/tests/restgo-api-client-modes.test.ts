// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  prepareRestGoApplicationApiRequest,
  WebApiClient,
  type WebApiConnection,
} from '../src/api-client.js';
import { configureRestGo } from '../src/restgo.js';

const settings = {
  enabled: true,
  baseUrl: 'https://restgo.example.test/gateway',
  apiToken: 'browser-application-token',
  apiVersion: 1,
  defaultDatabase: 'demo',
  persistSession: false,
  sessionStorage: 'memory' as const,
  storageKey: 'restgo-mode-test',
};

afterEach(() => {
  configureRestGo({ ...settings, enabled: false });
  vi.restoreAllMocks();
});

describe('RestGo public and application token API Clients', () => {
  it.each(['restgo-public', 'restgo-api-token'] as const)(
    'pins %s requests to the integration and replaces caller authorization',
    async (connection) => {
      const sdk = configureRestGo(settings)!;
      const getSession = vi.spyOn(sdk, 'getSession');
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }),
      );
      const client = new WebApiClient({
        baseUrl: 'https://unrelated.example.test',
        fetch,
        apiClientConfig: {
          schemaVersion: 1,
          connection,
          defaultHeaders: [],
          timeoutMs: 1000,
          operations: [],
        },
      });
      await expect(
        client.get('/v1/demo/items', {
          headers: { Authorization: 'caller-secret' },
          credentials: 'include',
          redirect: 'follow',
        }),
      ).resolves.toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0]!;
      expect(url).toBe('https://restgo.example.test/gateway/v1/demo/items');
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        connection === 'restgo-public' ? null : settings.apiToken,
      );
      expect(init).toMatchObject({ mode: 'cors', credentials: 'omit', redirect: 'error' });
      expect(getSession).not.toHaveBeenCalled();
      expect(() => {
        client.baseUrl = 'https://other.example.test';
      }).toThrow(/fixed URL/u);
    },
  );

  it('blocks application-token execution before any network call when the token is missing', async () => {
    configureRestGo({ ...settings, apiToken: '' });
    const fetch = vi.fn<typeof globalThis.fetch>();
    const connection: WebApiConnection = 'restgo-api-token';
    const client = new WebApiClient({
      fetch,
      apiClientConfig: {
        schemaVersion: 1,
        connection,
        defaultHeaders: [],
        timeoutMs: 1000,
        operations: [],
      },
    });
    await expect(client.get('/v1/demo/items')).rejects.toMatchObject({
      code: 'API_TOKEN_REQUIRED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://other.example.test/items',
    '../items',
    '/%252e%252e/items',
    '//other.example.test/items',
  ])('rejects unsafe endpoint %s for both application modes', (endpoint) => {
    for (const authentication of ['public', 'api-token'] as const) {
      expect(() =>
        prepareRestGoApplicationApiRequest(endpoint, authentication, {}, settings),
      ).toThrow(TypeError);
    }
  });

  it('uses the newly configured application token and refuses disabled integration', () => {
    configureRestGo(settings);
    configureRestGo({ ...settings, apiToken: 'replacement-browser-token' });
    expect(
      new Headers(prepareRestGoApplicationApiRequest('/items', 'api-token').init.headers).get(
        'Authorization',
      ),
    ).toBe('replacement-browser-token');
    configureRestGo({ ...settings, enabled: false });
    expect(() => prepareRestGoApplicationApiRequest('/items', 'public')).toThrow(/configure/u);
  });
});
