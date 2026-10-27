import { Menu, type BrowserWindow } from 'electron';
import { isPreviewMenuMode } from './menu';

function nativeMenuMatchesPreviewMode(window: BrowserWindow, preview: boolean): boolean {
  if (!isPreviewMenuMode(window, preview)) return false;
  if (process.platform === 'darwin') return (Menu.getApplicationMenu() === null) === preview;
  // Smoke windows stay hidden, so verify menu visibility only for visible windows.
  return !window.isVisible() || window.isMenuBarVisible() === !preview;
}

/** Stop through the visible control, including when focus belongs to the application iframe. */
export async function stopPreviewSmoke(window: BrowserWindow): Promise<void> {
  const position: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('button[aria-label="Stop preview"]');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Missing Stop preview control.');
      const rect = button.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      if (rect.width <= 0 || rect.height <= 0 || !button.contains(document.elementFromPoint(x, y)))
        throw new Error('Stop preview is not visible or reachable.');
      return { x, y };
    })()`,
    true,
  );
  if (
    typeof position !== 'object' ||
    position === null ||
    !('x' in position) ||
    !('y' in position) ||
    typeof position.x !== 'number' ||
    typeof position.y !== 'number'
  )
    throw new Error('Invalid Stop preview coordinates.');
  const coordinates = { x: position.x, y: position.y };
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    ...coordinates,
    button: 'left',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    ...coordinates,
    button: 'left',
    clickCount: 1,
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    if (
      (await window.webContents.executeJavaScript(
        `(() => {
          const host = document.querySelector('.wr-ide-modal-host');
          return host instanceof HTMLElement && getComputedStyle(host).visibility === 'visible' && !host.inert &&
            host.getBoundingClientRect().width > 0 &&
            document.querySelector('.wr-preview-workspace') === null &&
            document.querySelector('iframe[title="WebRAD application preview"]') === null;
        })()`,
        true,
      )) === true &&
      nativeMenuMatchesPreviewMode(window, false)
    )
      return;
    if (Date.now() >= deadline) {
      const renderer = await window.webContents.executeJavaScript(
        `(() => {
          const host = document.querySelector('.wr-ide-modal-host');
          const stop = document.querySelector('button[aria-label="Stop preview"]');
          return {
            host: host instanceof HTMLElement ? {
              visibility: getComputedStyle(host).visibility, inert: host.inert,
              width: host.getBoundingClientRect().width
            } : null,
            preview: document.querySelector('.wr-preview-workspace') !== null,
            frame: document.querySelector('iframe[title="WebRAD application preview"]') !== null,
            focus: document.activeElement?.outerHTML?.slice(0, 500),
            stop: stop?.getBoundingClientRect().toJSON(),
            viewport: { width: innerWidth, height: innerHeight }
          };
        })()`,
        true,
      );
      throw new Error(
        `Stop preview did not restore the IDE: ${JSON.stringify({
          renderer,
          expectedPreviewMenuMode: false,
          previewMenuModeApplied: isPreviewMenuMode(window, false),
          menuVisible: window.isMenuBarVisible(),
          windowVisible: window.isVisible(),
          applicationMenu: Menu.getApplicationMenu() !== null,
          coordinates,
        })}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function assertExclusivePreviewSmoke(window: BrowserWindow): Promise<void> {
  if (!nativeMenuMatchesPreviewMode(window, true))
    throw new Error('The native IDE menu is visible during Preview.');
  const before: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('.wr-view-tabs [aria-selected="true"]')?.getAttribute('aria-label')`,
    true,
  );
  for (const command of ['view.design', 'edit.delete', 'file.newProject', 'run.run'])
    window.webContents.send('webrad:menu-command', command);
  const evidence: unknown = await window.webContents.executeJavaScript(
    `(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true }));
      const host = document.querySelector('.wr-ide-modal-host');
      const frame = document.querySelector('iframe[title="WebRAD application preview"]');
      const stop = document.querySelector('button[aria-label="Stop preview"]');
      const address = document.querySelector('input[aria-label="Preview URL"]');
      if (!(host instanceof HTMLElement) || !(frame instanceof HTMLIFrameElement) ||
          !(stop instanceof HTMLButtonElement) || !(address instanceof HTMLInputElement)) return false;
      const rect = frame.getBoundingClientRect();
      return getComputedStyle(host).visibility === 'hidden' && host.inert && host.getAttribute('aria-hidden') === 'true' &&
        host.getBoundingClientRect().width > 0 &&
        Math.abs(rect.left) <= 1 && Math.abs(rect.width - innerWidth) <= 1 &&
        Math.abs(rect.bottom - innerHeight) <= 1 && Math.abs(rect.top - 42) <= 1 &&
        stop.getBoundingClientRect().width > 0 &&
        address.readOnly && address.value === '/index' && address.title === '/index' &&
        address.getBoundingClientRect().width > 0 &&
        document.querySelector('[role="dialog"]') === null &&
        document.querySelector('.wr-view-tabs [aria-selected="true"]')?.getAttribute('aria-label') === ${JSON.stringify(before)};
    })()`,
    true,
  );
  if (evidence !== true)
    throw new Error('Preview is not exclusive, does not fill the window, or allows IDE commands.');
}
