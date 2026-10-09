// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WebApiClient,
  type WebApiClientConfiguration,
  type WebApiClientInstance,
} from '../src/api-client.js';
import type { WebApiQueryValue } from '../src/api-client-accessors.js';
import { WebDataGrid } from '../src/data-grid.js';
import { configureRestGo } from '../src/restgo.js';

interface Outputs {
  readonly PutKey: { readonly saved: boolean };
  readonly GetKey: { readonly key: string };
}

interface Inputs {
  readonly PutKey: {
    readonly Parameter: {
      readonly idinstancia: number;
      readonly chave: string;
      readonly page: WebApiQueryValue;
    };
    readonly Query: { readonly page: WebApiQueryValue };
    readonly Headers: { readonly 'X-Request': string };
  };
  readonly GetKey: {
    readonly Parameter: { readonly chave: WebApiQueryValue; readonly page: WebApiQueryValue };
    readonly Query: { readonly chave: WebApiQueryValue; readonly page: WebApiQueryValue };
    readonly Headers: object;
  };
}

function configuration(): WebApiClientConfiguration {
  return {
    schemaVersion: 1,
    timeoutMs: 30000,
    defaultHeaders: [{ id: 'accept', name: 'Accept', value: 'application/json', enabled: true }],
    operations: [
      {
        id: 'put-key',
        name: 'PutKey',
        method: 'PUT',
        path: '/atentor/key',
        apiVersion: 1,
        headers: [],
        query: [{ id: 'page-put', name: 'page', value: '1', enabled: false }],
        body: {
          kind: 'json',
          content: '{"idinstancia":<idinstancia>,"chave":<chave>}',
          parameters: [
            { name: 'idinstancia', type: 'integer' },
            { name: 'chave', type: 'string' },
          ],
        },
        credentials: 'omit',
        timeoutMs: null,
        responseSchema: null,
      },
      {
        id: 'get-key',
        name: 'GetKey',
        method: 'GET',
        path: '/atentor/key',
        apiVersion: 1,
        headers: [],
        query: [
          { id: 'chave-get', name: 'chave', value: '', enabled: true },
          { id: 'page-get', name: 'page', value: '1', enabled: false },
        ],
        body: { kind: 'none', content: '' },
        credentials: 'omit',
        timeoutMs: null,
        responseSchema: null,
      },
    ],
  };
}

function client(): {
  readonly api: WebApiClientInstance<Outputs, Inputs, { readonly Accept: string }>;
  readonly fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
  readonly original: WebApiClientConfiguration;
} {
  const original = configuration();
  const fetch = vi.fn<typeof globalThis.fetch>(
    async (_url, options) =>
      new Response(
        JSON.stringify(options?.method === 'GET' ? { key: 'loaded' } : { saved: true }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
  );
  const api = new WebApiClient<Outputs, Inputs, { readonly Accept: string }>({
    id: 'api-client',
    name: 'ApiClient1',
    baseUrl: 'https://api.example.test',
    apiClientConfig: original,
    fetch,
  }).withRequests();
  return { api, fetch, original };
}

afterEach(() => {
  configureRestGo({
    enabled: false,
    baseUrl: '',
    apiVersion: 1,
    defaultDatabase: '',
    persistSession: false,
    sessionStorage: 'memory',
    storageKey: 'object-api',
  });
});

describe('API Client object interface', () => {
  it('exposes only canonical parameter and execution members on clients and requests', async () => {
    const { api } = client();
    expect(Reflect.has(api, 'Execute')).toBe(false);
    expect(Reflect.has(api, 'Parameter')).toBe(false);
    expect(Reflect.has(api.PutKey, 'Execute')).toBe(false);
    expect(Reflect.has(api.PutKey, 'Parameter')).toBe(false);
    api.parameter.idinstancia = 42;
    api.parameter.chave = 'canonical';
    expect(await api.execute()).toEqual({ saved: true });
  });

  it('executes a named request directly and isolates its parameters from other requests and instances', async () => {
    const { api, fetch } = client();
    const other = client().api;
    api.Operation = 'GetKey';
    api.PutKey.parameter.idinstancia = 42;
    api.PutKey.parameter.chave = 'direct';
    expect(api.Operation).toBe('GetKey');
    expect(api.PutKey.parameter).toBe(api.Requests.PutKey.parameter);
    expect(api.GetKey.parameter.chave).toBe('');
    expect(other.PutKey.parameter.idinstancia).toBeUndefined();
    const result = await api.PutKey.execute();
    expect(result.saved).toBe(true);
    expect(api.PutKey.Response.Value).toEqual({ saved: true });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      idinstancia: 42,
      chave: 'direct',
    });

    expect(Reflect.set(api, 'PutKey', {})).toBe(false);
  });

  it('updates direct names by stable ID and protects client and object members', () => {
    const { api } = client();
    const request = api.PutKey;
    request.parameter.chave = 'retained';
    request.Name = 'SaveKey';
    expect(Reflect.get(api, 'PutKey')).toBeUndefined();
    expect(Reflect.get(api, 'SaveKey')).toBe(request);
    expect(request.parameter.chave).toBe('retained');
    for (const name of ['execute', 'withRequests', 'then', '__proto__', 'constructor']) {
      request.Name = name;
      expect(api.RequestByName(name)).toBe(request);
      expect(Reflect.get(api, name)).not.toBe(request);
    }
    expect(Reflect.get(api, 'then')).toBeUndefined();
    api.operations = api.operations.filter((operation) => operation.id !== request.ID);
    expect(() => request.parameter.chave).toThrow();
  });

  it('sets named parameters, edits real settings and executes the selected request', async () => {
    const { api, fetch, original } = client();
    const grid = new WebDataGrid(document.createElement('div'));
    grid.bindApiClient(api);
    api.Operation = 'PutKey';
    api.Connection.Timeout = 12000;
    api.Connection.Headers.Accept = 'application/json';
    api.Method = 'PATCH';
    api.Endpoint = '/atentor/update-key';
    api.ApiVersion = 2;
    api.Options.Timeout = 3000;
    api.Options.ResponseType = 'json';
    api.Headers['X-Request'] = 'object-api';
    api.parameter.idinstancia = 42;
    api.parameter.chave = 'safe "value"';
    api.parameter.page = 3;
    expect(api.parameter.idinstancia).toBe(42);
    expect(api.ParamByName('idinstancia').Value).toBe(42);
    expect(
      api.Request.Definition.query.find((parameter) => parameter.name === 'page'),
    ).toMatchObject({ id: 'page-put', value: '3', enabled: true });
    const result = await api.execute();
    expect(result).toEqual({ saved: true });
    const call = fetch.mock.calls[0];
    expect(String(call?.[0])).toBe('https://api.example.test/v2/atentor/update-key?page=3');
    expect(call?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ idinstancia: 42, chave: 'safe "value"' });
    expect(new Headers(call?.[1]?.headers).get('X-Request')).toBe('object-api');
    expect(api.Response.Value).toEqual({ saved: true });
    expect(api.Response.Status).toBe('success');
    expect(api.Body.Value).toContain('<idinstancia>');
    expect(original.operations[0]?.method).toBe('PUT');
    expect(original.operations[0]?.query[0]?.enabled).toBe(false);
    expect(JSON.stringify(original)).not.toContain('safe');
    grid.dispose();
  });

  it('keeps values and responses independent for each named request and reusable instance', async () => {
    const first = client();
    const second = client();
    first.api.Requests.PutKey.parameter.idinstancia = 7;
    first.api.Requests.PutKey.parameter.chave = 'put-only';
    first.api.Requests.GetKey.parameter.chave = 'get-only';
    expect(second.api.Requests.PutKey.parameter.idinstancia).toBeUndefined();
    expect(first.api.Requests.PutKey.parameter.chave).toBe('put-only');
    await first.api.Requests.PutKey.execute();
    await first.api.Requests.GetKey.execute();
    expect(first.api.Operation).toBe('GetKey');
    expect(first.api.Requests.PutKey.Response.Value?.saved).toBe(true);
    expect(first.api.Requests.GetKey.Response.Value?.key).toBe('loaded');
    expect(String(first.fetch.mock.calls[1]?.[0])).toContain('chave=get-only');
    expect(first.api.Requests.PutKey.ID).toBe('put-key');
    expect(first.api.RequestByName('PutKey')).toBe(first.api.Requests.PutKey);
  });

  it('resolves explicit JSON templates once without rewriting saved bodies or literal parameter values', async () => {
    const original = configuration();
    const request = original.operations[0];
    if (request === undefined) throw new Error('Expected PutKey.');
    const body = {
      kind: 'json' as const,
      content:
        '{"idinstancia":<idinstancia>,"chave":<chave>,"enabled":<enabled>,"message":"Key: <chave>"}',
      parameters: [
        { name: 'idinstancia', type: 'integer' as const },
        { name: 'chave', type: 'string' as const },
        { name: 'enabled', type: 'boolean' as const },
      ],
    };
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    );
    const api = new WebApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      apiClientConfig: {
        ...original,
        operations: [
          {
            ...request,
            body,
          },
        ],
      },
    });
    const literal = '<literal> "<enabled>", "injected": true';
    api.parameter.idinstancia = 9;
    api.parameter.chave = literal;
    api.parameter.enabled = true;
    await api.execute();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      idinstancia: 9,
      chave: literal,
      enabled: true,
      message: `Key: ${literal}`,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(api.Body.Value).toBe(body.content);
    expect(api.Request.Definition.body).toEqual(body);
    expect(api.parameter.chave).toBe(literal);
  });

  it('validates setters, protects request identities and keeps explicit options compatible', async () => {
    const { api, fetch } = client();
    expect(() => {
      api.parameter.idinstancia = 1.5;
    }).toThrow('integer');
    expect(() => {
      api.ParamByName('missing').Value = 'value';
    }).toThrow('not configured');
    expect(() => {
      api.Options.Timeout = -1;
    }).toThrow('Timeout');
    expect(() => {
      api.Request.Definition = { ...api.Request.Definition, id: 'replacement' };
    }).toThrow('ID');
    api.ParamByName('idinstancia').Type = 'number';
    api.ParamByName('idinstancia').Value = 2.5;
    api.parameter.chave = 'stored';
    await api.execute('PutKey', { parameters: { chave: 'one-call' } });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      idinstancia: 2.5,
      chave: 'one-call',
    });
    expect(api.parameter.chave).toBe('stored');
    api.ClearParameters();
    await expect(api.execute()).rejects.toThrow('requires a value');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reflects configuration changes and preserves a request object through rename', async () => {
    const { api } = client();
    const request = api.Requests.PutKey;
    request.Name = 'SaveKey';
    expect(api.RequestByName('SaveKey')).toBe(request);
    expect(api.Operation).toBe('SaveKey');
    request.Query.page = 2;
    request.Definition = {
      ...request.Definition,
      query: [{ id: 'page-put', name: 'page', value: '8', enabled: true }],
    };
    expect(request.Query.page).toBe('8');
    expect(request.ID).toBe('put-key');
    expect(Object.isFrozen(api.Configuration)).toBe(true);
  });

  it('preserves fixed RestGo URLs and isolates application-token and public authorization', async () => {
    configureRestGo({
      enabled: true,
      baseUrl: 'https://restgo.example.test/backend',
      apiToken: 'rgo.application-token',
      apiVersion: 1,
      defaultDatabase: 'atentor',
      persistSession: false,
      sessionStorage: 'memory',
      storageKey: 'object-api',
    });
    const { api, fetch } = client();
    api.Connection.Mode = 'restgo-api-token';
    expect(api.Connection.BaseURL).toBe('https://restgo.example.test/backend');
    expect(() => {
      api.Connection.BaseURL = 'https://escape.example.test';
    }).toThrow('fixed URL');
    expect(() => {
      api.Endpoint = '//escape.example.test';
    }).toThrow('configured integration');
    expect(() => {
      api.Connection.Headers.Authorization = 'override';
    }).toThrow('automatically');
    expect(() => {
      api.Headers.Authorization = 'override';
    }).toThrow('automatically');
    api.parameter.idinstancia = 4;
    api.parameter.chave = 'key';
    await api.execute();
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'rgo.application-token',
    );
    api.Connection.Mode = 'restgo-public';
    await api.execute();
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBeNull();
    expect(fetch.mock.calls[1]?.[1]?.credentials).toBe('omit');
  });
});
