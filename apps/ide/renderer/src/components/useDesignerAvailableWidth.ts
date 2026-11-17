import { useLayoutEffect, useState, type RefObject } from 'react';
import { isWorkbenchResizing, WORKBENCH_RESIZE_END } from './workbench-resize';

/** Measures the scroll host, excluding its padding and vertical scrollbar. */
export function useDesignerAvailableWidth(
  scrollRef: RefObject<HTMLDivElement | null>,
): number | undefined {
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const host = scrollRef.current;
    if (host === null) return;
    const measure = (): void => {
      // CSS follows the dock live; defer the full component projection until release.
      if (isWorkbenchResizing(host)) return;
      const style = getComputedStyle(host);
      const next =
        host.clientWidth -
        (Number.parseFloat(style.paddingLeft) || 0) -
        (Number.parseFloat(style.paddingRight) || 0);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    const workbench = host.closest('.wr-workbench');
    let frame: number | undefined;
    const onResizeEnd = (): void => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        measure();
      });
    };
    observer?.observe(host);
    workbench?.addEventListener(WORKBENCH_RESIZE_END, onResizeEnd);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      workbench?.removeEventListener(WORKBENCH_RESIZE_END, onResizeEnd);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [scrollRef]);
  return width;
}
