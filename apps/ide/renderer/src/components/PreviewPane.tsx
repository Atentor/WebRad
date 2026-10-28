import type { ReactElement } from 'react';
import type { BuildDiagnostic } from '../../../shared/contracts';

interface PreviewPaneProps {
  url: string | null;
  running: boolean;
  diagnostics: readonly BuildDiagnostic[];
}

export function PreviewPane({ url, running, diagnostics }: PreviewPaneProps): ReactElement {
  if (running) {
    return (
      <div className="wr-preview-state" role="status">
        <span className="wr-spinner" aria-hidden="true" />
        Building the browser application…
      </div>
    );
  }

  if (!url) {
    const firstError = diagnostics.find((item) => item.category === 'error');
    return (
      <div className="wr-preview-state">
        <strong>{firstError ? 'Preview build failed' : 'No preview build yet'}</strong>
        <span>
          {firstError?.message ??
            'Run the compiler to render the actual generated application here.'}
        </span>
      </div>
    );
  }

  // Preview uses a separate origin and main-process navigation/IPC guards.
  // HTML iframe sandboxing blocks native PDF viewers; Electron's process
  // sandbox remains enabled for the entire renderer window.
  return (
    <div className="wr-preview-pane">
      <iframe
        title="WebRAD application preview"
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        src={url}
      />
    </div>
  );
}
