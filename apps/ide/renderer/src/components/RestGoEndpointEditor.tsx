import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type {
  RestGoAdminCatalog,
  RestGoAdminEndpoint,
  RestGoAdminEndpointInput,
  RestGoAdminHttpMethod,
  RestGoAdminPublication,
  RestGoAdminPublicationInput,
} from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import { restGoErrorMessage, type RestGoEndpointGroup } from './restgo-workspace-model';
import { RestGoSqlDialog } from './RestGoSqlDialog';
import { RestGoEndpointPublication } from './RestGoEndpointPublication';

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
  const [sqlDialog, setSqlDialog] = useState<{
    readonly method: RestGoAdminHttpMethod;
    readonly script: string;
  } | null>(null);
  const [publicationPending, setPublicationPending] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty || publicationPending);
  }, [dirty, publicationPending, onDirtyChange]);
  const id = useId();
  const current = methods.find((method) => method.method === activeMethod)!;
  const operation = catalog.operations.find((entry) => String(entry.id) === current.operationId);
  const liveEndpoints = useMemo(
    () =>
      group === null
        ? []
        : catalog.endpoints.filter(
            (entry) => entry.slug === group.slug && entry.versao === group.version,
          ),
    [catalog.endpoints, group],
  );
  const currentEndpoint = liveEndpoints.find((entry) => entry.metodo === activeMethod);

  const markDirty = (): void => {
    setDirty(true);
    setError(null);
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
    } catch (reason) {
      setError(
        `${restGoErrorMessage(reason)} Earlier methods may already have been saved; you can safely retry.`,
      );
    }
  };
  const toggleMethod = async (): Promise<void> => {
    if (!currentEndpoint) return;
    setError(null);
    try {
      await props.onSetActive(currentEndpoint, !currentEndpoint.ativo);
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    }
  };

  return (
    <div className="wr-restgo-endpoint-editor">
      <div className="wr-restgo-subheading">
        <div>
          <h2>{group ? group.slug : 'New endpoint'}</h2>
          <p>Configure the endpoint, add its methods, then publish it to a database.</p>
        </div>
        <span className="wr-restgo-scope">{group ? `Version ${group.version}` : 'Draft'}</span>
      </div>
      {error && (
        <div className="wr-restgo-alert" role="alert">
          {error}
        </div>
      )}
      {publicationPending && (
        <p className="wr-restgo-inline-note">
          Save or cancel the publication edit before changing endpoint methods.
        </p>
      )}
      <form
        className="wr-restgo-endpoint-form"
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <section className="wr-restgo-editor-section" aria-labelledby={`${id}-details`}>
          <div className="wr-restgo-section-heading">
            <div>
              <h3 id={`${id}-details`}>Endpoint details</h3>
              <p>The name and version identify this API across its HTTP methods.</p>
            </div>
            <code className="wr-restgo-route-preview">
              /v{version || '1'}/:database/{slug || 'endpoint'}
            </code>
          </div>
          <fieldset disabled={publicationPending || busy} className="wr-restgo-fields">
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
                  ? 'Create a new endpoint for another version.'
                  : 'Each version is published independently.'}
              </small>
            </label>
          </fieldset>
        </section>
        <section className="wr-restgo-editor-section" aria-labelledby={`${id}-methods`}>
          <div className="wr-restgo-section-heading">
            <div>
              <h3 id={`${id}-methods`}>HTTP methods</h3>
              <p>Select a method, then choose the SQL script or API Operation it runs.</p>
            </div>
            <span className="wr-restgo-muted">
              {methods.filter((method) => method.configured).length} configured
            </span>
          </div>
          <div
            className="wr-restgo-method-tabs"
            role="tablist"
            aria-label="HTTP methods"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const index = METHODS.indexOf(activeMethod);
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? METHODS.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + METHODS.length) %
                      METHODS.length;
              const next = METHODS[nextIndex];
              if (next) {
                setActiveMethod(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }
            }}
          >
            {methods.map((method) => (
              <button
                type="button"
                role="tab"
                key={method.method}
                id={`${id}-${method.method}`}
                aria-controls={`${id}-method-panel`}
                aria-selected={activeMethod === method.method}
                tabIndex={activeMethod === method.method ? 0 : -1}
                title={method.configured ? 'Configured method' : 'Not configured'}
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
            {current.configured ? (
              <>
                <div className="wr-restgo-method-heading">
                  <div>
                    <strong>{activeMethod} handler</strong>
                    <small>
                      {current.existingId !== undefined
                        ? currentEndpoint
                          ? currentEndpoint.ativo
                            ? 'Active method'
                            : 'Inactive method'
                          : 'Saved method'
                        : 'New method - save the endpoint to add it.'}
                    </small>
                  </div>
                  {currentEndpoint ? (
                    <button
                      type="button"
                      className="wr-restgo-button"
                      disabled={publicationPending || busy || dirty}
                      onClick={() => {
                        void toggleMethod();
                      }}
                    >
                      <span
                        className={`wr-restgo-dot${currentEndpoint.ativo ? ' is-active' : ''}`}
                      />
                      {currentEndpoint.ativo ? 'Deactivate' : 'Activate'} {activeMethod}
                    </button>
                  ) : current.existingId === undefined ? (
                    <button
                      type="button"
                      className="wr-restgo-button is-quiet"
                      disabled={publicationPending || busy}
                      onClick={() => patchMethod({ configured: false })}
                    >
                      Remove method
                    </button>
                  ) : null}
                </div>
                <fieldset disabled={publicationPending || busy} className="wr-restgo-method-fields">
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
                    <small>Run a database query or an existing workflow.</small>
                  </label>
                  {current.type === 'normal' ? (
                    <div className="wr-restgo-sql-summary">
                      <div>
                        <strong>SQL for {activeMethod}</strong>
                        <small>
                          {current.script ? current.script.split('\n').length : 0} lines
                        </small>
                        <button
                          type="button"
                          className="wr-restgo-button is-primary"
                          aria-label={`Edit SQL for ${activeMethod}`}
                          onClick={() =>
                            setSqlDialog({ method: activeMethod, script: current.script })
                          }
                        >
                          <Icon name="code" />
                          {current.script.trim() ? 'Edit SQL' : 'Write SQL'}
                        </button>
                      </div>
                      {current.script.trim() ? (
                        <pre className="wr-restgo-sql-preview">
                          {current.script.split('\n').slice(0, 5).join('\n').slice(0, 1600)}
                        </pre>
                      ) : (
                        <p>No SQL script yet. Open the editor to write this method's query.</p>
                      )}
                      <small>
                        Use :namedParameters for values from query parameters or the JSON body.
                      </small>
                    </div>
                  ) : (
                    <div className="wr-restgo-operation-config">
                      <label>
                        <span>API Operation</span>
                        <select
                          value={current.operationId}
                          onChange={(event) =>
                            patchMethod({ operationId: event.currentTarget.value })
                          }
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
                          Create an API Operation in RestGO, then refresh the catalog.
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
                              Activate this API Operation in RestGO before using the endpoint.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </fieldset>
              </>
            ) : (
              <div className="wr-restgo-method-empty">
                <Icon name="add" />
                <div>
                  <strong>{activeMethod} is not configured</strong>
                  <p>Add a handler to make this method available for the endpoint.</p>
                </div>
                <button
                  type="button"
                  className="wr-restgo-button is-primary"
                  disabled={publicationPending || busy}
                  onClick={() => patchMethod({ configured: true })}
                >
                  Add {activeMethod} method
                </button>
              </div>
            )}
          </section>
        </section>
        <div className="wr-restgo-form-actions wr-restgo-save-bar">
          <div className="wr-restgo-save-state">
            <strong>
              {dirty ? 'Changes to save' : group ? 'Endpoint up to date' : 'New endpoint'}
            </strong>
            <small>Save endpoint sends every configured method to RestGO.</small>
          </div>
          {dirty && (
            <button
              type="button"
              className="wr-restgo-button"
              disabled={publicationPending || busy}
              onClick={discard}
            >
              Discard changes
            </button>
          )}
          <button
            type="submit"
            className="wr-restgo-button is-primary"
            disabled={publicationPending || busy || (!dirty && group !== null)}
          >
            <Icon name="save" />
            Save endpoint
          </button>
        </div>
      </form>
      <RestGoEndpointPublication
        group={group}
        catalog={catalog}
        defaultDatabase={props.defaultDatabase}
        busy={busy}
        dirty={dirty}
        onSave={props.onSavePublication}
        onSetActive={props.onSetPublicationActive}
        onPendingChange={setPublicationPending}
      />
      {sqlDialog && (
        <RestGoSqlDialog
          method={sqlDialog.method}
          endpoint={slug}
          value={sqlDialog.script}
          onClose={() => setSqlDialog(null)}
          onApply={(script) => {
            setMethods((entries) =>
              entries.map((entry) =>
                entry.method === sqlDialog.method ? { ...entry, script } : entry,
              ),
            );
            markDirty();
            setSqlDialog(null);
          }}
        />
      )}
    </div>
  );
}
