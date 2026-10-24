import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { loadProjectFiles } from './project-files';

interface DataGridSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
}

const dialogSelector = '.wr-data-grid-configuration-dialog';
const toggleValues = [
  ['Show Data Grid header', 'showHeader', true],
  ['Keep Data Grid header fixed', 'stickyHeader', false],
  ['Show Data Grid footer', 'showFooter', true],
  ['Keep Data Grid footer fixed', 'stickyFooter', false],
  ['Wrap Data Grid text', 'wrapText', true],
  ['Stripe Data Grid rows', 'stripedRows', true],
  ['Show Data Grid horizontal lines', 'showHorizontalLines', false],
  ['Show Data Grid vertical lines', 'showVerticalLines', true],
] as const;

function labelledControl(label: string): string {
  return `${dialogSelector} [aria-label=${JSON.stringify(label)}]`;
}

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value: unknown = await window.webContents.executeJavaScript(expression, true);
    if (value === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Data Grid renderer smoke timed out: ${expression}`);
}

async function paint(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => { const timer = setTimeout(resolve, 100); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); })); })',
    true,
  );
}

/** Each action occupies its own renderer turn so deferred React updates are exercised. */
async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(
    window,
    `(() => { const control = document.querySelector(${JSON.stringify(selector)}); return control instanceof HTMLElement && !control.disabled; })()`,
  );
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
    true,
  );
  await paint(window);
}

async function setField(window: BrowserWindow, label: string, value: string): Promise<void> {
  const selector = labelledControl(label);
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) !== null`);
  await window.webContents.executeJavaScript(
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement) || control.disabled) throw new Error('Missing editable Data Grid control');
      const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }));
    })()`,
    true,
  );
  await paint(window);
  await ready(
    window,
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
  );
}

async function setChecked(window: BrowserWindow, label: string, checked: boolean): Promise<void> {
  const selector = labelledControl(label);
  const current: unknown = await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)})?.checked`,
    true,
  );
  if (typeof current !== 'boolean') throw new Error(`Missing Data Grid toggle ${label}.`);
  if (current !== checked) await click(window, selector);
  await ready(
    window,
    `document.querySelector(${JSON.stringify(selector)})?.checked === ${String(checked)}`,
  );
}

async function openConfiguration(window: BrowserWindow): Promise<void> {
  await click(window, 'button[aria-label="Configure Data Grid"]');
  await ready(window, `document.querySelector(${JSON.stringify(dialogSelector)}) !== null`);
}

async function assertSavedEditor(window: BrowserWindow): Promise<void> {
  const fields = [
    ['Data Grid row height mode', 'dynamic'],
    ['Minimum Data Grid row height', '44'],
    ['Maximum Data Grid row height', '88'],
    ['Data Grid horizontal cell padding', '12'],
    ['Data Grid vertical cell padding', '6'],
    ['Data Grid empty-state message', 'No records match'],
    ['Header for Data Grid column 1', 'Actions'],
    ['Cell type for Data Grid column 1', 'button'],
    ['Fixed caption for Data Grid column 1', 'Open record'],
    ['Footer for Data Grid column 1', '3 records'],
    ['Width mode for Data Grid column 1', 'fixed'],
    ['Fixed width for Data Grid column 1', '240'],
  ];
  await ready(
    window,
    `(() => {
      const fields = ${JSON.stringify(fields)};
      const toggles = ${JSON.stringify(toggleValues)};
      const control = (label) => document.querySelector(${JSON.stringify(dialogSelector)} + ' [aria-label="' + label + '"]');
      return fields.every(([label, value]) => control(label)?.value === value) &&
        toggles.every(([label, , checked]) => control(label)?.checked === checked) &&
        control('Button icon for Data Grid column 1')?.textContent?.includes('Check') === true;
    })()`,
  );
}

async function captureConfiguration(
  window: BrowserWindow,
  theme: 'dark' | 'light',
  width: number,
  showColumns = false,
): Promise<string> {
  const current: unknown = await window.webContents.executeJavaScript(
    'document.documentElement.dataset.theme',
    true,
  );
  if (current !== theme) window.webContents.send('webrad:menu-command', 'view.toggleTheme');
  window.setContentSize(width, 820);
  await ready(
    window,
    `document.documentElement.dataset.theme === ${JSON.stringify(theme)} && innerWidth === ${String(width)}`,
  );
  await paint(window);
  await window.webContents.executeJavaScript(
    `(() => {
 const content = document.querySelector(".wr-data-grid-configuration-content");
 if (${String(showColumns)}) {
  const column = content.querySelector(".wr-data-grid-column-card");
  column.querySelector("input")?.focus({ preventScroll: true });
  content.scrollTop = 0;
  content.scrollTop = column.getBoundingClientRect().top - content.getBoundingClientRect().top;
 } else { content.scrollTop = 0; }
})()`,
    true,
  );
  if (showColumns)
    await ready(
      window,
      `document.querySelector(".wr-data-grid-configuration-content")?.scrollTop > 0`,
    );
  await paint(window);
  const geometry: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const dialog = document.querySelector(${JSON.stringify(dialogSelector)});
      const content = dialog?.querySelector('.wr-data-grid-configuration-content');
      const footer = dialog?.querySelector('.wr-data-grid-configuration-actions');
      if (!(dialog instanceof HTMLElement && content instanceof HTMLElement && footer instanceof HTMLElement)) return false;
      const bounds = dialog.getBoundingClientRect();
      const contentBounds = content.getBoundingClientRect();
      const footerBounds = footer.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight &&
        content.scrollWidth <= content.clientWidth + 1 && content.scrollHeight > content.clientHeight &&
        footerBounds.top >= contentBounds.bottom - 1 && footerBounds.bottom <= bounds.bottom + 1 &&
        getComputedStyle(content).overflowY === 'auto' && dialog.contains(document.activeElement);
    })()`,
    true,
  );
  if (geometry !== true)
    throw new Error(`Data Grid dialog overflow/focus at ${theme}/${String(width)}.`);
  const screenshotPath = path.resolve(
    'node_modules',
    '.cache',
    `webrad-data-grid-${theme}-${showColumns ? 'columns-' : ''}${String(width)}.png`,
  );
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  window.webContents.invalidate();
  await paint(window);
  const screenshot = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (screenshot.isEmpty()) throw new Error('Data Grid smoke screenshot was empty.');
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  return screenshotPath;
}

/** Real renderer regression coverage; the temporary component is removed through history. */
export async function runDataGridConfigurationSmoke(
  window: BrowserWindow,
  { projectPath, log }: DataGridSmokeOptions,
): Promise<void> {
  log('renderer Data Grid smoke started');
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((candidate) => candidate.name === 'index');
  if (page === undefined)
    throw new Error('Data Grid smoke requires the isolated index fixture.');
  const bounds = window.getBounds();
  const minimumSize = window.getMinimumSize();
  const wasMaximized = window.isMaximized();
  const originalTheme: unknown = await window.webContents.executeJavaScript(
    'document.documentElement.dataset.theme',
    true,
  );
  const errors: string[] = [];
  const captureError = (_event: unknown, level: number, message: string): void => {
    if (level === 3) errors.push(message);
  };
  window.webContents.on('console-message', captureError);
  let gridId: string | undefined;
  let saved = false;
  try {
    if (wasMaximized) window.unmaximize();
    // macOS treats 0x0 as unspecified and keeps Cocoa's previous minimum.
    window.setMinimumSize(1, 1);
    await click(window, 'button[aria-label="Design"]');
    await click(
      window,
      `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`,
    );
    await click(window, 'button[role="tab"][aria-label="Properties"]');
    await ready(
      window,
      `Array.from(document.querySelectorAll('.wr-palette-item')).some((item) => item.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Data Grid')`,
    );
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.wr-palette-item')).find((item) => item.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Data Grid').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      true,
    );
    await paint(window);
    await ready(
      window,
      `document.querySelector('.wr-design-hit.selected [data-component-type="WebDataGrid"], .wr-design-hit.selected[data-component-type="WebDataGrid"]') !== null || document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('DataGrid') === true`,
    );
    const selected: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
      true,
    );
    if (typeof selected !== 'string' || selected.length === 0)
      throw new Error('Data Grid was not selected after palette insertion.');
    gridId = selected;
    await openConfiguration(window);
    log('renderer Data Grid smoke configuration opened');
    for (let round = 0; round < 2; round++) {
      await setChecked(window, 'Show Data Grid header', true);
      await setChecked(window, 'Show Data Grid footer', true);
      for (const [label] of toggleValues) {
        await setChecked(window, label, false);
        if (label === 'Show Data Grid header' || label === 'Show Data Grid footer') {
          const sticky =
            label === 'Show Data Grid header'
              ? 'Keep Data Grid header fixed'
              : 'Keep Data Grid footer fixed';
          await ready(
            window,
            `document.querySelector(${JSON.stringify(labelledControl(sticky))})?.disabled === true`,
          );
        }
        await setChecked(window, label, true);
      }
    }
    for (const [label, , checked] of toggleValues) await setChecked(window, label, checked);
    log('renderer Data Grid smoke toggles complete');
    for (let round = 0; round < 2; round++) {
      await setField(window, 'Data Grid row height mode', 'fixed');
      await setField(window, 'Fixed Data Grid row height', '52');
      await setField(window, 'Data Grid row height mode', 'dynamic');
      await setField(window, 'Width mode for Data Grid column 1', 'dynamic');
      await setField(window, 'Minimum width for Data Grid column 1', '128');
      await setField(window, 'Maximum width for Data Grid column 1', '360');
      await setField(window, 'Flex grow for Data Grid column 1', '2');
      await setField(window, 'Width mode for Data Grid column 1', 'fixed');
      await setField(window, 'Fixed width for Data Grid column 1', '240');
    }
    for (const kind of ['image', 'checkbox', 'button', 'text', 'button']) {
      await setField(window, 'Cell type for Data Grid column 1', kind);
    }
    for (const [label, value] of [
      ['Minimum Data Grid row height', '44'],
      ['Maximum Data Grid row height', '88'],
      ['Data Grid horizontal cell padding', '12'],
      ['Data Grid vertical cell padding', '6'],
      ['Data Grid empty-state message', 'No records match'],
      ['Header for Data Grid column 1', 'Actions'],
      ['Fixed caption for Data Grid column 1', 'Open record'],
      ['Footer for Data Grid column 1', '3 records'],
    ] as const)
      await setField(window, label, value);
    await click(window, labelledControl('Button icon for Data Grid column 1'));
    await click(window, '.wr-icon-picker-dialog [data-icon-picker-option="check"]');
    await ready(window, `document.querySelector('.wr-icon-picker-dialog') === null`);
    await assertSavedEditor(window);
    log('renderer Data Grid smoke edits complete');
    const screenshots: string[] = [];
    for (const width of [970, 640]) {
      for (const theme of ['dark', 'light'] as const)
        screenshots.push(await captureConfiguration(window, theme, width));
    }
    screenshots.push(await captureConfiguration(window, 'dark', 970, true));
    await click(window, '.wr-data-grid-configuration-actions button.primary');
    await ready(window, `document.querySelector(${JSON.stringify(dialogSelector)}) === null`);
    saved = true;
    await openConfiguration(window);
    await assertSavedEditor(window);
    await setField(window, 'Header for Data Grid column 1', 'Discard this edit');
    await setChecked(window, 'Wrap Data Grid text', false);
    await setField(window, 'Data Grid row height mode', 'fixed');
    await click(window, '.wr-data-grid-configuration-actions button:not(.primary)');
    await openConfiguration(window);
    await assertSavedEditor(window);
    await click(window, 'button[aria-label="Close Data Grid configuration"]');
    if (errors.length > 0) throw new Error(`Data Grid renderer errors: ${errors.join('\n')}`);
    log(
      `renderer Data Grid configuration passed: 2 rounds of all 8 toggles; row/column modes; cell kinds and icon picker; save, reopen, cancel; screenshots ${screenshots.join(', ')}`,
    );
  } finally {
    if (gridId !== undefined && !window.isDestroyed()) {
      if (
        await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(dialogSelector)}) !== null`,
          true,
        )
      ) {
        await click(window, 'button[aria-label="Close Data Grid configuration"]');
      }
      const treeSelector = `[role="treeitem"][data-component-id=${JSON.stringify(gridId)}]`;
      await click(window, treeSelector);
      for (let undo = 0; undo < (saved ? 2 : 1); undo++) {
        await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(treeSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
          true,
        );
        await paint(window);
      }
      await ready(window, `document.querySelector(${JSON.stringify(treeSelector)}) === null`);
      await click(
        window,
        `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`,
      );
      await click(window, 'button[aria-label="Save (Ctrl+S)"]');
      await ready(window, `document.querySelector(".wr-status-ready")?.textContent === "Ready"`);
      log(
        'renderer Data Grid fixture restored: configuration and insertion undone, original fixture saved',
      );
    }
    window.webContents.off('console-message', captureError);
    if (!window.isDestroyed()) {
      const theme: unknown = await window.webContents.executeJavaScript(
        'document.documentElement.dataset.theme',
        true,
      );
      if (theme !== originalTheme)
        window.webContents.send('webrad:menu-command', 'view.toggleTheme');
      window.setBounds(bounds);
      window.setMinimumSize(minimumSize[0] ?? 0, minimumSize[1] ?? 0);
      if (wasMaximized) window.maximize();
    }
  }
}
