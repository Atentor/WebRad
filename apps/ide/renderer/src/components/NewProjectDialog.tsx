import { Icon } from './Icon';
import { getProjectNameError } from '@webrad/project-model';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

interface NewProjectDialogProps {
  readonly busy: boolean;
  readonly error?: string | null;
  readonly onCancel: () => void;
  readonly onClearError: () => void;
  readonly onCreate: (name: string) => void;
}

function validationMessage(reason: string): string {
  return `${reason.slice(0, 1).toUpperCase()}${reason.slice(1)}.`;
}

export function NewProjectDialog({
  busy,
  error = null,
  onCancel,
  onClearError,
  onCreate,
}: NewProjectDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousBusyRef = useRef(busy);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [name, setName] = useState('Project1');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (previousBusyRef.current && !busy) inputRef.current?.focus();
    previousBusyRef.current = busy;
  }, [busy]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const normalizedName = name.trim();
    const reason = getProjectNameError(normalizedName);
    if (reason !== undefined) {
      setLocalError(validationMessage(reason));
      return;
    }
    setLocalError(null);
    onCreate(normalizedName);
  };
  const displayedError = localError ?? error;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
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
            <span className="wr-modal-eyebrow">File / New Project</span>
            <h2 id={titleId}>Create a new project</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close new project dialog"
            disabled={busy}
            onClick={onCancel}
          >
            <Icon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <p id={descriptionId} className="wr-modal-description">
            Choose a project name. WebRAD will then ask where to create it and make a folder with
            that name inside the selected location.
          </p>
          <label className="wr-modal-field">
            <span>Project name</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              aria-invalid={displayedError !== null}
              aria-describedby={displayedError === null ? descriptionId : errorId}
              disabled={busy}
              maxLength={80}
              spellCheck={false}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setLocalError(null);
                onClearError();
              }}
            />
          </label>
          {displayedError !== null && (
            <div className="wr-modal-error" id={errorId} role="alert">
              {displayedError}
            </div>
          )}
          <footer className="wr-modal-actions">
            <button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
