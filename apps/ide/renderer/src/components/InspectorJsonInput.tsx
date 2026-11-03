import { useId, useState, type ReactElement } from 'react';
import { useEditorDraftPending } from './useEditorDraftPending';

/** Keeps incomplete JSON out of the Project Model while retaining an editable draft. */
export function InspectorJsonInput({
  id,
  value,
  disabled,
  validate,
  description,
  onChange,
}: {
  readonly id: string;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly validate?: (value: unknown) => boolean;
  readonly description?: string;
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  const saved = JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState('');
  const errorId = useId();
  useEditorDraftPending(draft !== saved);
  const commit = (): void => {
    if (disabled || draft === saved) return;
    try {
      const parsed: unknown = JSON.parse(draft);
      if (parsed === null || typeof parsed !== 'object') throw new Error('Enter a JSON object.');
      if (validate && !validate(parsed))
        throw new Error('The character rules are invalid. Review the format below.');
      onChange(parsed);
      setDraft(JSON.stringify(parsed, null, 2));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid JSON.');
    }
  };
  return (
    <div className="wr-inspector-structured-input">
      <textarea
        id={id}
        className="wr-inspector-input wr-inspector-multiline"
        value={draft}
        disabled={disabled}
        spellCheck={false}
        rows={4}
        aria-invalid={error !== ''}
        aria-describedby={errorId}
        onChange={(event) => {
          setDraft(event.target.value);
          setError('');
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(saved);
            setError('');
            event.stopPropagation();
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commit();
          }
        }}
      />
      <small id={errorId} role={error ? 'alert' : undefined}>
        {error || description}
      </small>
    </div>
  );
}
