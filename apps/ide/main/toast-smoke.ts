import type { BrowserWindow } from 'electron';
import { loadProjectFiles } from './project-files';

/** Exercises Toast insertion, Inspector persistence and cleanup in the real IDE. */
export async function runToastSmoke(
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
    throw new Error(`Toast smoke timed out: ${expression}`);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const original = await loadProjectFiles(options.projectPath);
  const page = original.project.pages.find((item) => item.name === 'index');
  if (!page) throw new Error('Toast smoke has no index page.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await ready(
    `Array.from(document.querySelectorAll('.wr-palette-item')).some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Toast')`,
  );
  await evaluate(
    `Array.from(document.querySelectorAll('.wr-palette-item')).find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Toast').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(`document.querySelector('.wr-inspector-selection strong')?.textContent === 'Toast1'`);
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Toast has no stable ID.');
  const field = (label: string) =>
    `([...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent?.trim() === ${JSON.stringify(label)})?.control)`;
  await ready(
    `${field('Duration (ms)')}?.value === '4000' && ${field('Position')}?.value === 'top-right'`,
  );
  await evaluate(
    `(() => { const input = ${field('Duration (ms)')}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '7000'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await ready(`${field('Duration (ms)')}?.value === '7000'`);
  await evaluate(
    `(() => { const input = ${field('Position')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, 'bottom-left'); input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await ready(`${field('Position')}?.value === 'bottom-left'`);
  await click('button[aria-label="Alert icon"]');
  await click('[data-icon-picker-option="bell"]');
  await click('button[role="tab"][aria-label="Events"]');
  await ready(
    `['OnShow', 'OnClose'].every(name => [...document.querySelectorAll('.wr-inspector-event-row label')].some(e => e.textContent?.trim() === name))`,
  );
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(options.projectPath);
  const toast = saved.project.pages
    .find((item) => item.id === page.id)
    ?.components.find((item) => item.id === id);
  if (
    toast?.type !== 'WebToast' ||
    toast.props.duration !== 7000 ||
    toast.props.position !== 'bottom-left' ||
    toast.props.alertIcon !== 'bell' ||
    !toast.styleId ||
    !saved.project.styles.some(
      (style) => style.id === toast.styleId && style.componentType === 'WebToast',
    )
  )
    throw new Error('Toast Inspector values or style were not saved.');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);
  for (let index = 0; index < 4; index++) {
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
    'renderer Toast Inspector passed: palette, duration, position, icon, events, style binding, persistence and undo',
  );
}
