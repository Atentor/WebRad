import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { UpdateState } from '../../../shared/update-contracts';
import { Icon } from './Icon';

interface UpdateIndicatorProps {
  readonly state: UpdateState;
  readonly onCheck: () => void;
  readonly onUpdate: () => void;
}

export function UpdateIndicator({
  state,
  onCheck,
  onUpdate,
}: UpdateIndicatorProps): ReactElement | null {
  if (state.status === 'idle' || state.status === 'disabled') return null;
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  const actionable = state.status === 'available' || state.status === 'ready';
  const label =
    state.status === 'available'
      ? state.mode === 'manual'
        ? 'Download update'
        : 'Update'
      : state.status === 'ready'
        ? 'Restart to update'
        : state.status === 'checking'
          ? 'Checking...'
          : state.status === 'downloading'
            ? `Downloading${state.progress === undefined ? '...' : ` ${String(state.progress)}%`}`
            : state.status === 'installing'
              ? 'Installing...'
              : state.status === 'manual'
                ? 'Update downloaded'
                : state.status === 'current'
                  ? 'Up to date'
                  : 'Retry update check';
  const title =
    state.message ??
    (state.latestVersion
      ? `WebRad ${state.latestVersion} is available. Your project will be saved before restarting.`
      : `WebRad ${state.currentVersion}`);
  return (
    <button
      type="button"
      className={`wr-toolbar-update${state.status === 'error' ? ' error' : ''}`}
      data-update-status={state.status}
      disabled={busy || state.status === 'manual'}
      title={title}
      aria-label={label}
      aria-busy={busy}
      onClick={actionable ? onUpdate : onCheck}
    >
      <Icon name="download" />
      <span aria-live="polite">{label}</span>
    </button>
  );
}

export function UpdateInstallingDialog(): ReactElement {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);
  return (
    <div className="wr-modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="wr-update-installing"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wr-update-installing-title"
        tabIndex={-1}
      >
        <h2 id="wr-update-installing-title">Installing update</h2>
        <p>Your project has been saved. WebRad will restart when installation finishes.</p>
        <p role="status">Complete the system authorization prompt if requested.</p>
      </section>
    </div>
  );
}
