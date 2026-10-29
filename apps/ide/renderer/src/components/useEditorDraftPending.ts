import { useEffect, useId } from 'react';

/** Includes local editor work in the shell's unsaved-change tracking. */
export function useEditorDraftPending(pending: boolean): void {
  const id = useId();
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('webrad:editor-draft-state', { detail: { id, pending } }));
  }, [id, pending]);
  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent('webrad:editor-draft-state', { detail: { id, pending: false } }),
      );
    },
    [id],
  );
}
