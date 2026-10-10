import { describe, expect, it, vi } from 'vitest';
import type { DebugState } from '../shared/debugger-contracts';
import { createDebugPausePresenter } from './debugger-presentation';

function fixture() {
  const calls: string[] = [];
  const window = {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(() => calls.push('restore')),
    show: vi.fn(() => calls.push('show')),
    focus: vi.fn(() => calls.push('window focus')),
    webContents: {
      isDestroyed: vi.fn(() => false),
      focus: vi.fn(() => calls.push('renderer focus')),
    },
  };
  const paused: DebugState = {
    sessionId: 'session',
    status: 'paused',
    breakpoints: [],
    frames: [
      {
        id: 'frame',
        name: 'click',
        scopes: [],
        thisValue: { type: 'undefined', description: 'undefined' },
      },
    ],
  };
  return { window, calls, paused, present: createDebugPausePresenter(window) };
}

describe('debugger pause presentation', () => {
  it('restores a minimized IDE and brings its renderer forward on a breakpoint', () => {
    const f = fixture();
    f.window.isMinimized.mockReturnValue(true);
    f.present(f.paused);
    expect(f.calls).toEqual(['restore', 'show', 'window focus', 'renderer focus']);
  });

  it('preserves console focus when breakpoint preferences change during the same pause', () => {
    const f = fixture();
    f.present(f.paused);
    f.calls.length = 0;
    f.present({
      ...f.paused,
      breakpoints: [{ path: 'pages/Main.ts', line: 2, enabled: true, verified: true }],
    });
    expect(f.calls).toEqual([]);
  });

  it('presents each new stepping pause and returns focus after resume reaches another breakpoint', () => {
    const f = fixture();
    f.present(f.paused);
    f.present({ ...f.paused, frames: [{ ...f.paused.frames[0]!, id: 'next-frame' }] });
    f.present({ ...f.paused, status: 'running', frames: [] });
    expect(f.window.focus).toHaveBeenCalledTimes(2);
    f.present(f.paused);
    expect(f.window.focus).toHaveBeenCalledTimes(3);
  });

  it('leaves the Preview in front while running and ignores destroyed windows', () => {
    const f = fixture();
    f.present({ ...f.paused, status: 'running', frames: [] });
    expect(f.calls).toEqual([]);
    f.window.isDestroyed.mockReturnValue(true);
    f.present(f.paused);
    expect(f.calls).toEqual([]);
    const closedRenderer = fixture();
    closedRenderer.window.webContents.isDestroyed.mockReturnValue(true);
    closedRenderer.present(closedRenderer.paused);
    expect(closedRenderer.calls).toEqual([]);
  });
});
