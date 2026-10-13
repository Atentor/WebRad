import { useEffect, useId, useRef, type ReactElement } from 'react';
import type { DeployState } from '../use-deploy';
import { Icon } from './Icon';

export function DeployDialog({
  state,
  onClose,
}: {
  readonly state: DeployState;
  readonly onClose: () => void;
}): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const busy = state.status === 'compiling' || state.status === 'writing';
  useEffect(() => {
    dialogRef.current?.focus();
    const previous = returnFocusRef.current;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!busy) closeRef.current?.focus();
  }, [busy]);
  const description =
    state.status === 'compiling'
      ? 'Compiling your application…'
      : state.status === 'writing'
        ? 'Exporting files…'
        : state.status === 'success'
          ? 'Your application is ready for hosting.'
          : 'Deploy could not be completed.';
  return (
    <div
      className="wr-modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (!busy) onClose();
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (busy) dialogRef.current?.focus();
          else closeRef.current?.focus();
        }
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="wr-modal wr-deploy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Project</span>
            <h2 id={titleId}>Deploy</h2>
          </div>
          <Icon name={state.status === 'success' ? 'check' : 'upload-cloud'} />
        </header>
        <div className="wr-deploy-content">
          <p id={descriptionId} role="status">
            {description}
          </p>
          {state.status !== 'error' && (
            <progress
              aria-label="Deploy progress"
              max={Math.max(1, state.totalFiles)}
              value={state.status === 'compiling' ? undefined : state.completedFiles}
            />
          )}
          {state.totalFiles > 0 && (
            <div className="wr-deploy-count">
              {state.completedFiles} of {state.totalFiles} files
            </div>
          )}
          {busy && state.currentFile && (
            <div className="wr-deploy-path" title={state.currentFile}>
              {state.currentFile}
            </div>
          )}
          {state.outputDirectory && (
            <div className="wr-deploy-path" title={state.outputDirectory}>
              {state.outputDirectory}
            </div>
          )}
          {state.status === 'error' && (
            <p className="wr-project-settings-error" role="alert">
              {state.message}
            </p>
          )}
        </div>
        <footer className="wr-modal-actions">
          <button
            ref={closeRef}
            type="button"
            className="primary"
            disabled={busy}
            onClick={onClose}
          >
            {busy ? 'Deploying…' : 'Close'}
          </button>
        </footer>
      </section>
    </div>
  );
}
