import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
} from 'react';
import { useEditorDraftPending } from './useEditorDraftPending';

interface DraftNumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | 'type'
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'onFocus'
  | 'onBlur'
  | 'onKeyDown'
  | 'min'
  | 'max'
  | 'step'
> {
  readonly value: number | null | undefined;
  readonly onChange: (value: number | null) => void;
  readonly nullable?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly integer?: boolean;
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function parsedNumber(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(normalized)) return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Keeps incomplete numeric text local while publishing complete, valid values. */
export function DraftNumberInput({
  value,
  onChange,
  nullable = false,
  min,
  max,
  step = 1,
  integer = false,
  readOnly,
  disabled,
  'aria-describedby': describedBy,
  ...inputProps
}: DraftNumberInputProps): ReactElement {
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(() => numberText(value));
  const [error, setError] = useState<string | null>(null);
  const [sourceValue, setSourceValue] = useState(value);
  const [lastPublished, setLastPublished] = useState(value);
  const [focusStartValue, setFocusStartValue] = useState(value);
  const [edited, setEdited] = useState(false);
  const skipBlurCommit = useRef(false);

  if (!Object.is(value, sourceValue)) {
    setSourceValue(value);
    if (!Object.is(value, lastPublished)) {
      setLastPublished(value);
      setFocusStartValue(value);
      setDraft(numberText(value));
      setError(null);
      setEdited(false);
    }
  }
  const parsedDraft = parsedNumber(draft);
  const pending =
    !readOnly &&
    !disabled &&
    edited &&
    (value === undefined ||
      (draft.trim().length === 0
        ? !(nullable && value === null)
        : parsedDraft === undefined || !Object.is(parsedDraft, value)));
  useEditorDraftPending(pending);

  const bounded = (next: number): number => {
    const result = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
    return integer ? Math.round(result) : result;
  };
  const publish = (next: number | null, confirmed = false): void => {
    // A mixed selection has no single starting value to restore on Escape.
    if (focusStartValue === undefined && !confirmed) return;
    if (Object.is(next, lastPublished)) return;
    setLastPublished(next);
    onChange(next);
  };
  const commit = (): boolean => {
    if (readOnly || disabled || !edited) return true;
    if (draft.trim().length === 0 && nullable) {
      publish(null, true);
      setDraft('');
      setError(null);
      setEdited(false);
      setFocusStartValue(null);
      return true;
    }
    const next = parsedNumber(draft);
    if (next === undefined) {
      setError(draft.trim().length === 0 ? 'Enter a number.' : 'Enter a valid number.');
      return false;
    }
    const normalized = bounded(next);
    publish(normalized, true);
    setDraft(String(normalized));
    setError(null);
    setEdited(false);
    setFocusStartValue(normalized);
    return true;
  };
  const commitActiveDraft = useEffectEvent((event: Event) => {
    const input = inputRef.current;
    if (input !== null && document.activeElement === input && !commit()) event.preventDefault();
  });
  useEffect(() => {
    const onCommitDrafts = (event: Event): void => commitActiveDraft(event);
    window.addEventListener('webrad:commit-editor-drafts', onCommitDrafts);
    return () => window.removeEventListener('webrad:commit-editor-drafts', onCommitDrafts);
  }, []);

  return (
    <div className="wr-draft-number">
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        role="spinbutton"
        inputMode="decimal"
        value={draft}
        data-editor-draft-pending={pending ? 'true' : undefined}
        readOnly={readOnly}
        disabled={disabled}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={error !== null || undefined}
        aria-describedby={
          [describedBy, error === null ? undefined : errorId].filter(Boolean).join(' ') || undefined
        }
        onFocus={() => {
          setFocusStartValue(value);
          skipBlurCommit.current = false;
        }}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          setError(null);
          if (readOnly || disabled) return;
          setEdited(true);
          if (text.trim().length === 0 && nullable) publish(null);
          const next = parsedNumber(text);
          if (next !== undefined && Object.is(bounded(next), next)) publish(next);
        }}
        onBlur={() => {
          if (skipBlurCommit.current) skipBlurCommit.current = false;
          else commit();
        }}
        onKeyDown={(event) => {
          if (readOnly || disabled) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            const original = focusStartValue;
            if (original !== undefined) publish(original, true);
            setDraft(numberText(original));
            setError(null);
            setEdited(false);
            skipBlurCommit.current = true;
            event.currentTarget.blur();
          } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (!commit()) return;
            skipBlurCommit.current = true;
            event.currentTarget.blur();
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            const current = parsedNumber(draft) ?? value ?? min ?? 0;
            const direction = event.key === 'ArrowUp' ? 1 : -1;
            const next = bounded(
              Number((current + direction * step * (event.shiftKey ? 10 : 1)).toPrecision(12)),
            );
            setEdited(true);
            publish(next);
            setDraft(String(next));
            setError(null);
          }
        }}
      />
      {error !== null && (
        <small id={errorId} className="wr-draft-number-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
