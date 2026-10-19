import { describe, expect, it } from 'vitest';
import {
  importRestGoPublishedApis,
  synchronizeRestGoApiConfiguration,
  type RestGoPublishedApi,
} from '../src/index.js';
import type { ApiClientConfiguration } from '@webrad/project-model';

const api: RestGoPublishedApi = {
  id: '20:11',
  name: 'anotacoes',
  database: 'demo',
  endpoint: 'anotacoes',
  method: 'GET',
  apiVersion: 1,
  authentication: 'jwt',
  kind: 'sql',
  script: 'SELECT * FROM anotacoes WHERE rgouserid = :rgouserid AND active = :active',
};
const changed = {
  ...api,
  script: 'SELECT * FROM anotacoes WHERE rgouserid = :rgouserid AND titulo = :pesquisa',
};

describe('existing RestGo API Client synchronization', () => {
  it('adds and removes SQL inputs while preserving the request identity, name, values, headers and output contract', () => {
    const imported = importRestGoPublishedApis([api]);
    const original = imported.operations[0]!;
    const configuration: ApiClientConfiguration = {
      ...imported,
      operations: [
        {
          ...original,
          name: 'MinhasAnotacoes',
          headers: [{ id: 'accept', name: 'Accept', value: 'application/json', enabled: true }],
          query: [
            ...original.query.map((entry) =>
              entry.name === 'rgouserid' ? { ...entry, value: 'user-42', enabled: false } : entry,
            ),
            { id: 'custom', name: 'limit', value: '50', enabled: true },
          ],
          responseSchema: {
            version: 1,
            root: {
              id: 'response',
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
    const next = synchronizeRestGoApiConfiguration(configuration, [changed]);
    expect(next.operations).toHaveLength(1);
    expect(next.operations[0]).toMatchObject({
      id: original.id,
      name: 'MinhasAnotacoes',
      headers: configuration.operations[0]!.headers,
      responseSchema: configuration.operations[0]!.responseSchema,
    });
    expect(next.operations[0]!.query).toContainEqual({
      ...original.query[0],
      value: 'user-42',
      enabled: false,
    });
    expect(next.operations[0]!.query.map((entry) => entry.name)).toEqual([
      'rgouserid',
      'page',
      'limit',
      'pesquisa',
    ]);
    expect(synchronizeRestGoApiConfiguration(next, [changed])).toBe(next);
    expect(configuration.operations[0]!.query.some((entry) => entry.name === 'active')).toBe(true);
  });

  it('upgrades already imported GET requests without source metadata', () => {
    const imported = importRestGoPublishedApis([api]);
    const original = { ...imported.operations[0]! };
    delete original.restGoSource;
    const result = synchronizeRestGoApiConfiguration({ ...imported, operations: [original] }, [
      changed,
    ]);
    expect(result.operations[0]!.query.map((entry) => entry.name)).toEqual([
      'rgouserid',
      'page',
      'pesquisa',
    ]);
    expect(result.operations[0]!.restGoSource?.apiId).toBe(api.id);
  });

  it('reconciles JSON templates without evaluating or rewriting retained placeholders and nested values', () => {
    const post = { ...api, method: 'POST' };
    const imported = importRestGoPublishedApis([post]);
    const original = {
      ...imported.operations[0]!,
      body: {
        kind: 'json' as const,
        content:
          '{"rgouserid": <rgouserid>, "active": <active>, "extra": {"items": ["a,b", {"caption":"x:y"}]}}',
        parameters: [
          { name: 'rgouserid', type: 'string' as const },
          { name: 'active', type: 'boolean' as const },
        ],
      },
    };
    const result = synchronizeRestGoApiConfiguration({ ...imported, operations: [original] }, [
      { ...changed, method: 'POST' },
    ]);
    const body = result.operations[0]!.body;
    expect(body.content).toContain('"rgouserid": <rgouserid>');
    expect(body.content).toContain('"extra": {"items": ["a,b", {"caption":"x:y"}]}');
    expect(body.content).toContain('"pesquisa": null');
    expect(body.content).not.toContain('active');
    expect(body.parameters).toEqual([{ name: 'rgouserid', type: 'string' }]);
  });

  it('updates renamed routes and versions on reimport without creating duplicate operations', () => {
    const imported = importRestGoPublishedApis([api]);
    const result = importRestGoPublishedApis(
      [{ ...changed, endpoint: 'notas', database: 'sales', apiVersion: 2 }],
      imported,
    );
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      id: imported.operations[0]!.id,
      name: imported.operations[0]!.name,
      path: '/sales/notas',
      apiVersion: 2,
    });
  });

  it('migrates one consistent authentication mode and reports conflicts rather than guessing', () => {
    const imported = importRestGoPublishedApis([api]);
    expect(
      synchronizeRestGoApiConfiguration(imported, [{ ...changed, authentication: 'public' }])
        .connection,
    ).toBe('restgo-public');
    const second = { ...api, id: '20:12', method: 'PUT' };
    const mixed = importRestGoPublishedApis([api, second]);
    expect(() =>
      synchronizeRestGoApiConfiguration(mixed, [{ ...changed, authentication: 'public' }, second]),
    ).toThrow('different authentication modes');
  });

  it('leaves manual routes, missing publications and selected method subsets intact', () => {
    const imported = importRestGoPublishedApis([api]);
    expect(synchronizeRestGoApiConfiguration(imported, [])).toBe(imported);
    expect(
      synchronizeRestGoApiConfiguration({ ...imported, connection: 'custom' }, [changed])
        .operations,
    ).toEqual(imported.operations);
    const manual = {
      ...imported,
      operations: [{ ...imported.operations[0]!, id: 'manual', restGoSource: undefined }],
    };
    expect(synchronizeRestGoApiConfiguration(manual, [changed])).toBe(manual);
    expect(
      synchronizeRestGoApiConfiguration(imported, [changed, { ...api, id: '20:12', method: 'PUT' }])
        .operations,
    ).toHaveLength(1);
  });
});
