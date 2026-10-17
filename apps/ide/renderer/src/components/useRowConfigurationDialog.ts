import { useEffect, useRef, type KeyboardEvent } from 'react';

/** Shared modal focus containment and draft cancellation for row editors. */
export function useRowConfigurationDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('form select, form input, form button')?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
      ) ?? []),
    ];
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0]?.focus();
    }
  };
  return { dialogRef, handleKeyDown };
}
