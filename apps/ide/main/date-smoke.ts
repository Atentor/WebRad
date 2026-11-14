import { confirmInspectorDrafts } from './smoke-inspector-drafts';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { loadProjectFiles } from './project-files';
import { stopPreviewSmoke } from './preview-workspace-smoke';

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const found = findFrame(child, url);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Real palette/Inspector persistence and native typing in compiled F9. */
export async function runDateSmoke(
  window: BrowserWindow,
  { projectPath, log }: { readonly projectPath: string; readonly log: (message: string) => void },
): Promise<void> {
  const evaluate = (expression: string): Promise<unknown> =>
    window.webContents.executeJavaScript(expression, true);
  const ready = async (expression: string): Promise<void> => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if ((await evaluate(expression)) === true) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Date smoke timed out: ' + expression);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const field = (label: string): string =>
    `([...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)})?.control)`;
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((item) => item.name === 'index');
  if (page === undefined) throw new Error('Date smoke requires the index page.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  const palette = `([...document.querySelectorAll('.wr-palette-item')].find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Date'))`;
  await ready(`${palette} instanceof HTMLElement`);
  await evaluate(`${palette}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await ready(`document.querySelector('.wr-inspector-selection strong')?.textContent === 'Date1'`);
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Date has no stable ID.');
  const designer = `[data-component-id=${JSON.stringify(id)}][data-component-type="WebDate"]`;
  await ready(
    `(() => { const e = document.querySelector(${JSON.stringify(designer)}); return ${field('Mode')}?.value === 'date' && ${field('Date format')}?.value === 'dd/MM/yyyy' && e?.querySelector('.wr-date-input')?.placeholder === 'dd/MM/yyyy' && e?.querySelector('.wr-date-button') instanceof HTMLButtonElement && e.querySelector('.wr-date-button').getAttribute('aria-haspopup') === 'dialog'; })()`,
  );
  await evaluate(
    `(() => { const input = ${field('Mode')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'datetime'); input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await ready(`${field('Mode')}?.value === 'datetime'`);
  // Leave room on both sides to exercise field alignment rather than the
  // intentional viewport-edge fallback.
  await evaluate(
    `(() => { const input = ${field('Left')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '160'); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); })()`,
  );
  await confirmInspectorDrafts(window);
  await ready(`${field('Left')}?.value === '160'`);
  await evaluate(
    `(() => { const input = ${field('Value')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2026-11-03T14:30'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await confirmInspectorDrafts(window);
  await ready(
    `document.querySelector(${JSON.stringify(designer)})?.querySelector('.wr-date-input')?.value === '03/11/2026 14:30'`,
  );
  const paintExpression = (selector: string): string => `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!(e instanceof HTMLElement)) return null;
    const input = e.querySelector('.wr-date-input'), button = e.querySelector('.wr-date-button');
    const b = e.getBoundingClientRect(), i = input.getBoundingClientRect(), c = button.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0 || i.width <= 0 || c.width <= 0 || i.right > c.left + 1 || c.right > b.right + 1) return null;
    if (!(button instanceof HTMLButtonElement) || button.getAttribute('aria-haspopup') !== 'dialog') return null;
    if (getComputedStyle(input).direction !== getComputedStyle(e).direction) return null;
    const s = getComputedStyle(e), t = getComputedStyle(input);
    return JSON.stringify([s.fontFamily, s.fontSize, s.color, s.backgroundImage, s.borderRadius, s.padding, t.fontSize]);
  })()`;
  const paint = await evaluate(paintExpression(designer));
  if (typeof paint !== 'string') throw new Error('Date Designer geometry is clipped or empty.');
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(projectPath);
  const node = saved.project.pages
    .flatMap((item) => item.components)
    .find((item) => item.id === id);
  if (
    node?.type !== 'WebDate' ||
    node.props.mode !== 'datetime' ||
    node.bounds.x !== 160 ||
    node.props.value !== '2026-11-03T14:30'
  ) {
    throw new Error('Date Inspector values did not persist.');
  }
  await ready(
    `document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled === false`,
  );
  await evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
  );
  await ready(
    `Boolean(document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src'))`,
  );
  const url = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]').getAttribute('src')`,
  );
  if (typeof url !== 'string') throw new Error('Date F9 has no Preview URL.');
  const selector = `[data-webrad-id=${JSON.stringify(id)}]`;
  let frame: WebFrameMain | undefined;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame, url);
    if (
      frame &&
      (await frame.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)})?.querySelector('.wr-date-input')?.value === '03/11/2026 14:30'`,
        true,
      )) === true
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (
    frame === undefined ||
    (await frame.executeJavaScript(paintExpression(selector), true)) !== paint
  ) {
    throw new Error('Date Designer and compiled F9 paint/geometry differ.');
  }
  window.webContents.focus();
  await evaluate(`document.querySelector('iframe[title="WebRAD application preview"]').focus()`);
  await frame.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).querySelector('.wr-date-button').focus()`,
    true,
  );
  window.webContents.debugger.attach('1.3');
  try {
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
  } finally {
    window.webContents.debugger.detach();
  }
  const popupGeometry = await frame.executeJavaScript(
    `(() => {
    const e = document.querySelector(${JSON.stringify(selector)}), button = e.querySelector('.wr-date-button');
    const popup = document.getElementById(button.getAttribute('aria-controls'));
    if (!(popup instanceof HTMLElement) || !popup.matches(':popover-open') || button.getAttribute('aria-expanded') !== 'true') return null;
    const a = e.getBoundingClientRect(), p = popup.getBoundingClientRect();
    const expectedWidth = Math.min(Math.max(260, a.width), innerWidth - 16);
    if (p.width < 200 || p.height < 200 || Math.abs(p.left - a.left) > 1.5 || Math.abs(p.right - (a.left + expectedWidth)) > 1.5 || Math.abs(p.width - expectedWidth) > 1.5 || p.top < a.bottom || p.left < 7 || p.bottom > innerHeight - 7) return null;
    if (popup.scrollWidth > popup.clientWidth + 1 || popup.scrollHeight > popup.clientHeight + 1) return null;
    return { fieldLeft: a.left, popupLeft: p.left, fieldRight: a.right, popupRight: p.right, fieldWidth: a.width, width: p.width, height: p.height };
  })()`,
    true,
  );
  if (popupGeometry === null)
    throw new Error(
      'The open Date calendar does not match the field alignment and minimum popup width, or is clipped.',
    );
  await frame.executeJavaScript(
    `(() => {
    const e = document.querySelector(${JSON.stringify(selector)}), popup = e.querySelector('.wr-date-calendar');
    popup.querySelector('[data-date-day="2026-11-04"]').click();
    popup.querySelector('[data-date-apply]').click();
  })()`,
    true,
  );
  if (
    (await frame.executeJavaScript(
      `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    return e.querySelector('.wr-date-input').value === '04/11/2026 14:30' && e.querySelector('.wr-date-button').getAttribute('aria-expanded') === 'false' && !e.querySelector('.wr-date-calendar').matches(':popover-open');
  })()`,
      true,
    )) !== true
  )
    throw new Error('Date calendar selection did not commit the date and preserve the time.');
  log(
    `renderer Date popup field alignment passed: ${JSON.stringify(popupGeometry)}; native Space opening, measured alignment and 260px minimum popup width, day selection and time preservation`,
  );
  await frame.executeJavaScript(
    `(() => {
    const e = document.querySelector(${JSON.stringify(selector)}), input = e.querySelector('.wr-date-input');
    e.dataset.dateInputs = '0'; e.dataset.dateChanges = '0';
    e.addEventListener('input', () => e.dataset.dateInputs = String(Number(e.dataset.dateInputs) + 1));
    e.addEventListener('change', () => e.dataset.dateChanges = String(Number(e.dataset.dateChanges) + 1));
    input.focus(); input.select();
  })()`,
    true,
  );
  window.webContents.debugger.attach('1.3');
  try {
    await window.webContents.debugger.sendCommand('Input.insertText', { text: '291120261530' });
  } finally {
    window.webContents.debugger.detach();
  }
  const valid = await frame.executeJavaScript(
    `(() => {
    const e = document.querySelector(${JSON.stringify(selector)}), input = e.querySelector('.wr-date-input');
    input.blur();
    return input.value === '29/11/2026 15:30' && input.checkValidity() && Number(e.dataset.dateInputs) > 0 && Number(e.dataset.dateChanges) > 0;
  })()`,
    true,
  );
  if (valid !== true) throw new Error('Date native typing, mask, or input/change events failed.');
  await frame.executeJavaScript(
    `(() => { const input = document.querySelector(${JSON.stringify(selector)}).querySelector('.wr-date-input'); input.focus(); input.select(); })()`,
    true,
  );
  window.webContents.debugger.attach('1.3');
  try {
    await window.webContents.debugger.sendCommand('Input.insertText', { text: '310220261530' });
  } finally {
    window.webContents.debugger.detach();
  }
  if (
    (await frame.executeJavaScript(
      `(() => { const input = document.querySelector(${JSON.stringify(selector)}).querySelector('.wr-date-input'); return input.value === '31/02/2026 15:30' && !input.checkValidity() && input.getAttribute('aria-invalid') === 'true'; })()`,
      true,
    )) !== true
  ) {
    throw new Error('Date accepted an impossible calendar date.');
  }
  await stopPreviewSmoke(window);
  await click('button[aria-label="Design"]');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);
  // A property may already match the insertion defaults. Undo only this
  // fixture's commands, using the root row which survives component removal.
  for (let index = 0; index < 4; index++) {
    if ((await evaluate(`document.querySelector(${JSON.stringify(tree)}) === null`)) === true)
      break;
    await evaluate(
      `document.querySelector(${JSON.stringify(root)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  }
  await ready(`document.querySelector(${JSON.stringify(tree)}) === null`);
  await click(root);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const restored = await loadProjectFiles(projectPath);
  const restoredPage = restored.project.pages.find((item) => item.id === page.id);
  if (JSON.stringify(restoredPage) !== JSON.stringify(page))
    throw new Error('Date Undo cleanup did not restore the complete original page.');
  log(
    'renderer Date Inspector and F9 passed: complete original page restored; date/datetime modes, mask, persistence, native typing, calendar validation, calendar popup matching both field edges, events, Designer/runtime geometry and undo',
  );
}
