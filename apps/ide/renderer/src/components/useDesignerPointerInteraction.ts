import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface PointerInteraction {
  readonly pointerId: number;
}

/** Keeps pointer transactions current between React renders and paints at most once per frame. */
export function useDesignerPointerInteraction<T extends PointerInteraction>(context: unknown) {
  const [snapshot, setSnapshot] = useState<{ context: unknown; value: T | null }>({
    context,
    value: null,
  });
  // A preview belongs to the model/viewport that created it. Context changes
  // remove it during render; the effect only releases external pointer state.
  const interaction = snapshot.context === context ? snapshot.value : null;
  const current = useRef<T | null>(null);
  const capture = useRef<HTMLElement | null>(null);
  const frame = useRef<number | undefined>(undefined);

  const clear = useCallback((): void => {
    const active = current.current;
    const target = capture.current;
    current.current = null;
    capture.current = null;
    if (frame.current !== undefined) {
      window.cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
    // Clear first: releasing capture dispatches lostpointercapture synchronously
    // in some hosts, and that event must not cancel a later transaction.
    if (active !== null && target?.hasPointerCapture?.(active.pointerId)) {
      target.releasePointerCapture(active.pointerId);
    }
  }, []);

  const cancel = useCallback((): void => {
    clear();
    setSnapshot({ context, value: null });
  }, [clear, context]);

  useLayoutEffect(() => {
    clear();
    return clear;
  }, [clear, context]);

  useLayoutEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && current.current !== null) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    const onVisibilityChange = (): void => {
      if (document.hidden) cancel();
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cancel]);

  const get = useCallback((): T | null => current.current, []);

  const begin = useCallback(
    (next: T, target: HTMLElement): void => {
      if (current.current !== null) return;
      target.setPointerCapture(next.pointerId);
      capture.current = target;
      current.current = next;
      setSnapshot({ context, value: next });
    },
    [context],
  );

  const preview = useCallback(
    (next: T): void => {
      if (current.current?.pointerId !== next.pointerId || current.current === next) return;
      current.current = next;
      if (frame.current !== undefined) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = undefined;
        setSnapshot({ context, value: current.current });
      });
    },
    [context],
  );

  const end = useCallback(
    (pointerId: number): T | null => {
      const active = current.current;
      if (active?.pointerId !== pointerId) return null;
      clear();
      setSnapshot({ context, value: null });
      return active;
    },
    [clear, context],
  );

  const cancelPointer = useCallback(
    (pointerId: number): void => {
      if (current.current?.pointerId === pointerId) cancel();
    },
    [cancel],
  );

  return { interaction, get, begin, preview, end, cancel, cancelPointer };
}
