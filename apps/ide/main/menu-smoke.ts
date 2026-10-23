import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { parseWebMenuConfiguration } from '@webrad/runtime/menu-model';
import { loadProjectFiles } from './project-files';
/** Registry palette -> transactional editor -> saved model -> desktop and mobile compiled F9. */
export async function runMenuSmoke(
  window: BrowserWindow,
  options: {
    readonly projectPath: string;
    readonly log: (message: string) => void;
  },
): Promise<void> {
  const evaluate = (source: string): Promise<unknown> =>
    window.webContents.executeJavaScript(source, true);
  const ready = async (source: string): Promise<void> => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if ((await evaluate(source)) === true) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Menu smoke timed out: ${source}`);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const field = (label: string): string =>
    `([...document.querySelectorAll('.wr-menu-configuration-dialog label')].find(e => e.firstElementChild?.textContent === ${JSON.stringify(label)})?.querySelector('input,select'))`;
  const input = async (label: string, value: string): Promise<void> => {
    await evaluate(
      `(() => { const input = ${field(label)}; if (!(input instanceof HTMLInputElement)) throw new Error('Missing Menu field: ' + ${JSON.stringify(label)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await ready(`${field(label)}?.value === ${JSON.stringify(value)}`);
  };
  const original = await loadProjectFiles(options.projectPath);
  const page = original.project.pages.find((candidate) => candidate.name === 'PageMain');
  if (!page) throw new Error('Menu smoke has no PageMain.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await ready(
    `[...document.querySelectorAll('.wr-palette-item')].some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Menu')`,
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-palette-item')].find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Menu').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Menu') === true`,
  );
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Menu palette did not create a stable ID.');
  await click('button[aria-label="Configure Menu"]');
  await ready(`document.querySelector('.wr-menu-configuration-dialog') !== null`);
  await input('Label', 'Menu smoke home');
  const editorGeometry: unknown = await evaluate(
    "(() => {\nconst dialog = document.querySelector('.wr-menu-configuration-dialog');\nconst body = dialog.querySelector('.wr-menu-editor-body');\nconst main = dialog.querySelector('.wr-menu-editor-main');\nconst tree = dialog.querySelector('.wr-menu-editor-tree-panel').getBoundingClientRect();\nconst fields = dialog.querySelector('.wr-menu-editor-fields').getBoundingClientRect();\nconst footer = dialog.querySelector('.wr-modal-actions').getBoundingClientRect();\nconst bounds = dialog.getBoundingClientRect();\nconst tabs = [...dialog.querySelectorAll('.wr-menu-editor-tabs > button')];\nreturn { width: bounds.width, available: innerWidth, mainWidth: main.clientWidth,\n fieldsWidth: fields.width, noOverlap: fields.top >= tree.bottom - 1 || fields.left >= tree.right - 1,\n noHorizontalOverflow: body.scrollWidth <= body.clientWidth + 2,\n readableTabs: tabs.every(tab => tab.getBoundingClientRect().width >= 76 && tab.scrollWidth <= tab.clientWidth + 1),\n visibleFooter: footer.bottom <= bounds.bottom + 1 && footer.top >= bounds.top,\n styledSelect: dialog.querySelector('.wr-menu-editor-field select').getBoundingClientRect().height >= 36 };\n})()",
  );
  if (
    !editorGeometry ||
    typeof editorGeometry !== 'object' ||
    !('width' in editorGeometry) ||
    typeof editorGeometry.width !== 'number' ||
    !('available' in editorGeometry) ||
    typeof editorGeometry.available !== 'number' ||
    editorGeometry.width < Math.min(1000, editorGeometry.available - 50) ||
    !('mainWidth' in editorGeometry) ||
    typeof editorGeometry.mainWidth !== 'number' ||
    editorGeometry.mainWidth < Math.min(560, editorGeometry.width - 2) ||
    !('fieldsWidth' in editorGeometry) ||
    typeof editorGeometry.fieldsWidth !== 'number' ||
    editorGeometry.fieldsWidth < Math.min(260, editorGeometry.width - 40) ||
    !('noOverlap' in editorGeometry) ||
    editorGeometry.noOverlap !== true ||
    !('noHorizontalOverflow' in editorGeometry) ||
    editorGeometry.noHorizontalOverflow !== true ||
    !('readableTabs' in editorGeometry) ||
    editorGeometry.readableTabs !== true ||
    !('visibleFooter' in editorGeometry) ||
    editorGeometry.visibleFooter !== true ||
    !('styledSelect' in editorGeometry) ||
    editorGeometry.styledSelect !== true
  )
    throw new Error(
      'Menu configurator layout is compressed or clipped: ' + JSON.stringify(editorGeometry),
    );
  const editorScreenshot = path.resolve('node_modules', '.cache', 'webrad-menu-configurator.png');
  await fs.mkdir(path.dirname(editorScreenshot), { recursive: true });
  window.webContents.invalidate();
  const editorCapture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (editorCapture.isEmpty()) throw new Error('Menu configurator screenshot is empty.');
  await fs.writeFile(editorScreenshot, editorCapture.toPNG());
  options.log(
    'renderer Menu configurator layout passed: ' +
      JSON.stringify(editorGeometry) +
      '; screenshot ' +
      editorScreenshot,
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-tabs button')].find(e => e.textContent === 'Behavior & mobile').click()`,
  );
  await input('Mobile breakpoint (px)', '480');
  await click('.wr-menu-configuration-dialog button[type="submit"]');
  await ready(`document.querySelector('.wr-menu-configuration-dialog') === null`);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(options.projectPath);
  const node = saved.project.pages
    .find((candidate) => candidate.id === page.id)
    ?.components.find((candidate) => candidate.id === id);
  const config = parseWebMenuConfiguration(node?.props.configuration);
  if (
    node?.type !== 'WebMenu' ||
    config.items[0]?.label !== 'Menu smoke home' ||
    config.mobileBreakpoint !== 480 ||
    config.items[1]?.children?.length !== 2
  )
    throw new Error('Menu editor and saved model disagree.');
  const screenshot = path.resolve('node_modules', '.cache', 'webrad-menu-designer.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  window.webContents.invalidate();
  const capture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (capture.isEmpty()) throw new Error('Menu Designer screenshot is empty.');
  await fs.writeFile(screenshot, capture.toPNG());
  const previous = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
  );
  await ready(
    `document.querySelector('button[aria-label="Save (Ctrl+S)"]')?.disabled !== undefined && document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  await evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
  );
  await ready(
    `(() => { const src = document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src'); return Boolean(src && src !== ${JSON.stringify(previous)}); })()`,
  );
  const url = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]').getAttribute('src')`,
  );
  const findFrame = (frame: WebFrameMain): WebFrameMain | undefined =>
    frame.url === url
      ? frame
      : frame.frames.map(findFrame).find((candidate) => candidate !== undefined);
  let frame: WebFrameMain | undefined;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame);
    if (
      frame &&
      (await frame.executeJavaScript(
        `document.querySelector('[data-webrad-id="${id}"] .wr-menu-item') !== null`,
        true,
      )) === true
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!frame) throw new Error('Compiled Menu Preview frame is missing.');
  const desktop = await frame.executeJavaScript(
    `(() => {
    const menu = document.querySelector('[data-webrad-id="${id}"]');
    if (!menu || menu.dataset.menuMobile !== 'false') return false;
    const toggle = () => menu.querySelector('[data-menu-action="collapse"]');
    const width = menu.getBoundingClientRect().width;
    toggle().click();
    if (menu.dataset.menuCollapsed !== 'true' || Math.abs(menu.getBoundingClientRect().width - 72) > 1) return false;
    toggle().click();
    if (Math.abs(menu.getBoundingClientRect().width - width) > 1) return false;
    menu.querySelector('[data-menu-item="home"]').click();
    return menu.querySelector('[data-menu-item="home"]').getAttribute('aria-current') === 'page' && menu.querySelector('.wr-menu-submenu').children.length === 2;
  })()`,
    true,
  );
  if (desktop !== true)
    throw new Error('Menu desktop collapse, selection or submenu projection failed.');
  window.webContents.debugger.attach('1.3');
  try {
    window.webContents.focus();
    await evaluate(`document.querySelector('iframe[title="WebRAD application preview"]').focus()`);
    await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const mobileDeadline = Date.now() + 10000;
    let mobile = false;
    while (Date.now() < mobileDeadline) {
      if (
        (await frame.executeJavaScript(
          `document.querySelector('[data-webrad-id="${id}"]')?.dataset.menuMobile === 'true'`,
          true,
        )) === true
      ) {
        mobile = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!mobile) throw new Error('Menu did not respond to the real mobile viewport.');
    const drawer = await frame.executeJavaScript(
      `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); menu.querySelector('[data-menu-action="open"]').click(); const dialog = menu.querySelector('dialog'); return dialog.open && dialog.contains(document.activeElement) && document.body.style.overflow === 'hidden' && dialog.getBoundingClientRect().width <= innerWidth; })()`,
      true,
    );
    if (drawer !== true)
      throw new Error('Menu mobile drawer lacks modal focus, viewport sizing or scroll lock.');
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    const closed = await frame.executeJavaScript(
      `!document.querySelector('[data-webrad-id="${id}"] dialog').open && document.body.style.overflow !== 'hidden'`,
      true,
    );
    if (closed !== true)
      throw new Error('Menu Escape did not close the drawer and restore scrolling.');
  } finally {
    await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    window.webContents.debugger.detach();
  }
  await click('button[aria-label="Design"]');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);
  for (let index = 0; index < 2; index++) {
    await evaluate(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  }
  await ready(`document.querySelector(${JSON.stringify(tree)}) === null`);
  await click(root);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  options.log(
    `renderer Menu Inspector and F9 passed: nested items, persistence, desktop collapse/selection, mobile viewport, modal focus/Escape, undo; screenshot ${screenshot}`,
  );
}
