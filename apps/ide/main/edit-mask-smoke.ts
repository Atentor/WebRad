import type { BrowserWindow, WebFrameMain } from 'electron';
import { loadProjectFiles } from './project-files';
import { stopPreviewSmoke } from './preview-workspace-smoke';

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const found = findFrame(child, url);
    if (found) return found;
  }
  return undefined;
}

/** Real Registry-driven Inspector controls and native input in the compiled application. */
export async function runEditMaskSmoke(
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
    throw new Error('Edit mask smoke timed out: ' + expression);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const field = (label: string): string =>
    `([...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)})?.control)`;
  const text = async (label: string, value: string, textarea = false): Promise<void> => {
    await evaluate(
      `(() => { const e = ${field(label)}; e.focus(); Object.getOwnPropertyDescriptor(${textarea ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await ready(`${field(label)}?.value === ${JSON.stringify(value)}`);
    await evaluate(`${field(label)}.blur()`);
  };
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((item) => item.name === 'index');
  if (!page) throw new Error('Edit mask smoke requires the index page.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  const palette = `([...document.querySelectorAll('.wr-palette-item')].find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Edit'))`;
  await ready(`${palette} instanceof HTMLElement`);
  await evaluate(`${palette}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  const ids = page.components.map((component) => component.id);
  await ready(
    `(() => { const id = document.querySelector('.wr-inspector-selection')?.getAttribute('title'); return Boolean(id) && !${JSON.stringify(ids)}.includes(id) && ${field('Enable mask')} instanceof HTMLInputElement; })()`,
  );
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Edit has no stable ID.');
  const designer = `[data-component-id=${JSON.stringify(id)}][data-component-type="WebEdit"]`;
  await ready(
    `${field('Enable mask')}?.checked === false && ${field('Mask pattern')}?.readOnly === true`,
  );
  await evaluate(`${field('Enable mask')}.click()`);
  await ready(
    `${field('Enable mask')}?.checked === true && ${field('Mask pattern')}?.readOnly === false`,
  );
  await text('Mask pattern', 'HH[:HH]');
  await text('Custom tokens', '{"H":{"pattern":"[0-9A-Fa-f]","transform":"upper"}}', true);
  await text('Value', 'ab12');
  await ready(`document.querySelector(${JSON.stringify(designer)})?.value === 'AB:12'`);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(projectPath);
  const node = saved.project.pages
    .flatMap((item) => item.components)
    .find((item) => item.id === id);
  if (
    node?.type !== 'WebEdit' ||
    node.props.maskEnabled !== true ||
    node.props.mask !== 'HH[:HH]' ||
    node.props.value !== 'ab12' ||
    JSON.stringify(node.props.maskTokens) !== '{"H":{"pattern":"[0-9A-Fa-f]","transform":"upper"}}'
  )
    throw new Error('Edit mask Inspector settings did not persist.');
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
  if (typeof url !== 'string') throw new Error('Edit mask Preview has no URL.');
  const selector = `[data-webrad-id=${JSON.stringify(id)}]`;
  let frame: WebFrameMain | undefined;
  let loaded = false;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame, url);
    if (
      frame &&
      (await frame.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)})?.value === 'AB:12'`,
        true,
      )) === true
    ) {
      loaded = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!frame || !loaded) throw new Error('Compiled Edit mask configuration did not load.');
  await frame.executeJavaScript(
    `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    const b = e.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) throw new Error('Compiled Edit has empty geometry.');
    e.dataset.maskInputs = '0'; e.dataset.maskChanges = '0';
    e.addEventListener('input', () => { e.dataset.maskInputs = String(Number(e.dataset.maskInputs) + 1); e.dataset.maskObserved = e.value; });
    e.addEventListener('change', () => { e.dataset.maskChanges = String(Number(e.dataset.maskChanges) + 1); });
    e.focus(); e.select();
  })()`,
    true,
  );
  window.webContents.debugger.attach('1.3');
  try {
    await window.webContents.debugger.sendCommand('Input.insertText', { text: 'cdef' });
    if (
      (await frame.executeJavaScript(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e.value === 'CD:EF' && e.dataset.maskObserved === 'CD:EF' && Number(e.dataset.maskInputs) > 0; })()`,
        true,
      )) !== true
    )
      throw new Error('Edit native input/custom token formatting failed.');
    await frame.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}).setSelectionRange(3, 3)`,
      true,
    );
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });
    if (
      (await frame.executeJavaScript(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.blur(); return e.value === 'CE:F' && e.selectionStart === 1 && Number(e.dataset.maskChanges) > 0; })()`,
        true,
      )) !== true
    )
      throw new Error('Edit separator deletion, caret or change delivery failed.');
  } finally {
    window.webContents.debugger.detach();
  }
  await stopPreviewSmoke(window);
  await click('button[aria-label="Design"]');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);
  for (let index = 0; index < 5; index++) {
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
  log(
    'renderer Edit mask Inspector and F9 passed: activation, optional groups, custom Unicode token rules, case conversion, saved model, Designer/compiled text, native input, separator deletion, caret, events and undo',
  );
}
