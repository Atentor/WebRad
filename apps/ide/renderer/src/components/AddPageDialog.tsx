import { getPageNameError, portableFileNameKey } from '@webrad/project-model';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

export type AddDocumentKind = 'page' | 'reusable';

interface AddPageDialogProps {
  readonly kind: AddDocumentKind;
  readonly suggestedName: string;
  readonly occupiedNames: readonly string[];
  readonly onCancel: () => void;
  readonly onCreate: (name: string) => void;
}

function documentLabel(kind: AddDocumentKind): string {
  return kind === 'page' ? 'page' : 'reusable component';
}

function validationMessage(reason: string): string {
  return `${reason.slice(0, 1).toUpperCase()}${reason.slice(1)}.`;
}

/**
 * Renderer-owned replacement for window.prompt(). Electron renderers do not
 * provide a usable synchronous prompt dialog, so menu commands need a normal
 * React dialog to create project documents reliably.
 */
export function AddPageDialog({
  kind,
  suggestedName,
  occupiedNames,
  onCancel,
  onCreate,
}: AddPageDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const label = documentLabel(kind);

  useEffect(() => {
    inputRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalizedName = name.trim();
    const reason = getPageNameError(normalizedName);
    if (reason !== undefined) {
      setError(validationMessage(reason));
      return;
    }
    const normalizedKey = portableFileNameKey(normalizedName);
    if (occupiedNames.some((candidate) => portableFileNameKey(candidate) === normalizedKey)) {
      setError(`A page or reusable component named "${normalizedName}" already exists.`);
      return;
    }
    setError(null);
    onCreate(normalizedName);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>('button, input') ?? []),
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

  return (
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-new-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Project / Add {label}</span>
            <h2 id={titleId}>Add {label}</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label={`Close add ${label} dialog`}
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        <form onSubmit={submit}>
          <p id={descriptionId} className="wr-modal-description">
            {kind === 'page'
              ? 'Create a navigable page for this application.'
              : 'Create a shared visual definition that can be dragged into any page.'}
          </p>
          <label className="wr-modal-field">
            <span>{kind === 'page' ? 'Page name' : 'Reusable component name'}</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              aria-invalid={error !== null}
              aria-describedby={error === null ? descriptionId : errorId}
              maxLength={80}
              spellCheck={false}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setError(null);
              }}
            />
          </label>
          {error !== null && (
            <div className="wr-modal-error" id={errorId} role="alert">
              {error}
            </div>
          )}
          <footer className="wr-modal-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Add {label}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
