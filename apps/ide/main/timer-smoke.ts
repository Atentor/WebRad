import type { BrowserWindow } from 'electron';
import { loadProjectFiles } from './project-files';

/** Exercises the registry-driven Timer tray, Inspector and Interact in the real IDE. */
export async function runTimerSmoke(
  window: BrowserWindow,
  options: { projectPath: string; log: (message: string) => void },
): Promise<void> {
  const evaluate = (expression: string): Promise<unknown> =>
    window.webContents.executeJavaScript(expression, true);
  const ready = async (expression: string): Promise<void> => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if ((await evaluate(expression)) === true) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timer smoke timed out: ${expression}`);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const original = await loadProjectFiles(options.projectPath);
  const page = original.project.pages.find((item) => item.name === 'index')!;
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await ready(
    `Array.from(document.querySelectorAll('.wr-palette-item')).some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Timer')`,
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.wr-palette-item')).find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Timer').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(`document.querySelector('.wr-inspector-selection strong')?.textContent === 'Timer1'`);
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Timer has no stable ID.');
  const field = (label: string) =>
    `([...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)})?.control)`;
  await ready(
    `${field('Time (ms)')}?.value === '1000' && ${field('Loop')}?.checked === true && ${field('Enabled')}?.checked === false`,
  );
  await evaluate(
    `(() => { const input = ${field('Time (ms)')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '50'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await ready(`${field('Time (ms)')}?.value === '50'`);
  await click('button[role="tab"][aria-label="Events"]');
  await ready(
    `['OnTimer', 'OnStart', 'OnStop'].every(name => [...document.querySelectorAll('.wr-inspector-event-row label')].some(e => e.textContent?.trim() === name))`,
  );
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(options.projectPath);
  const timer = saved.project.pages
    .find((item) => item.id === page.id)
    ?.components.find((item) => item.id === id);
  if (
    timer?.type !== 'WebTimer' ||
    timer.props.time !== 50 ||
    timer.props.loop !== true ||
    timer.props.enabled !== false
  )
    throw new Error('Timer Inspector values were not saved.');
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
  await click('button[role="tab"][aria-label="Properties"]');
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  options.log(
    'renderer Timer Inspector and Interact passed: palette, interval, loop, enabled, events, persistence and undo',
  );
}
