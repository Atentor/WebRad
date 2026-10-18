import type { editor } from 'monaco-editor/editor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreMonacoViewState } from './monaco-view-state';

afterEach(() => vi.unstubAllGlobals());

describe('deferred Monaco viewport restoration', () => {
  it.each(['fonts pending', 'frame queued', 'unchanged', 'disposed editor'] as const)(
    'handles %s without applying an obsolete viewport',
    async (scenario) => {
      let resolveFonts!: () => void;
      const ready = new Promise<void>((resolve) => {
        resolveFonts = resolve;
      });
      let frame: FrameRequestCallback | undefined;
      vi.stubGlobal('document', { fonts: { ready } });
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      });
      const target = {
        getDomNode: vi.fn(() => (scenario === 'disposed editor' ? null : ({} as HTMLElement))),
        layout: vi.fn(),
        render: vi.fn(),
        restoreViewState: vi.fn(),
      };
      const state: editor.ICodeEditorViewState = {
        cursorState: [],
        viewState: {
          scrollLeft: 0,
          firstPosition: { lineNumber: 1, column: 1 },
          firstPositionDeltaTop: 0,
        },
        contributionsState: {},
      };
      const restoration = restoreMonacoViewState(target, state);
      expect(target.restoreViewState).toHaveBeenCalledExactlyOnceWith(state);
      if (scenario === 'fonts pending') restoration.dispose();
      resolveFonts();
      await ready;
      if (scenario === 'frame queued') restoration.dispose();
      frame?.(0);
      expect(target.restoreViewState).toHaveBeenCalledTimes(scenario === 'unchanged' ? 2 : 1);
      restoration.dispose();
    },
  );
});
