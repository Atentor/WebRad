import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

import { loadProjectFiles } from './project-files';
import { capturePresentedSmokePage } from './smoke-capture';

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
    if (Date.now() >= deadline) throw new Error(`Repeating Group smoke timed out: ${expression}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
    true,
  );
}

async function insert(window: BrowserWindow, type: string, prefix: string): Promise<string> {
  const selector = `[data-palette-component-type=${JSON.stringify(type)}]`;
  const category = type === 'WebLabel' ? 'Standard' : 'Containers';
  await window.webContents.executeJavaScript(
    `(() => {
      if (document.querySelector(${JSON.stringify(selector)}) !== null) return;
      const header = Array.from(document.querySelectorAll('.wr-palette-category-header'))
        .find((item) => item.querySelector('span:nth-child(2)')?.textContent?.trim() === ${JSON.stringify(category)});
      if (header?.getAttribute('aria-expanded') === 'false') header.click();
    })()`,
    true,
  );
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith(${JSON.stringify(prefix)}) === true`,
  );
  const id: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
    true,
  );
  if (typeof id !== 'string' || id.length === 0)
    throw new Error(`Repeating Group smoke did not obtain the ${type} ID.`);
  return id;
}

/** Exercise the contextual Interaction in the real IDE and restore its fixture. */
export async function runRepeatingGroupCalculationSmoke(
  window: BrowserWindow,
  { projectPath, log }: { readonly projectPath: string; readonly log: (message: string) => void },
): Promise<void> {
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((candidate) => candidate.name === 'index');
  if (page === undefined) throw new Error('Repeating Group smoke requires the index fixture.');
  const sourcePath = `pages/${page.name}.ts`;
  const originalSource = original.userSources[sourcePath];
  if (originalSource === undefined) throw new Error('Repeating Group smoke requires page source.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  const calcRow = `Array.from(document.querySelectorAll('.wr-inspector-event-row')).find((row) => row.querySelector('label')?.textContent?.trim() === 'OnCalcRow')`;
  let inserted = 0;
  const insertedIds: string[] = [];
  let eventBound = false;
  let sourceChanged = false;
  let fixtureRestored = true;
  let labelName = '';
  try {
    await click(window, 'button[aria-label="Design"]');
    await click(window, root);
    await click(window, 'button[role="tab"][aria-label="Properties"]');
    const groupId = await insert(window, 'WebRepeatingGroup', 'RepeatingGroup');
    inserted += 1;
    insertedIds.push(groupId);
    const groupName: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.wr-inspector-selection strong')?.textContent?.trim()`,
      true,
    );
    if (typeof groupName !== 'string') throw new Error('Repeating Group name is missing.');
    await click(window, 'button[role="tab"][aria-label="Events"]');
    await ready(
      window,
      `Array.from(document.querySelectorAll('.wr-inspector-event-row')).some((row) => row.querySelector('label')?.textContent?.trim() === 'OnClick')`,
    );
    if ((await window.webContents.executeJavaScript(`${calcRow} === undefined`, true)) !== true)
      throw new Error('OnCalcRow was offered outside a repeated row.');
    await click(window, 'button[role="tab"][aria-label="Properties"]');
    const panelId = await insert(window, 'WebPanel', 'Panel');
    inserted += 1;
    insertedIds.push(panelId);
    const labelId = await insert(window, 'WebLabel', 'Label');
    inserted += 1;
    insertedIds.push(labelId);
    const selectedName: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.wr-inspector-selection strong')?.textContent?.trim()`,
      true,
    );
    if (typeof selectedName !== 'string') throw new Error('Repeated Label name is missing.');
    labelName = selectedName;
    await click(window, 'button[role="tab"][aria-label="Events"]');
    await ready(window, `${calcRow} instanceof HTMLElement`);
    const screenshotPath = path.resolve(
      'node_modules',
      '.cache',
      'webrad-repeating-group-calculation-interaction.png',
    );
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    window.webContents.invalidate();
    const screenshot = await capturePresentedSmokePage(window, Date.now() + 10_000, screenshotPath);
    if (screenshot.isEmpty()) throw new Error('Repeating Group Interaction screenshot was empty.');
    await fs.writeFile(screenshotPath, screenshot.toPNG());
    await window.webContents.executeJavaScript(
      `${calcRow}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      true,
    );
    eventBound = true;
    sourceChanged = true;
    await ready(
      window,
      `(() => { const text = document.querySelector('.monaco-editor')?.textContent?.replaceAll(String.fromCharCode(160), ' ') ?? ''; return text.includes('WebRepeatingGroupCalcRowStringEventDetail') && text.includes('rowIndex, value, setValue') && !text.includes(${JSON.stringify(`async ${labelName}CalcRow`)}); })()`,
    );
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    await ready(
      window,
      `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
    );
    const saved = await loadProjectFiles(projectPath);
    const nodes = saved.project.pages.find((candidate) => candidate.id === page.id)?.components;
    const panel = nodes?.find((component) => component.id === panelId);
    const label = nodes?.find((component) => component.id === labelId);
    const source = saved.userSources[sourcePath];
    if (
      panel?.parentId !== groupId ||
      label?.parentId !== panelId ||
      label.events.OnCalcRow !== `${labelName}CalcRow` ||
      source === undefined ||
      !source.includes('WebRepeatingGroupCalcRowStringEventDetail') ||
      !source.includes(`${groupName}CurrentRow`) ||
      !source.includes('rowIndex, value, setValue')
    )
      throw new Error('Repeating Group calculation binding or typed handler was not saved.');
    log(
      `renderer Repeating Group calculation Interaction passed: contextual nested Label, synchronous typed handler, row context and setValue; screenshot ${screenshotPath}`,
    );
  } finally {
    if (sourceChanged && !window.isDestroyed()) {
      const attached = window.webContents.debugger.isAttached();
      if (!attached) window.webContents.debugger.attach('1.3');
      try {
        await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
          enabled: true,
        });
        const input = '.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea';
        await ready(
          window,
          `document.querySelector(${JSON.stringify(input)}) instanceof HTMLElement`,
        );
        await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(input)}).focus()`,
          true,
        );
        window.webContents.focus();
        await ready(
          window,
          `document.hasFocus() && document.activeElement === document.querySelector(${JSON.stringify(input)})`,
        );
        const modifiers: ('meta' | 'control')[] = [
          process.platform === 'darwin' ? 'meta' : 'control',
        ];
        // Undo the generated handler as one Monaco edit to preserve the original
        // source exactly, including indentation and line endings.
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Z', modifiers });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Z', modifiers });
        await ready(
          window,
          `document.querySelector('.monaco-editor')?.textContent?.includes(${JSON.stringify(`${labelName}CalcRow`)}) !== true`,
        );
      } finally {
        if (!window.webContents.isDestroyed() && window.webContents.debugger.isAttached()) {
          try {
            await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
              enabled: false,
            });
          } finally {
            if (!attached) window.webContents.debugger.detach();
          }
        }
      }
    }
    if (inserted > 0 && !window.isDestroyed()) {
      await click(window, 'button[aria-label="Design"]');
      await click(window, root);
      for (let index = 0; index < inserted + (eventBound ? 1 : 0); index++) {
        await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(root)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
          true,
        );
        await window.webContents.executeJavaScript(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
          true,
        );
      }
      await click(window, 'button[aria-label="Save (Ctrl+S)"]');
      await ready(
        window,
        `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
      );
      const restored = await loadProjectFiles(projectPath);
      fixtureRestored =
        restored.userSources[sourcePath] === originalSource &&
        restored.project.pages
          .find((candidate) => candidate.id === page.id)
          ?.components.some((component) => insertedIds.includes(component.id)) === false;
    }
  }
  if (!fixtureRestored) throw new Error('Repeating Group smoke did not restore the page fixture.');
}
