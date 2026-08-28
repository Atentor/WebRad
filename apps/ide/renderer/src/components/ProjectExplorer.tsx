import type { WebRadProject } from '@webrad/project-model';
import { useState, type DragEvent, type ReactElement } from 'react';
import { Icon } from './Icon';
import { Panel } from './Panel';
import { WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE } from './ToolPalette';

interface ProjectExplorerProps {
  project: WebRadProject | null;
  activePageId: string | null;
  onOpenPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, name: string) => void;
  activeReusableElementId?: string | null;
  onOpenReusableElement?: (reusableElementId: string) => void;
  onAddReusableElement?: () => void;
  onDeleteReusableElement?: (reusableElementId: string) => void;
  onRenameReusableElement?: (reusableElementId: string, name: string) => void;
}

function FolderGlyph({
  open = true,
  label,
  onToggle,
}: {
  open?: boolean;
  label?: string;
  onToggle?: () => void;
}): ReactElement {
  const icon = <Icon name={open ? 'chevron-down' : 'chevron-right'} className="wr-tree-glyph" />;
  if (!onToggle || !label) return icon;
  return (
    <button
      type="button"
      className="wr-tree-toggle"
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      {icon}
    </button>
  );
}

export function ProjectExplorer({
  project,
  activePageId,
  onOpenPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  activeReusableElementId = null,
  onOpenReusableElement,
  onAddReusableElement,
  onDeleteReusableElement,
  onRenameReusableElement,
}: ProjectExplorerProps): ReactElement {
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [reusableElementsExpanded, setReusableElementsExpanded] = useState(true);

  const beginRename = (pageId: string, name: string): void => {
    setEditingPageId(pageId);
    setDraftName(name);
  };

  const finishRename = (): void => {
    if (editingPageId && draftName.trim()) {
      if (project?.pages.some((page) => page.id === editingPageId)) {
        onRenamePage(editingPageId, draftName.trim());
      } else {
        onRenameReusableElement?.(editingPageId, draftName.trim());
      }
    }
    setEditingPageId(null);
  };

  return (
    <Panel
      title="Project Explorer"
      actions={
        <>
          <button type="button" title="Add page" aria-label="Add page" onClick={onAddPage}>
            <Icon name="add" />
          </button>
          <button
            type="button"
            title="Add reusable component"
            aria-label="Add reusable component"
            onClick={onAddReusableElement}
          >
            <span aria-hidden="true">R</span>
          </button>
        </>
      }
    >
      {!project ? (
        <div className="wr-empty-state">Create or open a project to begin.</div>
      ) : (
        <div className="wr-project-tree" role="tree" aria-label={`${project.name} project`}>
          <div role="group" className="wr-tree-group">
            <div
              className="wr-tree-row wr-folder-row"
              role="treeitem"
              aria-expanded={pagesExpanded}
            >
              <FolderGlyph
                open={pagesExpanded}
                label="Pages"
                onToggle={() => setPagesExpanded((current) => !current)}
              />
              <span>Pages</span>
              <small>{project.pages.length}</small>
            </div>
            {pagesExpanded && (
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
            )}
            <div
              className="wr-tree-row wr-folder-row"
              role="treeitem"
              aria-expanded={reusableElementsExpanded}
            >
              <FolderGlyph
                open={reusableElementsExpanded}
                label="Reusable Components"
                onToggle={() => setReusableElementsExpanded((current) => !current)}
              />
              <span>Reusable Components</span>
              <small>{project.reusableElements.length}</small>
            </div>
            {reusableElementsExpanded && (
              <div role="group" className="wr-tree-group nested">
                {project.reusableElements.map((reusableElement) => (
                  <div
                    key={reusableElement.id}
                    className={`wr-tree-row wr-page-row ${
                      activeReusableElementId === reusableElement.id ? 'active' : ''
                    }`}
                    role="treeitem"
                    aria-selected={activeReusableElementId === reusableElement.id}
                    draggable
                    onDragStart={(event: DragEvent<HTMLDivElement>) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData(
                        WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE,
                        reusableElement.id,
                      );
                      event.dataTransfer.setData('text/plain', reusableElement.name);
                    }}
                    onDoubleClick={() => onOpenReusableElement?.(reusableElement.id)}
                    onClick={() => onOpenReusableElement?.(reusableElement.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onOpenReusableElement?.(reusableElement.id);
                      if (event.key === 'F2') beginRename(reusableElement.id, reusableElement.name);
                      if (event.key === 'Delete') onDeleteReusableElement?.(reusableElement.id);
                    }}
                    tabIndex={0}
                    title="Drag onto a page to insert an instance"
                  >
                    <span className="wr-page-icon" aria-hidden="true">
                      R
                    </span>
                    {editingPageId === reusableElement.id ? (
                      <input
                        autoFocus
                        aria-label="Reusable component name"
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
                      <span>{reusableElement.name}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
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
