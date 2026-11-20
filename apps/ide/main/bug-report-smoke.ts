import { Menu, shell, type BrowserWindow } from 'electron';

/** Exercise the Help menu action without launching an external browser during smoke. */
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
        if (document.querySelector('.wr-toolbar, .wr-toolbar-beta, .wr-document-tabs'))
          throw new Error('The removed main toolbar must be absent.');
      })()`).then(() => {
        const report = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Help')
          ?.submenu?.items.find((item) => item.label === 'Report a bug');
        if (!report || !report.enabled || !report.visible)
          throw new Error('Help > Report a bug is missing or unavailable.');
        report.click(report, window, {});
      }),
    ]);
    if (opened.length !== 1 || opened[0] !== 'https://github.com/Atentor/WebRad/issues') {
      throw new Error(`Bug report opened an unexpected destination: ${JSON.stringify(opened)}`);
    }
    const help = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Help');
    const documentation = help?.submenu?.items.find((item) => item.label === 'Documentation');
    if (!documentation || !documentation.enabled || !documentation.visible) {
      throw new Error('Help > Documentation menu item missing or unavailable.');
    }
    documentation.click(documentation, window, {});
    if (opened.slice(1).join() !== 'https://webrad.atentor.com/docs') {
      throw new Error(`Documentation opened an unexpected destination: ${JSON.stringify(opened)}`);
    }
  } finally {
    clearTimeout(timeout);
    shell.openExternal = originalOpen;
  }
}
