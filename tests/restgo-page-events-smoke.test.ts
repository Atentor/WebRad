// @vitest-environment jsdom
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));
vi.mock('../apps/ide/main/preview-server', () => ({}));

import { runRestGoPageEventsSmoke } from '../apps/ide/main/restgo-smoke';

it('waits for event navigation and native editor focus before typing into a mounted Monaco', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-restgo-event-'));
  const writeFile = fs.writeFile;
  // Keep synthetic screenshots out of the real Electron evidence directory.
  const writes = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
    if (String(args[0]).endsWith('webrad-restgo-page-events.png')) return;
    await writeFile(...args);
  });
  const timers: ReturnType<typeof setTimeout>[] = [];
  const handlers = ['PageMainLogin', 'PageMainLogout', 'PageMainUnauthenticated'];
  let currentHandler = '';
  let authoredHandler = '';
  document.body.innerHTML = `
    <button aria-label="Design"></button>
    <button role="treeitem" data-component-id="hello-webrad-component-form-main-v1"></button>
    <button role="tab" aria-label="Events"></button>
    <button aria-label="Save (Ctrl+S)"></button>
    ${['OnLogin', 'OnLogout', 'OnUnauthenticated'].map((name) => `<div class="wr-inspector-event-row"><label>${name}</label></div>`).join('')}
    <div class="monaco-editor"><span></span><textarea class="inputarea"></textarea></div>
    <div class="wr-status-position" aria-label="Line 1, column 1"></div>
  `;
  const editor = document.querySelector('.monaco-editor')!;
  const textarea = editor.querySelector('textarea')!;
  const text = editor.querySelector('span')!;
  const status = document.querySelector('.wr-status-position')!;
  document.querySelectorAll('.wr-inspector-event-row').forEach((row, index) => {
    row.addEventListener('dblclick', () => {
      textarea.blur();
      currentHandler = '';
      text.textContent = '';
      status.setAttribute('aria-label', 'Line 1, column 1');
      // Monaco exists immediately, but native input is unavailable until navigation finishes.
      timers.push(
        setTimeout(() => {
          currentHandler = handlers[index]!;
          text.textContent = currentHandler;
          textarea.focus();
          status.setAttribute('aria-label', 'Line 20, column 5');
        }, 100),
      );
    });
  });
  try {
    await fs.mkdir(path.join(workspace, 'pages'));
    await fs.writeFile(
      path.join(workspace, 'pages', 'PageMain.wrpage'),
      JSON.stringify({
        rootComponentId: 'root',
        components: [
          {
            id: 'root',
            events: {
              OnLogin: handlers[0],
              OnLogout: handlers[1],
              OnUnauthenticated: handlers[2],
            },
          },
        ],
      }),
    );
    await fs.writeFile(
      path.join(workspace, 'pages', 'PageMain.ts'),
      [
        'CustomEvent<WebPageLoginEventDetail>',
        'CustomEvent<WebPageLogoutEventDetail>',
        'async PageMainUnauthenticated(sender: WebPage, event: Event): Promise<void>',
        'const { user } = event.detail;',
      ].join('\n'),
    );
    const log = vi.fn();
    const insertText = vi.fn(async (value: string) => {
      expect(document.activeElement).toBe(textarea);
      expect(currentHandler).toBe('PageMainUnauthenticated');
      authoredHandler = currentHandler;
      text.textContent += value;
    });
    const window = {
      webContents: {
        executeJavaScript: async (expression: string) => globalThis.eval(expression) as unknown,
        insertText,
        capturePage: async () => ({ toPNG: () => Buffer.from('screenshot fixture') }),
      },
    } as unknown as BrowserWindow;
    await runRestGoPageEventsSmoke(window, {
      projectPath: path.join(workspace, 'Fixture.wrproj'),
      log,
    });
    expect(authoredHandler).toBe('PageMainUnauthenticated');
    expect(insertText).toHaveBeenCalledExactlyOnceWith('return;');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('renderer RestGO page Interaction passed:'),
    );
  } finally {
    writes.mockRestore();
    timers.forEach(clearTimeout);
    document.body.innerHTML = '';
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
