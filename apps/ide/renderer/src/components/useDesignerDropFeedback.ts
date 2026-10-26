import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { setDesignerDragPayload } from './designer-drag-data';

/** Frame-limited, transient feedback that never writes to the Project Model. */
export function useDesignerDropFeedback<T>(context: unknown, onCancelInsertion?: () => void) {
  const [snapshot, setSnapshot] = useState<{ context: unknown; value: T | null }>({
    context,
    value: null,
  });
  const pending = useRef<T | null>(null);
  const frame = useRef<number | undefined>(undefined);
  const clearFrame = useCallback((): void => {
    if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    frame.current = undefined;
    pending.current = null;
  }, []);
  const clear = useCallback((): void => {
    clearFrame();
    setSnapshot({ context, value: null });
  }, [clearFrame, context]);
  const show = useCallback(
    (value: T): void => {
      pending.current = value;
      if (frame.current !== undefined) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = undefined;
        setSnapshot({ context, value: pending.current });
      });
    },
    [context],
  );

  useLayoutEffect(() => {
    clearFrame();
    return clearFrame;
  }, [clearFrame, context]);

  useLayoutEffect(() => {
    const cancel = (): void => {
      setDesignerDragPayload(null);
      clear();
      onCancelInsertion?.();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel();
    };
    const onVisibility = (): void => {
      if (document.hidden) cancel();
    };
    window.addEventListener('dragend', cancel);
    window.addEventListener('drop', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('dragend', cancel);
      window.removeEventListener('drop', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clear, onCancelInsertion]);

  return { feedback: snapshot.context === context ? snapshot.value : null, show, clear };
}
