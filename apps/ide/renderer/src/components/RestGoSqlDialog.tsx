import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { RestGoAdminHttpMethod } from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import { useEditorDraftPending } from './useEditorDraftPending';
import { useRowConfigurationDialog } from './useRowConfigurationDialog';

interface Props {
  readonly method: RestGoAdminHttpMethod;
  readonly endpoint: string;
  readonly value: string;
  readonly onApply: (value: string) => void;
  readonly onClose: () => void;
}

/** SQL is applied to the endpoint draft; only Save endpoint writes to RestGO. */
export function RestGoSqlDialog({
  method,
  endpoint,
  value,
  onApply,
  onClose,
}: Props): ReactElement {
  const titleId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { dialogRef, handleKeyDown } = useRowConfigurationDialog(onClose);
  const [script, setScript] = useState(value);
  const changed = script !== value;
  const canApply = changed && script.trim().length > 0;
  useEditorDraftPending(changed);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const apply = (): void => {
    if (canApply) onApply(script);
  };
  return createPortal(
    <div
      className="wr-modal-backdrop wr-restgo-sql-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          event.stopPropagation();
          apply();
          return;
        }
        handleKeyDown(event);
      }}
    >
      <section
        ref={dialogRef}
        className="wr-modal wr-restgo-sql-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">
              {method} / {endpoint || 'New endpoint'}
            </span>
            <h2 id={titleId}>Edit SQL</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close SQL editor"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form
          className="wr-restgo-sql-form"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <div className="wr-restgo-sql-help" id={helpId}>
            Use <code>:name</code> for values supplied by query parameters or the JSON body.
            Separate SQL statements with semicolons.
          </div>
          <textarea
            ref={inputRef}
            className="wr-restgo-sql"
            aria-label={`SQL for ${method}`}
            aria-describedby={helpId}
            value={script}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            maxLength={1_000_000}
            placeholder="SELECT * FROM customers WHERE id = :id;"
            onChange={(event) => setScript(event.currentTarget.value)}
          />
          <div className="wr-restgo-sql-status">
            <span>
              {script.split('\n').length} lines · {script.length} characters
            </span>
            <span>Ctrl+Enter to apply</span>
          </div>
          <footer className="wr-restgo-sql-footer">
            <small>Apply SQL updates the draft. Save endpoint sends the changes to RestGO.</small>
            <div className="wr-modal-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={!canApply}>
                Apply SQL
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
