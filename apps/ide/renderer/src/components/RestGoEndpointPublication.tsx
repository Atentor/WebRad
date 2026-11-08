import { useEffect, useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type {
  RestGoAdminCatalog,
  RestGoAdminPublication,
  RestGoAdminPublicationInput,
} from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import {
  restGoErrorMessage,
  restGoPublicationAuthentication,
  type RestGoEndpointGroup,
} from './restgo-workspace-model';
import { useEditorDraftPending } from './useEditorDraftPending';

interface Props {
  readonly group: RestGoEndpointGroup | null;
  readonly catalog: RestGoAdminCatalog;
  readonly defaultDatabase: string;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly onSave: (publication: RestGoAdminPublicationInput, id?: number) => Promise<void>;
  readonly onSetActive: (publication: RestGoAdminPublication, active: boolean) => Promise<void>;
  readonly onPendingChange: (pending: boolean) => void;
}

export function RestGoEndpointPublication({
  group,
  catalog,
  defaultDatabase,
  busy,
  dirty,
  onSave,
  onSetActive,
  onPendingChange,
}: Props): ReactElement {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
  const [authenticationDraft, setAuthenticationDraft] = useState<
    'jwt' | 'api-token' | 'public' | null
  >(null);
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
        defaultDatabase !== '' &&
        (publication.bancoSlug === defaultDatabase ||
          catalog.bancos.some(
            (database) => database.id === publication.idbanco && database.slug === defaultDatabase,
          )),
    ) ?? publications[0];
  const defaultDatabaseId = defaultPublication
    ? String(defaultPublication.idbanco)
    : String(
        catalog.bancos.find((database) => database.ativo && database.slug === defaultDatabase)
          ?.id ?? '',
      );
  const databaseId = selectedDatabaseId ?? defaultDatabaseId;
  const selectedPublication = publications.find((entry) => String(entry.idbanco) === databaseId);
  const authentication =
    authenticationDraft ??
    (selectedPublication ? restGoPublicationAuthentication(selectedPublication) : 'jwt');
  const endpoint = group?.endpoints[0];
  const pending = group !== null && (open || publications.length === 0) && changed;
  useEditorDraftPending(pending);
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const cancel = (): void => {
    setChanged(false);
    setOpen(false);
    setError(null);
    setSelectedDatabaseId(null);
    setAuthenticationDraft(null);
  };
  const publish = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!endpoint || dirty) {
      setError('Save the endpoint before publishing.');
      return;
    }
    if (!catalog.bancos.some((database) => String(database.id) === databaseId)) {
      setError('Choose a database for this publication.');
      return;
    }
    try {
      await onSave(
        {
          idbanco: Number(databaseId),
          idendpoint: endpoint.id,
          requiresAuthentication: authentication === 'jwt',
          isPublic: authentication === 'public',
        },
        selectedPublication?.id,
      );
      cancel();
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    }
  };
  return (
    <section
      className="wr-restgo-editor-section wr-restgo-publication-editor"
      aria-labelledby={headingId}
    >
      <div className="wr-restgo-section-heading">
        <div>
          <h3 id={headingId}>Publication & access</h3>
          <p>
            Choose the database and who can call this endpoint. The policy applies to all methods.
          </p>
        </div>
        {group && publications.length > 0 && !open && (
          <button
            type="button"
            className="wr-restgo-button"
            disabled={busy || dirty || changed}
            onClick={() => {
              setSelectedDatabaseId('');
              setAuthenticationDraft('jwt');
              setError(null);
              setOpen(true);
            }}
          >
            <Icon name="add" />
            Add publication
          </button>
        )}
      </div>
      {error && (
        <p className="wr-restgo-inline-error" role="alert">
          {error}
        </p>
      )}
      {group === null ? (
        <p className="wr-restgo-inline-note">
          Save the endpoint first, then choose where to publish it.
        </p>
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
                          `Database ${publication.idbanco}`}
                      </strong>
                      <code>
                        /v{group.version}/{database?.slug || publication.bancoSlug}/{group.slug}
                      </code>
                      <small>
                        {auth === 'jwt'
                          ? 'User session (JWT)'
                          : auth === 'public'
                            ? 'Public access'
                            : 'API token'}
                        {' · '}
                        {publication.ativo ? 'Published' : 'Unpublished'}
                        {database?.ativo === false ? ' · Database inactive' : ''}
                      </small>
                    </div>
                    <button
                      className="wr-restgo-button"
                      type="button"
                      disabled={busy || dirty || changed}
                      onClick={() => {
                        setSelectedDatabaseId(String(publication.idbanco));
                        setAuthenticationDraft(null);
                        setError(null);
                        setOpen(true);
                      }}
                    >
                      Edit access
                    </button>
                    <button
                      className={`wr-restgo-button wr-restgo-publish-action ${publication.ativo ? 'is-unpublish' : 'is-publish'}`}
                      type="button"
                      disabled={
                        changed ||
                        busy ||
                        dirty ||
                        publication.idendpoint === null ||
                        (!publication.ativo && !database?.ativo)
                      }
                      onClick={() => {
                        setError(null);
                        void onSetActive(publication, !publication.ativo).catch((reason: unknown) =>
                          setError(restGoErrorMessage(reason)),
                        );
                      }}
                    >
                      <Icon name={publication.ativo ? 'eye-off' : 'upload-cloud'} />
                      {publication.ativo ? 'Unpublish' : 'Publish'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {dirty && (
            <p className="wr-restgo-inline-note">
              Save endpoint changes before editing publications.
            </p>
          )}
          {(open || publications.length === 0) && (
            <form
              className="wr-restgo-publication-form"
              onSubmit={(event) => {
                void publish(event);
              }}
            >
              <h4>{selectedPublication ? 'Edit publication' : 'New publication'}</h4>
              <fieldset className="wr-restgo-fields" disabled={busy || dirty}>
                <label>
                  <span>Database</span>
                  <select
                    required
                    value={databaseId}
                    onChange={(event) => {
                      setChanged(true);
                      setSelectedDatabaseId(event.currentTarget.value);
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
                    onChange={(event) => {
                      setChanged(true);
                      const next = event.currentTarget.value;
                      if (next === 'jwt' || next === 'api-token' || next === 'public')
                        setAuthenticationDraft(next);
                    }}
                  >
                    <option value="jwt">User session (JWT)</option>
                    <option value="api-token">Application API token</option>
                    <option value="public">Public (no credential)</option>
                  </select>
                </label>
              </fieldset>
              {catalog.bancos.length === 0 && (
                <p className="wr-restgo-inline-note">
                  Add a database in the RestGO panel, then refresh.
                </p>
              )}
              {authentication === 'public' && (
                <p className="wr-restgo-inline-note">
                  Anyone with the URL can call this API without authentication.
                </p>
              )}
              {authentication === 'api-token' && (
                <p className="wr-restgo-inline-note">
                  The application uses its application API token. Administrative credentials stay in
                  the IDE.
                </p>
              )}
              <div className="wr-restgo-form-actions">
                <small>Publishing updates RestGO immediately.</small>
                {(publications.length > 0 || changed) && (
                  <button
                    type="button"
                    className="wr-restgo-button"
                    disabled={busy}
                    onClick={cancel}
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
                  {selectedPublication ? 'Save publication' : 'Publish endpoint'}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
