import { describe, expect, it } from 'vitest';
import {
  createDefaultApiClientConfiguration,
  getTypeScriptIdentifierError,
  type ApiClientConfiguration,
  type ApiClientOperation,
} from '@webrad/project-model';
import {
  getRestGoPublishedApiConnection,
  getRestGoSqlParameterNames,
  importRestGoPublishedApis,
  type RestGoPublishedApi,
} from '../src/restgo-api-import.js';

function published(patch: Partial<RestGoPublishedApi> = {}): RestGoPublishedApi {
  return {
    id: 'publication:1',
    name: 'customers',
    database: 'sales',
    endpoint: 'customers',
    method: 'GET',
    apiVersion: 2,
    authentication: 'jwt',
    kind: 'sql',
    script: 'SELECT id FROM customers WHERE active = :active',
    ...patch,
  };
}

function operation(configuration: ApiClientConfiguration): ApiClientOperation {
  const result = configuration.operations[0];
  if (result === undefined) throw new Error('Expected a saved operation.');
  return result;
}

describe('RestGo published API import', () => {
  it('extracts unique named parameters while ignoring PostgreSQL casts and lexical literals', () => {
    const script = [
      `SELECT :id::uuid, ':quoted', 'it''s :escaped', "column:quoted", :_active;`,
      '-- :line_comment',
      '/* :comment /* :nested */ :still_comment */',
      'DO $body$ BEGIN value := :dollar_quoted; END $body$;',
      'SELECT $$:unlabelled$$, :id, :pageSize, :_active;',
    ].join('\n');
    expect(getRestGoSqlParameterNames(script)).toEqual(['id', '_active', 'pageSize']);
  });

  it('imports the exact database, method and version without a fabricated output contract', () => {
    const configuration = importRestGoPublishedApis([published()]);
    expect(configuration.connection).toBe('restgo-session');
    expect(configuration.operations).toHaveLength(1);
    expect(operation(configuration)).toMatchObject({
      path: '/sales/customers',
      method: 'GET',
      apiVersion: 2,
      body: { kind: 'none', content: '' },
      responseSchema: null,
      credentials: 'omit',
      query: [
        { name: 'active', value: '', enabled: true },
        { name: 'page', value: '1', enabled: false },
      ],
    });
  });

  it('keeps generated IDs and TypeScript names unique when catalog names and IDs collide', () => {
    const configuration = importRestGoPublishedApis([
      published({ id: 'same', name: '1 lista de clientes' }),
      published({ id: 'same', name: '1 lista de clientes', database: 'inventory' }),
    ]);
    expect(configuration.operations).toHaveLength(2);
    expect(new Set(configuration.operations.map(({ id }) => id)).size).toBe(2);
    expect(new Set(configuration.operations.map(({ name }) => name)).size).toBe(2);
    for (const saved of configuration.operations) {
      expect(getTypeScriptIdentifierError(saved.name)).toBeUndefined();
    }
  });

  it('preserves user edits and stable response fields when a published route is imported again', () => {
    const imported = importRestGoPublishedApis([published()]);
    const existing = operation(imported);
    const edited: ApiClientConfiguration = {
      ...imported,
      operations: [
        {
          ...existing,
          name: 'LoadCustomers',
          query: [{ id: 'existing-query', name: 'active', value: 'true', enabled: true }],
          responseSchema: {
            version: 1,
            root: {
              id: 'response-root',
              name: 'Response',
              path: '',
              kind: 'object',
              fieldType: 'object',
              nullable: false,
              children: [],
            },
          },
        },
      ],
    };
    expect(importRestGoPublishedApis([published()], edited)).toEqual(edited);
  });

  it('maps all authentication modes explicitly and blocks mixing modes within one client', () => {
    expect(getRestGoPublishedApiConnection(published())).toBe('restgo-session');
    expect(getRestGoPublishedApiConnection(published({ authentication: 'public' }))).toBe(
      'restgo-public',
    );
    expect(getRestGoPublishedApiConnection(published({ authentication: 'api-token' }))).toBe(
      'restgo-api-token',
    );
    expect(() =>
      importRestGoPublishedApis([
        published(),
        published({ authentication: 'public', endpoint: 'public' }),
      ]),
    ).toThrow('same authentication mode');
    const existing = importRestGoPublishedApis([published()]);
    expect(() =>
      importRestGoPublishedApis([published({ authentication: 'api-token' })], existing),
    ).toThrow('another RestGo authentication mode');
  });

  it('requires an explicit custom conversion and preserves authored settings without Authorization', () => {
    const initial = createDefaultApiClientConfiguration();
    const custom: ApiClientConfiguration = {
      ...initial,
      timeoutMs: 12_345,
      defaultHeaders: [
        { id: 'default-auth', name: 'Authorization', value: 'private-default', enabled: true },
      ],
      operations: [
        {
          ...operation(initial),
          id: 'existing-operation',
          name: 'Existing',
          path: '/sales/existing',
          headers: [
            { id: 'request-auth', name: 'aUtHoRiZaTiOn', value: 'private-request', enabled: false },
            { id: 'accept', name: 'Accept', value: 'application/json', enabled: true },
          ],
        },
      ],
    };
    const snapshot = structuredClone(custom);
    expect(() => importRestGoPublishedApis([published()], custom)).toThrow('Confirm converting');
    const converted = importRestGoPublishedApis([published()], custom, { replaceCustom: true });
    expect(converted.timeoutMs).toBe(12_345);
    expect(converted.defaultHeaders).toEqual([]);
    expect(operation(converted)).toMatchObject({
      id: 'existing-operation',
      name: 'Existing',
      headers: [{ id: 'accept', name: 'Accept' }],
    });
    expect(JSON.stringify(converted)).not.toContain('private-');
    expect(custom).toEqual(snapshot);
  });

  it.each(['https://other.example/api', '/%2e%2e/private', '//other.example/api'])(
    'refuses custom conversion when an existing path can escape the RestGo URL: %s',
    (path) => {
      const initial = createDefaultApiClientConfiguration();
      const custom = { ...initial, operations: [{ ...operation(initial), path }] };
      expect(() =>
        importRestGoPublishedApis([published()], custom, { replaceCustom: true }),
      ).toThrow('Use a separate API Client');
    },
  );

  it('imports operation inputs as a typed JSON template and never creates a sampled schema', () => {
    const configuration = importRestGoPublishedApis([
      published({
        method: 'POST',
        kind: 'operation',
        authentication: 'api-token',
        parameters: [
          { name: 'count', type: 'numeric' },
          { name: 'active', type: 'boolean' },
          { name: 'caption', type: 'string' },
        ],
      }),
    ]);
    expect(configuration.connection).toBe('restgo-api-token');
    expect(operation(configuration).query).toEqual([]);
    expect(JSON.parse(operation(configuration).body.content)).toEqual({
      count: 0,
      active: false,
      caption: '',
    });
    expect(operation(configuration).responseSchema).toBeNull();
    expect(operation(configuration).headers).toEqual([]);
  });
});
