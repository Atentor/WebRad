import type { DebugState } from '../shared/debugger-contracts';

interface DebugWindowTarget {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  readonly webContents: { isDestroyed(): boolean; focus(): void };
}

/** Present each new pause once; preference updates must preserve the user's current focus. */
export function createDebugPausePresenter(window: DebugWindowTarget): (state: DebugState) => void {
  let lastPause: string | null = null;
  return (state) => {
    const pause =
      state.status === 'paused'
        ? `${state.sessionId}:${state.frames[0]?.id ?? state.reason ?? ''}`
        : null;
    const changed = pause !== lastPause;
    lastPause = pause;
    if (!changed || pause === null || window.isDestroyed() || window.webContents.isDestroyed())
      return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    window.webContents.focus();
  };
}
