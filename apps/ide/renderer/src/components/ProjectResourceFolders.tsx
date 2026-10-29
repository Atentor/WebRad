import type { WebRadProject } from '@webrad/project-model';
import type { ReactElement } from 'react';
import { Icon } from './Icon';
import { ProjectExplorerFolder } from './project-explorer-tree';
import { projectResourceGroups } from './project-explorer-resources';

export function ProjectResourceFolders({
  project,
  query,
  collapsed,
  onToggle,
  activeId,
  onOpen,
  onDelete,
  focusedKey,
}: {
  project: WebRadProject;
  query: string;
  collapsed: ReadonlySet<string>;
  onToggle: (label: string) => void;
  activeId?: string | null;
  onOpen?: (id: string) => void;
  onDelete?: (id: string) => void;
  focusedKey: string;
}): ReactElement {
  const groups = projectResourceGroups(project);
  return (
    <>
      {groups.map(({ label, entries }) => {
        const expanded = !collapsed.has(label);
        const visibleEntries = entries.filter((entry) =>
          entry.label.toLocaleLowerCase().includes(query),
        );
        if (query && visibleEntries.length === 0) return null;
        return (
          <ProjectExplorerFolder key={label} label={label} count={visibleEntries.length}
            expanded={expanded} tabIndex={focusedKey === `folder:${label}` ? 0 : -1}
            onToggle={() => onToggle(label)}>
                {visibleEntries.map((entry) => (
                  <div
                    key={entry.id}
                    data-project-resource-id={entry.id}
                    data-explorer-key={entry.id}
                    data-explorer-label={entry.label}
                    role="treeitem"
                    aria-level={2}
                    tabIndex={focusedKey === entry.id ? 0 : -1}
                    aria-selected={activeId === entry.id}
                    className={`wr-tree-row wr-page-row ${activeId === entry.id ? 'active' : ''}`}
                    title={entry.path}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      onOpen?.(entry.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onOpen?.(entry.id);
                      if (event.key === 'Delete') {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete?.(entry.id);
                      }
                    }}
                  >
                    <span className="wr-page-icon" aria-hidden="true">
                      <Icon name={label === 'Assets' ? 'file-image' : 'file-code'} />
                    </span>
                    <span className="wr-explorer-name">{entry.label}</span>
                  </div>
                ))}
          </ProjectExplorerFolder>
        );
      })}
    </>
  );
}
