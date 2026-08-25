import { type WebRadIconName, webRadIconLabel } from '@webrad/runtime/icons';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface IconPickerDialogProps {
  readonly icons: readonly WebRadIconName[];
  readonly selected?: WebRadIconName;
  readonly onClose: () => void;
  readonly onSelect: (icon: WebRadIconName) => void;
}

/**
 * Browser-local visual icon gallery used by the Inspector. Selecting an icon
 * applies it immediately; this keeps the property's single source of truth in
 * the Project Model rather than holding a separate draft selection in the UI.
 */
export function IconPickerDialog({
  icons,
  selected,
  onClose,
  onSelect,
}: IconPickerDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    initialFocusRef.current?.focus();
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
      ...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
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
            <span className="wr-modal-eyebrow">Button / Icon</span>
            <h2 id={titleId}>Choose an icon</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close icon picker"
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <div className="wr-icon-picker-content">
          <p id={descriptionId} className="wr-modal-description">
            Select an icon to apply it to the selected button.
          </p>
          <div className="wr-icon-picker-grid" aria-label="Available icons">
            {icons.map((icon, index) => {
              const label = webRadIconLabel(icon);
              const receivesInitialFocus =
                icon === selected || (selected === undefined && index === 0);
              return (
                <button
                  ref={receivesInitialFocus ? initialFocusRef : undefined}
                  type="button"
                  className={`wr-icon-picker-option${icon === selected ? ' selected' : ''}`}
                  key={icon}
                  aria-label={`Select ${label} icon`}
                  aria-pressed={icon === selected}
                  data-icon-picker-option={icon}
                  onClick={() => onSelect(icon)}
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <footer className="wr-modal-actions wr-icon-picker-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
