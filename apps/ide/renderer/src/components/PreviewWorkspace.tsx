import { useEffect, useRef, type ReactElement } from 'react';
import type { BuildDiagnostic } from '../../../shared/contracts';
import { Icon } from './Icon';
import { PreviewPane } from './PreviewPane';
import { ErrorBoundary } from './ErrorBoundary';

interface PreviewWorkspaceProps {
  projectName: string;
  url: string | null;
  building: boolean;
  diagnostics: readonly BuildDiagnostic[];
  onStop: () => void;
}

function previewPageAddress(url: string | null): string {
  if (url === null) return '';
  const address = new URL(url);
  // The first segment belongs to the local Preview publication, not the application route.
  const path = address.hash.startsWith('#/')
    ? address.hash.slice(1)
    : '/' + address.pathname.split('/').slice(2).join('/');
  return path.endsWith('/index.html') ? path.slice(0, -'.html'.length) : path;
}

export function PreviewWorkspace({
  projectName,
  url,
  building,
  diagnostics,
  onStop,
}: PreviewWorkspaceProps): ReactElement {
  const stopButton = useRef<HTMLButtonElement>(null);
  const pageAddress = previewPageAddress(url);
  useEffect(() => stopButton.current?.focus(), []);

  return (
    <section className="wr-preview-workspace" aria-label="Application preview">
      <header className="wr-preview-toolbar" aria-label="Preview controls">
        <Icon name="play" />
        <strong>Preview</strong>
        <span className="wr-preview-project">{projectName}</span>
        <input
          className="wr-preview-url"
          type="text"
          aria-label="Preview URL"
          value={pageAddress}
          placeholder={building ? 'Building...' : 'Preview unavailable'}
          title={pageAddress || undefined}
          readOnly
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
        <span className="wr-preview-hint">Stop to return to the IDE</span>
        <button
          ref={stopButton}
          className="wr-preview-stop"
          type="button"
          aria-label="Stop preview"
          title="Stop preview and return to the IDE"
          onClick={onStop}
        >
          <Icon name="stop" />
          <span>Stop</span>
        </button>
      </header>
      <main className="wr-preview-content">
        <ErrorBoundary area="Preview">
          <PreviewPane url={url} running={building} diagnostics={diagnostics} />
        </ErrorBoundary>
      </main>
    </section>
  );
}
