import type { BrowserWindow, WebContents } from 'electron';
import { applicationWindowIconPath } from './application-icon';
import { isPublishedPreviewUrl } from './preview-server';

/** Only a report Blob created by a live compiler Preview may open a window. */
export function reportPreviewOrigin(
  target: { readonly url: string; readonly frameName: string },
  frameUrls: readonly string[],
): string | undefined {
  if (target.frameName !== 'webrad-report') return undefined;
  try {
    const blob = new URL(target.url);
    if (blob.protocol !== 'blob:' || !/\/[\da-f-]{36}$/iu.test(blob.pathname)) return undefined;
    return frameUrls.some(
      (url) => isPublishedPreviewUrl(url) && new URL(url).origin === blob.origin,
    )
      ? blob.origin
      : undefined;
  } catch {
    return undefined;
  }
}

/** Report children are ordinary sandboxed browser windows with no preload bridge. */
export function installReportPreviewWindows(contents: WebContents): void {
  const children = new Set<BrowserWindow>();
  contents.once('destroyed', () => {
    for (const child of children) if (!child.isDestroyed()) child.destroy();
    children.clear();
  });
  contents.on('did-create-window', (child, details) => {
    const origin = new URL(details.url).origin;
    children.add(child);
    child.removeMenu();
    child.once('closed', () => children.delete(child));
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-attach-webview', (event) => event.preventDefault());
    child.webContents.on('will-navigate', (event, url) => {
      try {
        const target = new URL(url);
        if (target.protocol !== 'blob:' || target.origin !== origin) event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    child.webContents.on('will-redirect', (event) => event.preventDefault());
  });
  contents.setWindowOpenHandler((details) => {
    const origin = reportPreviewOrigin(
      details,
      contents.mainFrame.framesInSubtree.map((frame) => frame.url),
    );
    if (origin === undefined) return { action: 'deny' };
    return {
      action: 'allow',
      // Native creation preserves the WindowProxy returned to the calling frame.
      // Blob navigation permits overriding preload (about:blank does not).
      overrideBrowserWindowOptions: {
        title: 'Report preview',
        width: 1100,
        height: 800,
        autoHideMenuBar: true,
        icon: applicationWindowIconPath(),
        webPreferences: {
          preload: undefined,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          webviewTag: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          session: contents.session,
        },
      },
    };
  });
}
