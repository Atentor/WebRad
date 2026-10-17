import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentNode } from '@webrad/project-model';

interface ComboBoxItemsDialogProps {
  readonly component: ComponentNode;
  readonly focusField: 'items' | 'values';
  readonly onSave: (items: readonly string[], values: readonly string[]) => void;
  readonly onClose: () => void;
}

function listText(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').join('\n')
    : '';
}

function lines(value: string): string[] {
  if (value === '') return [];
  const result = value.split(/\r\n?|\n/u);
  if (result.at(-1) === '') result.pop();
  return result;
}

export function ComboBoxItemsDialog({
  component,
  focusField,
  onSave,
  onClose,
}: ComboBoxItemsDialogProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const itemsRef = useRef<HTMLTextAreaElement>(null);
  const valuesRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [itemsText, setItemsText] = useState(() => listText(component.props.items));
  const [valuesText, setValuesText] = useState(() => listText(component.props.values));
  const items = lines(itemsText);
  const values = lines(valuesText);
  const error = items.some((item) => item.trim() === '')
    ? 'Each Items line must contain a label.'
    : values.length > 0 && values.length !== items.length
      ? 'Enter one Value for each Item, in the same order, or leave Values empty.'
      : null;

  useEffect(() => {
    (focusField === 'items' ? itemsRef : valuesRef).current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [focusField]);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)') ??
        []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={keyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-data-grid-configuration-dialog wr-combo-box-configuration-dialog wr-combo-box-static-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">ComboBox / {component.name}</span>
            <h2 id={titleId}>Edit ComboBox items</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close ComboBox items"
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form
          className="wr-data-grid-configuration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (error === null) onSave(items, values);
          }}
        >
          <div className="wr-data-grid-configuration-content">
            <div className="wr-data-grid-configuration-fields">
              <label>
                <span>Items</span>
                <textarea
                  ref={itemsRef}
                  aria-label="ComboBox Items"
                  className="wr-inspector-input"
                  rows={6}
                  spellCheck={false}
                  placeholder="One item per line"
                  value={itemsText}
                  onChange={(event) => setItemsText(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>Values</span>
                <textarea
                  ref={valuesRef}
                  aria-label="ComboBox Values"
                  className="wr-inspector-input"
                  rows={6}
                  spellCheck={false}
                  placeholder="One value per line"
                  value={valuesText}
                  onChange={(event) => setValuesText(event.currentTarget.value)}
                />
              </label>
            </div>
            <p className="wr-modal-description">
              Each value corresponds to the item on the same line. Leave Values empty to use the
              item text.
            </p>
            {error !== null && <p role="alert">{error}</p>}
          </div>
          <footer className="wr-modal-actions wr-data-grid-configuration-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={error !== null}>
              Save
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
