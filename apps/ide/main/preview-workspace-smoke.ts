import { Menu, type BrowserWindow, type KeyboardInputEvent, type WebFrameMain } from 'electron';
import { isPreviewMenuMode } from './menu';
import { loadProjectFiles } from './project-files';

async function waitForPreviewState(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 15000;
  for (;;) {
    if (await window.webContents.executeJavaScript(expression, true) === true) return;
    if (Date.now() >= deadline) throw new Error('Preview recovery smoke timed out: ' + expression);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Author a real compiler error, review it through Stop, then restore the source through Monaco. */
export async function assertPreviewBuildErrorSmoke(
  window: BrowserWindow,
  projectPath: string,
  sendKey: (key: string, modifiers?: NonNullable<KeyboardInputEvent['modifiers']>) => void,
): Promise<void> {
  window.webContents.send('webrad:menu-command', 'file.save');
  await waitForPreviewState(window, "document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'");
  const original = await loadProjectFiles(projectPath);
  const focusEditor = async (): Promise<void> => {
    await window.webContents.executeJavaScript(`document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea')?.focus()`, true);
    await waitForPreviewState(window, "document.activeElement?.closest('.monaco-editor') !== null");
  };
  const command = process.platform === 'darwin' ? 'meta' : 'control';
  await focusEditor();
  sendKey(process.platform === 'darwin' ? 'Up' : 'Home', [command]);
  await waitForPreviewState(window, "document.querySelector('.monaco-editor')?.getAttribute('data-cursor-position') === 'Line 1, column 1'");
  await window.webContents.insertText("const uxPreviewFailure: number = 'ux-preview-error';\n");
  await waitForPreviewState(window, "[...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes('uxPreviewFailure'))");
  await clickPreviewControlSmoke(window, 'button[aria-label="Build and run (F9)"]');
  await waitForPreviewState(window, "document.querySelector('.wr-preview-state')?.textContent?.includes('Preview build failed') === true && document.querySelector('.wr-preview-diagnostics code')?.textContent?.includes('index.ts') === true");
  await stopPreviewSmoke(window);
  await waitForPreviewState(window, "document.querySelector('.wr-view-tabs [aria-selected=\"true\"]')?.getAttribute('aria-label') === 'Code' && document.querySelector('.monaco-editor')?.getAttribute('data-cursor-position')?.startsWith('Line 1,') === true && document.querySelector('.wr-bottom-slot') !== null");
  await focusEditor();
  sendKey(process.platform === 'darwin' ? 'Up' : 'Home', [command]);
  sendKey('Down', ['shift']);
  sendKey('Backspace');
  await waitForPreviewState(window, "![...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes('uxPreviewFailure'))");
  window.webContents.send('webrad:menu-command', 'file.save');
  await waitForPreviewState(window, "document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'");
  const restored = await loadProjectFiles(projectPath);
  if (Object.entries(original.userSources).some(([key, source]) => restored.userSources[key] !== source))
    throw new Error('Preview recovery smoke did not restore the authored source exactly.');
}

function nativeMenuMatchesPreviewMode(window: BrowserWindow, preview: boolean): boolean {
  if (!isPreviewMenuMode(window, preview)) return false;
  if (process.platform === 'darwin') return (Menu.getApplicationMenu() === null) === preview;
  // Smoke windows stay hidden, so verify menu visibility only for visible windows.
  return !window.isVisible() || window.isMenuBarVisible() === !preview;
}

async function clickPreviewControlSmoke(
  window: BrowserWindow,
  selector: string,
): Promise<{ x: number; y: number }> {
  const position: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!(button instanceof HTMLButtonElement)) throw new Error('Missing Preview control: ' + ${JSON.stringify(selector)});
      const rect = button.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      if (rect.width <= 0 || rect.height <= 0 || !button.contains(document.elementFromPoint(x, y)))
        throw new Error('Preview control is not visible or reachable: ' + ${JSON.stringify(selector)});
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
    throw new Error('Invalid Preview control coordinates.');
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
  return coordinates;
}

/** Exercise the Preview toolbar without reloading the compiled application. */
export async function assertPreviewViewportsSmoke(
  window: BrowserWindow,
  frame: WebFrameMain,
): Promise<void> {
  const stateExpression = `JSON.stringify({
    timeOrigin: performance.timeOrigin,
    url: location.href,
    value: document.querySelector('[data-webrad-name="EDTNome"]')?.value
  })`;
  const initialState: unknown = await frame.executeJavaScript(stateExpression, true);
  const desktopWidth: unknown = await window.webContents.executeJavaScript('innerWidth', true);
  if (typeof initialState !== 'string' || typeof desktopWidth !== 'number')
    throw new Error('Missing initial Preview viewport state.');
  const deadline = Date.now() + 10000;
  for (const [label, name, width] of [
    ['Tablet', 'tablet', 768],
    ['Mobile', 'mobile', 390],
    ['Desktop', 'desktop', desktopWidth],
  ] as const) {
    await clickPreviewControlSmoke(
      window,
      '.wr-preview-viewports button[aria-label="' + label + '"]',
    );
    let geometry: unknown;
    let application: unknown;
    for (;;) {
      geometry = await window.webContents.executeJavaScript(
        `(() => {
          const content = document.querySelector('.wr-preview-content');
          const viewport = document.querySelector('.wr-preview-viewport');
          const frame = viewport?.querySelector('iframe');
          const selected = [...document.querySelectorAll('.wr-preview-viewports [aria-pressed="true"]')];
          if (!(content instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !frame) return false;
          const rect = frame.getBoundingClientRect();
          return viewport.dataset.viewport === ${JSON.stringify(name)} &&
            selected.length === 1 && selected[0].getAttribute('aria-label') === ${JSON.stringify(label)} &&
            Math.abs(rect.width - ${width}) <= 1 &&
            Math.abs(rect.left - content.getBoundingClientRect().left - Math.max(0, (content.clientWidth - ${width}) / 2)) <= 1;
        })()`,
        true,
      );
      application = await frame.executeJavaScript(
        `innerWidth === ${width} &&
          matchMedia('(max-width: 600px)').matches === ${width <= 600} &&
          (${stateExpression}) === ${JSON.stringify(initialState)}`,
        true,
      );
      if (geometry === true && application === true) break;
      if (Date.now() >= deadline)
        throw new Error(
          'Preview viewport did not preserve geometry, media queries or application state: ' +
            JSON.stringify({ name, width, geometry, application }),
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Follow real router changes while retaining the same compiled application document. */
export async function assertPreviewRouteSmoke(window: BrowserWindow, frame: WebFrameMain): Promise<void> {
  const timeOrigin: unknown = await frame.executeJavaScript('performance.timeOrigin', true);
  for (const route of ['404', 'index']) {
    await frame.executeJavaScript(`Navigate(${JSON.stringify(route)}, { replace: true })`, true);
    const deadline = Date.now() + 10000;
    for (;;) {
      const synchronized: unknown = await window.webContents.executeJavaScript(
        `document.querySelector('input[aria-label="Preview URL"]')?.value === ${JSON.stringify('/' + route)}`, true);
      if (synchronized === true) break;
      if (Date.now() >= deadline) throw new Error('Preview address did not follow route /' + route);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (await frame.executeJavaScript('performance.timeOrigin', true) !== timeOrigin)
      throw new Error('Preview route synchronization reloaded the application.');
  }
}

/** Stop through the visible control, including when focus belongs to the application iframe. */
export async function stopPreviewSmoke(window: BrowserWindow): Promise<void> {
  const coordinates = await clickPreviewControlSmoke(window, 'button[aria-label="Stop preview"]');
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
