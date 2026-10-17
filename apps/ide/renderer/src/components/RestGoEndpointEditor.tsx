import { useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type {
  RestGoAdminCatalog,
  RestGoAdminEndpoint,
  RestGoAdminEndpointInput,
  RestGoAdminHttpMethod,
  RestGoAdminPublication,
  RestGoAdminPublicationInput,
} from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import {
  restGoErrorMessage,
  restGoPublicationAuthentication,
  type RestGoEndpointGroup,
} from './restgo-workspace-model';

const METHODS: readonly RestGoAdminHttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

interface MethodDraft {
  readonly method: RestGoAdminHttpMethod;
  readonly configured: boolean;
  readonly existingId?: number;
  readonly script: string;
  readonly type: 'normal' | 'operation';
  readonly operationId: string;
}

export interface RestGoEndpointDraft {
  readonly slug: string;
  readonly version: number;
  readonly methods: readonly {
    readonly id?: number;
    readonly endpoint: RestGoAdminEndpointInput;
  }[];
}

interface RestGoEndpointEditorProps {
  readonly group: RestGoEndpointGroup | null;
  readonly catalog: RestGoAdminCatalog;
  readonly busy: boolean;
  readonly baseUrl: string;
  readonly defaultDatabase: string;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onSave: (draft: RestGoEndpointDraft) => Promise<RestGoEndpointGroup>;
  readonly onSetActive: (endpoint: RestGoAdminEndpoint, active: boolean) => Promise<void>;
  readonly onSavePublication: (
    publication: RestGoAdminPublicationInput,
    id?: number,
  ) => Promise<void>;
  readonly onSetPublicationActive: (
    publication: RestGoAdminPublication,
    active: boolean,
  ) => Promise<void>;
}

function createMethods(group: RestGoEndpointGroup | null): readonly MethodDraft[] {
  return METHODS.map((method) => {
    const endpoint = group?.endpoints.find((entry) => entry.metodo === method);
    return {
      method,
      configured: endpoint !== undefined,
      ...(endpoint ? { existingId: endpoint.id } : {}),
      script: endpoint?.script ?? '',
      type: endpoint?.tipo ?? 'normal',
      operationId: endpoint?.idoperacao ? String(endpoint.idoperacao) : '',
    };
  });
}

function publicationAuthentication(value: string): 'jwt' | 'api-token' | 'public' {
  return value === 'public' ? 'public' : value === 'api-token' ? 'api-token' : 'jwt';
}

export function RestGoEndpointEditor(props: RestGoEndpointEditorProps): ReactElement {
  const { group, catalog, busy, onDirtyChange } = props;
  const [slug, setSlug] = useState(group?.slug ?? '');
  const [version, setVersion] = useState(String(group?.version ?? 1));
  const [methods, setMethods] = useState(() => createMethods(group));
  const [activeMethod, setActiveMethod] = useState<RestGoAdminHttpMethod>(
    group?.endpoints[0]?.metodo ?? 'GET',
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
  const [authenticationDraft, setAuthenticationDraft] = useState<
    'jwt' | 'api-token' | 'public' | null
  >(null);
  const id = useId();
  const current = methods.find((method) => method.method === activeMethod)!;
  const operation = catalog.operations.find((entry) => String(entry.id) === current.operationId);
  const publications = useMemo(
    () =>
      group === null
        ? []
        : catalog.publications.filter(
            (entry) => entry.endpointSlug === group.slug && entry.versao === group.version,
          ),
    [catalog.publications, group],
  );
  const defaultPublication =
    publications.find(
      (publication) =>
        props.defaultDatabase !== '' &&
        (publication.bancoSlug === props.defaultDatabase ||
          catalog.bancos.some(
            (database) =>
              database.id === publication.idbanco && database.slug === props.defaultDatabase,
          )),
    ) ?? publications[0];
  const defaultDatabase = catalog.bancos.find(
    (database) => database.ativo && database.slug === props.defaultDatabase,
  );
  const defaultDatabaseId = defaultPublication
    ? String(defaultPublication.idbanco)
    : defaultDatabase
      ? String(defaultDatabase.id)
      : '';
  const databaseId = selectedDatabaseId ?? defaultDatabaseId;
  const selectedPublication = publications.find(
    (publication) => String(publication.idbanco) === databaseId,
  );
  const editingPublicationId = selectedPublication?.id;
  const authentication =
    authenticationDraft ??
    (selectedPublication ? restGoPublicationAuthentication(selectedPublication) : 'jwt');
  const liveEndpoints = useMemo(
    () =>
      group === null
        ? []
        : catalog.endpoints.filter(
            (entry) => entry.slug === group.slug && entry.versao === group.version,
          ),
    [catalog.endpoints, group],
  );
  const active = liveEndpoints.length > 0 && liveEndpoints.every((entry) => entry.ativo);

  const markDirty = (): void => {
    setDirty(true);
    setError(null);
    onDirtyChange(true);
  };
  const patchMethod = (patch: Partial<MethodDraft>): void => {
    setMethods((entries) =>
      entries.map((entry) => (entry.method === activeMethod ? { ...entry, ...patch } : entry)),
    );
    markDirty();
  };
  const discard = (): void => {
    setSlug(group?.slug ?? '');
    setVersion(String(group?.version ?? 1));
    setMethods(createMethods(group));
    setDirty(false);
    setError(null);
    onDirtyChange(false);
  };
  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const normalizedSlug = slug.trim();
    const parsedVersion = Number(version);
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(normalizedSlug)) {
      setError('Use an endpoint slug with 1–30 letters, numbers, underscores, or hyphens.');
      return;
    }
    if (!Number.isSafeInteger(parsedVersion) || parsedVersion < 1) {
      setError('Choose a positive integer API version.');
      return;
    }
    const configured = methods.filter((method) => method.configured);
    if (configured.length === 0) {
      setError('Configure at least one HTTP method.');
      return;
    }
    for (const method of configured) {
      if (method.type === 'normal' && method.script.trim().length === 0) {
        setActiveMethod(method.method);
        setError(`Enter the SQL script for ${method.method}.`);
        return;
      }
      if (
        method.type === 'operation' &&
        !catalog.operations.some((entry) => String(entry.id) === method.operationId)
      ) {
        setActiveMethod(method.method);
        setError(`Select an API Operation for ${method.method}.`);
        return;
      }
    }
    try {
      await props.onSave({
        slug: normalizedSlug,
        version: parsedVersion,
        methods: configured.map((method) => ({
          ...(method.existingId ? { id: method.existingId } : {}),
          endpoint: {
            slug: normalizedSlug,
            versao: parsedVersion,
            metodo: method.method,
            script: method.type === 'normal' ? method.script : '',
            tipo: method.type,
            idoperacao: method.type === 'operation' ? Number(method.operationId) : null,
          },
        })),
      });
      setDirty(false);
      onDirtyChange(false);
    } catch (reason) {
      setError(
        `${restGoErrorMessage(reason)} Earlier methods may already have been saved; you can safely retry.`,
      );
    }
  };
  const publish = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const endpoint = liveEndpoints[0];
    if (!endpoint || dirty) {
      setError('Save the endpoint before publishing.');
      return;
    }
    if (!catalog.bancos.some((database) => String(database.id) === databaseId)) {
      setError('Choose a database for this publication.');
      return;
    }
    try {
      const existing = publications.find(
        (publication) => String(publication.idbanco) === databaseId,
      );
      await props.onSavePublication(
        {
          idbanco: Number(databaseId),
          idendpoint: endpoint.id,
          requiresAuthentication: authentication === 'jwt',
          isPublic: authentication === 'public',
        },
        editingPublicationId ?? existing?.id,
      );
      setSelectedDatabaseId(databaseId);
      setAuthenticationDraft(null);
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    }
  };
  const toggleEndpoint = async (): Promise<void> => {
    const endpoint = liveEndpoints[0];
    if (!endpoint) return;
    setError(null);
    try {
      await props.onSetActive(endpoint, !active);
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    }
  };

  return (
    <div className="wr-restgo-endpoint-editor">
      <div className="wr-restgo-subheading">
        <div>
          <h2>{group ? group.slug : 'New endpoint'}</h2>
          <p>Configure each HTTP method, then publish this API version to a database.</p>
        </div>
        {group && (
          <button
            type="button"
            className="wr-restgo-button"
            disabled={busy || dirty}
            onClick={() => {
              void toggleEndpoint();
            }}
          >
            <span className={`wr-restgo-dot${active ? ' is-active' : ''}`} />
            {active ? 'Deactivate endpoint' : 'Activate endpoint'}
          </button>
        )}
      </div>
      {error && (
        <div className="wr-restgo-alert" role="alert">
          {error}
        </div>
      )}
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <fieldset disabled={busy} className="wr-restgo-fields">
          <label>
            <span>Endpoint slug</span>
            <input
              required
              value={slug}
              maxLength={30}
              spellCheck={false}
              placeholder="customers"
              onChange={(event) => {
                setSlug(event.currentTarget.value);
                markDirty();
              }}
            />
          </label>
          <label>
            <span>API version</span>
            <input
              required
              type="number"
              min={1}
              step={1}
              value={version}
              readOnly={group !== null}
              onChange={(event) => {
                setVersion(event.currentTarget.value);
                markDirty();
              }}
            />
            <small>
              {group
                ? 'Create a new endpoint to publish another version.'
                : 'Versions are independent published APIs.'}
            </small>
          </label>
        </fieldset>
        <div className="wr-restgo-method-tabs" role="tablist" aria-label="HTTP methods">
          {methods.map((method) => (
            <button
              type="button"
              role="tab"
              key={method.method}
              id={`${id}-${method.method}`}
              aria-controls={`${id}-method-panel`}
              aria-selected={activeMethod === method.method}
              onClick={() => setActiveMethod(method.method)}
            >
              {method.method}
              {method.configured && (
                <span className="wr-restgo-method-configured" aria-label="Configured" />
              )}
            </button>
          ))}
        </div>
        <section
          className="wr-restgo-method-panel"
          id={`${id}-method-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${activeMethod}`}
        >
          <label className="wr-restgo-toggle">
            <input
              type="checkbox"
              checked={current.configured}
              disabled={busy || current.existingId !== undefined}
              onChange={(event) => patchMethod({ configured: event.currentTarget.checked })}
            />
            <span>Configure {activeMethod}</span>
            {current.existingId !== undefined && <small>Saved method</small>}
          </label>
          {current.configured ? (
            <fieldset disabled={busy} className="wr-restgo-method-fields">
              <label>
                <span>Execution</span>
                <select
                  value={current.type}
                  onChange={(event) =>
                    patchMethod({
                      type: event.currentTarget.value === 'operation' ? 'operation' : 'normal',
                    })
                  }
                >
                  <option value="normal">SQL script</option>
                  <option value="operation">API Operation</option>
                </select>
              </label>
              {current.type === 'normal' ? (
                <label>
                  <span>SQL for {activeMethod}</span>
                  <textarea
                    className="wr-restgo-sql"
                    value={current.script}
                    spellCheck={false}
                    maxLength={1_000_000}
                    placeholder="SELECT * FROM customers WHERE id = :id;"
                    onChange={(event) => patchMethod({ script: event.currentTarget.value })}
                  />
                  <small>
                    Use :namedParameters supplied through query or JSON body. Separate SQL
                    statements with semicolons.
                  </small>
                </label>
              ) : (
                <>
                  <label>
                    <span>API Operation</span>
                    <select
                      value={current.operationId}
                      onChange={(event) => patchMethod({ operationId: event.currentTarget.value })}
                    >
                      <option value="">Select an API Operation</option>
                      {catalog.operations.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.nome}
                          {entry.ativo ? '' : ' (inactive)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {catalog.operations.length === 0 && (
                    <p className="wr-restgo-inline-note">
                      Create an API Operation in the RestGO panel first. This endpoint runs its
                      workflow on demand.
                    </p>
                  )}
                  {operation && (
                    <div className="wr-restgo-operation-parameters">
                      <strong>Required inputs</strong>
                      {operation.parametrosEntrada.length > 0 ? (
                        <div className="wr-restgo-parameter-list">
                          {operation.parametrosEntrada.map((parameter) => (
                            <span key={parameter.nome}>
                              <code>{parameter.nome}</code>
                              <small>{parameter.tipo || 'string'}</small>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p>This operation has no required inputs.</p>
                      )}
                      <small>
                        Send inputs through query parameters or a JSON body. Body values take
                        precedence.
                      </small>
                      {!operation.ativo && (
                        <p className="wr-restgo-warning">
                          This API Operation is inactive. Activate it in RestGO before using this
                          endpoint.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </fieldset>
          ) : (
            <div className="wr-restgo-method-empty">
              <Icon name="code" />
              <p>No {activeMethod} handler configured.</p>
              <button
                type="button"
                className="wr-restgo-button"
                disabled={busy}
                onClick={() => patchMethod({ configured: true })}
              >
                Configure {activeMethod}
              </button>
            </div>
          )}
        </section>
        <div className="wr-restgo-form-actions">
          <span className="wr-restgo-muted">
            {dirty
              ? 'Unsaved endpoint changes'
              : group
                ? 'Endpoint saved on RestGO'
                : 'Choose a method to get started'}
          </span>
          {dirty && (
            <button type="button" className="wr-restgo-button" disabled={busy} onClick={discard}>
              Discard changes
            </button>
          )}
          <button
            type="submit"
            className="wr-restgo-button is-primary"
            disabled={busy || (!dirty && group !== null)}
          >
            <Icon name="save" />
            Save endpoint
          </button>
        </div>
      </form>
      <section className="wr-restgo-publication-editor">
        <h3>Publication</h3>
        <p>
          Link this endpoint version to a RestGO database. Every configured method shares the
          database and access policy.
        </p>
        {group === null ? (
          <p className="wr-restgo-inline-note">Save the endpoint to configure its publication.</p>
        ) : (
          <>
            {publications.length > 0 && (
              <div className="wr-restgo-publication-list">
                {publications.map((publication) => {
                  const database = catalog.bancos.find((entry) => entry.id === publication.idbanco);
                  const auth = restGoPublicationAuthentication(publication);
                  return (
                    <div className="wr-restgo-publication-row" key={publication.id}>
                      <div>
                        <strong>
                          {database?.slug ||
                            publication.bancoSlug ||
                            `Database ${String(publication.idbanco)}`}
                        </strong>
                        <code>
                          /v{group.version}/{database?.slug || publication.bancoSlug}/{group.slug}
                        </code>
                        <small>
                          {auth === 'jwt'
                            ? 'User session (JWT)'
                            : auth === 'public'
                              ? 'Public access'
                              : 'API token'}{' '}
                          · {publication.ativo ? 'Published' : 'Publication inactive'}
                          {database?.ativo === false ? ' · Database inactive' : ''}
                        </small>
                      </div>
                      <button
                        className="wr-restgo-button"
                        type="button"
                        disabled={busy || dirty}
                        onClick={() => {
                          setSelectedDatabaseId(String(publication.idbanco));
                          setAuthenticationDraft(null);
                        }}
                      >
                        Edit access
                      </button>
                      <button
                        className="wr-restgo-button"
                        type="button"
                        disabled={busy || dirty}
                        onClick={() => {
                          setError(null);
                          void props
                            .onSetPublicationActive(publication, !publication.ativo)
                            .catch((reason: unknown) => setError(restGoErrorMessage(reason)));
                        }}
                      >
                        {publication.ativo ? 'Unpublish' : 'Publish'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <form
              onSubmit={(event) => {
                void publish(event);
              }}
            >
              <fieldset className="wr-restgo-fields" disabled={busy || dirty}>
                <label>
                  <span>Database</span>
                  <select
                    required
                    value={databaseId}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSelectedDatabaseId(value);
                      setAuthenticationDraft(null);
                    }}
                  >
                    <option value="">Choose a database</option>
                    {catalog.bancos.map((database) => (
                      <option key={database.id} value={database.id} disabled={!database.ativo}>
                        {database.slug}
                        {database.ativo ? '' : ' (inactive)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Required credential</span>
                  <select
                    value={authentication}
                    onChange={(event) =>
                      setAuthenticationDraft(publicationAuthentication(event.currentTarget.value))
                    }
                  >
                    <option value="jwt">User session (JWT)</option>
                    <option value="api-token">API token</option>
                    <option value="public">Public (no credential)</option>
                  </select>
                </label>
              </fieldset>
              {catalog.bancos.length === 0 && (
                <p className="wr-restgo-inline-note">
                  No databases are configured. Add a database in the RestGO panel, then refresh.
                </p>
              )}
              {authentication === 'public' && (
                <p className="wr-restgo-inline-note">
                  Anyone with the URL can call this API without authentication.
                </p>
              )}
              {authentication === 'api-token' && (
                <p className="wr-restgo-inline-note">
                  The published application uses its application API token. Administrative access
                  remains separate.
                </p>
              )}
              <div className="wr-restgo-form-actions">
                <span className="wr-restgo-muted">
                  {dirty
                    ? 'Save endpoint changes before publishing.'
                    : !active
                      ? 'Publishing activates this endpoint version.'
                      : ''}
                </span>
                {(authenticationDraft !== null ||
                  (selectedDatabaseId !== null && selectedDatabaseId !== defaultDatabaseId)) && (
                  <button
                    type="button"
                    className="wr-restgo-button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedDatabaseId(null);
                      setAuthenticationDraft(null);
                    }}
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="submit"
                  className="wr-restgo-button is-primary"
                  disabled={busy || dirty || !databaseId}
                >
                  <Icon name="upload" />
                  {editingPublicationId !== undefined ? 'Save publication' : 'Publish endpoint'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
