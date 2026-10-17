import type { Dispatch, SetStateAction, ReactElement } from 'react';
import type { RestGoPublishedApi } from '@webrad/designer';
import type { RestGoAdminCatalog, RestGoAdminPublication } from '../../../shared/restgo-admin';
import type { RestGoSection } from './RestGoSidebar';
import { Icon } from './Icon';
import {
  restGoPublicationEndpoints,
  restGoPublicationAuthentication,
  type RestGoEndpointGroup,
} from './restgo-workspace-model';
interface Props {
  readonly section: RestGoSection;
  readonly requiresConnection: boolean;
  readonly catalog: RestGoAdminCatalog;
  readonly groups: readonly RestGoEndpointGroup[];
  readonly query: string;
  readonly setQuery: Dispatch<SetStateAction<string>>;
  readonly databaseFilter: string;
  readonly setDatabaseFilter: Dispatch<SetStateAction<string>>;
  readonly visiblePublications: readonly RestGoAdminPublication[];
  readonly publishedApis: readonly RestGoPublishedApi[];
  readonly busy: boolean;
  readonly endpointDirty: boolean;
  readonly baseUrl: string;

  readonly openEndpoint: (group: RestGoEndpointGroup) => void;
  readonly setPublicationActive: (
    publication: RestGoAdminPublication,
    active: boolean,
  ) => Promise<void>;
}
export function RestGoPublishedApis(props: Props): ReactElement {
  const {
    section,
    requiresConnection,
    catalog,
    groups,
    query,
    setQuery,
    databaseFilter,
    setDatabaseFilter,
    visiblePublications,
    publishedApis,
    busy,
    endpointDirty,
    baseUrl,
    openEndpoint,
    setPublicationActive,
  } = props;
  return (
    <div hidden={section !== 'published' || requiresConnection} className="wr-restgo-published">
      <div className="wr-restgo-catalog-tools">
        <label className="wr-restgo-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder="Search endpoints, methods, or databases"
            aria-label="Search published APIs"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <select
          value={databaseFilter}
          aria-label="Filter published APIs by database"
          onChange={(event) => setDatabaseFilter(event.currentTarget.value)}
        >
          <option value="">All databases</option>
          {catalog.bancos.map((database) => (
            <option key={database.id} value={database.id}>
              {database.slug}
            </option>
          ))}
        </select>
        <span className="wr-restgo-result-count">
          {visiblePublications.length} publications · {publishedApis.length} ready requests
        </span>
      </div>

      {visiblePublications.length === 0 ? (
        <div className="wr-restgo-empty-state">
          <Icon name="globe" />
          <h2>{catalog.publications.length ? 'No matching APIs' : 'No APIs published yet'}</h2>
          <p>
            {catalog.publications.length
              ? 'Try another search or database filter.'
              : 'Create an endpoint, then publish it to a database from Endpoints.'}
          </p>
        </div>
      ) : (
        <div className="wr-restgo-api-cards">
          {visiblePublications.map((publication) => {
            const database = catalog.bancos.find((entry) => entry.id === publication.idbanco);
            const endpoints = restGoPublicationEndpoints(catalog, publication);
            const authentication = restGoPublicationAuthentication(publication);
            const ready =
              publication.ativo &&
              database?.ativo &&
              endpoints.some((endpoint) =>
                publishedApis.some(
                  (api) => api.id === `${String(publication.id)}:${String(endpoint.id)}`,
                ),
              );
            return (
              <article className="wr-restgo-api-card" key={publication.id}>
                <header>
                  <div className="wr-restgo-api-title">
                    <h2>{publication.endpointSlug || 'Unlinked endpoint'}</h2>
                    <span className="wr-restgo-api-meta">
                      <Icon name="database" />
                      {database?.slug || publication.bancoSlug} <span>·</span> Version{' '}
                      {publication.versao}
                    </span>
                    <span
                      className={`wr-restgo-badge${ready ? ' is-ready' : ''}`}
                      title={`Publication #${publication.id}`}
                    >
                      {ready
                        ? 'Ready'
                        : !publication.ativo
                          ? 'Unpublished'
                          : database?.ativo === false
                            ? 'Database inactive'
                            : 'Endpoint inactive'}
                    </span>
                  </div>
                  <div className="wr-restgo-api-actions">
                    <button
                      type="button"
                      className="wr-restgo-button"
                      disabled={busy || endpointDirty || endpoints.length === 0}
                      onClick={() => {
                        const group = groups.find(
                          (entry) =>
                            entry.slug === publication.endpointSlug &&
                            entry.version === publication.versao,
                        );
                        if (group) openEndpoint(group);
                      }}
                      title={
                        endpointDirty
                          ? 'Save or discard the endpoint changes first.'
                          : 'Open this endpoint in the editor'
                      }
                    >
                      Edit endpoint
                    </button>
                    <button
                      type="button"
                      className="wr-restgo-button"
                      disabled={
                        busy ||
                        publication.idendpoint === null ||
                        (!publication.ativo && !database?.ativo)
                      }
                      onClick={() => {
                        void setPublicationActive(publication, !publication.ativo).catch(
                          () => undefined,
                        );
                      }}
                    >
                      {publication.ativo ? 'Unpublish' : 'Publish'}
                    </button>
                  </div>
                </header>
                <div className="wr-restgo-api-details">
                  <code
                    className="wr-restgo-api-url"
                    title={`${baseUrl}/v${publication.versao}/${database?.slug || publication.bancoSlug}/${publication.endpointSlug}`}
                  >
                    {baseUrl}/v{publication.versao}/{database?.slug || publication.bancoSlug}/
                    {publication.endpointSlug}
                  </code>
                  <div className="wr-restgo-api-auth">
                    <Icon name={authentication === 'public' ? 'unlock' : 'lock'} />
                    {authentication === 'jwt'
                      ? 'User session (JWT)'
                      : authentication === 'public'
                        ? 'Public · no credential'
                        : 'Application API token'}
                  </div>
                </div>
                <div className="wr-restgo-api-methods">
                  {endpoints.length === 0 && (
                    <p className="wr-restgo-muted">This publication has no linked endpoint.</p>
                  )}
                  {endpoints.map((endpoint) => {
                    const operation = catalog.operations.find(
                      (entry) => entry.id === endpoint.idoperacao,
                    );
                    return (
                      <div className="wr-restgo-api-method" key={endpoint.id}>
                        <span
                          className={`wr-restgo-method-badge method-${endpoint.metodo.toLowerCase()}`}
                        >
                          {endpoint.metodo}
                        </span>
                        <span className="wr-restgo-method-kind">
                          {endpoint.tipo === 'operation'
                            ? operation?.nome || 'API Operation'
                            : 'SQL endpoint'}
                          {!endpoint.ativo
                            ? ' · Inactive'
                            : endpoint.tipo === 'operation' && !operation?.ativo
                              ? ' · Operation inactive'
                              : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
