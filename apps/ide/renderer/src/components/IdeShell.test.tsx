// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdeShell } from './IdeShell';

const originalWidth = window.innerWidth;
const originalCapture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
const originalHasCapture = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'hasPointerCapture',
);
const originalRelease = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'releasePointerCapture',
);
let notifyResize: ResizeObserverCallback | undefined;
const disconnectObserver = vi.fn();
const releaseCapture = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1000 });
  notifyResize = undefined;
  disconnectObserver.mockReset();
  releaseCapture.mockReset();
  const captures = new WeakMap<HTMLElement, number>();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: function (this: HTMLElement, pointerId: number): void {
        captures.set(this, pointerId);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value: function (this: HTMLElement, pointerId: number): boolean {
        return captures.get(this) === pointerId;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value: function (this: HTMLElement, pointerId: number): void {
        releaseCapture(pointerId);
        captures.delete(this);
      },
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      public constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }
      public observe(): void {}
      public disconnect(): void {
        disconnectObserver();
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: originalWidth,
  });
  for (const [key, descriptor] of [
    ['setPointerCapture', originalCapture],
    ['hasPointerCapture', originalHasCapture],
    ['releasePointerCapture', originalRelease],
  ] as const) {
    if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, key);
    else Object.defineProperty(HTMLElement.prototype, key, descriptor);
  }
});

function shell(inspector = true): ReturnType<typeof render> {
  return render(
    <IdeShell
      toolbar={<div>Toolbar</div>}
      activity={<nav>Activity</nav>}
      explorer={<div>Elements</div>}
      palette={<div>Palette</div>}
      editor={<div>Canvas</div>}
      inspector={inspector ? <div>Inspector</div> : null}
      bottom={null}
      status={<div>Status</div>}
    />,
  );
}

function sidebarWidths(): { readonly left: number; readonly right: number } {
  const grid = document.querySelector<HTMLElement>('.wr-workbench')?.style.gridTemplateColumns;
  if (grid === undefined) throw new Error('Expected workbench grid.');
  const sizes = /^40px (\d+)px 1px minmax\(240px, 1fr\) (?:1px (\d+)px|0px 0px)$/.exec(grid);
  if (sizes === null) throw new Error(`Unexpected grid: ${grid}`);
  return { left: Number(sizes[1]), right: Number(sizes[2] ?? 0) };
}

function pointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientX: number,
  pointerId = 1,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: 0 },
  });
  fireEvent(element, event);
}

function observedWidth(width: number): void {
  if (notifyResize === undefined) throw new Error('Expected resize subscription.');
  const rect = { width } as DOMRectReadOnly;
  const entry = { contentRect: rect } as ResizeObserverEntry;
  const callback = notifyResize;
  act(() => callback([entry], {} as ResizeObserver));
}

describe('IdeShell sidebar resizing', () => {
  it('starts with the requested sidebar widths and reserves a visible canvas', () => {
    shell();
    expect(sidebarWidths()).toEqual({ left: 250, right: 360 });
    const { left, right } = sidebarWidths();
    expect(1000 - 40 - 2 - left - right).toBeGreaterThanOrEqual(240);
  });

  it('limits either sidebar drag so the inspector and 240px canvas remain visible', () => {
    shell();
    const left = screen.getByRole('separator', { name: 'Resize elements sidebar' });
    pointer(left, 'pointerdown', 250);
    pointer(left, 'pointermove', 900);
    pointer(left, 'pointerup', 900);
    expect(sidebarWidths()).toEqual({ left: 358, right: 360 });

    const right = screen.getByRole('separator', { name: 'Resize inspector' });
    pointer(right, 'pointerdown', 640);
    pointer(right, 'pointermove', 200);
    pointer(right, 'pointerup', 200);
    const sizes = sidebarWidths();
    expect(sizes).toEqual({ left: 358, right: 360 });
    expect(1000 - 40 - 2 - sizes.left - sizes.right).toBe(240);
  });

  it('clamps wide sidebars after a window shrink and starts the next drag from displayed widths', () => {
    window.innerWidth = 1640;
    shell();
    const left = screen.getByRole('separator', { name: 'Resize elements sidebar' });
    const right = screen.getByRole('separator', { name: 'Resize inspector' });
    pointer(left, 'pointerdown', 250);
    pointer(left, 'pointermove', 700);
    pointer(left, 'pointerup', 700);
    pointer(right, 'pointerdown', 1200);
    pointer(right, 'pointermove', 800);
    pointer(right, 'pointerup', 800);
    expect(sidebarWidths()).toEqual({ left: 420, right: 440 });

    observedWidth(1000);
    expect(sidebarWidths()).toEqual({ left: 278, right: 440 });
    pointer(left, 'pointerdown', 278);
    pointer(left, 'pointermove', 258);
    pointer(left, 'pointerup', 258);
    expect(sidebarWidths()).toEqual({ left: 258, right: 440 });
  });

  it('uses the viewport resize fallback and preserves sidebar minimum widths', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    window.innerWidth = 1640;
    shell();
    const left = screen.getByRole('separator', { name: 'Resize elements sidebar' });
    const right = screen.getByRole('separator', { name: 'Resize inspector' });
    pointer(left, 'pointerdown', 250);
    pointer(left, 'pointermove', 900);
    pointer(left, 'pointerup', 900);
    pointer(right, 'pointerdown', 1200);
    pointer(right, 'pointermove', 800);
    pointer(right, 'pointerup', 800);
    expect(sidebarWidths()).toEqual({ left: 420, right: 440 });
    window.innerWidth = 1000;
    fireEvent(window, new Event('resize'));
    expect(sidebarWidths()).toEqual({ left: 278, right: 440 });
    pointer(left, 'pointerdown', 278);
    pointer(left, 'pointermove', -200);
    pointer(left, 'pointerup', -200);
    pointer(right, 'pointerdown', 700);
    pointer(right, 'pointermove', 1200);
    pointer(right, 'pointerup', 1200);
    expect(sidebarWidths()).toEqual({ left: 180, right: 220 });
  });

  it('releases a canceled drag and ignores subsequent or unrelated pointer movement', () => {
    shell();
    const left = screen.getByRole('separator', { name: 'Resize elements sidebar' });
    pointer(left, 'pointerdown', 250, 7);
    pointer(left, 'pointermove', 300, 8);
    expect(sidebarWidths().left).toBe(250);
    pointer(left, 'pointermove', 300, 7);
    expect(sidebarWidths().left).toBe(300);
    pointer(left, 'pointercancel', 300, 7);
    expect(releaseCapture).toHaveBeenCalledWith(7);
    pointer(left, 'pointermove', 320, 7);
    expect(sidebarWidths().left).toBe(300);
  });

  it('reclaims inspector space when hidden and disconnects observation on unmount', () => {
    const { unmount } = shell(false);
    expect(screen.queryByRole('separator', { name: 'Resize inspector' })).toBeNull();
    const left = screen.getByRole('separator', { name: 'Resize elements sidebar' });
    pointer(left, 'pointerdown', 250);
    pointer(left, 'pointermove', 900);
    pointer(left, 'pointerup', 900);
    expect(sidebarWidths()).toEqual({ left: 420, right: 0 });
    unmount();
    expect(disconnectObserver).toHaveBeenCalledOnce();
  });
});
