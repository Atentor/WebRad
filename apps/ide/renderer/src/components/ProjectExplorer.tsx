import { ProjectResourceFolders } from './ProjectResourceFolders';
import { projectResourceGroups } from './project-explorer-resources';
import type { WebRadProject } from '@webrad/project-model';
import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { Icon } from './Icon';
import { Panel } from './Panel';
import { WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE } from './ToolPalette';
import { hideNativeDesignerDragImage, setDesignerDragPayload } from './designer-drag-data';
import { ProjectExplorerFolder } from './project-explorer-tree';
import { useProjectExplorerNavigation } from './use-project-explorer-navigation';
import './project-explorer.css';

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
  onRenamePage: (pageId: string, name: string) => string | void;
  activeReusableElementId?: string | null;
  onOpenReusableElement?: (reusableElementId: string) => void;
  onAddReusableElement?: () => void;
  onDeleteReusableElement?: (reusableElementId: string) => void;
  onRenameReusableElement?: (reusableElementId: string, name: string) => string | void;
  activeMenuId?: string | null;
  onOpenMenu?: (id: string) => void;
  onAddMenu?: () => void;
  onDeleteMenu?: (id: string) => void;
  onRenameMenu?: (id: string, name: string) => string | void;
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
  activeMenuId,
  onOpenMenu,
  onAddMenu,
  onDeleteMenu,
  onRenameMenu,
}: ProjectExplorerProps): ReactElement {
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState('folder:Pages');
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set());
  const [searchCollapsedFolders, setSearchCollapsedFolders] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [searchVisible, setSearchVisible] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const navigateTree = useProjectExplorerNavigation();
  const query = search.trim().toLocaleLowerCase();
  const effectiveCollapsedFolders = query ? searchCollapsedFolders : collapsedFolders;
  const matches = (name: string): boolean => name.toLocaleLowerCase().includes(query);
  const pages = project?.pages.filter((page) => matches(page.name)) ?? [];
  const menus = project?.menus?.filter((menu) => matches(menu.name)) ?? [];
  const menusExpanded = !effectiveCollapsedFolders.has('Menus');
  const reusableElements =
    project?.reusableElements.filter((element) => matches(element.name)) ?? [];
  const pagesExpanded = !effectiveCollapsedFolders.has('Pages');
  const reusableElementsExpanded = !effectiveCollapsedFolders.has('Reusable Components');
  const resourceGroups = project ? projectResourceGroups(project) : [];
  const groups = [
    { label: 'Pages', entries: pages.map((entry) => ({ id: entry.id, label: entry.name })) },
    {
      label: 'Reusable Components',
      entries: reusableElements.map((entry) => ({ id: entry.id, label: entry.name })),
    },
    { label: 'Menus', entries: menus.map((entry) => ({ id: entry.id, label: entry.name })) },
    ...resourceGroups.map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => matches(entry.label)),
    })),
  ];
  const resultCount = groups.reduce((count, group) => count + group.entries.length, 0);
  const visibleKeys = groups.flatMap(({ label, entries }) => {
    if (query && entries.length === 0) return [];
    return [
      `folder:${label}`,
      ...(!effectiveCollapsedFolders.has(label) ? entries.map((entry) => entry.id) : []),
    ];
  });
  const rovingKey = visibleKeys.includes(focusedKey) ? focusedKey : (visibleKeys[0] ?? '');
  const toggleFolder = (label: string): void => {
    const update = query ? setSearchCollapsedFolders : setCollapsedFolders;
    update((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };
  const closeSearch = (): void => {
    setSearch('');
    setSearchVisible(false);
    searchButton.current?.focus();
  };
  const selectedPage = project?.pages.find((page) => page.id === activePageId);
  const selectedMenu = project?.menus?.find((menu) => menu.id === activeMenuId);
  const selectedReusable = project?.reusableElements.find(
    (element) => element.id === activeReusableElementId,
  );
  const selectedSource = project?.sourceFiles?.find((file) => file.id === activeResourceId);
  const selectedAsset = project?.assets?.find((asset) => asset.id === activeResourceId);
  const selectedResource = selectedSource ?? selectedAsset;
  const selectedDocument = selectedMenu ?? selectedReusable ?? selectedPage;
  const canRename =
    selectedResource === undefined &&
    selectedDocument !== undefined &&
    selectedDocument.id !== project?.entryPage &&
    !(selectedPage?.name === '404') &&
    (selectedMenu
      ? onRenameMenu !== undefined
      : selectedReusable
        ? onRenameReusableElement !== undefined
        : true);
  const selectedName = selectedResource
    ? (selectedSource?.name ?? selectedAsset?.fileName)
    : (selectedMenu?.name ?? selectedReusable?.name ?? selectedPage?.name);
  const canDelete = selectedResource
    ? onDeleteResource !== undefined
    : selectedMenu
      ? onDeleteMenu !== undefined
      : selectedReusable
        ? onDeleteReusableElement !== undefined
        : selectedPage !== undefined &&
          selectedPage.id !== project?.entryPage &&
          selectedPage.name !== '404' &&
          (project?.pages.length ?? 0) > 1;
  const deleteSelected = (): void => {
    if (!canDelete) return;
    if (selectedResource) onDeleteResource?.(selectedResource.id);
    else if (selectedMenu) onDeleteMenu?.(selectedMenu.id);
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
    setRenameError(null);
  };

  const finishRename = (): void => {
    if (!editingPageId) return;
    if (!draftName.trim()) {
      setRenameError('Enter a name.');
      renameInput.current?.focus();
      return;
    }
    try {
      let error: string | void;
      if (project?.pages.some((page) => page.id === editingPageId)) {
        error = onRenamePage(editingPageId, draftName.trim());
      } else if (project?.menus?.some((menu) => menu.id === editingPageId)) {
        error = onRenameMenu?.(editingPageId, draftName.trim());
      } else {
        error = onRenameReusableElement?.(editingPageId, draftName.trim());
      }
      if (error) {
        setRenameError(error);
        renameInput.current?.focus();
        return;
      }
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Could not rename this item.');
      renameInput.current?.focus();
      return;
    }
    const row = renameInput.current?.closest<HTMLElement>('[data-project-resource-id]');
    setEditingPageId(null);
    setRenameError(null);
    row?.focus();
  };

  const renderName = (id: string, name: string, label: string): ReactElement =>
    editingPageId === id ? (
      <span className="wr-explorer-rename" onClick={(event) => event.stopPropagation()}>
        <span className="wr-explorer-rename-fields">
          <input
            ref={renameInput}
            autoFocus
            aria-label={label}
            value={draftName}
            aria-invalid={renameError !== null}
            aria-describedby={renameError ? 'wr-project-rename-error' : undefined}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setDraftName(event.target.value);
              setRenameError(null);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                event.preventDefault();
                finishRename();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                const row = event.currentTarget.closest<HTMLElement>('[data-project-resource-id]');
                setEditingPageId(null);
                setRenameError(null);
                row?.focus();
              }
            }}
          />
          <button
            type="button"
            title="Apply name (Enter)"
            aria-label="Apply project item name"
            onClick={finishRename}
          >
            <Icon name="check" />
          </button>
          <button
            type="button"
            title="Cancel rename (Escape)"
            aria-label="Cancel project item rename"
            onClick={() => {
              const row = renameInput.current?.closest<HTMLElement>('[data-project-resource-id]');
              setEditingPageId(null);
              setRenameError(null);
              row?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </span>
        {renameError && (
          <span id="wr-project-rename-error" role="alert" className="wr-explorer-rename-error">
            {renameError}
          </span>
        )}
      </span>
    ) : (
      <span className="wr-explorer-name">{name}</span>
    );

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
                new Set(['Pages', 'Menus', 'Reusable Components', 'Models', 'Units', 'Assets']),
              );
            }}
          >
            <Icon name="fold-vertical" />
          </button>
          <button
            type="button"
            title="Search project items"
            ref={searchButton}
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
            title="Add menu"
            aria-label="Add menu"
            onClick={onAddMenu}
            disabled={!project || !onAddMenu}
          >
            <Icon name="menu" />
          </button>
          <button
            type="button"
            title={
              canRename && selectedName
                ? `Rename ${selectedName} (F2)`
                : 'Select a page, reusable component or menu to rename'
            }
            aria-label="Rename selected project item"
            disabled={!canRename}
            onClick={() => {
              if (selectedDocument) beginRename(selectedDocument.id, selectedDocument.name);
            }}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            title={selectedName ? `Duplicate ${selectedName}` : 'Select an item to duplicate'}
            aria-label="Duplicate selected project item"
            disabled={!onDuplicateItem || !selectedName}
            onClick={() => {
              const selected = selectedResource ?? selectedMenu ?? selectedReusable ?? selectedPage;
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
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchCollapsedFolders(new Set());
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                closeSearch();
              }
            }}
          />
          <button
            type="button"
            className="wr-palette-clear"
            title="Close search"
            aria-label="Close project search"
            onClick={closeSearch}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {query && (
        <div className="wr-project-search-summary">
          <span role="status">
            {resultCount} matching {resultCount === 1 ? 'item' : 'items'}
          </span>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              searchInput.current?.focus();
            }}
          >
            Clear filter
          </button>
        </div>
      )}
      {!project ? (
        <div className="wr-empty-state">Create or open a project to begin.</div>
      ) : (
        <div
          className="wr-project-tree"
          role="tree"
          aria-label={`${project.name} project`}
          onKeyDown={navigateTree}
          onFocusCapture={(event) => {
            if (event.target instanceof HTMLElement) {
              const key =
                event.target.closest<HTMLElement>('[data-explorer-key]')?.dataset.explorerKey;
              if (key) setFocusedKey(key);
            }
          }}
        >
          {query && resultCount === 0 && (
            <div className="wr-empty-state compact" data-explorer-no-results>
              No project items match “{search.trim()}”. Clear the filter to see all items.
            </div>
          )}
          {(!query || pages.length > 0) && (
            <ProjectExplorerFolder
              label="Pages"
              count={pages.length}
              expanded={pagesExpanded}
              tabIndex={rovingKey === 'folder:Pages' ? 0 : -1}
              onToggle={() => toggleFolder('Pages')}
            >
              {pages.map((page) => (
                <div
                  key={page.id}
                  data-project-resource-id={page.id}
                  data-explorer-key={page.id}
                  data-explorer-label={page.name}
                  className={`wr-tree-row wr-page-row ${activePageId === page.id ? 'active' : ''}`}
                  role="treeitem"
                  aria-level={2}
                  aria-selected={activePageId === page.id}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    onOpenPage(page.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter') onOpenPage(page.id);
                    if (event.key === 'F2') beginRename(page.id, page.name);
                    if (
                      event.key === 'Delete' &&
                      page.id !== project.entryPage &&
                      page.name !== '404'
                    )
                      onDeletePage(page.id);
                  }}
                  tabIndex={rovingKey === page.id ? 0 : -1}
                >
                  <Icon name="page" className="wr-page-icon" />
                  {renderName(page.id, page.name, 'Page name')}
                  {project.entryPage === page.id && <small title="Entry page">entry</small>}
                </div>
              ))}
            </ProjectExplorerFolder>
          )}
          {(!query || reusableElements.length > 0) && (
            <ProjectExplorerFolder
              label="Reusable Components"
              count={reusableElements.length}
              expanded={reusableElementsExpanded}
              tabIndex={rovingKey === 'folder:Reusable Components' ? 0 : -1}
              onToggle={() => toggleFolder('Reusable Components')}
            >
              {reusableElements.map((reusableElement) => (
                <div
                  key={reusableElement.id}
                  data-project-resource-id={reusableElement.id}
                  data-explorer-key={reusableElement.id}
                  data-explorer-label={reusableElement.name}
                  className={`wr-tree-row wr-page-row ${
                    activeReusableElementId === reusableElement.id ? 'active' : ''
                  }`}
                  role="treeitem"
                  aria-level={2}
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
                  onClick={(event) => {
                    event.currentTarget.focus();
                    onOpenReusableElement?.(reusableElement.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter') onOpenReusableElement?.(reusableElement.id);
                    if (event.key === 'F2') beginRename(reusableElement.id, reusableElement.name);
                    if (event.key === 'Delete') onDeleteReusableElement?.(reusableElement.id);
                  }}
                  tabIndex={rovingKey === reusableElement.id ? 0 : -1}
                  title="Drag onto a page to insert an instance"
                >
                  <Icon name="component" className="wr-page-icon" />
                  {renderName(reusableElement.id, reusableElement.name, 'Reusable component name')}
                </div>
              ))}
            </ProjectExplorerFolder>
          )}
          {(!query || menus.length > 0) && (
            <ProjectExplorerFolder
              label="Menus"
              count={menus.length}
              expanded={menusExpanded}
              tabIndex={rovingKey === 'folder:Menus' ? 0 : -1}
              onToggle={() => toggleFolder('Menus')}
            >
              {menus.map((menu) => (
                <div
                  key={menu.id}
                  data-project-resource-id={menu.id}
                  className={`wr-tree-row wr-page-row ${activeMenuId === menu.id ? 'active' : ''}`}
                  data-explorer-key={menu.id}
                  data-explorer-label={menu.name}
                  role="treeitem"
                  aria-level={2}
                  aria-selected={activeMenuId === menu.id}
                  tabIndex={rovingKey === menu.id ? 0 : -1}
                  onClick={(event) => {
                    event.currentTarget.focus();
                    onOpenMenu?.(menu.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter') onOpenMenu?.(menu.id);
                    if (event.key === 'F2') beginRename(menu.id, menu.name);
                    if (event.key === 'Delete') onDeleteMenu?.(menu.id);
                  }}
                >
                  <Icon name="menu" className="wr-page-icon" />
                  {renderName(menu.id, menu.name, 'Menu name')}
                </div>
              ))}
            </ProjectExplorerFolder>
          )}
          <ProjectResourceFolders
            project={project}
            query={query}
            collapsed={effectiveCollapsedFolders}
            onToggle={toggleFolder}
            activeId={activeResourceId}
            onOpen={onOpenResource}
            onDelete={onDeleteResource}
            focusedKey={rovingKey}
          />
        </div>
      )}
    </Panel>
  );
}
