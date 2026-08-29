import type { ReactElement, ReactNode } from 'react';
import { applicationIconUrl } from '../application-assets';
import { Icon } from './Icon';

export type ViewMode = 'design' | 'code' | 'preview';

export interface DocumentTab {
  id: string;
  label: string;
  dirty: boolean;
  kind: 'page' | 'reusable' | 'code' | 'styles';
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
  const activeDocument = documents.find((document) => document.id === activeDocumentId);
  const stylesDocumentActive = activeDocument?.kind === 'styles';

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
              {document.kind === 'styles' ? (
                <Icon name="palette" className="wr-document-style-icon" />
              ) : document.kind === 'page' ? (
                <Icon name="page" className="wr-document-page-icon" />
              ) : document.kind === 'reusable' ? (
                <span aria-hidden="true">R</span>
              ) : (
                <span aria-hidden="true">TS</span>
              )}
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
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
      {activeDocumentId ? (
        stylesDocumentActive ? (
          <div className="wr-editor-content wr-editor-content-full">{children}</div>
        ) : (
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
