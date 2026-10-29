import type { ReactElement, ReactNode } from 'react';
import { applicationIconUrl } from '../application-assets';
import { Icon } from './Icon';

export type ViewMode = 'design' | 'code';

export interface DocumentTab {
  id: string;
  label: string;
  dirty: boolean;
  kind: 'page' | 'reusable' | 'menu' | 'code' | 'asset' | 'styles' | 'restgo';
}

interface EditorWorkspaceProps {
  documents: readonly DocumentTab[];
  activeDocumentId: string | null;
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  children: ReactNode;
}

export function EditorWorkspace({
  documents,
  activeDocumentId,
  activeView,
  onSelectView,
  onNewProject,
  onOpenProject,
  children,
}: EditorWorkspaceProps): ReactElement {
  const activeDocument = documents.find((document) => document.id === activeDocumentId);
  const stylesDocumentActive =
    activeDocument?.kind === 'styles' ||
    activeDocument?.kind === 'restgo' ||
    activeDocument?.kind === 'asset';
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
              tabIndex={activeView === view ? 0 : -1}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const view =
                  activeDocument?.kind === 'code'
                    ? 'code'
                    : event.key === 'Home'
                      ? 'design'
                      : event.key === 'End'
                        ? 'code'
                        : activeView === 'design'
                          ? 'code'
                          : 'design';
                onSelectView(view);
                event.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(
                    `[aria-label="${view === 'design' ? 'Design' : 'Code'}"]`,
                  )
                  ?.focus();
              }}
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
            <button
              type="button"
              className="wr-welcome-action"
              aria-label="New Project"
              onClick={onNewProject}
            >
              <Icon name="add" />
              New Project
            </button>
            <kbd>Ctrl N</kbd>
            <button
              type="button"
              className="wr-welcome-action"
              aria-label="Open Project"
              onClick={onOpenProject}
            >
              <Icon name="folder-open" />
              Open Project
            </button>
            <kbd>Ctrl O</kbd>
          </div>
        </div>
      )}
    </section>
  );
}
