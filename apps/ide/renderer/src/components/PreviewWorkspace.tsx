import { DESIGNER_VIEWPORTS, type DesignerViewportName } from '@webrad/designer';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { BuildDiagnostic } from '../../../shared/contracts';
import { Icon, type IconName } from './Icon';
import { PreviewPane } from './PreviewPane';
import { ErrorBoundary } from './ErrorBoundary';

interface PreviewWorkspaceProps {
  projectName: string;
  url: string | null;
  building: boolean;
  diagnostics: readonly BuildDiagnostic[];
  onStop: () => void;
}

const VIEWPORT_ICONS: Record<DesignerViewportName, IconName> = {
  desktop: 'monitor',
  tablet: 'tablet',
  mobile: 'smartphone',
};

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
  const [viewport, setViewport] = useState<DesignerViewportName>('desktop');
  const pageAddress = previewPageAddress(url);
  useEffect(() => stopButton.current?.focus(), []);

  return (
    <section className="wr-preview-workspace" aria-label="Application preview">
      <header className="wr-preview-toolbar" aria-label="Preview controls">
        <Icon name="play" />
        <strong className="wr-preview-title">Preview</strong>
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
        <div className="wr-preview-viewports" role="group" aria-label="Preview viewport">
          {(['desktop', 'tablet', 'mobile'] as const).map((name) => {
            const preset = DESIGNER_VIEWPORTS[name];
            const label = name === 'desktop' ? 'Desktop' : preset.label;
            return (
              <button
                key={name}
                className="wr-tool-button wr-preview-viewport-button"
                type="button"
                aria-label={label}
                aria-pressed={viewport === name}
                title={
                  preset.width === null
                    ? `${label} (available width)`
                    : `${label} (${preset.width} px)`
                }
                onClick={() => setViewport(name)}
              >
                <Icon name={VIEWPORT_ICONS[name]} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
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
        <div
          className="wr-preview-viewport"
          data-viewport={viewport}
          style={{ width: DESIGNER_VIEWPORTS[viewport].width ?? '100%' }}
        >
          <ErrorBoundary area="Preview">
            <PreviewPane url={url} running={building} diagnostics={diagnostics} />
          </ErrorBoundary>
        </div>
      </main>
    </section>
  );
}
