import type { RestGoPublishedApi } from '@webrad/designer';
import type {
  RestGoAdminCatalog,
  RestGoAdminEndpoint,
  RestGoAdminPublication,
} from '../../../shared/restgo-admin';

export interface RestGoEndpointGroup {
  readonly key: string;
  readonly slug: string;
  readonly version: number;
  readonly endpoints: readonly RestGoAdminEndpoint[];
}

export function restGoEndpointGroups(
  endpoints: readonly RestGoAdminEndpoint[],
): readonly RestGoEndpointGroup[] {
  const groups = new Map<string, RestGoAdminEndpoint[]>();
  for (const endpoint of endpoints) {
    const key = JSON.stringify([endpoint.slug, endpoint.versao]);
    const group = groups.get(key) ?? [];
    group.push(endpoint);
    groups.set(key, group);
  }
  return [...groups]
    .map(([key, entries]) => ({
      key,
      slug: entries[0]!.slug,
      version: entries[0]!.versao,
      endpoints: entries,
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug) || right.version - left.version);
}

export function restGoPublicationEndpoints(
  catalog: RestGoAdminCatalog,
  publication: RestGoAdminPublication,
): readonly RestGoAdminEndpoint[] {
  if (publication.idendpoint === null) return [];
  const anchor = catalog.endpoints.find((endpoint) => endpoint.id === publication.idendpoint);
  const slug = publication.endpointSlug || anchor?.slug;
  const version = publication.versao || anchor?.versao;
  return catalog.endpoints.filter(
    (endpoint) => endpoint.slug === slug && endpoint.versao === version,
  );
}

export function restGoPublicationAuthentication(
  publication: RestGoAdminPublication,
): RestGoPublishedApi['authentication'] {
  return publication.requiresAuthentication ? 'jwt' : publication.isPublic ? 'public' : 'api-token';
}

export function restGoCatalogToPublishedApis(
  catalog: RestGoAdminCatalog,
): readonly RestGoPublishedApi[] {
  return catalog.publications.flatMap((publication) => {
    const database = catalog.bancos.find((entry) => entry.id === publication.idbanco);
    if (!publication.ativo || !database?.ativo) return [];
    return restGoPublicationEndpoints(catalog, publication).flatMap((endpoint) => {
      const operation =
        endpoint.tipo === 'operation'
          ? catalog.operations.find((entry) => entry.id === endpoint.idoperacao)
          : undefined;
      if (!endpoint.ativo || (endpoint.tipo === 'operation' && !operation?.ativo)) return [];
      return [
        {
          id: `${String(publication.id)}:${String(endpoint.id)}`,
          name: endpoint.slug,
          database: database.slug,
          endpoint: endpoint.slug,
          method: endpoint.metodo,
          apiVersion: endpoint.versao,
          authentication: restGoPublicationAuthentication(publication),
          kind: endpoint.tipo === 'operation' ? ('operation' as const) : ('sql' as const),
          ...(endpoint.tipo === 'normal' ? { script: endpoint.script } : {}),
          ...(operation
            ? {
                parameters: operation.parametrosEntrada.map((parameter) => ({
                  name: parameter.nome,
                  type: parameter.tipo || ('string' as const),
                })),
              }
            : {}),
        },
      ];
    });
  });
}

export function restGoErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'The RestGO operation could not be completed.';
  const message = error.message;
  const prefix = "Error invoking remote method 'webrad:restgo-admin:";
  const separator = "': Error: ";
  const start = message.startsWith(prefix) ? message.indexOf(separator, prefix.length) : -1;
  return start >= 0 ? message.slice(start + separator.length) : message;
}
