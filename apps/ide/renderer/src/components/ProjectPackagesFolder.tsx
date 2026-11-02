import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { PackageAction, PackageStatus } from '../../../shared/package-contracts';
import { Icon } from './Icon';
import { ProjectExplorerFolder } from './project-explorer-tree';

export function ProjectPackagesFolder({
  dependencies,
  query,
  expanded,
  focusedKey,
  disabled,
  onToggle,
  onManage,
  onRun,
}: {
  readonly dependencies: PackageStatus['dependencies'];
  readonly query: string;
  readonly expanded: boolean;
  readonly focusedKey: string;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
  readonly onManage?: (name?: string) => void;
  readonly onRun?: (action: PackageAction, name?: string) => void;
}): ReactElement | null {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; name?: string } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const entries = dependencies.filter((entry) => entry.name.toLocaleLowerCase().includes(query));

  useEffect(() => {
    if (!contextMenu) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    if (menu) {
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(contextMenu.x, window.innerWidth - rect.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(contextMenu.y, window.innerHeight - rect.height - 4))}px`;
    }
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menu?.contains(event.target)) setContextMenu(null);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [contextMenu]);

  if (query && entries.length === 0) return null;
  const closeMenu = (): void => {
    setContextMenu(null);
    returnFocus.current?.focus();
  };
  return (
    <div
      className="wr-explorer-packages"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        returnFocus.current =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>('[data-explorer-key]')
            : null;
        const name =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>('[data-project-package]')?.dataset.projectPackage
            : undefined;
        setContextMenu({ x: event.clientX, y: event.clientY, name });
      }}
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest('.wr-folder-row'))
          onManage?.();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        event.preventDefault();
        event.stopPropagation();
        const target =
          event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>('[data-explorer-key]')
            : null;
        const bounds = target?.getBoundingClientRect();
        returnFocus.current = target;
        setContextMenu({
          x: bounds?.left ?? 0,
          y: bounds?.bottom ?? 0,
          name: target?.dataset.projectPackage,
        });
      }}
    >
      <ProjectExplorerFolder
        label="Packages"
        count={entries.length}
        expanded={expanded}
        tabIndex={focusedKey === 'folder:Packages' ? 0 : -1}
        onToggle={onToggle}
      >
        {entries.map((entry) => (
          <div
            key={entry.name}
            data-project-package={entry.name}
            data-explorer-key={`package:${entry.name}`}
            data-explorer-label={entry.name}
            className="wr-tree-row wr-page-row wr-package-row"
            role="treeitem"
            aria-level={2}
            aria-selected={false}
            tabIndex={focusedKey === `package:${entry.name}` ? 0 : -1}
            title={`${entry.name}: ${entry.installedVersion ?? 'not installed'} (requested ${entry.requested})`}
            onClick={(event) => {
              event.currentTarget.focus();
              onManage?.(entry.name);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onManage?.(entry.name);
              if (event.key === 'Delete' && !disabled) onRun?.('remove', entry.name);
            }}
          >
            <Icon name="download-cloud" className="wr-page-icon" />
            <span className="wr-explorer-name">{entry.name}</span>
            <small>{entry.installedVersion ?? entry.requested}</small>
          </div>
        ))}
        {entries.length === 0 && (
          <button type="button" className="wr-explorer-package-manage" onClick={() => onManage?.()}>
            Install package...
          </button>
        )}
      </ProjectExplorerFolder>
      {contextMenu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={
              contextMenu.name ? `${contextMenu.name} package actions` : 'Package actions'
            }
            className="wr-packages-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                closeMenu();
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const items = [
                  ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
                    'button:not(:disabled)',
                  ) ?? []),
                ];
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                items[
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                ]?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onManage?.(contextMenu.name);
              }}
            >
              Manage packages...
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                closeMenu();
                onManage?.();
              }}
            >
              Install package...
            </button>
            {contextMenu.name && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    closeMenu();
                    onRun?.('update', contextMenu.name);
                  }}
                >
                  Update package
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => {
                    closeMenu();
                    onRun?.('remove', contextMenu.name);
                  }}
                >
                  Remove package
                </button>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={disabled || dependencies.length === 0}
              onClick={() => {
                closeMenu();
                onRun?.('restore');
              }}
            >
              Restore dependencies
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
