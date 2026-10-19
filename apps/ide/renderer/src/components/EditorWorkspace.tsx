import type { ReactElement, ReactNode } from 'react';
import { applicationIconUrl } from '../application-assets';
import { Icon } from './Icon';

export type ViewMode = 'design' | 'code' | 'preview';

export interface DocumentTab {
  id: string;
  label: string;
  dirty: boolean;
  kind: 'page' | 'reusable' | 'code' | 'styles' | 'restgo';
}

interface EditorWorkspaceProps {
  documents: readonly DocumentTab[];
  activeDocumentId: string | null;
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  children: ReactNode;
}

export function EditorWorkspace({
  documents,
  activeDocumentId,
  activeView,
  onSelectView,
  children,
}: EditorWorkspaceProps): ReactElement {
  const activeDocument = documents.find((document) => document.id === activeDocumentId);
  const stylesDocumentActive =
    activeDocument?.kind === 'styles' || activeDocument?.kind === 'restgo';
  const hasDocumentViews = activeDocument !== undefined && !stylesDocumentActive;

  return (
    <section
      className={
        hasDocumentViews
          ? 'wr-editor-workspace wr-editor-workspace-with-views'
          : 'wr-editor-workspace'
      }
    >
      {hasDocumentViews && (
        <div className="wr-view-tabs" role="tablist" aria-label="Document view">
          {(
            [
              { view: 'design', label: 'Design', icon: 'layout' },
              { view: 'code', label: 'Code', icon: 'code' },
            ] as const
          ).map(({ view, label, icon }) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-label={label}
              title={label + ' (F12)'}
              aria-keyshortcuts="F12"
              aria-selected={activeView === view}
              onClick={() => onSelectView(view)}
              disabled={view === 'design' && activeDocument?.kind === 'code'}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      {activeDocumentId ? (
        stylesDocumentActive ? (
          <div className="wr-editor-content wr-editor-content-full">{children}</div>
        ) : (
          <div className="wr-editor-content">{children}</div>
        )
      ) : (
        <div className="wr-welcome">
          <img className="wr-welcome-mark" src={applicationIconUrl} alt="" aria-hidden="true" />
          <h1>WebRAD</h1>
          <p>
            Build browser applications with pages, components, properties, events, and TypeScript.
          </p>
          <div className="wr-welcome-shortcuts">
            <span>New Project</span>
            <kbd>Ctrl N</kbd>
            <span>Open Project</span>
            <kbd>Ctrl O</kbd>
          </div>
        </div>
      )}
    </section>
  );
}
