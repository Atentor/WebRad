import type { ReactElement, ReactNode } from 'react';
import { Icon } from './Icon';

export function ProjectExplorerFolder({
  label,
  count,
  expanded,
  tabIndex,
  onToggle,
  children,
}: {
  readonly label: string;
  readonly count: number;
  readonly expanded: boolean;
  readonly tabIndex: number;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className="wr-tree-group wr-explorer-folder"
      role="treeitem"
      aria-label={`${label}, ${String(count)} ${count === 1 ? 'item' : 'items'}`}
      aria-expanded={expanded}
      aria-level={1}
      data-explorer-key={`folder:${label}`}
      data-explorer-label={label}
      tabIndex={tabIndex}
    >
      <div
        className="wr-tree-row wr-folder-row"
        onClick={(event) => {
          event.currentTarget.parentElement?.focus();
          onToggle();
        }}
      >
        <button
          type="button"
          className="wr-tree-toggle"
          tabIndex={-1}
          data-explorer-toggle
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            event.currentTarget.closest<HTMLElement>('[role="treeitem"]')?.focus();
            onToggle();
          }}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} className="wr-tree-glyph" />
        </button>
        <span>{label}</span>
        <small>{count}</small>
      </div>
      {expanded && (
        <div role="group" className="wr-tree-group nested">
          {children}
        </div>
      )}
    </div>
  );
}

