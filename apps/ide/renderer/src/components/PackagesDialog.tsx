import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { PackageSearchResult } from '../../../shared/package-contracts';
import type { useProjectPackages } from '../use-project-packages';
import { Icon } from './Icon';
import './PackagesDialog.css';

type PackagesController = ReturnType<typeof useProjectPackages>;

export function PackagesDialog({
  projectName,
  controller,
  blocked,
}: {
  readonly projectName: string;
  readonly controller: PackagesController;
  readonly blocked: boolean;
}): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const searchRequest = useRef<string | null>(null);
  const [name, setName] = useState(controller.selectedName);
  const [version, setVersion] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<PackageSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const installed = controller.status?.dependencies ?? [];
  const unavailable = controller.status?.toolchain.available === false;
  const operationDisabled = blocked || controller.busy || unavailable;

  useEffect(() => {
    nameRef.current?.focus();
    const previous = returnFocus.current;
    return () => {
      const requestId = searchRequest.current;
      searchRequest.current = null;
      if (requestId) void window.webrad.packages.cancel(requestId).catch(() => undefined);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [controller.logs]);

  const cancelSearch = (): void => {
    const requestId = searchRequest.current;
    searchRequest.current = null;
    setSearching(false);
    if (requestId)
      void window.webrad.packages.cancel(requestId).catch((failure: unknown) => {
        setSearchError(failure instanceof Error ? failure.message : String(failure));
      });
  };

  const search = async (offset = 0): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) return;
    cancelSearch();
    const requestId = crypto.randomUUID();
    searchRequest.current = requestId;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await window.webrad.packages.search({ requestId, query: trimmed, offset });
      if (searchRequest.current !== requestId) return;
      setSearchResult(result);
    } catch (failure) {
      if (searchRequest.current === requestId)
        setSearchError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (searchRequest.current === requestId) {
        searchRequest.current = null;
        setSearching(false);
      }
    }
  };

  return (
    <div
      className="wr-modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (searching) cancelSearch();
          else if (!controller.busy) controller.close();
        }
        if (event.key !== 'Tab') return;
        const focusable = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="wr-modal wr-packages-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-packages-dialog
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">{projectName}</span>
            <h2 id={titleId}>Packages / NPM</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close packages"
            disabled={controller.busy}
            onClick={controller.close}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="wr-packages-content">
          <p id={descriptionId} className="wr-modal-description">
            Manage this project's browser libraries. NPM lifecycle scripts are disabled.
          </p>
          {controller.status?.toolchain.message && (
            <p
              className={unavailable ? 'wr-packages-error' : 'wr-packages-note'}
              role={unavailable ? 'alert' : undefined}
            >
              {controller.status.toolchain.message}
            </p>
          )}
          {blocked && (
            <p className="wr-packages-note">
              Stop Preview, Debug or the current build before changing packages.
            </p>
          )}
          <section className="wr-packages-manual" aria-label="Install by name">
            <h3>Install by name</h3>
            <form
              className="wr-packages-install"
              onSubmit={(event) => {
                event.preventDefault();
                void controller.run('install', name.trim(), version.trim() || undefined);
              }}
            >
              <label>
                <span>Package name</span>
                <input
                  ref={nameRef}
                  aria-label="Package name"
                  placeholder="dayjs or @scope/package"
                  value={name}
                  spellCheck={false}
                  disabled={controller.busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                <span>Version (optional)</span>
                <input
                  aria-label="Package version"
                  placeholder="latest"
                  value={version}
                  spellCheck={false}
                  disabled={controller.busy}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="primary"
                disabled={operationDisabled || !name.trim()}
              >
                Install
              </button>
            </form>
          </section>
          <div className="wr-packages-columns">
            <section className="wr-packages-section" aria-label="Installed packages">
              <div className="wr-packages-section-heading">
                <h3>
                  <Icon name="download-cloud" />
                  Installed <span className="wr-packages-count">{installed.length}</span>
                </h3>
                <button
                  type="button"
                  title="Refresh installed packages and available updates"
                  aria-label="Refresh packages"
                  disabled={controller.busy || controller.refreshing}
                  onClick={() => void controller.refresh()}
                >
                  <Icon name="refresh" />
                </button>
              </div>
              <div className="wr-packages-list" aria-busy={controller.refreshing}>
                {installed.length === 0 && (
                  <div className="wr-packages-empty">
                    <Icon name="download-cloud" />
                    <strong>No packages installed</strong>
                    <p>Search the registry or install a package by name.</p>
                  </div>
                )}
                {installed.map((item) => (
                  <article
                    key={item.name}
                    className="wr-package-card"
                    data-package-name={item.name}
                  >
                    <strong>{item.name}</strong>
                    <div className="wr-package-versions">
                      <span>
                        Installed: {item.installedVersion ?? 'Missing — restore dependencies'}
                      </span>
                      <span>Requested: {item.requested}</span>
                      {item.latestVersion && <span>Latest: {item.latestVersion}</span>}
                    </div>
                    {item.description && <p>{item.description}</p>}
                    <div className="wr-package-actions">
                      <button
                        type="button"
                        disabled={operationDisabled}
                        aria-label={`Update ${item.name}`}
                        onClick={() => void controller.run('update', item.name)}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        disabled={operationDisabled}
                        aria-label={`Remove ${item.name}`}
                        onClick={() => void controller.run('remove', item.name)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="wr-packages-section" aria-label="Search NPM registry">
              <div className="wr-packages-section-heading">
                <h3>
                  <Icon name="search" />
                  NPM registry
                </h3>
              </div>
              <form
                className="wr-packages-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void search();
                }}
              >
                <input
                  type="search"
                  aria-label="Search NPM packages"
                  placeholder="Search browser libraries..."
                  value={query}
                  spellCheck={false}
                  onChange={(event) => {
                    cancelSearch();
                    setQuery(event.target.value);
                    setSearchResult(null);
                  }}
                />
                <button type="submit" disabled={!query.trim() || searching}>
                  Search
                </button>
                {searching && (
                  <button type="button" onClick={cancelSearch}>
                    Cancel search
                  </button>
                )}
              </form>
              {searchError && (
                <p className="wr-packages-error" role="alert">
                  {searchError}
                </p>
              )}
              <div className="wr-packages-list" aria-busy={searching}>
                {!searching && searchResult === null && !searchError && (
                  <div className="wr-packages-empty">
                    <Icon name="search" />
                    <strong>Find a library</strong>
                    <p>Search NPM for packages to add to this project.</p>
                  </div>
                )}
                {searching && <p role="status">Searching NPM...</p>}
                {searchResult?.packages.length === 0 && <p role="status">No packages found.</p>}
                {searchResult?.packages.map((item) => (
                  <article
                    key={item.name}
                    className="wr-package-card"
                    data-registry-package={item.name}
                  >
                    <strong>{item.name}</strong>
                    <span className="wr-package-version">{item.version}</span>
                    {item.description && <p>{item.description}</p>}
                    {item.license && <small>License: {item.license}</small>}
                    {item.homepage && (
                      <small className="wr-package-homepage" title={item.homepage}>
                        {item.homepage}
                      </small>
                    )}
                    <div className="wr-package-actions">
                      <button
                        type="button"
                        disabled={operationDisabled}
                        aria-label={`Install ${item.name}`}
                        onClick={() => {
                          setName(item.name);
                          setVersion('');
                          void controller.run('install', item.name);
                        }}
                      >
                        Install
                      </button>
                      <button
                        type="button"
                        disabled={controller.busy}
                        onClick={() => {
                          setName(item.name);
                          nameRef.current?.focus();
                        }}
                      >
                        Choose version
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {searchResult && (
                <div className="wr-packages-pagination">
                  <button
                    type="button"
                    disabled={searching || searchResult.offset === 0}
                    onClick={() => void search(Math.max(0, searchResult.offset - 20))}
                  >
                    Previous
                  </button>
                  <span>
                    {searchResult.offset + (searchResult.packages.length ? 1 : 0)}–
                    {searchResult.offset + searchResult.packages.length} of {searchResult.total}
                  </span>
                  <button
                    type="button"
                    disabled={
                      searching ||
                      searchResult.offset + searchResult.packages.length >= searchResult.total
                    }
                    onClick={() => void search(searchResult.offset + searchResult.packages.length)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          </div>
          {controller.typeWarnings.map((warning) => (
            <p className="wr-packages-note" key={warning}>
              {warning}
            </p>
          ))}
          {controller.error && (
            <p className="wr-packages-error" role="alert">
              {controller.error}
            </p>
          )}
          {controller.message && (
            <p role="status" className="wr-packages-operation">
              {controller.message}
            </p>
          )}
          {controller.busy && <progress aria-label="Package operation progress" />}
          <details
            className="wr-packages-log"
            open={controller.busy || controller.error !== null || controller.logs.length > 0}
          >
            <summary>Operation log</summary>
            <pre ref={logRef} tabIndex={0} aria-label="Package operation log">
              {controller.logs.join('\n') || 'No package operation has run.'}
            </pre>
          </details>
        </div>
        <footer className="wr-modal-actions">
          <button
            type="button"
            disabled={operationDisabled || installed.length === 0}
            onClick={() => void controller.run('restore')}
          >
            Restore dependencies
          </button>
          {controller.busy && (
            <button type="button" onClick={() => void controller.cancel()}>
              Cancel operation
            </button>
          )}
          <button type="button" disabled={controller.busy} onClick={controller.close}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
