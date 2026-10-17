// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMonacoFontMetrics } from './monaco-font-metrics';

const remeasureFonts = vi.hoisted(() => vi.fn());
vi.mock('monaco-editor/editor', () => ({ editor: { remeasureFonts } }));

function fontLoadingSource() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    resolve = resolveReady;
    reject = rejectReady;
  });
  const fonts = Object.assign(new EventTarget(), { ready });
  return { fonts, resolve, reject };
}

beforeEach(() => vi.clearAllMocks());

describe('Monaco font metrics lifecycle', () => {
  it('replaces initial fallback measurements and refreshes later font loads', async () => {
    const { fonts, resolve } = fontLoadingSource();
    const editor = { layout: vi.fn() };
    const observer = observeMonacoFontMetrics(editor, fonts);

    expect(remeasureFonts).not.toHaveBeenCalled();
    resolve();
    await fonts.ready;
    expect(remeasureFonts).toHaveBeenCalledOnce();
    expect(editor.layout).toHaveBeenCalledOnce();
    expect(remeasureFonts.mock.invocationCallOrder[0]).toBeLessThan(
      editor.layout.mock.invocationCallOrder[0] ?? 0,
    );

    fonts.dispatchEvent(new Event('loadingdone'));
    expect(remeasureFonts).toHaveBeenCalledTimes(2);
    expect(editor.layout).toHaveBeenCalledTimes(2);
    observer.dispose();
  });

  it('remeasures the actual fallback after a font fails to load', async () => {
    const { fonts, reject } = fontLoadingSource();
    const editor = { layout: vi.fn() };
    const observer = observeMonacoFontMetrics(editor, fonts);

    reject(new Error('Font unavailable'));
    await fonts.ready.catch(() => undefined);
    expect(remeasureFonts).toHaveBeenCalledOnce();
    fonts.dispatchEvent(new Event('loadingerror'));
    expect(editor.layout).toHaveBeenCalledTimes(2);
    observer.dispose();
  });

  it('removes font listeners and ignores a pending load after editor unmount', async () => {
    const { fonts, resolve } = fontLoadingSource();
    const removeListener = vi.spyOn(fonts, 'removeEventListener');
    const editor = { layout: vi.fn() };
    const observer = observeMonacoFontMetrics(editor, fonts);

    observer.dispose();
    expect(removeListener).toHaveBeenCalledWith('loadingdone', expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith('loadingerror', expect.any(Function));
    fonts.dispatchEvent(new Event('loadingdone'));
    fonts.dispatchEvent(new Event('loadingerror'));
    resolve();
    await fonts.ready;
    expect(remeasureFonts).not.toHaveBeenCalled();
    expect(editor.layout).not.toHaveBeenCalled();
  });

  it('supports environments without the font loading API', () => {
    const editor = { layout: vi.fn() };
    const observer = observeMonacoFontMetrics(editor);
    observer.dispose();
    expect(remeasureFonts).not.toHaveBeenCalled();
  });
});
