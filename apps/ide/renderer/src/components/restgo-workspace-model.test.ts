import { describe, expect, it } from 'vitest';
import type { RestGoAdminCatalog } from '../../../shared/restgo-admin';
import {
  restGoCatalogToPublishedApis,
  restGoEndpointGroups,
  restGoPublicationEndpoints,
} from './restgo-workspace-model';

function catalog(): RestGoAdminCatalog {
  return {
    bancos: [
      {
        id: 1,
        ativo: true,
        slug: 'customers',
        host: 'localhost',
        port: 5432,
        database: 'customers',
        descri: '',
        sslMode: 'require',
      },
    ],
    endpoints: [
      {
        id: 11,
        ativo: true,
        slug: 'orders',
        versao: 2,
        metodo: 'GET',
        script: 'SELECT * FROM orders WHERE id = :id',
        tipo: 'normal',
        idoperacao: null,
      },
      {
        id: 12,
        ativo: true,
        slug: 'orders',
        versao: 2,
        metodo: 'POST',
        script: '',
        tipo: 'operation',
        idoperacao: 3,
      },
      {
        id: 13,
        ativo: true,
        slug: 'orders',
        versao: 1,
        metodo: 'GET',
        script: 'SELECT 1',
        tipo: 'normal',
        idoperacao: null,
      },
    ],
    publications: [
      {
        id: 20,
        ativo: true,
        idbanco: 1,
        idendpoint: 11,
        bancoSlug: 'customers',
        endpointSlug: 'orders',
        versao: 2,
        requiresAuthentication: true,
        isPublic: false,
      },
    ],
    operations: [
      {
        id: 3,
        ativo: true,
        nome: 'Create order',
        parametrosEntrada: [{ nome: 'total', tipo: 'numeric', valorTeste: 999 }],
      },
    ],
  };
}

describe('RestGo catalog conversion', () => {
  it('expands a grouped publication into only its own version and preserves SQL or operation inputs', () => {
    const apis = restGoCatalogToPublishedApis(catalog());
    expect(apis).toHaveLength(2);
    expect(apis[0]).toMatchObject({
      id: '20:11',
      name: 'orders',
      database: 'customers',
      endpoint: 'orders',
      method: 'GET',
      apiVersion: 2,
      authentication: 'jwt',
      kind: 'sql',
      script: 'SELECT * FROM orders WHERE id = :id',
    });
    expect(apis[1]).toMatchObject({
      method: 'POST',
      kind: 'operation',
      parameters: [{ name: 'total', type: 'numeric' }],
    });
    expect(apis[1]).not.toHaveProperty('script');
    expect(apis[1]?.parameters?.[0]).not.toHaveProperty('valorTeste');
  });

  it('excludes inactive databases, publications, handlers, and API Operations from importable requests', () => {
    const original = catalog();
    expect(
      restGoCatalogToPublishedApis({
        ...original,
        bancos: original.bancos.map((entry) => ({ ...entry, ativo: false })),
      }),
    ).toEqual([]);
    expect(
      restGoCatalogToPublishedApis({
        ...original,
        publications: original.publications.map((entry) => ({ ...entry, ativo: false })),
      }),
    ).toEqual([]);
    expect(
      restGoCatalogToPublishedApis({
        ...original,
        endpoints: original.endpoints.map((entry) => ({ ...entry, ativo: false })),
      }),
    ).toEqual([]);
    expect(
      restGoCatalogToPublishedApis({
        ...original,
        operations: original.operations.map((entry) => ({ ...entry, ativo: false })),
      }).map((api) => api.method),
    ).toEqual(['GET']);
    expect(
      restGoCatalogToPublishedApis({ ...original, operations: [] }).map((api) => api.method),
    ).toEqual(['GET']);
  });

  it('keeps public and API token policies distinct and gives a required JWT precedence', () => {
    const original = catalog();
    const withPolicy = (requiresAuthentication: boolean, isPublic: boolean): string | undefined =>
      restGoCatalogToPublishedApis({
        ...original,
        publications: original.publications.map((entry) => ({
          ...entry,
          requiresAuthentication,
          isPublic,
        })),
      })[0]?.authentication;
    expect(withPolicy(false, true)).toBe('public');
    expect(withPolicy(false, false)).toBe('api-token');
    expect(withPolicy(true, true)).toBe('jwt');
  });

  it('preserves version groups and safely handles orphan or older publication metadata', () => {
    const original = catalog();
    const publication = original.publications[0]!;
    const groups = restGoEndpointGroups(original.endpoints);
    expect(groups.map((group) => group.version)).toEqual([2, 1]);
    expect(groups[0]?.endpoints.map((endpoint) => endpoint.metodo)).toEqual(['GET', 'POST']);
    expect(restGoPublicationEndpoints(original, { ...publication, idendpoint: null })).toEqual([]);
    expect(
      restGoPublicationEndpoints(original, { ...publication, endpointSlug: '', versao: 0 }).map(
        (endpoint) => endpoint.id,
      ),
    ).toEqual([11, 12]);
  });
});
