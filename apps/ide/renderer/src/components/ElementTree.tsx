import {
  defaultComponentRegistry,
  resolveComponentDesignerPresentation,
  type ComponentRegistry,
} from '@webrad/component-registry';
import type { ComponentNode, PageModel } from '@webrad/project-model';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { ComponentIcon } from './ComponentIcon';
import { Icon } from './Icon';

export type ElementTreeEditCommand =
  'edit.delete' | 'edit.copy' | 'edit.cut' | 'edit.paste' | 'edit.undo' | 'edit.redo';

export interface ElementTreeProps {
  readonly page: PageModel | null;
  readonly selectedIds: readonly string[];
  readonly onSelect: (ids: readonly string[], primaryId?: string) => void;
  readonly registry?: ComponentRegistry;
  readonly onEditCommand?: (command: ElementTreeEditCommand) => void;
}

interface ElementRow {
  readonly node: ComponentNode;
  readonly depth: number;
  readonly ancestors: readonly string[];
  readonly hasChildren: boolean;
}

/** Project child order, rather than position or name, determines the hierarchy. */
function elementRows(page: PageModel | null): readonly ElementRow[] {
  if (page === null) return [];
  const nodes = new Map(page.components.map((node) => [node.id, node]));
  const rows: ElementRow[] = [];
  const visited = new Set<string>();
  const visit = (id: string, ancestors: readonly string[]): void => {
    const node = nodes.get(id);
    if (node === undefined || visited.has(id)) return;
    visited.add(id);
    rows.push({
      node,
      depth: ancestors.length,
      ancestors,
      hasChildren: node.children.some((child) => nodes.has(child)),
    });
    for (const child of node.children) visit(child, [...ancestors, id]);
  };
  visit(page.rootComponentId, []);
  return rows;
}

interface SelectionModifiers {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export function ElementTree({
  page,
  selectedIds,
  onSelect,
  registry = defaultComponentRegistry,
  onEditCommand,
}: ElementTreeProps): ReactElement {
  const [search, setSearch] = useState('');
  // A collapse applies to the selection at that moment. A later canvas selection
  // reveals its ancestors without an effect that writes model-derived state.
  const [collapsed, setCollapsed] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const anchorId = useRef<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const selectionKey = JSON.stringify(selectedIds);
  const query = search.trim().toLocaleLowerCase();
  const rows = useMemo(() => elementRows(page), [page]);
  const selectedAncestors = new Set(
    rows.filter((row) => selectedIds.includes(row.node.id)).flatMap((row) => row.ancestors),
  );
  const isExpanded = (id: string): boolean =>
    query.length > 0 ||
    !collapsed.has(id) ||
    (selectedAncestors.has(id) && collapsed.get(id) !== selectionKey);

  const matches = new Set<string>();
  for (const row of rows) {
    const definition = registry.get(row.node.type);
    if (
      query.length === 0 ||
      [row.node.name, row.node.type, definition?.displayName ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(query),
      )
    ) {
      matches.add(row.node.id);
      for (const ancestor of row.ancestors) matches.add(ancestor);
    }
  }
  const visibleRows = rows.filter(
    (row) => matches.has(row.node.id) && row.ancestors.every(isExpanded),
  );
  const activeId =
    (visibleRows.some((row) => row.node.id === focusedId) ? focusedId : null) ??
    [...selectedIds].reverse().find((id) => visibleRows.some((row) => row.node.id === id)) ??
    visibleRows[0]?.node.id;

  const toggleExpanded = (id: string): void => {
    const expanded = isExpanded(id);
    setCollapsed((current) => {
      const next = new Map(current);
      if (expanded) next.set(id, selectionKey);
      else next.delete(id);
      return next;
    });
  };

  const select = (id: string, modifiers: SelectionModifiers): void => {
    if (modifiers.shiftKey) {
      const anchorIndex = visibleRows.findIndex(
        (row) => row.node.id === (anchorId.current ?? selectedIds.at(-1)),
      );
      const targetIndex = visibleRows.findIndex((row) => row.node.id === id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const range = visibleRows
          .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
          .map((row) => row.node.id);
        const ids =
          modifiers.ctrlKey || modifiers.metaKey ? [...new Set([...selectedIds, ...range])] : range;
        onSelect(ids, id);
        return;
      }
    }
    anchorId.current = id;
    if (modifiers.ctrlKey || modifiers.metaKey) {
      const ids = selectedIds.includes(id)
        ? selectedIds.filter((selected) => selected !== id)
        : [...selectedIds, id];
      onSelect(ids, ids.includes(id) ? id : ids.at(-1));
    } else {
      onSelect([id], id);
    }
  };

  const focusRow = (id: string | undefined): void => {
    if (id === undefined) return;
    setFocusedId(id);
    rowElements.current.get(id)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, row: ElementRow): void => {
    const editKeys: Readonly<Record<string, ElementTreeEditCommand>> = {
      c: 'edit.copy',
      x: 'edit.cut',
      v: 'edit.paste',
      z: event.shiftKey ? 'edit.redo' : 'edit.undo',
      y: 'edit.redo',
    };
    const editCommand =
      event.key === 'Delete'
        ? 'edit.delete'
        : event.ctrlKey || event.metaKey
          ? editKeys[event.key.toLocaleLowerCase()]
          : undefined;
    if (editCommand !== undefined && onEditCommand !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      onEditCommand(editCommand);
      return;
    }

    const index = visibleRows.findIndex((candidate) => candidate.node.id === row.node.id);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      focusRow(visibleRows[Math.max(0, Math.min(visibleRows.length - 1, index + offset))]?.node.id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (row.hasChildren && !isExpanded(row.node.id)) toggleExpanded(row.node.id);
      else if (row.hasChildren) focusRow(visibleRows[index + 1]?.node.id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (row.hasChildren && isExpanded(row.node.id)) toggleExpanded(row.node.id);
      else focusRow(row.ancestors.at(-1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusRow(event.key === 'Home' ? visibleRows[0]?.node.id : visibleRows.at(-1)?.node.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(row.node.id, event);
    }
  };

  return (
    <section className="wr-element-tree" aria-label="Elements">
      <div className="wr-element-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Search elements"
          placeholder="Search elements"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          spellCheck={false}
        />
      </div>
      <div
        className="wr-element-list"
        role="tree"
        aria-label="Page elements"
        aria-multiselectable="true"
      >
        {visibleRows.map((row) => {
          const definition = registry.get(row.node.type);
          const selected = selectedIds.includes(row.node.id);
          const expanded = isExpanded(row.node.id);
          const hidden = row.node.props.visible === false;
          const tray =
            definition !== undefined && resolveComponentDesignerPresentation(definition) === 'tray';
          return (
            <div
              key={row.node.id}
              ref={(element) => {
                if (element === null) rowElements.current.delete(row.node.id);
                else rowElements.current.set(row.node.id, element);
              }}
              role="treeitem"
              aria-label={row.node.name}
              aria-level={row.depth + 1}
              aria-selected={selected}
              aria-expanded={row.hasChildren ? expanded : undefined}
              tabIndex={activeId === row.node.id ? 0 : -1}
              className={`wr-element-row${selected ? ' selected' : ''}${tray ? ' tray' : ''}`}
              style={{ paddingLeft: 10 + row.depth * 16 }}
              title={`${row.node.name} · ${definition?.displayName ?? row.node.type}`}
              data-component-id={row.node.id}
              onFocus={() => setFocusedId(row.node.id)}
              onClick={(event) => {
                focusRow(row.node.id);
                select(row.node.id, event);
              }}
              onKeyDown={(event) => handleKeyDown(event, row)}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  className="wr-element-chevron"
                  tabIndex={-1}
                  aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.node.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(row.node.id);
                    focusRow(row.node.id);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
                </button>
              ) : (
                <span className="wr-element-chevron" aria-hidden="true" />
              )}
              <span className="wr-element-icon" aria-hidden="true">
                <ComponentIcon icon={definition?.icon} />
              </span>
              <span className="wr-element-name">{row.node.name}</span>
              {hidden && (
                <span className="wr-element-status" title="Hidden at runtime">
                  <Icon name="eye-off" />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {visibleRows.length === 0 && (
        <div className="wr-element-empty">
          {page === null ? 'Open a page to view its elements.' : 'No elements match your search.'}
        </div>
      )}
    </section>
  );
}
