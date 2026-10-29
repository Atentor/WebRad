import type { ReactElement, RefObject } from 'react';
import type { BuildDiagnostic } from '../../../shared/contracts';

interface PreviewPaneProps {
  url: string | null;
  running: boolean;
  diagnostics: readonly BuildDiagnostic[];
  frameRef?: RefObject<HTMLIFrameElement | null>;
  onFrameLoad?: () => void;
}

export function PreviewPane({
  url,
  running,
  diagnostics,
  frameRef,
  onFrameLoad,
}: PreviewPaneProps): ReactElement {
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
      <div className="wr-preview-state" role={firstError ? 'alert' : 'status'}>
        <strong>{firstError ? 'Preview build failed' : 'No preview build yet'}</strong>
        <span>
          {firstError
            ? 'The application could not be built.'
            : 'Run the compiler to render the actual generated application here.'}
        </span>
        {firstError && (
          <>
            <p>Use Stop to return to the IDE and review Problems.</p>
            <ul className="wr-preview-diagnostics">
              {diagnostics.filter((item) => item.category === 'error').map((item, index) => (
                <li key={index}>
                  {item.file && (
                    <code>
                      {item.file}
                      {item.line === undefined ? '' : `:${item.line}`}
                      {item.line === undefined || item.column === undefined ? '' : `:${item.column}`}
                    </code>
                  )}
                  <span>{item.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  // Preview uses a separate origin and main-process navigation/IPC guards.
  // HTML iframe sandboxing blocks native PDF viewers; Electron's process
  // sandbox remains enabled for the entire renderer window.
  return (
    <div className="wr-preview-pane">
      <iframe
        ref={frameRef}
        onLoad={onFrameLoad}
        title="WebRAD application preview"
        referrerPolicy="no-referrer"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        src={url}
      />
    </div>
  );
}
