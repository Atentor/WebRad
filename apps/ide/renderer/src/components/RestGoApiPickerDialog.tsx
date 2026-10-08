import {
  getRestGoPublishedApiConnection,
  isEmptyApiClientConfiguration,
  type RestGoPublishedApi,
} from '@webrad/designer';
import type { ApiClientConfiguration, RestGoProjectSettings } from '@webrad/project-model';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { restGoCatalogToPublishedApis, restGoErrorMessage } from './restgo-workspace-model';

interface Props {
  readonly restGoSettings?: RestGoProjectSettings;
  readonly configuration: ApiClientConfiguration;
  readonly customBaseUrl: string;
  readonly onClose: () => void;
  readonly onImport: (apis: readonly RestGoPublishedApi[], convertCustom: boolean) => void;
}

const AUTHENTICATION_LABELS = {
  jwt: 'User JWT',
  'api-token': 'API token',
  public: 'Public',
} as const;

export function RestGoApiPickerDialog({
  restGoSettings,
  configuration,
  customBaseUrl,
  onClose,
  onImport,
}: Props): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [apis, setApis] = useState<readonly RestGoPublishedApi[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [convertCustom, setConvertCustom] = useState(false);
  const [connectionRequired, setConnectionRequired] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [remember, setRemember] = useState(false);
  const [encryptionAvailable, setEncryptionAvailable] = useState(false);
  const adminTokenRef = useRef<HTMLInputElement | null>(null);
  const baseUrl = restGoSettings?.baseUrl ?? '';
  const enabled = restGoSettings?.enabled === true && baseUrl.length > 0;
  const custom = (configuration.connection ?? 'custom') === 'custom';
  const empty = isEmptyApiClientConfiguration(configuration);
  const needsConversion = custom && (!empty || customBaseUrl.trim().length > 0);
  const selectedApis = useMemo(
    () => apis.filter((api) => selectedIds.has(api.id)),
    [apis, selectedIds],
  );
  const selectedConnection =
    selectedApis[0] === undefined ? undefined : getRestGoPublishedApiConnection(selectedApis[0]);
  const visibleApis = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return apis.filter((api) =>
      `${api.name} ${api.method} ${api.database} ${api.endpoint} v${String(api.apiVersion)}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [apis, search]);

  useEffect(() => {
    searchRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        if (!enabled) throw new Error('Enable and configure RestGo in the left sidebar.');
        const status = await window.webrad.restgoAdmin.status({ baseUrl });
        if (cancelled) return;
        setEncryptionAvailable(status.encryptionAvailable);
        setRemember(status.storage === 'encrypted');
        if (!status.connected) {
          setConnectionRequired(true);
          throw new Error('Connect an administrative API token to load published APIs.');
        }
        const catalog = await window.webrad.restgoAdmin.catalog({ baseUrl });
        if (!cancelled) {
          setApis(restGoCatalogToPublishedApis(catalog));
          setConnectionRequired(false);
        }
      } catch (caught) {
        if (!cancelled) {
          const message = restGoErrorMessage(caught);
          setApis([]);
          setSelectedIds(new Set());
          setError(message);
          if (
            message.startsWith('RestGo HTTP 401:') ||
            message.startsWith('RestGo HTTP 403: This token has no administrative permission.')
          )
            setConnectionRequired(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, enabled, refreshVersion]);

  useEffect(() => {
    if (connectionRequired) adminTokenRef.current?.focus();
  }, [connectionRequired]);

  const connectAdmin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!enabled || connecting || adminToken.trim().length === 0) return;
    setConnecting(true);
    setError(null);
    try {
      await window.webrad.restgoAdmin.connect({
        baseUrl,
        token: adminToken.trim(),
        remember: remember && encryptionAvailable,
      });
      if (!dialogRef.current?.isConnected) return;
      setAdminToken('');
      setConnectionRequired(false);
      setLoading(true);
      setSelectedIds(new Set());
      setRefreshVersion((current) => current + 1);
    } catch (caught) {
      if (dialogRef.current?.isConnected) setError(restGoErrorMessage(caught));
    } finally {
      if (dialogRef.current?.isConnected) setConnecting(false);
    }
  };

  const incompatible = (api: RestGoPublishedApi): boolean => {
    const connection = getRestGoPublishedApiConnection(api);
    return (
      (!custom && !empty && configuration.connection !== connection) ||
      (selectedConnection !== undefined && selectedConnection !== connection)
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        className="wr-modal wr-restgo-api-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={loading}
        ref={dialogRef}
      >
        <header className="wr-modal-header">
          <h2 id={titleId}>Import from RestGo</h2>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close RestGo API picker"
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <div className="wr-api-client-content">
          <div className="wr-restgo-api-picker-tools">
            <input
              ref={searchRef}
              aria-label="Search published RestGo APIs"
              placeholder="Search APIs, databases, or methods"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <button
              type="button"
              disabled={loading || connecting}
              onClick={() => {
                setLoading(true);
                setError(null);
                setSelectedIds(new Set());
                setRefreshVersion((current) => current + 1);
              }}
            >
              Refresh
            </button>
          </div>
          {error !== null && (
            <p className="wr-modal-error" role="alert">
              {error}
            </p>
          )}
          {connectionRequired && enabled && (
            <form
              className="wr-restgo-api-picker-connect"
              aria-label="RestGo administrative access"
              onSubmit={(event) => void connectAdmin(event)}
            >
              <div className="wr-restgo-api-picker-credential">
                <label>
                  <span>Administrative API token</span>
                  <input
                    ref={adminTokenRef}
                    type="password"
                    aria-label="Administrative API token"
                    autoComplete="off"
                    spellCheck={false}
                    value={adminToken}
                    disabled={connecting}
                    onChange={(event) => setAdminToken(event.currentTarget.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="primary"
                  disabled={connecting || adminToken.trim().length === 0}
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
              {encryptionAvailable && (
                <label className="wr-restgo-api-picker-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    disabled={connecting}
                    onChange={(event) => setRemember(event.currentTarget.checked)}
                  />
                  <span>Remember securely on this device</span>
                </label>
              )}
            </form>
          )}
          {loading ? (
            <p className="wr-api-empty" role="status">
              Loading published APIs...
            </p>
          ) : (
            <div className="wr-restgo-api-picker-list" aria-label="Published RestGo APIs">
              {visibleApis.map((api) => {
                const unavailable = incompatible(api);
                const unavailableId = `${titleId}-unavailable-${api.id}`;
                return (
                  <label className="wr-restgo-api-picker-row" key={api.id}>
                    <input
                      type="checkbox"
                      aria-label={`Import ${api.method} ${api.database}/${api.endpoint} v${String(api.apiVersion)}`}
                      aria-describedby={unavailable ? unavailableId : undefined}
                      checked={selectedIds.has(api.id)}
                      disabled={unavailable}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(api.id);
                          else next.delete(api.id);
                          return next;
                        });
                      }}
                    />
                    <span className={`wr-restgo-method-badge method-${api.method.toLowerCase()}`}>
                      {api.method}
                    </span>
                    <span className="wr-restgo-api-picker-details">
                      <span className="wr-restgo-api-picker-heading">
                        <strong>{api.name}</strong>
                        <small>
                          {api.database} · v{String(api.apiVersion)}
                        </small>
                      </span>
                      <code className="wr-restgo-api-picker-route">
                        /v{String(api.apiVersion)}/{api.database}/{api.endpoint}
                      </code>
                    </span>
                    <span className="wr-restgo-api-picker-auth">
                      <small>{AUTHENTICATION_LABELS[api.authentication]}</small>
                      {unavailable && (
                        <small
                          className="wr-restgo-api-picker-unavailable"
                          id={unavailableId}
                          title="Use another API Client for this authentication mode."
                        >
                          Separate client required
                        </small>
                      )}
                    </span>
                  </label>
                );
              })}
              {visibleApis.length === 0 && error === null && (
                <p className="wr-api-empty">
                  {apis.length === 0
                    ? 'No published APIs. Publish an endpoint in RestGo to import it.'
                    : 'No APIs match this search.'}
                </p>
              )}
            </div>
          )}
          {needsConversion && (
            <label className="wr-restgo-api-conversion">
              <input
                type="checkbox"
                checked={convertCustom}
                onChange={(event) => setConvertCustom(event.currentTarget.checked)}
              />
              <span>
                Use the fixed RestGo URL and authentication. Keep relative requests and remove saved
                Authorization headers. Absolute URLs need another API Client.
              </span>
            </label>
          )}
        </div>
        <footer className="wr-modal-actions">
          <span className="wr-restgo-api-picker-count" role="status">
            {selectedApis.length === 0
              ? 'No requests selected'
              : `${String(selectedApis.length)} selected`}
          </span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={
              loading ||
              connecting ||
              connectionRequired ||
              selectedApis.length === 0 ||
              (needsConversion && !convertCustom)
            }
            onClick={() => onImport(selectedApis, convertCustom)}
          >
            Import{' '}
            {selectedApis.length > 0
              ? `${String(selectedApis.length)} request${selectedApis.length === 1 ? '' : 's'}`
              : 'APIs'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
