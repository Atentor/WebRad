import { describe, expect, it, vi } from 'vitest';
import { apiOperationPath, WebApiClient } from '../src/index.js';

describe('per-operation API versions', () => {
  it('preserves legacy paths and replaces explicit version prefixes', () => {
    expect(apiOperationPath('/v4/database/items')).toBe('/v4/database/items');
    expect(apiOperationPath('/v4/database/items?limit=2', 2)).toBe('/v2/database/items?limit=2');
    expect(apiOperationPath('/database/items', 3)).toBe('/v3/database/items');
    expect(() => apiOperationPath('/items', 0)).toThrow(RangeError);
    expect(() => apiOperationPath('https://example.test/items', 2)).toThrow(TypeError);
  });

  it('executes different versions on the same client and retains the reverse-proxy prefix', async () => {
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response('{}', {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const api = new WebApiClient({
      baseUrl: 'https://api.example.test/restgo',
      fetch: fetcher,
      apiClientConfig: {
        schemaVersion: 1,
        defaultHeaders: [],
        timeoutMs: 30000,
        operations: [1, 3].map((apiVersion) => ({
          id: `request-${apiVersion}`,
          name: `Request${apiVersion}`,
          apiVersion,
          method: 'GET',
          path: '/database/items',
          headers: [],
          query: [],
          body: { kind: 'none', content: '' },
          credentials: 'omit',
          timeoutMs: null,
          responseSchema: null,
        })),
      },
    });
    await api.execute('Request1');
    await api.execute('Request3');
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://api.example.test/restgo/v1/database/items',
      'https://api.example.test/restgo/v3/database/items',
    ]);
  });
});
