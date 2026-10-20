import { shell, type BrowserWindow } from 'electron';

/** Exercise the real renderer/preload/IPC path without launching a browser during smoke. */
export async function runBugReportSmoke(window: BrowserWindow): Promise<void> {
  const originalOpen = shell.openExternal;
  const opened: string[] = [];
  let finish: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const launched = new Promise<void>((resolve, reject) => {
    finish = resolve;
    timeout = setTimeout(() => reject(new Error('Report a bug did not open the browser.')), 5_000);
  });
  shell.openExternal = async (url) => {
    opened.push(url);
    finish?.();
  };
  try {
    await Promise.all([
      launched,
      window.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('button[aria-label="Report a bug"]');
        const debug = document.querySelector('.wr-toolbar-debug');
        if (!(button instanceof HTMLButtonElement) || !debug) throw new Error('Bug report button missing.');
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        if (!button.querySelector('svg path') || button.disabled || rect.width < 28 || rect.height < 28 ||
            rect.right > debug.getBoundingClientRect().left || rect.left < 0 ||
            style.visibility !== 'visible' || style.display === 'none' ||
            style.borderTopStyle !== 'solid' || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
          throw new Error('Bug report button is not visibly highlighted beside Debug.');
        }
        button.click();
      })()`),
    ]);
    if (opened.length !== 1 || opened[0] !== 'https://github.com/Atentor/WebRad/issues') {
      throw new Error(`Bug report opened an unexpected destination: ${JSON.stringify(opened)}`);
    }
  } finally {
    clearTimeout(timeout);
    shell.openExternal = originalOpen;
  }
}
