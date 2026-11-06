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
  await text('Label', 'Account code');
  await click('.wr-inspector-icon-picker[aria-label="Icon"]');
  await click('[data-icon-picker-option="search"]');
  await ready(
    `document.querySelector(${JSON.stringify(designer)})?.querySelector('input')?.value === 'AB:12' && document.querySelector(${JSON.stringify(designer)})?.querySelector('label')?.textContent === 'Account code' && document.querySelector(${JSON.stringify(designer)})?.querySelector('[data-webrad-edit-icon="search"]') !== null`,
  );
  await ready(
    `document.querySelector(${JSON.stringify(designer)})?.querySelector('.wr-edit-icon-action') === null`,
  );
  await click('button[role="tab"][aria-label="Events"]');
  const eventRow = `[...document.querySelectorAll('.wr-inspector-event-row')].find(row => row.querySelector('label')?.textContent === 'OnIconClick')`;
  await ready(`${eventRow} !== undefined`);
  await evaluate(`${eventRow}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await ready(
    `document.querySelector('.monaco-editor')?.textContent?.replaceAll(String.fromCharCode(160), ' ').includes('sender: WebEdit, event: MouseEvent') === true`,
  );
  await ready(
    `(() => { const editor = document.querySelector('.monaco-editor'); const input = editor?.querySelector('.native-edit-context, textarea.inputarea'); return input instanceof HTMLElement && document.activeElement === input && editor?.getAttribute('data-cursor-position')?.endsWith('column 5') === true; })()`,
  );
  await window.webContents.insertText("sender.value = 'face';");
  await ready(
    `document.querySelector('.monaco-editor')?.textContent?.replaceAll(String.fromCharCode(160), ' ').includes("sender.value = 'face'") === true`,
  );
  await click('button[aria-label="Design"]');
  await ready(
    `document.querySelector(${JSON.stringify(designer)})?.querySelector('.wr-edit-icon-action') instanceof HTMLButtonElement`,
  );
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
    node.props.label !== 'Account code' ||
    node.props.icon !== 'search' ||
    typeof node.events.OnIconClick !== 'string' ||
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
  const inputSelector = `${selector} input`;
  let frame: WebFrameMain | undefined;
  let loaded = false;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame, url);
    if (
      frame &&
      (await frame.executeJavaScript(
        `document.querySelector(${JSON.stringify(inputSelector)})?.value === 'AB:12' && document.querySelector(${JSON.stringify(selector)})?.querySelector('label')?.textContent === 'Account code'`,
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
    const root = document.querySelector(${JSON.stringify(selector)});
    const e = root.querySelector('input');
    const label = root.querySelector('label');
    const icon = root.querySelector('[data-webrad-edit-icon="search"]');
    const iconButton = root.querySelector('.wr-edit-icon-action');
    const b = root.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) throw new Error('Compiled Edit has empty geometry.');
    if (label.control !== e || label.hidden || label.getBoundingClientRect().bottom > b.top + 1 || label.scrollHeight > label.clientHeight + 1) throw new Error('Compiled Edit label is clipped, not associated or not positioned above the field.');
    const iconBounds = icon?.getBoundingClientRect();
    const inputBounds = e.getBoundingClientRect();
    if (!iconBounds || !(iconButton instanceof HTMLButtonElement) || !iconButton.getAttribute('aria-label') || icon.getAttribute('aria-hidden') !== 'true' || iconBounds.width <= 0 || iconBounds.left < b.left || iconBounds.right > inputBounds.left || inputBounds.right > b.right) throw new Error('Compiled Edit icon is missing, inaccessible or overlaps the input.');
    const fieldStyle = getComputedStyle(root);
    const topPadding = parseFloat(fieldStyle.paddingTop);
    const bottomPadding = parseFloat(fieldStyle.paddingBottom);
    const availableIconHeight = root.clientHeight - topPadding - bottomPadding + Math.min(2, topPadding, bottomPadding);
    if (Math.abs(iconBounds.height - Math.min(iconBounds.width, availableIconHeight)) > 1.5 || iconBounds.top < b.top || iconBounds.bottom > b.bottom) throw new Error('Compiled Edit icon is vertically clipped or outside its field.');
    const edgeGap = iconBounds.left - b.left - parseFloat(fieldStyle.borderLeftWidth);
    const expectedGap = Math.max(0, parseFloat(fieldStyle.paddingLeft) - 4);
    if (Math.abs(edgeGap - expectedGap) > 1.5) throw new Error('Compiled Edit icon did not move toward the left edge.');
    e.dataset.maskInputs = '0'; e.dataset.maskChanges = '0';
    e.addEventListener('input', () => { e.dataset.maskInputs = String(Number(e.dataset.maskInputs) + 1); e.dataset.maskObserved = e.value; });
    e.addEventListener('change', () => { e.dataset.maskChanges = String(Number(e.dataset.maskChanges) + 1); });
    e.focus(); e.select();
  })()`,
    true,
  );
  window.webContents.debugger.attach('1.3');
  let frameSession: string | undefined;
  try {
    if (frame.processId !== window.webContents.mainFrame.processId) {
      const targets = (await window.webContents.debugger.sendCommand('Target.getTargets', {
        filter: [{ type: 'iframe' }, { exclude: true }],
      })) as { targetInfos: { targetId: string; url: string }[] };
      const target = targets.targetInfos.find((candidate) => candidate.url === frame.url);
      if (!target) throw new Error('Edit Preview has no matching debugger target.');
      const attached = (await window.webContents.debugger.sendCommand('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: true,
      })) as { sessionId: string };
      frameSession = attached.sessionId;
    }
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    });
    if (frameSession)
      await window.webContents.debugger.sendCommand(
        'Emulation.setFocusEmulationEnabled',
        { enabled: true },
        frameSession,
      );
    const offset = await evaluate(
      `(() => { const r = document.querySelector('iframe[title="WebRAD application preview"]').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`,
    );
    const iconGeometry: unknown = await frame.executeJavaScript(
      `(() => { const button = document.querySelector(${JSON.stringify(selector)}).querySelector('.wr-edit-icon-action'); const r = button.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, color: getComputedStyle(button.querySelector('.wr-edit-icon')).color, background: getComputedStyle(button).backgroundColor }; })()`,
      true,
    );
    if (
      typeof offset !== 'object' ||
      offset === null ||
      typeof iconGeometry !== 'object' ||
      iconGeometry === null
    )
      throw new Error('Edit icon geometry is unavailable.');
    const x = Number(Reflect.get(offset, 'x')) + Number(Reflect.get(iconGeometry, 'x'));
    const y = Number(Reflect.get(offset, 'y')) + Number(Reflect.get(iconGeometry, 'y'));
    const mousePosition = {
      x: frameSession ? Number(Reflect.get(iconGeometry, 'x')) : x,
      y: frameSession ? Number(Reflect.get(iconGeometry, 'y')) : y,
    };
    await window.webContents.debugger.sendCommand(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', ...mousePosition },
      frameSession,
    );
    await frame.executeJavaScript(
      `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      true,
    );
    const hovered: unknown = await frame.executeJavaScript(
      `(() => { const button = document.querySelector(${JSON.stringify(selector)}).querySelector('.wr-edit-icon-action'); return { color: getComputedStyle(button.querySelector('.wr-edit-icon')).color, background: getComputedStyle(button).backgroundColor, hovered: button.matches(':hover'), hit: document.elementFromPoint(${Number(Reflect.get(iconGeometry, 'x'))}, ${Number(Reflect.get(iconGeometry, 'y'))})?.outerHTML.slice(0, 300) }; })()`,
      true,
    );
    if (
      typeof hovered !== 'object' ||
      hovered === null ||
      Reflect.get(hovered, 'color') === Reflect.get(iconGeometry, 'color') ||
      Reflect.get(hovered, 'background') !== Reflect.get(iconGeometry, 'background')
    )
      throw new Error(
        `Edit icon hover must change only the icon color: ${JSON.stringify({ offset, iconGeometry, hovered })}`,
      );
    await window.webContents.debugger.sendCommand(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', ...mousePosition, button: 'left', clickCount: 1 },
      frameSession,
    );
    await window.webContents.debugger.sendCommand(
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', ...mousePosition, button: 'left', clickCount: 1 },
      frameSession,
    );
    if (
      (await frame.executeJavaScript(
        `document.querySelector(${JSON.stringify(inputSelector)}).value`,
        true,
      )) !== 'FA:CE'
    )
      throw new Error('Edit icon click handler did not run.');
    await frame.executeJavaScript(
      `(() => { document.querySelector(${JSON.stringify(inputSelector)}).value = ''; document.querySelector(${JSON.stringify(selector)}).querySelector('.wr-edit-icon-action').focus(); })()`,
      true,
    );
    await window.webContents.debugger.sendCommand(
      'Input.dispatchKeyEvent',
      {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        text: '\r',
        unmodifiedText: '\r',
      },
      frameSession,
    );
    await window.webContents.debugger.sendCommand(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      frameSession,
    );
    if (
      (await frame.executeJavaScript(
        `document.querySelector(${JSON.stringify(inputSelector)}).value`,
        true,
      )) !== 'FA:CE'
    )
      throw new Error('Edit icon keyboard activation did not run.');
    await frame.executeJavaScript(
      `(() => { const e = document.querySelector(${JSON.stringify(inputSelector)}); e.focus(); e.select(); })()`,
      true,
    );
    await window.webContents.debugger.sendCommand(
      'Input.insertText',
      { text: 'cdef' },
      frameSession,
    );
    if (
      (await frame.executeJavaScript(
        `(() => { const e = document.querySelector(${JSON.stringify(inputSelector)}); return e.value === 'CD:EF' && e.dataset.maskObserved === 'CD:EF' && Number(e.dataset.maskInputs) > 0; })()`,
        true,
      )) !== true
    )
      throw new Error('Edit native input/custom token formatting failed.');
    await frame.executeJavaScript(
      `document.querySelector(${JSON.stringify(inputSelector)}).setSelectionRange(3, 3)`,
      true,
    );
    await window.webContents.debugger.sendCommand(
      'Input.dispatchKeyEvent',
      {
        type: 'keyDown',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
      },
      frameSession,
    );
    await window.webContents.debugger.sendCommand(
      'Input.dispatchKeyEvent',
      {
        type: 'keyUp',
        key: 'Backspace',
        code: 'Backspace',
        windowsVirtualKeyCode: 8,
      },
      frameSession,
    );
    if (
      (await frame.executeJavaScript(
        `(() => { const e = document.querySelector(${JSON.stringify(inputSelector)}); e.blur(); return e.value === 'CE:F' && e.selectionStart === 1 && Number(e.dataset.maskChanges) > 0; })()`,
        true,
      )) !== true
    )
      throw new Error('Edit separator deletion, caret or change delivery failed.');
  } finally {
    try {
      if (frameSession) {
        await window.webContents.debugger.sendCommand(
          'Emulation.setFocusEmulationEnabled',
          { enabled: false },
          frameSession,
        );
        await window.webContents.debugger.sendCommand('Target.detachFromTarget', {
          sessionId: frameSession,
        });
      }
      await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
        enabled: false,
      });
    } finally {
      window.webContents.debugger.detach();
    }
  }
  await stopPreviewSmoke(window);
  await click('button[aria-label="Design"]');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);
  for (let index = 0; index < 8; index++) {
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
    'renderer Edit mask Inspector and F9 passed: activation, mask and saved model, accessible label, typed icon Interaction, hover, pointer and keyboard activation, icon geometry, Designer/compiled text, native input, separator deletion, caret, events and undo',
  );
}
