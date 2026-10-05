import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

interface StylesSmokeOptions {
  readonly log: (message: string) => void;
}

const editorSelector = '.wr-style-visual-editor';
const searchSelector = `${editorSelector} input[type="search"]`;

function labelledControl(label: string): string {
  switch (label) {
    case 'Essential':
      return '.wr-style-property-views button:nth-of-type(1)';
    case 'All properties':
      return '.wr-style-property-views button:nth-of-type(2)';
    case 'Configured':
      return '.wr-style-property-views button:nth-of-type(3)';
    default:
      return `${editorSelector} [aria-label=${JSON.stringify(label)}]`;
  }
}

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result: unknown = await window.webContents.executeJavaScript(expression, true);
    if (result === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Styles renderer smoke timed out: ${expression}`);
}

async function paint(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => { const timer = setTimeout(resolve, 100); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); })); })',
    true,
  );
}

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

async function setField(window: BrowserWindow, selector: string, value: string): Promise<void> {
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) !== null`);
  await window.webContents.executeJavaScript(
    `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement) || control.disabled) throw new Error('Missing Styles input');
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

async function selectStyle(window: BrowserWindow, name: string): Promise<void> {
  const selected: unknown = await window.webContents.executeJavaScript(
    `(() => {
    const option = Array.from(document.querySelectorAll('.wr-style-list [role="option"]'))
      .find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(name)});
    if (!(option instanceof HTMLButtonElement)) return false;
    option.click();
    return true;
  })()`,
    true,
  );
  if (selected !== true) throw new Error(`Missing Styles library option: ${name}`);
  await paint(window);
  await ready(
    window,
    `document.querySelector('.wr-style-list [aria-selected="true"] strong')?.textContent?.trim() === ${JSON.stringify(name)}`,
  );
}

async function createPageSnapshotStyle(window: BrowserWindow): Promise<void> {
  await click(window, '.wr-style-section-heading button');
  await setField(window, '.wr-style-create-form select', 'WebPage');
  await setField(window, '.wr-style-create-form input', 'Page Surface');
  await click(window, '.wr-style-create-form button[type="submit"]');
  await selectStyle(window, 'Page Surface');
  for (const [label, color] of [
    ['Background color', '#f8fbff'],
    ['Text color', '#0f172a'],
  ] as const) {
    await setField(window, searchSelector, label.toLowerCase());
    await click(window, labelledControl('Configure ' + label));
    await setField(window, labelledControl(label + ' type'), 'custom');
    await setField(window, labelledControl(label), color);
  }
  await setField(window, searchSelector, 'font family');
  await click(window, labelledControl('Configure Font family'));
  await setField(window, labelledControl('Font family'), 'sans');
  await click(window, labelledControl('Essential'));
  await assertDefaultFilters(window);
}

async function deletePageSnapshotStyle(window: BrowserWindow): Promise<void> {
  const removed: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('[aria-label="Delete Page Surface"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      const confirm = window.confirm;
      window.confirm = () => true;
      try { button.click(); } finally { window.confirm = confirm; }
      return true;
    })()`,
    true,
  );
  if (removed !== true) throw new Error('Missing temporary Page style delete control.');
  await paint(window);
  await selectStyle(window, 'Default Popup');
}

async function propertyCount(window: BrowserWindow): Promise<number> {
  const result: unknown = await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-style-category-summary')).reduce((count, button) => {
      const match = button.getAttribute('aria-label')?.match(/(\\d+) properties$/);
      return count + Number(match?.[1] ?? 0);
    }, 0)`,
    true,
  );
  if (typeof result !== 'number' || result <= 0)
    throw new Error(`Styles property count is invalid: ${JSON.stringify(result)}`);
  return result;
}

async function assertDefaultFilters(window: BrowserWindow): Promise<void> {
  await ready(
    window,
    `document.querySelector(${JSON.stringify(searchSelector)})?.value === '' && document.querySelector(${JSON.stringify(labelledControl('Essential'))})?.getAttribute('aria-pressed') === 'true'`,
  );
}

async function captureStyles(window: BrowserWindow, width: number): Promise<string> {
  window.setContentSize(width, 900);
  await ready(window, `innerWidth === ${String(width)}`);
  await paint(window);
  await window.webContents.executeJavaScript(
    `(() => {
      const list = document.querySelector('.wr-style-property-categories');
      if (list instanceof HTMLElement) list.scrollTop = 0;
      const library = document.querySelector('.wr-style-library-content');
      if (library instanceof HTMLElement) library.scrollTop = 0;
      document.activeElement?.blur();
    })()`,
    true,
  );
  const geometry: unknown = await window.webContents.executeJavaScript(
    `(() => {
const workspace = document.querySelector('.wr-styles-workspace');
const editor = document.querySelector(${JSON.stringify(editorSelector)});
const layout = document.querySelector('.wr-style-editor-layout');
const list = document.querySelector('.wr-style-property-categories');
const preview = document.querySelector('.wr-style-component-preview');
if (!(workspace instanceof HTMLElement && editor instanceof HTMLElement && layout instanceof HTMLElement && list instanceof HTMLElement && preview instanceof HTMLElement)) return { ready: false };
const workspaceBounds = workspace.getBoundingClientRect();
const editorBounds = editor.getBoundingClientRect();
const layoutBounds = layout.getBoundingClientRect();
const listBounds = list.getBoundingClientRect();
const previewBounds = preview.getBoundingClientRect();
return {
ready: true,
width: innerWidth,
layoutWidth: Math.round(layoutBounds.width),
editorWidth: Math.round(editorBounds.width),
previewWidth: Math.round(previewBounds.width),
noInspector: document.querySelector('.wr-inspector-slot') === null,
contained: workspace.scrollWidth <= workspace.clientWidth + 1 && list.scrollWidth <= list.clientWidth + 1 && editorBounds.left >= workspaceBounds.left && previewBounds.right <= workspaceBounds.right + 1 && listBounds.bottom <= workspaceBounds.bottom + 1,
compactPreview: layoutBounds.width <= 700 ? previewBounds.bottom <= editorBounds.top + 1 && previewBounds.width <= editorBounds.width + 1 : previewBounds.width < editorBounds.width && previewBounds.left >= editorBounds.right - 1,
sideColumn: innerWidth < 1275 || (layoutBounds.width > 700 && previewBounds.left >= editorBounds.right - 1),
scrollingProperties: getComputedStyle(list).overflowY === 'auto'
};
})()`,
    true,
  );
  if (
    typeof geometry !== 'object' ||
    geometry === null ||
    Reflect.get(geometry, 'ready') !== true ||
    Reflect.get(geometry, 'contained') !== true ||
    Reflect.get(geometry, 'compactPreview') !== true ||
    Reflect.get(geometry, 'scrollingProperties') !== true ||
    Reflect.get(geometry, 'noInspector') !== true ||
    Reflect.get(geometry, 'sideColumn') !== true
  ) {
    throw new Error(`Styles viewport smoke failed: ${JSON.stringify(geometry)}`);
  }
  const screenshotPath = path.resolve(
    'node_modules',
    '.cache',
    width === 1275 ? 'styles-polished.png' : 'styles-polished-wide.png',
  );
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  window.webContents.invalidate();
  await paint(window);
  const screenshot = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (screenshot.isEmpty()) throw new Error('Styles screenshot is empty.');
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  return `${JSON.stringify(geometry)}; screenshot=${screenshotPath}`;
}

/** Exercises filtering and reversible edits in the real renderer before existing Designer checks. */
export async function runStylesWorkspaceSmoke(
  window: BrowserWindow,
  options: StylesSmokeOptions,
): Promise<void> {
  const originalSize = window.getContentSize();
  await selectStyle(window, 'Default Popup');
  await assertDefaultFilters(window);
  const essentialCount = await propertyCount(window);
  await click(window, labelledControl('All properties'));
  const allCount = await propertyCount(window);
  if (allCount <= essentialCount)
    throw new Error(
      `Styles Essential filter did not reduce properties: ${String(essentialCount)}/${String(allCount)}`,
    );
  await setField(window, searchSelector, 'display');
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Configure Display'))}) !== null`,
  );

  await selectStyle(window, 'PrimaryButton');
  await assertDefaultFilters(window);
  await click(window, '.wr-style-category-summary[aria-label^="Motion,"]');
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Configure Transition duration'))})?.checked === true && document.querySelector(${JSON.stringify(labelledControl('Transition duration'))})?.value === '200'`,
  );

  await setField(window, searchSelector, 'transition duration');
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Transition duration'))})?.value === '200'`,
  );
  await setField(window, labelledControl('Transition duration'), '350');
  await click(window, labelledControl('Clear Transition duration'));
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Configure Transition duration'))})?.checked === false`,
  );
  await click(window, labelledControl('Configure Transition duration'));
  await setField(window, labelledControl('Transition duration'), '200');
  await setField(window, searchSelector, 'background color');
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Background color'))})?.value === '#0284c7'`,
  );

  await click(window, labelledControl('Configured'));
  await setField(window, searchSelector, 'transition');
  await click(window, '.wr-style-state-strip [aria-label="Hover"]');
  await assertDefaultFilters(window);
  await click(window, labelledControl('All properties'));
  await setField(window, searchSelector, 'transform');
  await selectStyle(window, 'Default Popup');
  await assertDefaultFilters(window);

  await createPageSnapshotStyle(window);
  const captures: string[] = [];
  try {
    for (const width of [1275, 1600]) captures.push(await captureStyles(window, width));
  } finally {
    await deletePageSnapshotStyle(window);
    const [width, height] = originalSize;
    if (width !== undefined && height !== undefined) window.setContentSize(width, height);
    await paint(window);
  }
  options.log(
    `renderer Styles intelligent filtering passed: ${String(essentialCount)}/${String(allCount)} properties; configured uncommon retained; full search/edit/clear/reset passed; ${captures.join('; ')}`,
  );
}
