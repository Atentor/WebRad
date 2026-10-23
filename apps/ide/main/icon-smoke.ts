import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { loadProjectFiles } from './project-files';

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Icons smoke timed out: ${expression}`);
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
  const page = original.project.pages.find((item) => item.name === 'PageMain')!;
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
  const previousUrl: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
    true,
  );
  await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
    true,
  );
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
