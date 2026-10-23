// @vitest-environment jsdom
import type { BrowserWindow } from 'electron';
import { afterEach, expect, it, vi } from 'vitest';
import { assertPreviewTitle } from '../apps/ide/main/page-title-smoke';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function shell(): void {
  document.body.innerHTML = `
    <button aria-label="Build and run (F9)"></button>
    <span class="wr-toolbar-save-state">Saved</span>
    <div class="wr-bottom-panel">COMPILER: Build started.</div>`;
}

it('checks the completed F9 frame after compilation blocks the next polling turn', async () => {
  shell();
  const now = Date.now();
  let elapsed = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now + elapsed);
  let polls = 0;
  const preview = {
    url: 'https://preview.test/',
    frames: [],
    executeJavaScript: vi.fn(async (expression: string) =>
      expression.includes('Navigate(')
        ? { hash: '', path: '/index' }
        : { title: 'Expected title', mounted: true },
    ),
  };
  const onKey = vi.fn((event: KeyboardEvent) => event.preventDefault());
  const run = document.querySelector<HTMLButtonElement>('button')!;
  run.disabled = true;
  const enabled = setTimeout(() => {
    run.disabled = false;
  }, 0);
  window.addEventListener('keydown', onKey);
  const browser = {
    webContents: {
      mainFrame: { url: 'https://ide.test/', frames: [preview] },
      executeJavaScript: async (expression: string) => {
        const result: unknown = globalThis.eval(expression);
        if (expression.includes('url.length > 0')) {
          polls += 1;
          if (polls === 1) {
            // Simulate the main-process event loop resuming after compilation:
            // the Preview exists, but the previously sampled predicate was false.
            setTimeout(() => {
              elapsed = 20_001;
              const iframe = document.createElement('iframe');
              iframe.title = 'WebRAD application preview';
              iframe.src = preview.url;
              document.body.append(iframe);
            }, 0);
          }
        }
        return result;
      },
    },
  } as unknown as BrowserWindow;
  try {
    await assertPreviewTitle(browser, 'Expected title', 'root');
    expect(polls).toBe(2);
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(preview.executeJavaScript).toHaveBeenCalledTimes(2);
  } finally {
    clearTimeout(enabled);
    window.removeEventListener('keydown', onKey);
  }
});

it('retains the deadline and reports compiler output when F9 fails', async () => {
  shell();
  document.querySelector('.wr-bottom-panel')!.textContent =
    'COMPILER: Build failed: invalid source';
  const now = Date.now();
  let elapsed = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now + elapsed);
  const onKey = (event: KeyboardEvent): void => event.preventDefault();
  window.addEventListener('keydown', onKey);
  const browser = {
    webContents: {
      executeJavaScript: async (expression: string) => {
        const result: unknown = globalThis.eval(expression);
        if (expression.includes('url.length > 0')) elapsed = 20_001;
        return result;
      },
    },
  } as unknown as BrowserWindow;
  try {
    await expect(assertPreviewTitle(browser, 'Expected title', 'root')).rejects.toThrow(
      'Build failed: invalid source',
    );
  } finally {
    window.removeEventListener('keydown', onKey);
  }
});
