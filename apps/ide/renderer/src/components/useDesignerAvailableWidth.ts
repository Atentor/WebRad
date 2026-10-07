import { useLayoutEffect, useState, type RefObject } from 'react';

/** Measures the scroll host, excluding its padding and vertical scrollbar. */
export function useDesignerAvailableWidth(
  scrollRef: RefObject<HTMLDivElement | null>,
): number | undefined {
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const host = scrollRef.current;
    if (host === null) return;
    const measure = (): void => {
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
    observer?.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [scrollRef]);
  return width;
}
