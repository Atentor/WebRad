import { projectAssetPath, type WebRadProject } from '@webrad/project-model';
import { useState, type ReactElement } from 'react';
import { Icon } from './Icon';

export function ProjectResourceFolders({
  project,
  activeId,
  onOpen,
  onDelete,
}: {
  project: WebRadProject;
  activeId?: string | null;
  onOpen?: (id: string) => void;
  onDelete?: (id: string) => void;
}): ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = [
    {
      label: 'Models',
      entries: (project.sourceFiles ?? [])
        .filter((file) => file.kind === 'model')
        .map((file) => ({ id: file.id, label: file.name, path: `models/${file.name}.ts` })),
    },
    {
      label: 'Units',
      entries: (project.sourceFiles ?? [])
        .filter((file) => file.kind === 'unit')
        .map((file) => ({ id: file.id, label: file.name, path: `units/${file.name}.ts` })),
    },
    {
      label: 'Assets',
      entries: (project.assets ?? []).map((asset) => ({
        id: asset.id,
        label: asset.fileName,
        path: projectAssetPath(asset),
      })),
    },
  ];
  return (
    <>
      {groups.map(({ label, entries }) => {
        const expanded = !collapsed.has(label);
        return (
          <div key={label}>
            <div className="wr-tree-row wr-folder-row" role="treeitem" aria-expanded={expanded}>
              <button
                type="button"
                className="wr-tree-toggle"
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
                aria-expanded={expanded}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(label)) next.delete(label);
                    else next.add(label);
                    return next;
                  })
                }
              >
                <Icon
                  name={expanded ? 'chevron-down' : 'chevron-right'}
                  className="wr-tree-glyph"
                />
              </button>
              <span>{label}</span>
              <small>{entries.length}</small>
            </div>
            {expanded && (
              <div role="group" className="wr-tree-group nested">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    role="treeitem"
                    tabIndex={0}
                    aria-selected={activeId === entry.id}
                    className={`wr-tree-row wr-page-row ${activeId === entry.id ? 'active' : ''}`}
                    title={entry.path}
                    onClick={() => onOpen?.(entry.id)}
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
                      {label === 'Assets' ? 'A' : 'TS'}
                    </span>
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
