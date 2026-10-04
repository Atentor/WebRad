import type { ReactElement, ReactNode } from 'react';
import { applicationIconUrl } from '../application-assets';

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

  children: ReactNode;
}

export function EditorWorkspace({
  documents,
  activeDocumentId,
  children,
}: EditorWorkspaceProps): ReactElement {
  const activeDocument = documents.find((document) => document.id === activeDocumentId);
  const stylesDocumentActive = activeDocument?.kind === 'styles';

  return (
    <section className="wr-editor-workspace">
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
