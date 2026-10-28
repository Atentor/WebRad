import type { ReactElement } from 'react';
import type { DocumentTab } from './EditorWorkspace';
import { Icon } from './Icon';

export interface DocumentTabsProps {
  documents: readonly DocumentTab[];
  activeDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onCloseDocument: (id: string) => void;
}

export function DocumentTabs(props: DocumentTabsProps): ReactElement {
  return (
    <div className="wr-document-tabs" role="tablist" aria-label="Open documents">
      {props.documents.map((document) => (
        <div
          key={document.id}
          className={`wr-document-tab ${props.activeDocumentId === document.id ? 'active' : ''}`}
          role="tab"
          aria-selected={props.activeDocumentId === document.id}
        >
          <button type="button" onClick={() => props.onSelectDocument(document.id)}>
            <Icon
              name={
                document.kind === 'code'
                  ? 'file'
                  : document.kind === 'menu' ? 'menu'
                  : document.kind === 'restgo'
                    ? 'database'
                    : document.kind === 'styles'
                      ? 'palette'
                      : document.kind === 'reusable'
                        ? 'layers'
                        : 'home'
              }
            />
            <span>{document.label}</span>
            {document.dirty && <em aria-label="Unsaved changes">*</em>}
          </button>
          <button
            className="wr-document-close"
            type="button"
            title={`Close ${document.label}`}
            aria-label={`Close ${document.label}`}
            onClick={() => props.onCloseDocument(document.id)}
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}
