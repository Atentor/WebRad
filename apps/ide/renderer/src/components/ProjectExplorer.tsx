import type { WebRadProject } from '@webrad/project-model';
import { useState, type ReactElement } from 'react';
import { Icon } from './Icon';
import { Panel } from './Panel';

interface ProjectExplorerProps {
  project: WebRadProject | null;
  activePageId: string | null;
  onOpenPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
}

function FolderGlyph({ open = true }: { open?: boolean }): ReactElement {
  return <Icon name={open ? 'chevron-down' : 'chevron-right'} className="wr-tree-glyph" />;
}

export function ProjectExplorer({
  project,
  activePageId,
  onOpenPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
}: ProjectExplorerProps): ReactElement {
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const beginRename = (pageId: string, name: string): void => {
    setEditingPageId(pageId);
    setDraftName(name);
  };

  const finishRename = (): void => {
    if (editingPageId && draftName.trim()) onRenamePage(editingPageId, draftName.trim());
    setEditingPageId(null);
  };

  return (
    <Panel
      title="Project Explorer"
      actions={
        <button type="button" title="Add page" aria-label="Add page" onClick={onAddPage}>
          <Icon name="add" />
        </button>
      }
    >
      {!project ? (
        <div className="wr-empty-state">Create or open a project to begin.</div>
      ) : (
        <div className="wr-project-tree" role="tree" aria-label={`${project.name} project`}>
          <div role="group" className="wr-tree-group">
            <div className="wr-tree-row wr-folder-row" role="treeitem" aria-expanded="true">
              <FolderGlyph />
              <span>Pages</span>
              <small>{project.pages.length}</small>
            </div>
            <div role="group" className="wr-tree-group nested">
              {project.pages.map((page) => (
                <div
                  key={page.id}
                  className={`wr-tree-row wr-page-row ${activePageId === page.id ? 'active' : ''}`}
                  role="treeitem"
                  aria-selected={activePageId === page.id}
                  onDoubleClick={() => onOpenPage(page.id)}
                  onClick={() => onOpenPage(page.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onOpenPage(page.id);
                    if (event.key === 'F2') beginRename(page.id, page.name);
                    if (event.key === 'Delete') onDeletePage(page.id);
                  }}
                  tabIndex={0}
                >
                  <Icon name="page" className="wr-page-icon" />
                  {editingPageId === page.id ? (
                    <input
                      autoFocus
                      aria-label="Page name"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter') finishRename();
                        if (event.key === 'Escape') setEditingPageId(null);
                      }}
                    />
                  ) : (
                    <span>{page.name}</span>
                  )}
                  {project.entryPage === page.id && <small title="Entry page">entry</small>}
                </div>
              ))}
            </div>
            {['Models', 'Units', 'Assets'].map((folder) => (
              <div
                className="wr-tree-row wr-folder-row"
                role="treeitem"
                aria-expanded="false"
                key={folder}
              >
                <FolderGlyph open={false} />
                <span>{folder}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
