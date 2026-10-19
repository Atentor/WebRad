import { RestGoProjectSettingsSchema, type RestGoProjectSettings } from '@webrad/project-model';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import type {
  RestGoAdminCatalog,
  RestGoAdminEndpoint,
  RestGoAdminPublication,
  RestGoAdminPublicationInput,
  RestGoAdminStatus,
} from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import { RestGoEndpointEditor, type RestGoEndpointDraft } from './RestGoEndpointEditor';

import type { RestGoSection } from './RestGoSidebar';
import {
  restGoCatalogToPublishedApis,
  restGoEndpointGroups,
  restGoErrorMessage,
  restGoPublicationEndpoints,
  type RestGoEndpointGroup,
} from './restgo-workspace-model';
import './restgo-workspace.css';
import { RestGoConnectionPanel } from './RestGoConnectionPanel';
import { RestGoPublishedApis } from './RestGoPublishedApis';

interface RestGoWorkspaceProps {
  readonly projectId: string;
  readonly settings: RestGoProjectSettings;
  readonly section: RestGoSection;
  readonly onSectionChange?: (section: RestGoSection) => void;
  readonly onSaveSettings: (settings: RestGoProjectSettings) => void | Promise<void>;
  readonly onCatalogChange?: (
    catalog: RestGoAdminCatalog,
    projectId: string,
    baseUrl: string,
  ) => string | undefined;
}

const EMPTY_CATALOG: RestGoAdminCatalog = {
  endpoints: [],
  bancos: [],
  publications: [],
  operations: [],
};

const SECTION_TITLES: Readonly<
  Record<RestGoSection, { readonly title: string; readonly description: string }>
> = {
  connection: {
    title: 'RestGO connection',
    description: 'Configure the application SDK and your access to the RestGO panel.',
  },
  published: {
    title: 'Published APIs',
    description: 'Browse database APIs and their access policies.',
  },
  endpoints: {
    title: 'Endpoints',
    description: 'Create SQL endpoints, connect API Operations, and publish versions.',
  },
};

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function RestGoWorkspace(props: RestGoWorkspaceProps): ReactElement {
  return (
    <RestGoWorkspaceSession
      {...props}
      key={`${props.projectId}:${normalizedBaseUrl(props.settings.baseUrl)}`}
    />
  );
}

function RestGoWorkspaceSession(props: RestGoWorkspaceProps): ReactElement {
  const { projectId, settings, section, onSaveSettings, onCatalogChange } = props;
  const savedSettingsKey = JSON.stringify(settings);
  const [draftBaseSettings, setDraftBaseSettings] = useState(savedSettingsKey);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [status, setStatus] = useState<RestGoAdminStatus | null>(null);
  const [catalog, setCatalog] = useState<RestGoAdminCatalog>(EMPTY_CATALOG);
  const [pending, setPending] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(settings.baseUrl));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [query, setQuery] = useState('');
  const [databaseFilter, setDatabaseFilter] = useState('');
  const [endpointQuery, setEndpointQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<RestGoEndpointGroup | null>(null);
  const [creatingEndpoint, setCreatingEndpoint] = useState(false);
  const [endpointDirty, setEndpointDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const baseUrl = normalizedBaseUrl(settings.baseUrl);
  const scope = `${projectId}:${baseUrl}`;
  const currentScope = useRef(scope);
  const catalogRef = useRef(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      currentScope.current = '';
    };
  }, [scope]);

  // Reset the editable projection only when an external settings commit replaces its base.
  if (draftBaseSettings !== savedSettingsKey) {
    setDraftBaseSettings(savedSettingsKey);
    setDraftSettings(settings);
    setSettingsError(null);
  }
  const busy = pending !== null || checking;
  const settingsDirty = JSON.stringify(draftSettings) !== JSON.stringify(settings);
  const groups = useMemo(() => restGoEndpointGroups(catalog.endpoints), [catalog.endpoints]);
  const visibleGroups = useMemo(
    () =>
      groups.filter((group) =>
        `${group.slug} v${String(group.version)} ${group.endpoints.map((endpoint) => endpoint.metodo).join(' ')}`
          .toLowerCase()
          .includes(endpointQuery.trim().toLowerCase()),
      ),
    [groups, endpointQuery],
  );
  const publishedApis = useMemo(() => restGoCatalogToPublishedApis(catalog), [catalog]);
  const visiblePublications = useMemo(
    () =>
      catalog.publications.filter((publication) => {
        const database = catalog.bancos.find((entry) => entry.id === publication.idbanco);
        if (databaseFilter && String(publication.idbanco) !== databaseFilter) return false;
        const methods = restGoPublicationEndpoints(catalog, publication)
          .map((endpoint) => endpoint.metodo)
          .join(' ');
        return `${publication.endpointSlug} ${publication.bancoSlug} ${database?.slug ?? ''} v${String(publication.versao)} ${methods}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      }),
    [catalog, databaseFilter, query],
  );

  useEffect(() => {
    let canceled = false;
    if (!baseUrl) return;
    void window.webrad.restgoAdmin
      .status({ baseUrl })
      .then(async (result) => {
        if (canceled) return;
        setStatus(result);
        if (result.connected) {
          const next = await window.webrad.restgoAdmin.catalog({ baseUrl });
          if (!canceled) {
            catalogRef.current = next;
            setCatalog(next);
            const issue = onCatalogChange?.(next, projectId, baseUrl);
            if (issue) setError(issue);
          }
        }
      })
      .catch(async (reason: unknown) => {
        if (canceled) return;
        setError(restGoErrorMessage(reason));
        const nextStatus = await window.webrad.restgoAdmin.status({ baseUrl }).catch(() => null);
        if (!canceled && nextStatus !== null) setStatus(nextStatus);
      })
      .finally(() => {
        if (!canceled) setChecking(false);
      });
    return () => {
      canceled = true;
    };
  }, [scope, baseUrl, projectId, onCatalogChange]);

  const perform = useCallback(
    async <T,>(label: string, action: () => Promise<T>, success?: string): Promise<T> => {
      const actionScope = currentScope.current;
      setPending(label);
      setError(null);
      setNotice(null);
      try {
        const result = await action();
        if (currentScope.current === actionScope && success) setNotice(success);
        return result;
      } catch (reason) {
        if (currentScope.current === actionScope) {
          setError(restGoErrorMessage(reason));
          const nextStatus = await window.webrad.restgoAdmin.status({ baseUrl }).catch(() => null);
          if (currentScope.current === actionScope && nextStatus !== null) setStatus(nextStatus);
        }
        throw reason;
      } finally {
        if (currentScope.current === actionScope) setPending(null);
      }
    },
    [baseUrl],
  );

  const reloadCatalog = useCallback(async (): Promise<RestGoAdminCatalog> => {
    const actionScope = scope;
    const next = await window.webrad.restgoAdmin.catalog({ baseUrl });
    if (currentScope.current === actionScope) {
      setCatalog(next);
      catalogRef.current = next;
      const issue = onCatalogChange?.(next, projectId, baseUrl);
      if (issue) setError(issue);
    }
    return next;
  }, [baseUrl, scope, projectId, onCatalogChange]);

  const refresh = (): void => {
    void perform('Refreshing RestGO', reloadCatalog, 'RestGO catalog updated.').catch(
      () => undefined,
    );
  };
  const saveSettings = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSettingsError(null);
    const validation = RestGoProjectSettingsSchema.safeParse(draftSettings);
    if (!validation.success) {
      setSettingsError(validation.error.issues[0]?.message ?? 'Check the RestGO configuration.');
      return;
    }
    if (endpointDirty && normalizedBaseUrl(validation.data.baseUrl) !== baseUrl) {
      setSettingsError('Save or discard the endpoint changes before switching RestGO instances.');
      return;
    }
    try {
      await perform(
        'Saving connection settings',
        async () => {
          await onSaveSettings(validation.data);
        },
        'RestGO application settings saved.',
      );
    } catch (reason) {
      setSettingsError(restGoErrorMessage(reason));
    }
  };
  const connect = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!baseUrl) {
      setError('Save a RestGO instance URL first.');
      return;
    }
    try {
      await perform(
        'Connecting to RestGO',
        async () => {
          const result = await window.webrad.restgoAdmin.connect({
            baseUrl,
            token: adminToken.trim(),
            remember,
          });
          if (currentScope.current !== scope) return;
          setAdminToken('');
          setStatus(result);
          await reloadCatalog();
        },
        'Administrative access verified. Your RestGO catalog is ready.',
      );
    } catch {
      /* The actionable error is displayed above the workspace. */
    }
  };
  const disconnect = (): void => {
    void perform(
      'Disconnecting administrative access',
      async () => {
        await window.webrad.restgoAdmin.disconnect({ baseUrl });
        const next = await window.webrad.restgoAdmin.status({ baseUrl });
        if (currentScope.current !== scope) return;
        setStatus(next);
        setCatalog(EMPTY_CATALOG);
        setSelectedGroup(null);
        setCreatingEndpoint(false);
        setEndpointDirty(false);
      },
      'Administrative access disconnected.',
    ).catch(() => undefined);
  };
  const openRestGo = (): void => {
    setError(null);
    setNotice(null);
    void window.webrad.links.open('restgo').catch((reason: unknown) => {
      setError(`Could not open RestGO in your default browser: ${restGoErrorMessage(reason)}`);
    });
  };
  const openEndpoint = (group: RestGoEndpointGroup): void => {
    if (endpointDirty) return;
    void perform('Loading endpoint scripts', async () => {
      const details = await Promise.all(
        group.endpoints.map((endpoint) =>
          window.webrad.restgoAdmin.getEndpoint({ baseUrl, id: endpoint.id }),
        ),
      );
      if (currentScope.current !== scope) return;
      setSelectedGroup({ ...group, endpoints: details });
      setCreatingEndpoint(false);
      setEndpointDirty(false);
      setEditorRevision((revision) => revision + 1);
      props.onSectionChange?.('endpoints');
    }).catch(() => undefined);
  };
  const saveEndpoint = useCallback(
    (draft: RestGoEndpointDraft): Promise<RestGoEndpointGroup> =>
      perform(
        'Saving endpoint methods',
        async () => {
          const saved: RestGoAdminEndpoint[] = [];
          for (const method of draft.methods) {
            if (currentScope.current !== scope)
              throw new Error(
                'The RestGo workspace changed before all endpoint methods could be saved.',
              );
            const existing =
              method.id ??
              catalogRef.current.endpoints.find(
                (endpoint) =>
                  endpoint.slug === draft.slug &&
                  endpoint.versao === draft.version &&
                  endpoint.metodo === method.endpoint.metodo,
              )?.id;
            const result = await window.webrad.restgoAdmin.saveEndpoint({
              baseUrl,
              ...(existing ? { id: existing } : {}),
              endpoint: method.endpoint,
            });
            saved.push(result);
            if (currentScope.current !== scope) continue;
            const next = {
              ...catalogRef.current,
              endpoints: [
                ...catalogRef.current.endpoints.filter((endpoint) => endpoint.id !== result.id),
                result,
              ],
            };
            catalogRef.current = next;
            setCatalog(next);
          }
          const nextGroup: RestGoEndpointGroup = {
            key: JSON.stringify([draft.slug, draft.version]),
            slug: draft.slug,
            version: draft.version,
            endpoints: saved,
          };
          if (currentScope.current === scope) {
            setSelectedGroup(nextGroup);
            setCreatingEndpoint(false);
            setEndpointDirty(false);
            setEditorRevision((revision) => revision + 1);
          }
          // Refresh failures do not turn a completed save into a failed transaction.
          try {
            await reloadCatalog();
          } catch (reason) {
            if (currentScope.current === scope)
              setError(
                `The endpoint was saved. Catalog refresh failed: ${restGoErrorMessage(reason)}`,
              );
          }
          return nextGroup;
        },
        'Endpoint methods saved on RestGO.',
      ),
    [baseUrl, scope, perform, reloadCatalog],
  );

  const setEndpointActive = useCallback(
    (endpoint: RestGoAdminEndpoint, active: boolean): Promise<void> =>
      perform(
        active ? 'Activating endpoint' : 'Deactivating endpoint',
        async () => {
          await window.webrad.restgoAdmin.setEndpointActive({ baseUrl, id: endpoint.id, active });
          await reloadCatalog();
        },
        active ? 'Endpoint activated.' : 'Endpoint deactivated.',
      ),
    [baseUrl, perform, reloadCatalog],
  );
  const savePublication = useCallback(
    (publication: RestGoAdminPublicationInput, id?: number): Promise<void> =>
      perform(
        'Saving publication',
        async () => {
          const database = catalogRef.current.bancos.find(
            (entry) => entry.id === publication.idbanco,
          );
          if (!database?.ativo && id === undefined)
            throw new Error('Activate this database in RestGO before publishing.');
          const saved = await window.webrad.restgoAdmin.savePublication({
            baseUrl,
            ...(id ? { id } : {}),
            publication,
          });
          if (id === undefined) {
            await window.webrad.restgoAdmin.setEndpointActive({
              baseUrl,
              id: publication.idendpoint,
              active: true,
            });
            await window.webrad.restgoAdmin.setPublicationActive({
              baseUrl,
              id: saved.id,
              active: true,
            });
          }
          await reloadCatalog();
        },
        'Publication saved on RestGO.',
      ),
    [baseUrl, perform, reloadCatalog],
  );
  const setPublicationActive = useCallback(
    (publication: RestGoAdminPublication, active: boolean): Promise<void> =>
      perform(
        active ? 'Publishing API' : 'Unpublishing API',
        async () => {
          if (active) {
            const database = catalogRef.current.bancos.find(
              (entry) => entry.id === publication.idbanco,
            );
            if (!database?.ativo)
              throw new Error('Activate this database in RestGO before publishing.');
            if (publication.idendpoint === null)
              throw new Error('This publication has no linked endpoint.');
            await window.webrad.restgoAdmin.setEndpointActive({
              baseUrl,
              id: publication.idendpoint,
              active: true,
            });
          }
          await window.webrad.restgoAdmin.setPublicationActive({
            baseUrl,
            id: publication.id,
            active,
          });
          await reloadCatalog();
        },
        active ? 'API publication activated.' : 'API publication deactivated.',
      ),
    [baseUrl, perform, reloadCatalog],
  );

  const title = SECTION_TITLES[section];
  const requiresConnection = !status?.connected;
  return (
    <section className="wr-restgo-workspace" aria-label="RestGO integration" aria-busy={busy}>
      <header className="wr-restgo-workspace-header">
        <h1 title={title.description}>{title.title}</h1>
        <div className="wr-restgo-header-tools">
          {section === 'connection' && (
            <button
              className="wr-restgo-button"
              type="button"
              onClick={openRestGo}
              title="Open RestGO in your default browser"
            >
              <Icon name="external-link" />
              Open RestGO
            </button>
          )}
          <span className={`wr-restgo-status${status?.connected ? ' is-connected' : ''}`}>
            <span className={`wr-restgo-dot${status?.connected ? ' is-active' : ''}`} />
            {checking
              ? 'Connecting…'
              : status?.connected
                ? 'Admin connected'
                : 'Admin disconnected'}
          </span>
          {section !== 'connection' && (
            <button
              className="wr-restgo-button"
              type="button"
              disabled={busy || requiresConnection}
              onClick={refresh}
            >
              <Icon name="refresh" />
              Refresh
            </button>
          )}
        </div>
      </header>
      {pending && (
        <div className="wr-restgo-progress" role="status">
          <span className="wr-restgo-spinner" />
          {pending}…
        </div>
      )}
      {error && (
        <div className="wr-restgo-alert" role="alert">
          <Icon name="alert-circle" />
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {notice && (
        <div className="wr-restgo-notice" role="status">
          <Icon name="check-circle" />
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
      <div
        className={
          section === 'endpoints' && !requiresConnection
            ? 'wr-restgo-workspace-body is-endpoints'
            : 'wr-restgo-workspace-body'
        }
      >
        <RestGoConnectionPanel
          section={section}
          busy={busy}
          draftSettings={draftSettings}
          settingsError={settingsError}
          settingsDirty={settingsDirty}
          setDraftSettings={setDraftSettings}
          setSettingsError={setSettingsError}
          saveSettings={saveSettings}
          status={status}
          catalog={catalog}
          groups={groups}
          refresh={refresh}
          endpointDirty={endpointDirty}
          disconnect={disconnect}
          connect={connect}
          adminToken={adminToken}
          setAdminToken={setAdminToken}
          remember={remember}
          setRemember={setRemember}
          baseUrl={baseUrl}
        />
        <div
          hidden={section === 'connection' || !requiresConnection}
          className="wr-restgo-empty-state"
        >
          <Icon name="lock" />
          <h2>Connect administrative access</h2>
          <p>
            Open Connection, save your instance URL, and connect a token with management permission
            to browse and publish APIs.
          </p>
          {props.onSectionChange && (
            <button
              type="button"
              className="wr-restgo-button is-primary"
              onClick={() => props.onSectionChange?.('connection')}
            >
              <Icon name="settings" />
              Open Connection
            </button>
          )}
          {checking && <span className="wr-restgo-muted">Loading your saved connection…</span>}
        </div>
        <RestGoPublishedApis
          section={section}
          requiresConnection={requiresConnection}
          catalog={catalog}
          groups={groups}
          query={query}
          setQuery={setQuery}
          databaseFilter={databaseFilter}
          setDatabaseFilter={setDatabaseFilter}
          visiblePublications={visiblePublications}
          publishedApis={publishedApis}
          busy={busy}
          endpointDirty={endpointDirty}
          baseUrl={baseUrl}

          openEndpoint={openEndpoint}
          setPublicationActive={setPublicationActive}
        />
        <div
          hidden={section !== 'endpoints' || requiresConnection}
          className="wr-restgo-endpoints-layout"
        >
          <aside className="wr-restgo-endpoint-list">
            <div className="wr-restgo-endpoint-list-toolbar">
              <strong>
                Endpoints <small>{groups.length}</small>
              </strong>
              <button
                type="button"
                className="wr-restgo-icon-button"
                title="Create endpoint"
                aria-label="Create endpoint"
                disabled={busy || endpointDirty}
                onClick={() => {
                  setSelectedGroup(null);
                  setCreatingEndpoint(true);
                }}
              >
                <Icon name="add" />
              </button>
            </div>
            <label className="wr-restgo-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label="Search endpoints"
                placeholder="Search endpoints"
                value={endpointQuery}
                onChange={(event) => setEndpointQuery(event.currentTarget.value)}
              />
            </label>
            {endpointDirty && (
              <p className="wr-restgo-list-note">
                Save or discard your changes to choose another endpoint.
              </p>
            )}
            {visibleGroups.map((group) => (
              <button
                className="wr-restgo-endpoint-list-item"
                key={group.key}
                type="button"
                aria-pressed={selectedGroup?.key === group.key}
                disabled={busy || endpointDirty}
                onClick={() => openEndpoint(group)}
              >
                <span>
                  <strong>{group.slug}</strong>
                  <small>v{group.version}</small>
                </span>
                <span className="wr-restgo-list-methods">
                  {group.endpoints.map((endpoint) => (
                    <small key={endpoint.id}>{endpoint.metodo}</small>
                  ))}
                  <span
                    className={`wr-restgo-dot${group.endpoints.every((endpoint) => endpoint.ativo) ? ' is-active' : ''}`}
                  />
                </span>
              </button>
            ))}
            {visibleGroups.length === 0 && (
              <p className="wr-restgo-list-note">
                {groups.length ? 'No matching endpoints.' : 'Create your first endpoint with +.'}
              </p>
            )}
          </aside>
          <div className="wr-restgo-endpoint-content">
            {selectedGroup || creatingEndpoint ? (
              <RestGoEndpointEditor
                key={`${selectedGroup?.key ?? 'new'}:${String(editorRevision)}`}
                group={selectedGroup}
                catalog={catalog}
                baseUrl={baseUrl}
                defaultDatabase={settings.defaultDatabase}
                busy={busy}
                onDirtyChange={setEndpointDirty}
                onSave={saveEndpoint}
                onSetActive={setEndpointActive}
                onSavePublication={savePublication}
                onSetPublicationActive={setPublicationActive}
              />
            ) : (
              <div className="wr-restgo-empty-state">
                <Icon name="code" />
                <h2>{groups.length ? 'Choose an endpoint' : 'Create your first endpoint'}</h2>
                <p>
                  Define SQL per HTTP method or run an existing API Operation. Publish it to a
                  database when it is ready.
                </p>
                <button
                  type="button"
                  className="wr-restgo-button is-primary"
                  disabled={busy}
                  onClick={() => setCreatingEndpoint(true)}
                >
                  <Icon name="add" />
                  New endpoint
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
