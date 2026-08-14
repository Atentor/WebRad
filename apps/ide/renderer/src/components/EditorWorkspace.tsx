import type { ReactElement, ReactNode } from 'react';
import { applicationIconUrl } from '../application-assets';

export type ViewMode = 'design' | 'code' | 'preview';

export interface DocumentTab {
  id: string;
  label: string;
  dirty: boolean;
  kind: 'form' | 'code';
}

interface EditorWorkspaceProps {
  documents: readonly DocumentTab[];
  activeDocumentId: string | null;
  activeView: ViewMode;
  onSelectDocument: (id: string) => void;
  onCloseDocument: (id: string) => void;
  onSelectView: (view: ViewMode) => void;
  children: ReactNode;
}

export function EditorWorkspace({
  documents,
  activeDocumentId,
  activeView,
  onSelectDocument,
  onCloseDocument,
  onSelectView,
  children,
}: EditorWorkspaceProps): ReactElement {
  return (
    <section className="wr-editor-workspace">
      <div className="wr-document-tabs" role="tablist" aria-label="Open documents">
        {documents.map((document) => (
          <div
            key={document.id}
            className={`wr-document-tab ${activeDocumentId === document.id ? 'active' : ''}`}
            role="tab"
            aria-selected={activeDocumentId === document.id}
          >
            <button type="button" onClick={() => onSelectDocument(document.id)}>
              <span aria-hidden="true">{document.kind === 'form' ? '▱' : 'TS'}</span>
              {document.label}
              {document.dirty && <em>*</em>}
            </button>
            <button
              className="wr-document-close"
              type="button"
              title={`Close ${document.label}`}
              aria-label={`Close ${document.label}`}
              onClick={() => onCloseDocument(document.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {activeDocumentId ? (
        <>
          <div className="wr-view-tabs" role="tablist" aria-label="Document view">
            {(['design', 'code', 'preview'] as const).map((view) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={activeView === view}
                className={activeView === view ? 'active' : ''}
                onClick={() => onSelectView(view)}
              >
                {view[0]?.toUpperCase()}
                {view.slice(1)}
              </button>
            ))}
          </div>
          <div className="wr-editor-content">{children}</div>
        </>
      ) : (
        <div className="wr-welcome">
          <img className="wr-welcome-mark" src={applicationIconUrl} alt="" aria-hidden="true" />
          <h1>WebRAD</h1>
          <p>
            Build browser applications with forms, components, properties, events, and TypeScript.
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
