import type { BrowserWindow, KeyboardInputEvent } from 'electron';

interface MonacoWorkspaceSmokeOptions {
  readonly log: (message: string) => void;
  readonly sendKey: (
    keyCode: string,
    modifiers?: NonNullable<KeyboardInputEvent['modifiers']>,
  ) => void;
}

async function settle(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );
}

async function waitFor(
  window: BrowserWindow,
  expression: string,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastResult: unknown;
  while (Date.now() < deadline) {
    lastResult = await window.webContents.executeJavaScript(expression, true);
    if (lastResult === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const evidence: unknown = await window.webContents.executeJavaScript(
    `({
      view: ${viewSnapshotExpression},
      source: [...document.querySelectorAll('.monaco-editor .view-lines .view-line')].sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top).map(line => line.textContent),
      focused: document.activeElement?.className,
      undoDisabled: document.querySelector('button[aria-label="Undo (Ctrl+Z)"]')?.disabled,
      redoDisabled: document.querySelector('button[aria-label="Redo (Ctrl+Y)"]')?.disabled,
      activeView: document.querySelector('.wr-view-tabs [aria-selected="true"]')?.getAttribute('aria-label'),
    })`,
    true,
  );
  throw new Error(
    `Timed out waiting for Monaco ${description}: ${JSON.stringify({ expression, lastResult, evidence })}`,
  );
}

const viewSnapshotExpression = `(() => {
  const editor = document.querySelector('.monaco-editor');
  const cursor = editor?.querySelector('.cursors-layer > .cursor');
  if (!(editor instanceof HTMLElement) || !(cursor instanceof HTMLElement)) return null;
  const bounds = editor.getBoundingClientRect();
  const firstLine = [...editor.querySelectorAll('.view-lines .view-line')].sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top).find(
    (line) => line.getBoundingClientRect().top >= bounds.top,
  );
  return {
    editorWidth: bounds.width,
    editorHeight: bounds.height,
    scrollWidth: Number.parseFloat(editor.querySelector('.view-lines')?.style.width ?? '0'),
    scrollHeight: Number.parseFloat(editor.querySelector('.view-lines')?.style.height ?? '0'),

    position: document.querySelector('.wr-status-position')?.getAttribute('aria-label'),
    firstLine: firstLine?.textContent,
    caretTop: cursor.getBoundingClientRect().top - bounds.top,
    scrollTop: Number.parseFloat(
      editor.querySelector('.scrollbar.vertical .slider')?.style.top ?? '0',
    ),
  };
})()`;

/** Exercise real editor state and undo across the Designer/Code lifecycle. */
export async function runMonacoWorkspaceSmoke(
  window: BrowserWindow,
  { log, sendKey }: MonacoWorkspaceSmokeOptions,
): Promise<void> {
  const command: NonNullable<KeyboardInputEvent['modifiers']>[number] =
    process.platform === 'darwin' ? 'meta' : 'control';
  sendKey('Escape');
  sendKey(process.platform === 'darwin' ? 'Down' : 'End', [command]);
  await settle(window);
  const originalEnd: unknown = await window.webContents.executeJavaScript(
    "document.querySelector('.wr-status-position')?.getAttribute('aria-label')",
    true,
  );
  if (typeof originalEnd !== 'string') throw new Error('Monaco original cursor was unavailable.');
  const originalLines: unknown = await window.webContents.executeJavaScript(
    "[...document.querySelectorAll('.monaco-editor .view-lines .view-line')].sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top).map(line => line.textContent)",
    true,
  );
  if (!Array.isArray(originalLines)) throw new Error('Monaco original source was unavailable.');
  log(`renderer Monaco workspace original: ${JSON.stringify({ originalEnd, originalLines })}`);
  const originalPosition = /^Line (\d+), column (\d+)$/.exec(originalEnd);
  if (originalPosition === null) throw new Error(`Unexpected Monaco cursor label: ${originalEnd}`);
  const originalLine = Number(originalPosition[1]);
  const originalColumn = Number(originalPosition[2]);
  const commentCount = 40;
  const marker = 'workspaceUndoMarker';
  const comments = Array.from(
    { length: commentCount },
    (_, index) => `// workspaceSmoke_${String(index)}`,
  ).join('\n');
  await window.webContents.insertText(`\n${comments}`);
  await waitFor(
    window,
    `[...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes('workspaceSmoke_${String(commentCount - 1)}'))`,
    'the temporary source block',
  );
  // Cursor movement separates the short edit from native multiline input's undo groups.
  sendKey(process.platform === 'darwin' ? 'Down' : 'End', [command]);
  sendKey('Left');
  sendKey('Right');
  await settle(window);
  const blockEnd: unknown = await window.webContents.executeJavaScript(
    "document.querySelector('.wr-status-position')?.getAttribute('aria-label')",
    true,
  );
  if (typeof blockEnd !== 'string')
    throw new Error('Monaco temporary block cursor was unavailable.');
  const markerLine = originalLine + commentCount;
  await window.webContents.insertText(marker);
  await waitFor(
    window,
    `[...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes(${JSON.stringify(marker)}))`,
    'the single undo marker',
  );
  for (let index = 0; index < 8; index += 1) sendKey('Up');
  sendKey('Home');
  for (let index = 0; index < 5; index += 1) sendKey('Right');
  await settle(window);
  const before: unknown = await window.webContents.executeJavaScript(viewSnapshotExpression, true);
  if (
    typeof before !== 'object' ||
    before === null ||
    Number(Reflect.get(before, 'scrollTop')) <= 0
  ) {
    throw new Error(`Monaco scroll state was unavailable: ${JSON.stringify(before)}`);
  }

  await waitFor(
    window,
    "document.activeElement instanceof HTMLElement && document.activeElement.closest('.monaco-editor') !== null",
    'editor focus before F12',
  );
  sendKey('F12');
  await waitFor(
    window,
    "document.querySelector('.wr-page-surface') !== null && document.querySelector('.monaco-editor') === null",
    'the Designer view',
  );
  sendKey('F12');
  await waitFor(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(Reflect.get(before, 'position'))} && document.querySelector('.monaco-editor') !== null`,
    'the restored cursor',
  );
  await settle(window);
  const after: unknown = await window.webContents.executeJavaScript(viewSnapshotExpression, true);
  if (
    typeof after !== 'object' ||
    after === null ||
    Reflect.get(after, 'position') !== Reflect.get(before, 'position') ||
    Reflect.get(after, 'firstLine') !== Reflect.get(before, 'firstLine') ||
    Math.abs(Number(Reflect.get(after, 'caretTop')) - Number(Reflect.get(before, 'caretTop'))) >
      1.5 ||
    Math.abs(Number(Reflect.get(after, 'scrollTop')) - Number(Reflect.get(before, 'scrollTop'))) >
      1.5
  ) {
    throw new Error(
      `Monaco view state changed across Design/Code: ${JSON.stringify({ before, after })}`,
    );
  }
  log(`renderer Monaco workspace restored view: ${JSON.stringify({ before, after })}`);

  sendKey('Z', [command]);
  await waitFor(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(blockEnd)}`,
    'the cursor after undoing the single marker',
  );
  await settle(window);
  sendKey(process.platform === 'darwin' ? 'Down' : 'End', [command]);
  await waitFor(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(blockEnd)} && [...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes('workspaceSmoke_${String(commentCount - 1)}')) && ![...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes(${JSON.stringify(marker)}))`,
    'undo after remount',
  );
  sendKey(
    process.platform === 'darwin' ? 'Z' : 'Y',
    process.platform === 'darwin' ? [command, 'shift'] : [command],
  );
  await settle(window);
  sendKey(process.platform === 'darwin' ? 'Down' : 'End', [command]);
  await waitFor(
    window,
    `[...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes(${JSON.stringify(marker)})) && document.querySelector('.wr-status-position')?.getAttribute('aria-label')?.startsWith('Line ${String(markerLine)},') === true`,
    'redo after remount',
  );
  sendKey('Z', [command]);
  await waitFor(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(blockEnd)}`,
    'the cursor after final marker undo',
  );
  await settle(window);
  sendKey(process.platform === 'darwin' ? 'Down' : 'End', [command]);
  sendKey('Home', ['shift']);
  for (let index = 0; index < commentCount; index += 1) sendKey('Up', ['shift']);
  for (let index = 1; index < originalColumn; index += 1) sendKey('Right', ['shift']);
  await waitFor(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(originalEnd)} && document.querySelector('.wr-status-selection') !== null`,
    'the temporary block selection',
  );
  sendKey('Backspace');
  await waitFor(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(originalEnd)} && JSON.stringify([...document.querySelectorAll('.monaco-editor .view-lines .view-line')].sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top).map(line => line.textContent)) === ${JSON.stringify(JSON.stringify(originalLines))}`,
    'the restored authored source',
  );
  log(
    `renderer Monaco workspace state passed: ${JSON.stringify({ before, after, undo: true, redo: true, restoredSource: true })}`,
  );

  for (const entry of ['Designer', 'Inspector']) {
    sendKey(process.platform === 'darwin' ? 'Down' : 'End', [command]);
    await settle(window);
    await window.webContents.executeJavaScript(
      'document.querySelector(\'button[aria-label="Design"]\')?.click()',
      true,
    );
    await waitFor(window, "document.querySelector('.wr-design-hit') !== null", 'event Designer');
    await window.webContents.executeJavaScript(
      entry === 'Designer'
        ? `document.querySelector('.wr-design-hit[title^="BTNMostrar:"]')
            .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`
        : `document.querySelector('[role="treeitem"][aria-label="BTNMostrar"]')?.click();
            document.querySelector('button[role="tab"][aria-label="Events"]')?.click()`,
      true,
    );
    if (entry === 'Inspector') {
      await waitFor(
        window,
        `[...document.querySelectorAll('.wr-inspector-event-row')].some(row =>
          row.querySelector('label')?.textContent === 'OnClick' &&
          row.querySelector('input')?.value === 'BTNMostrarClick')`,
        'the bound Inspector event',
      );
      await window.webContents.executeJavaScript(
        `[...document.querySelectorAll('.wr-inspector-event-row')]
          .find(row => row.querySelector('label')?.textContent === 'OnClick')
          .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
        true,
      );
    }
    await waitFor(window, "document.querySelector('.monaco-editor') !== null", 'event editor');
    await window.webContents.executeJavaScript('document.fonts.ready', true);
    await settle(window);
    await waitFor(
      window,
      `(() => {
        const cursor = document.querySelector('.monaco-editor .cursors-layer > .cursor');
        const line = [...document.querySelectorAll('.monaco-editor .view-lines .view-line')]
          .find(node => cursor && Math.abs(node.getBoundingClientRect().top - cursor.getBoundingClientRect().top) < 1);
        return line?.textContent?.includes('Message(') === true &&
          document.querySelector('.wr-status-position')?.getAttribute('aria-label')?.endsWith('column 5') === true &&
          document.querySelector('.wr-status-selection') === null &&
          document.activeElement?.closest('.monaco-editor') !== null;
      })()`,
      `the ${entry} event body after font/layout restoration`,
    );
  }
  log(
    'renderer Monaco event navigation passed: Designer and Inspector, existing handler body, column 5',
  );
}
