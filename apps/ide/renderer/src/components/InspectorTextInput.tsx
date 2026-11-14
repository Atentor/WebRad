import {
  useLayoutEffect,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { useEditorDraftPending } from './useEditorDraftPending';

export const INSPECTOR_COMMIT_DELAY = 600;

/** Keep typing local until blur, an explicit save, or a pause in editing. */
export function InspectorTextInput({
  id,
  value,
  multiple,
  readOnly,
  multiline = false,
  placeholder,
  validate,
  description,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly multiple: boolean;
  readonly readOnly: boolean;
  readonly multiline?: boolean;
  readonly placeholder?: string;
  readonly validate?: (value: unknown) => boolean;
  readonly description?: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(value);
  const [published, setPublished] = useState(value);
  const [edited, setEdited] = useState(false);
  const [composing, setComposing] = useState(false);
  const draftRef = useRef(draft);
  const editedRef = useRef(false);
  const skipBlur = useRef(false);
  useLayoutEffect(() => {
    draftRef.current = draft;
    editedRef.current = edited;
  }, [draft, edited]);
  if (source !== value) {
    setSource(value);
    if (published !== value) {
      setPublished(value);
      setDraft(value);
      setEdited(false);
    }
  }
  const pending = !readOnly && edited && (multiple || draft !== value);
  useEditorDraftPending(pending);
  const commit = (): void => {
    if (readOnly || !editedRef.current) return;
    const currentDraft = draftRef.current;
    if (multiple || currentDraft !== published) {
      setPublished(currentDraft);
      onChange(currentDraft);
    }
    setEdited(false);
    editedRef.current = false;
  };
  const commitCurrent = useEffectEvent(() => commit());
  const commitActive = useEffectEvent(() => {
    if (document.activeElement === inputRef.current) commit();
  });
  useEffect(() => {
    const listener = (): void => commitActive();
    window.addEventListener('webrad:commit-editor-drafts', listener);
    return () => window.removeEventListener('webrad:commit-editor-drafts', listener);
  }, []);
  useEffect(() => {
    if (!edited || composing || readOnly) return;
    const timer = window.setTimeout(() => commitCurrent(), INSPECTOR_COMMIT_DELAY);
    return () => window.clearTimeout(timer);
  }, [draft, edited, composing, readOnly]);

  const invalid = validate !== undefined && !multiple && !validate(edited ? draft : value);
  const common = {
    id,
    value: draft,
    placeholder,
    readOnly,
    spellCheck: false,
    'data-editor-draft-pending': pending ? 'true' : undefined,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? `${id}-error` : undefined,
    onFocus: () => {
      skipBlur.current = false;
    },
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (readOnly) return;
      setDraft(event.target.value);
      draftRef.current = event.target.value;
      setEdited(true);
      editedRef.current = true;
    },
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: () => setComposing(false),
    onBlur: () => {
      if (skipBlur.current) skipBlur.current = false;
      else commit();
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setDraft(value);
        draftRef.current = value;
        setEdited(false);
        editedRef.current = false;
        skipBlur.current = true;
        event.currentTarget.blur();
      } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        commit();
        skipBlur.current = true;
        event.currentTarget.blur();
      }
    },
  };
  const input = multiline ? (
    <textarea
      {...common}
      ref={(node) => {
        inputRef.current = node;
      }}
      className="wr-inspector-input wr-inspector-multiline"
      rows={10}
    />
  ) : (
    <input
      {...common}
      ref={(node) => {
        inputRef.current = node;
      }}
      className="wr-inspector-input"
      type="text"
    />
  );
  if (validate === undefined) return input;
  return (
    <div className="wr-inspector-structured-input">
      {input}
      {invalid && (
        <small id={`${id}-error`} role="alert">
          Invalid value. {description}
        </small>
      )}
    </div>
  );
}
