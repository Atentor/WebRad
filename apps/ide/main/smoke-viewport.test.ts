import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeSmokeViewport } from './smoke-viewport';

afterEach(() => vi.useRealTimers());

function smokeWindow(nativeSize: readonly number[], rendererSize = nativeSize) {
  return {
    setContentSize: vi.fn(),
    getContentSize: vi.fn(() => [...nativeSize]),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1080, height: 728 })),
    webContents: {
      executeJavaScript: vi.fn(async () => ({ width: rendererSize[0], height: rendererSize[1] })),
    },
  };
}

describe('native smoke viewports', () => {
  it.each([760, 700])(
    'preserves responsive width with a native content height of %i',
    async (height) => {
      const window = smokeWindow([1080, height]);
      await expect(resizeSmokeViewport(window, { width: 1080, height: 760 })).resolves.toEqual({
        width: 1080,
        height,
      });
      expect(window.setContentSize).toHaveBeenCalledExactlyOnceWith(1080, 760, false);
    },
  );

  it('waits for both the asynchronous native resize and the renderer to reach its actual height', async () => {
    vi.useFakeTimers();
    const window = smokeWindow([1600, 900]);
    let rendererHeight = 900;
    window.setContentSize.mockImplementation(() => {
      setTimeout(() => window.getContentSize.mockReturnValue([1080, 700]), 20);
      setTimeout(() => {
        rendererHeight = 700;
      }, 80);
    });
    window.webContents.executeJavaScript.mockImplementation(async () => ({
      width: window.getContentSize()[0],
      height: rendererHeight,
    }));
    const result = resizeSmokeViewport(window, { width: 1080, height: 760 });
    const completed = vi.fn();
    void result.then(completed);
    await vi.advanceTimersByTimeAsync(70);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toEqual({ width: 1080, height: 700 });
  });

  it.each([
    ['a different responsive width', [1079, 700]],
    ['zero height', [1080, 0]],
    ['negative height', [1080, -1]],
    ['an invalid height', [1080, Number.NaN]],
    ['a larger height than requested', [1080, 761]],
  ] as const)('rejects %s with native and renderer evidence', async (_description, size) => {
    vi.useFakeTimers();
    const window = smokeWindow(size);
    const result = resizeSmokeViewport(window, { width: 1080, height: 760 });
    const rejection = expect(result).rejects.toThrow('Smoke viewport resize timed out:');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(window.getBounds).toHaveBeenCalledOnce();
  });

  it('rejects a request with invalid dimensions before resizing', async () => {
    const window = smokeWindow([1080, 700]);
    await expect(resizeSmokeViewport(window, { width: 1080, height: Number.NaN })).rejects.toThrow(
      'Invalid smoke viewport request:',
    );
    expect(window.setContentSize).not.toHaveBeenCalled();
  });
});
