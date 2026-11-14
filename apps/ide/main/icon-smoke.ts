import { capturePresentedSmokePage } from './smoke-capture';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { stopPreviewSmoke } from './preview-workspace-smoke';
import { loadProjectFiles } from './project-files';

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  // Compilation can block the main process past the deadline between samples.
  // Read the current renderer state before deciding that the wait has expired.
  for (;;) {
    if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const evidence: unknown = await window.webContents.executeJavaScript(`({
    preview: document.querySelector('.wr-preview-state')?.textContent,
    runDisabled: document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled,
    saveState: document.querySelector('.wr-toolbar-save-state')?.textContent,
    output: document.querySelector('.wr-bottom-panel')?.textContent,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.textContent),
  })`);
  throw new Error(`Icons smoke timed out: ${expression}; evidence: ${JSON.stringify(evidence)}`);
}
async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
    true,
  );
}
function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const found = findFrame(child, url);
    if (found) return found;
  }
  return undefined;
}

/** Palette -> Lucide gallery -> saved model -> isolated compiled F9/native button. */
export async function runIconSmoke(
  window: BrowserWindow,
  { projectPath, log }: { readonly projectPath: string; readonly log: (message: string) => void },
): Promise<void> {
  log('renderer Lucide Icons smoke started');
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((item) => item.name === 'index')!;
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click(window, 'button[aria-label="Design"]');
  await click(window, root);
  await click(window, 'button[role="tab"][aria-label="Properties"]');
  await ready(
    window,
    `Array.from(document.querySelectorAll('.wr-palette-item')).some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Icons')`,
  );
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-palette-item')).find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Icons').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Icon') === true`,
  );
  const id: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
    true,
  );
  if (typeof id !== 'string')
    throw new Error('Icons palette did not insert a stable component ID.');
  const designer = `[data-component-type="WebIcon"][data-component-id=${JSON.stringify(id)}]`;
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  const field = (label: string) =>
    `(() => { const label = [...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)}); return label?.control; })()`;
  await ready(
    window,
    `${field('Mode')}?.value === 'icon' && document.querySelector(${JSON.stringify(designer)})?.textContent === ''`,
  );
  await click(window, '.wr-inspector-icon-picker[aria-label="Icon"]');
  await ready(
    window,
    `document.querySelector('.wr-icon-picker-dialog input[type=search]') instanceof HTMLInputElement`,
  );
  const galleryNames: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const options = [...document.querySelectorAll('[data-icon-picker-option]')];
      return options.length > 1500 && options.every(option => {
        const name = option.querySelector('.wr-icon-picker-name');
        const bounds = name?.getBoundingClientRect();
        return name?.textContent === option.getAttribute('data-icon-picker-option') &&
          bounds?.width > 0 && bounds?.height > 0 &&
          name.scrollWidth <= name.clientWidth + 1 && name.scrollHeight <= name.clientHeight + 1;
      });
    })()`,
    true,
  );
  if (galleryNames !== true) throw new Error('Icon gallery hides or clips canonical icon names.');
  const galleryScreenshotPath = path.resolve('node_modules', '.cache', 'webrad-icons-gallery.png');
  await fs.mkdir(path.dirname(galleryScreenshotPath), { recursive: true });
  window.webContents.invalidate();
  const galleryCapture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (galleryCapture.isEmpty()) throw new Error('Icon gallery screenshot was empty.');
  await fs.writeFile(galleryScreenshotPath, galleryCapture.toPNG());
  log(
    `renderer icon gallery canonical names passed: visible, unclipped catalogue; screenshot ${galleryScreenshotPath}`,
  );
  await window.webContents.executeJavaScript(
    `(() => { const input = document.querySelector('.wr-icon-picker-dialog input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'camera'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    true,
  );
  await click(window, '[data-icon-picker-option="camera"]');
  await ready(
    window,
    `document.querySelector(${JSON.stringify(designer)})?.dataset.webradIcon === 'camera' && document.querySelector('.wr-icon-picker-dialog') === null`,
  );
  await window.webContents.executeJavaScript(
    `(() => { const input = ${field('Mode')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'button'); input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    true,
  );
  await ready(
    window,
    `document.querySelector(${JSON.stringify(designer)})?.dataset.webradIconMode === 'button'`,
  );
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  const saved = await loadProjectFiles(projectPath);
  const node = saved.project.pages.flatMap((p) => p.components).find((c) => c.id === id);
  if (
    node?.type !== 'WebIcon' ||
    node.props.icon !== 'camera' ||
    node.props.mode !== 'button' ||
    'caption' in node.props
  )
    throw new Error('Saved Icons model differs from the Inspector.');
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-icons-designer.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  window.webContents.invalidate();
  const capture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (capture.isEmpty()) throw new Error('Icons Designer screenshot was empty.');
  await fs.writeFile(screenshotPath, capture.toPNG());
  await ready(
    window,
    `(() => {
      const run = document.querySelector('button[aria-label="Build and run (F9)"]');
      return run instanceof HTMLButtonElement && !run.disabled
        && document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'
        && document.querySelector('[role="dialog"]') === null;
    })()`,
  );
  const previousUrl: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
    true,
  );
  const dispatched: unknown = await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
    true,
  );
  if (dispatched !== false) throw new Error('Icons smoke F9 was not handled.');
  await ready(
    window,
    `(() => { const src = document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src'); return Boolean(src && src !== ${JSON.stringify(previousUrl)}); })()`,
  );
  const url: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]').getAttribute('src')`,
    true,
  );
  if (typeof url !== 'string') throw new Error('Icons F9 has no Preview URL.');
  const selector = `[data-webrad-id=${JSON.stringify(id)}]`;
  const deadline = Date.now() + 10_000;
  let frame: WebFrameMain | undefined;
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame, url);
    if (
      frame &&
      (await frame.executeJavaScript(
        `Boolean(document.querySelector(${JSON.stringify(selector)})?.querySelector('svg path'))`,
        true,
      )) === true
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!frame) throw new Error('Icons F9 frame did not mount.');
  window.webContents.focus();
  await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]').focus()`,
    true,
  );
  const paintExpression = `(() => { const e = document.querySelector(${JSON.stringify(selector)}), s = getComputedStyle(e); return JSON.stringify([s.color, s.backgroundColor, s.border, s.boxShadow, s.outlineStyle, s.transform]); })()`;
  const idlePaint: unknown = await frame.executeJavaScript(paintExpression, true);
  const evidence: unknown = await frame.executeJavaScript(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!(e instanceof HTMLButtonElement)) return false; const s = getComputedStyle(e); e.dataset.activations = '0'; e.addEventListener('click', () => e.dataset.activations = String(Number(e.dataset.activations) + 1)); e.focus(); return e.type === 'button' && e.dataset.webradIcon === 'camera' && e.getAttribute('role') === 'button' && e.textContent === '' && e.querySelector('svg').getAttribute('viewBox') === '0 0 24 24' && s.color.length > 0; })()`,
    true,
  );
  if (evidence !== true) throw new Error('Icons compiled F9 differs from the saved model.');
  const focused: unknown = await frame.executeJavaScript(
    `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
    true,
  );
  if (focused !== true) throw new Error('Icons F9 native button did not receive focus.');
  // Electron sendInputEvent does not route keys to a cross-site iframe in an
  // offscreen window. Chromium's native input API targets the focused frame.
  window.webContents.debugger.attach('1.3');
  try {
    for (const [key, code, virtualKey] of [
      ['Enter', 'Enter', 13],
      [' ', 'Space', 32],
    ] as const) {
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: virtualKey,
        ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
      });
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode: virtualKey,
      });
    }
  } finally {
    window.webContents.debugger.detach();
  }
  const activations: unknown = await frame.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).dataset.activations`,
    true,
  );
  if (activations !== '2')
    throw new Error(`Icons native Enter/Space produced ${String(activations)} clicks.`);
  if ((await frame.executeJavaScript(paintExpression, true)) !== idlePaint)
    throw new Error('Default Icons appearance changed after focus/native activation.');
  await stopPreviewSmoke(window);
  await click(window, 'button[aria-label="Design"]');
  await click(window, tree);
  // Exactly three history commands: insertion, selected icon, selected mode.
  for (let index = 0; index < 3; index++) {
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
      true,
    );
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );
  }
  await ready(window, `document.querySelector(${JSON.stringify(tree)}) === null`);
  await click(window, root);
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  log(
    `renderer Lucide Icons Inspector and F9 passed: palette, gallery, saved icon/button mode, captionless SVG, native Enter/Space, static default appearance; screenshot ${screenshotPath}`,
  );
}

/** Exercises the Line palette, persisted Inspector values and compiled Preview. */
export async function runLineSmoke(
  window: BrowserWindow,
  { projectPath, log }: { readonly projectPath: string; readonly log: (message: string) => void },
): Promise<void> {
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((item) => item.name === 'index');
  if (!page) throw new Error('Line smoke has no index page.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  const field = (label: string): string =>
    `([...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)})?.control)`;
  await click(window, 'button[aria-label="Design"]');
  await click(window, root);
  await click(window, 'button[role="tab"][aria-label="Properties"]');
  const palette = '[data-palette-component-type="WebLine"]';
  await ready(
    window,
    `document.querySelector(${JSON.stringify(palette)}) instanceof HTMLButtonElement`,
  );
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(palette)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Line') === true`,
  );
  const id: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
    true,
  );
  if (typeof id !== 'string') throw new Error('Line insertion has no stable component ID.');
  const designer = `[data-component-type="WebLine"][data-component-id=${JSON.stringify(id)}]`;
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await ready(
    window,
    `${field('Orientation')}?.value === 'horizontal' && ${field('Height')}?.value === '32'`,
  );
  for (const [label, value] of [
    ['Height', '220'],
    ['Label', 'Details'],
  ] as const) {
    await window.webContents.executeJavaScript(
      `(() => {
        const input = ${field(label)};
        if (!(input instanceof HTMLInputElement)) throw new Error('Missing Line field');
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
      })()`,
      true,
    );
    await ready(window, `${field(label)}?.value === ${JSON.stringify(value)}`);
  }
  await window.webContents.executeJavaScript(
    `(() => {
      const input = ${field('Orientation')};
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'vertical');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
    true,
  );
  await click(window, '.wr-inspector-icon-picker[aria-label="Icon"]');
  await click(window, '[data-icon-picker-option="info"]');
  const projection = (selector: string): string => `(() => {
    const line = document.querySelector(${JSON.stringify(selector)});
    const parts = line?.querySelectorAll('.wr-line-segment');
    const center = line?.querySelector('.wr-line-center');
    if (!(line instanceof HTMLElement) || parts?.length !== 2 || !(center instanceof HTMLElement)) return false;
    const a = parts[0].getBoundingClientRect(), b = parts[1].getBoundingClientRect(), c = center.getBoundingClientRect();
    return line.getAttribute('role') === 'separator' && line.getAttribute('aria-orientation') === 'vertical' &&
      line.getAttribute('aria-label') === 'Details' && center.textContent === 'Details' &&
      Boolean(center.querySelector('.wr-line-icon path')) && getComputedStyle(parts[0]).borderLeftStyle === 'solid' &&
      a.height > 20 && b.height > 20 && Math.abs(a.height - b.height) < 2 && a.bottom <= c.top && c.bottom <= b.top;
  })()`;
  await ready(window, projection(designer));
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  const saved = await loadProjectFiles(projectPath);
  const line = saved.project.pages
    .flatMap((item) => item.components)
    .find((item) => item.id === id);
  if (
    line?.type !== 'WebLine' ||
    line.props.orientation !== 'vertical' ||
    line.props.caption !== 'Details' ||
    line.props.icon !== 'info' ||
    line.bounds.height !== 220 ||
    !line.styleId ||
    !saved.project.styles.some(
      (style) => style.id === line.styleId && style.componentType === 'WebLine',
    )
  ) {
    throw new Error('Line Inspector values or style were not persisted.');
  }
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-line-designer.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  window.webContents.invalidate();
  const screenshot = await capturePresentedSmokePage(window, Date.now() + 10_000, 'Line Designer');
  if (screenshot.isEmpty()) throw new Error('Line Designer screenshot is empty.');
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  await ready(
    window,
    `(() => {
      const run = document.querySelector('button[aria-label="Build and run (F9)"]');
      return run instanceof HTMLButtonElement && !run.disabled && document.querySelector('[role="dialog"]') === null;
    })()`,
  );
  const previousUrl: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
    true,
  );
  const dispatched: unknown = await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
    true,
  );
  if (dispatched !== false) throw new Error('Line smoke F9 was not handled.');
  await ready(
    window,
    `(() => { const src = document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src'); return Boolean(src && src !== ${JSON.stringify(previousUrl)}); })()`,
  );
  const url: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]').getAttribute('src')`,
    true,
  );
  if (typeof url !== 'string') throw new Error('Line F9 has no Preview URL.');
  const previewSelector = `[data-webrad-id=${JSON.stringify(id)}]`;
  const deadline = Date.now() + 10_000;
  let matched = false;
  while (Date.now() < deadline) {
    const frame = findFrame(window.webContents.mainFrame, url);
    if (frame && (await frame.executeJavaScript(projection(previewSelector), true)) === true) {
      matched = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!matched) {
    throw new Error('Line compiled Preview did not match the saved geometry and content.');
  }
  await stopPreviewSmoke(window);
  await click(window, 'button[aria-label="Design"]');
  await click(window, tree);
  // Exactly five history commands: insertion, height, label, orientation and icon.
  for (let index = 0; index < 5; index++) {
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
      true,
    );
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );
  }
  await ready(window, `document.querySelector(${JSON.stringify(tree)}) === null`);
  await click(window, root);
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  const restored = await loadProjectFiles(projectPath);
  if (
    JSON.stringify(restored.project.pages.find((item) => item.id === page.id)) !==
    JSON.stringify(page)
  ) {
    throw new Error('Line smoke did not restore the original page.');
  }
  log(
    `renderer Line Inspector and F9 passed: palette, orientation, label, icon, style, persisted layout and centered geometry; screenshot ${screenshotPath}`,
  );
}
