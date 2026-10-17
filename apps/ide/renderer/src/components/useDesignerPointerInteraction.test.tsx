// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesignerPointerInteraction } from './useDesignerPointerInteraction';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function captureTarget() {
  const target = document.createElement('div');
  let captured = false;
  const release = vi.fn(() => {
    captured = false;
  });
  Object.defineProperties(target, {
    setPointerCapture: {
      value: vi.fn(() => {
        captured = true;
      }),
    },
    hasPointerCapture: { value: () => captured },
    releasePointerCapture: { value: release },
  });
  return { target, release };
}

describe('Designer pointer transaction lifecycle', () => {
  it('keeps the latest position synchronous while painting only once per frame', () => {
    let paint: FrameRequestCallback | undefined;
    const schedule = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      paint = callback;
      return 1;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const { target, release } = captureTarget();
    const context = {};
    const { result } = renderHook(() =>
      useDesignerPointerInteraction<{ pointerId: number; position: number }>(context),
    );
    act(() => result.current.begin({ pointerId: 1, position: 0 }, target));
    act(() => {
      result.current.preview({ pointerId: 1, position: 10 });
      result.current.preview({ pointerId: 1, position: 20 });
      result.current.preview({ pointerId: 1, position: 30 });
    });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(result.current.interaction?.position).toBe(0);
    expect(result.current.get()?.position).toBe(30);
    act(() => paint?.(0));
    expect(result.current.interaction?.position).toBe(30);
    act(() => result.current.preview({ pointerId: 1, position: 40 }));
    act(() => {
      expect(result.current.end(1)?.position).toBe(40);
    });
    expect(result.current.interaction).toBeNull();
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each(['escape', 'blur', 'context', 'capture', 'cancel'] as const)(
    'cancels on %s without leaving an active pointer or scheduled paint',
    (reason) => {
      const schedule = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
      const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
      const { target, release } = captureTarget();
      const { result, rerender } = renderHook(
        ({ context }) =>
          useDesignerPointerInteraction<{ pointerId: number; position: number }>(context),
        { initialProps: { context: 'page-a' } },
      );
      act(() => result.current.begin({ pointerId: 2, position: 0 }, target));
      act(() => result.current.preview({ pointerId: 2, position: 8 }));
      act(() => {
        if (reason === 'escape') {
          const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
          window.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
        } else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
        else if (reason === 'context') rerender({ context: 'page-b' });
        else if (reason === 'capture') result.current.cancelPointer(2);
        else result.current.cancel();
      });
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(cancelFrame).toHaveBeenCalledWith(7);
      expect(result.current.get()).toBeNull();
      expect(result.current.interaction).toBeNull();
      expect(release).toHaveBeenCalledTimes(1);
      expect(result.current.end(2)).toBeNull();
    },
  );

  it('ignores a second pointer and unrelated cancellation or completion', () => {
    const { target } = captureTarget();
    const context = {};
    const { result, unmount } = renderHook(() => useDesignerPointerInteraction(context));
    act(() => result.current.begin({ pointerId: 1 }, target));
    act(() => {
      result.current.begin({ pointerId: 2 }, target);
      result.current.cancelPointer(2);
      expect(result.current.end(2)).toBeNull();
    });
    expect(result.current.get()?.pointerId).toBe(1);
    const release = target.releasePointerCapture;
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
