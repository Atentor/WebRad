import { ProjectResourceFolders } from './ProjectResourceFolders';
import type { WebRadProject } from '@webrad/project-model';
import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { Icon } from './Icon';
import { Panel } from './Panel';
import { WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE } from './ToolPalette';
import { hideNativeDesignerDragImage, setDesignerDragPayload } from './designer-drag-data';

interface ProjectExplorerProps {
  project: WebRadProject | null;
  activeResourceId?: string | null;
  onOpenResource?: (id: string) => void;
  onDeleteResource?: (id: string) => void;
  onDuplicateItem?: (id: string) => void;
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
  activeResourceId,
  onOpenResource,
  onDeleteResource,
  onDuplicateItem,
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
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set());
  const [searchVisible, setSearchVisible] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const query = search.trim().toLocaleLowerCase();
  const matches = (name: string): boolean => name.toLocaleLowerCase().includes(query);
  const pages = project?.pages.filter((page) => matches(page.name)) ?? [];
  const reusableElements =
    project?.reusableElements.filter((element) => matches(element.name)) ?? [];
  const pagesExpanded = query.length > 0 || !collapsedFolders.has('Pages');
  const reusableElementsExpanded = query.length > 0 || !collapsedFolders.has('Reusable Components');
  const toggleFolder = (label: string): void => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };
  const selectedPage = project?.pages.find((page) => page.id === activePageId);
  const selectedReusable = project?.reusableElements.find(
    (element) => element.id === activeReusableElementId,
  );
  const selectedSource = project?.sourceFiles?.find((file) => file.id === activeResourceId);
  const selectedAsset = project?.assets?.find((asset) => asset.id === activeResourceId);
  const selectedResource = selectedSource ?? selectedAsset;
  const selectedName = selectedResource
    ? (selectedSource?.name ?? selectedAsset?.fileName)
    : (selectedReusable?.name ?? selectedPage?.name);
  const canDelete = selectedResource
    ? onDeleteResource !== undefined
    : selectedReusable
      ? onDeleteReusableElement !== undefined
      : selectedPage !== undefined &&
        selectedPage.id !== project?.entryPage &&
        selectedPage.name !== '404' &&
        (project?.pages.length ?? 0) > 1;
  const deleteSelected = (): void => {
    if (!canDelete) return;
    if (selectedResource) onDeleteResource?.(selectedResource.id);
    else if (selectedReusable) onDeleteReusableElement?.(selectedReusable.id);
    else if (selectedPage) onDeletePage(selectedPage.id);
  };

  const beginRename = (pageId: string, name: string): void => {
    if (
      pageId === project?.entryPage ||
      project?.pages.some((page) => page.id === pageId && page.name === '404')
    )
      return;
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
      className="wr-project-explorer"
      actions={
        <>
          <button
            type="button"
            title="Collapse all"
            aria-label="Collapse all project folders"
            disabled={!project}
            onClick={() => {
              setSearch('');
              setCollapsedFolders(
                new Set(['Pages', 'Reusable Components', 'Models', 'Units', 'Assets']),
              );
            }}
          >
            <Icon name="fold-vertical" />
          </button>
          <button
            type="button"
            title="Search project items"
            aria-label="Search project items"
            aria-expanded={searchVisible}
            aria-pressed={searchVisible}
            aria-controls="wr-project-search"
            disabled={!project}
            onClick={() => {
              setSearchVisible(true);
              searchInput.current?.focus();
            }}
          >
            <Icon name="search" />
          </button>
          <button type="button" title="Add page" aria-label="Add page" onClick={onAddPage}>
            <Icon name="add" />
          </button>
          <button
            type="button"
            title="Add reusable component"
            aria-label="Add reusable component"
            onClick={onAddReusableElement}
          >
            <Icon name="component" />
          </button>
          <button
            type="button"
            title={selectedName ? `Duplicate ${selectedName}` : 'Select an item to duplicate'}
            aria-label="Duplicate selected project item"
            disabled={!onDuplicateItem || !selectedName}
            onClick={() => {
              const selected = selectedResource ?? selectedReusable ?? selectedPage;
              if (selected) onDuplicateItem?.(selected.id);
            }}
          >
            <Icon name="file-copy" />
          </button>
          <button
            type="button"
            title={
              selectedPage && !selectedResource && !selectedReusable && !canDelete
                ? 'Mandatory pages cannot be deleted'
                : selectedName
                  ? `Delete ${selectedName}`
                  : 'Select an item to delete'
            }
            aria-label="Delete selected project item"
            disabled={!canDelete}
            onClick={deleteSelected}
          >
            <Icon name="delete" />
          </button>
        </>
      }
    >
      {searchVisible && project && (
        <div className="wr-project-search wr-palette-search" id="wr-project-search">
          <span className="wr-palette-search-icon" aria-hidden="true">
            <Icon name="search" />
          </span>
          <input
            ref={searchInput}
            autoFocus
            type="search"
            aria-label="Filter project items"
            placeholder="Search project items..."
            spellCheck={false}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearch('');
                setSearchVisible(false);
              }
            }}
          />
          <button
            type="button"
            className="wr-palette-clear"
            title="Close search"
            aria-label="Close project search"
            onClick={() => {
              setSearch('');
              setSearchVisible(false);
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
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
                onToggle={() => toggleFolder('Pages')}
              />
              <span>Pages</span>
              <small>{project.pages.length}</small>
            </div>
            {pagesExpanded && (
              <div role="group" className="wr-tree-group nested">
                {pages.map((page) => (
                  <div
                    key={page.id}
                    data-project-resource-id={page.id}
                    className={`wr-tree-row wr-page-row ${activePageId === page.id ? 'active' : ''}`}
                    role="treeitem"
                    aria-selected={activePageId === page.id}
                    onDoubleClick={() => onOpenPage(page.id)}
                    onClick={() => onOpenPage(page.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onOpenPage(page.id);
                      if (event.key === 'F2') beginRename(page.id, page.name);
                      if (
                        event.key === 'Delete' &&
                        page.id !== project.entryPage &&
                        page.name !== '404'
                      )
                        onDeletePage(page.id);
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
                      <span className="wr-explorer-name">{page.name}</span>
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
                onToggle={() => toggleFolder('Reusable Components')}
              />
              <span>Reusable Components</span>
              <small>{project.reusableElements.length}</small>
            </div>
            {reusableElementsExpanded && (
              <div role="group" className="wr-tree-group nested">
                {reusableElements.map((reusableElement) => (
                  <div
                    key={reusableElement.id}
                    data-project-resource-id={reusableElement.id}
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
                      setDesignerDragPayload({ kind: 'reusable', id: reusableElement.id });
                      hideNativeDesignerDragImage(event.dataTransfer);
                    }}
                    onDragEnd={() => setDesignerDragPayload(null)}
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
                    <Icon name="component" className="wr-page-icon" />
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
                      <span className="wr-explorer-name">{reusableElement.name}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <ProjectResourceFolders
              project={project}
              query={query}
              collapsed={collapsedFolders}
              onToggle={toggleFolder}
              activeId={activeResourceId}
              onOpen={onOpenResource}
              onDelete={onDeleteResource}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
