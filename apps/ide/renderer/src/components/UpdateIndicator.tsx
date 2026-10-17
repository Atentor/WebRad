import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import type { UpdateState } from '../../../shared/update-contracts';
import { Icon } from './Icon';

interface UpdateIndicatorProps {
  readonly state: UpdateState;
  readonly onUpdate: () => void;
}

export function UpdateIndicator({ state, onUpdate }: UpdateIndicatorProps): ReactElement | null {
  if (!['available', 'downloading', 'ready', 'installing', 'manual'].includes(state.status))
    return null;
  const busy = state.status === 'downloading' || state.status === 'installing';
  const title =
    state.message ??
    (state.status === 'downloading'
      ? `Downloading${state.progress === undefined ? '...' : ` ${String(state.progress)}%`}`
      : state.status === 'installing'
        ? 'Installing update...'
        : state.status === 'manual'
          ? 'Update downloaded. Complete the installation manually.'
          : state.latestVersion
            ? `WebRad ${state.latestVersion} is available. Your project will be saved before restarting.`
            : `WebRad ${state.currentVersion}`);
  return (
    <button
      type="button"
      className="wr-toolbar-update"
      data-update-status={state.status}
      disabled={busy || state.status === 'manual'}
      title={title}
      aria-label="Update"
      aria-busy={busy}
      onClick={onUpdate}
    >
      <Icon name="download" />
      <span aria-live="polite">Update</span>
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
