import {
  type WebRadIconName,
  isWebRadIconName,
  webRadIconLabel,
  webRadIconMatchesSearch,
} from '@webrad/runtime/icons';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { ProjectIconGraphic } from './ProjectIconGraphic';

interface IconPickerDialogProps<T extends string> {
  readonly icons: readonly T[];
  readonly selected?: T;
  readonly renderIcon?: (icon: T) => ReactNode;
  readonly libraryLabel?: string;
  readonly onClose: () => void;
  /** Enables consumers whose icon is optional to clear the current selection. */
  readonly onClear?: () => void;
  readonly onSelect: (icon: T) => void;
}

/**
 * Browser-local visual icon gallery used by the Inspector. Selecting an icon
 * applies it immediately; this keeps the property's single source of truth in
 * the Project Model rather than holding a separate draft selection in the UI.
 */
export function IconPickerDialog<T extends string = WebRadIconName>({
  icons,
  selected,
  onClose,
  onClear,
  onSelect,
  renderIcon,
  libraryLabel = 'Button / Icon',
}: IconPickerDialogProps<T>): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const searchId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const iconButtonRefs = useRef(new Map<T, HTMLButtonElement>());
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [search, setSearch] = useState('');
  const searchQuery = search.trim();
  const matchingIcons = useMemo(
    () =>
      searchQuery.length === 0
        ? icons
        : icons.filter((icon) =>
            isWebRadIconName(icon)
              ? webRadIconMatchesSearch(icon, searchQuery)
              : icon.replaceAll('-', ' ').includes(searchQuery.toLowerCase().replaceAll('-', ' ')),
          ),
    [icons, searchQuery],
  );
  const focusedIcon =
    selected !== undefined && matchingIcons.includes(selected) ? selected : matchingIcons[0];

  useEffect(() => {
    searchRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const focusMatchingIcon = (): void => {
    if (focusedIcon !== undefined) iconButtonRefs.current.get(focusedIcon)?.focus();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'ArrowDown') return;
    if (focusedIcon === undefined) return;
    event.preventDefault();
    focusMatchingIcon();
  };

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-icon-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">{libraryLabel}</span>
            <h2 id={titleId}>Choose an icon</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close icon picker"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="wr-icon-picker-content">
          <p id={descriptionId} className="wr-modal-description">
            Select an icon to apply it to the selected component.
          </p>
          <label className="wr-icon-picker-search" htmlFor={searchId}>
            <span>Search icons</span>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={search}
              placeholder="Search by name"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </label>
          {matchingIcons.length > 0 ? (
            <div className="wr-icon-picker-grid" aria-label="Available icons">
              {matchingIcons.map((icon) => {
                const label = isWebRadIconName(icon)
                  ? webRadIconLabel(icon)
                  : icon.replaceAll('-', ' ');
                return (
                  <button
                    ref={(element) => {
                      if (element === null) iconButtonRefs.current.delete(icon);
                      else iconButtonRefs.current.set(icon, element);
                    }}
                    type="button"
                    className={`wr-icon-picker-option${icon === selected ? ' selected' : ''}`}
                    key={icon}
                    aria-label={`Select ${label} icon`}
                    title={icon}
                    aria-pressed={icon === selected}
                    data-icon-picker-option={icon}
                    onClick={() => onSelect(icon)}
                  >
                    {renderIcon ? (
                      renderIcon(icon)
                    ) : isWebRadIconName(icon) ? (
                      <ProjectIconGraphic name={icon} />
                    ) : null}
                    <span className="wr-icon-picker-name">{icon}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="wr-icon-picker-empty" role="status">
              <strong>No icons found</strong>
              <span>Try another name or label.</span>
            </div>
          )}
        </div>
        <footer className="wr-modal-actions wr-icon-picker-actions">
          {onClear !== undefined && (
            <button type="button" disabled={selected === undefined} onClick={onClear}>
              No icon
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
