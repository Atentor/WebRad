import { promises as fs } from 'node:fs';
import path from 'node:path';
import { THEME_COLOR_NAMES } from '@webrad/project-model';

import type { BrowserWindow } from 'electron';
import { capturePresentedSmokePage } from './smoke-capture';

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
  const state: unknown = await window.webContents.executeJavaScript(
    `(() => {
    const frame = document.querySelector('.wr-style-preview-frame');
    const previewStyle = frame?.firstElementChild ? getComputedStyle(frame.firstElementChild) : undefined;
    return {
      previewStyle: previewStyle && { color: previewStyle.color, fontFamily: previewStyle.fontFamily, fontSize: previewStyle.fontSize, fontWeight: previewStyle.fontWeight },
      component: document.querySelector('[aria-label="Style components"] [aria-selected="true"]')?.textContent,
      style: document.querySelector('.wr-style-list [aria-selected="true"]')?.textContent,
      heading: document.querySelector('.wr-style-preview-heading')?.textContent,
      controls: Array.from(frame?.querySelectorAll('input, textarea, select') ?? []).map(control => ({ tag: control.tagName, value: control.value, html: control.outerHTML })),
      frame: frame?.innerHTML,
      error: document.querySelector('.wr-error-boundary')?.textContent,
    };
  })()`,
    true,
  );
  throw new Error(`Styles renderer smoke timed out: ${expression}; state=${JSON.stringify(state)}`);
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
    if (control instanceof HTMLInputElement && control.type === 'color')
      control.dispatchEvent(new Event('change', { bubbles: true }));
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
  const componentName =
    name === 'Default Toast'
      ? 'Toast'
      : name === 'Default Popup'
        ? 'Popup'
        : name === 'PrimaryButton'
          ? 'Button'
          : 'Page';
  await window.webContents.executeJavaScript(
    `(() => {
      const option = Array.from(document.querySelectorAll('[aria-label="Style components"] [role="option"]'))
        .find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(componentName)});
      if (!(option instanceof HTMLButtonElement)) throw new Error('Missing style component');
      const glyph = option.querySelector('.wr-style-component-glyph');
      if (!glyph || !glyph.querySelector('svg') || getComputedStyle(glyph).backgroundColor !== 'rgba(0, 0, 0, 0)')
        throw new Error('Styles component icon must have a transparent background');
      option.click();
    })()`,
    true,
  );
  await paint(window);
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
    `document.querySelector('.wr-style-library .wr-style-list [aria-selected="true"] strong')?.textContent?.trim() === ${JSON.stringify(name)}`,
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
  await setField(window, labelledControl('Font family'), 'roboto');
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
    width === 1275 ? 'webrad-styles-polished.png' : 'webrad-styles-polished-wide.png',
  );
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  window.webContents.invalidate();
  await paint(window);
  const screenshot = await capturePresentedSmokePage(
    window,
    Date.now() + 10_000,
    `Styles ${String(width)}px`,
  );
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
  for (const componentName of ['Edit', 'Text Area', 'Combo Box', 'List Box']) {
    await window.webContents.executeJavaScript(
      `(() => {
        const option = Array.from(document.querySelectorAll('[aria-label="Style components"] [role="option"]'))
          .find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(componentName)});
        if (!(option instanceof HTMLButtonElement)) throw new Error('Missing text style component');
        option.click();
      })()`,
      true,
    );
    await paint(window);
    const needsSampleStyle: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.wr-style-library .wr-style-list [role="option"]') === null`,
      true,
    );
    const sampleName = `Smoke ${componentName} sample`;
    if (needsSampleStyle === true) {
      await click(window, '.wr-style-section-heading button');
      await setField(window, '.wr-style-create-form input', sampleName);
      await click(window, '.wr-style-create-form button[type="submit"]');
    }
    try {
      await ready(
        window,
        `(() => {
        const control = document.querySelector('.wr-style-preview-frame input, .wr-style-preview-frame textarea, .wr-style-preview-frame select');
        return (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)
          && control.value.includes('Sample text');
      })()`,
      );
      if (componentName === 'Edit') {
        await setField(window, searchSelector, 'label position');
        const configure = labelledControl('Configure Label position');
        const position = labelledControl('Label position');
        await ready(window, `document.querySelector(${JSON.stringify(configure)}) !== null`);
        const configured: unknown = await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(configure)}).checked`,
          true,
        );
        if (configured !== true) await click(window, configure);
        const previousPosition: unknown = await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(position)}).value`,
          true,
        );
        if (typeof previousPosition !== 'string') throw new Error('Missing Edit label position.');
        await setField(window, position, 'right');
        await ready(
          window,
          `(() => {
          const field = document.querySelector('.wr-style-preview-frame .wr-webedit');
          const label = field?.querySelector('.wr-edit-label');
          return label?.textContent === 'Label' && label.getBoundingClientRect().left >= field.getBoundingClientRect().right;
        })()`,
        );
        await setField(window, position, previousPosition);
        if (configured !== true) await click(window, labelledControl('Clear Label position'));
        await setField(window, searchSelector, 'icon position');
        const iconConfigure = labelledControl('Configure Icon position');
        const iconPosition = labelledControl('Icon position');
        await ready(window, `document.querySelector(${JSON.stringify(iconConfigure)}) !== null`);
        const iconConfigured: unknown = await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(iconConfigure)}).checked`,
          true,
        );
        if (iconConfigured !== true) await click(window, iconConfigure);
        const previousIconPosition: unknown = await window.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(iconPosition)}).value`,
          true,
        );
        if (typeof previousIconPosition !== 'string')
          throw new Error('Missing Edit icon position.');
        await setField(window, iconPosition, 'right');
        await ready(
          window,
          `(() => {
          const field = document.querySelector('.wr-style-preview-frame .wr-webedit');
          const icon = field?.querySelector('.wr-edit-icon');
          const input = field?.querySelector('.wr-edit-input');
          if (!field || !icon || !input) return false;
          const fieldBounds = field.getBoundingClientRect();
          const iconBounds = icon.getBoundingClientRect();
          const style = getComputedStyle(field);
          const edgeGap = fieldBounds.right - iconBounds.right - parseFloat(style.borderRightWidth);
          const expectedGap = Math.max(0, parseFloat(style.paddingRight) - 4);
          return iconBounds.left >= input.getBoundingClientRect().right && Math.abs(edgeGap - expectedGap) <= 1.5;
        })()`,
        );
        await setField(window, iconPosition, previousIconPosition);
        if (iconConfigured !== true) await click(window, labelledControl('Clear Icon position'));
        await setField(window, searchSelector, '');
        options.log(
          'renderer Edit label style preview passed: label and icon position controls and right placement',
        );
      }
    } finally {
      if (needsSampleStyle === true) {
        await window.webContents.executeJavaScript(
          `(() => {
            const button = document.querySelector(${JSON.stringify('[aria-label="Delete ' + sampleName + '"]')});
            if (!(button instanceof HTMLButtonElement)) throw new Error('Missing temporary sample style delete control');
            const confirm = window.confirm;
            window.confirm = () => true;
            try { button.click(); } finally { window.confirm = confirm; }
          })()`,
          true,
        );
        await paint(window);
      }
    }
  }
  await selectStyle(window, 'Default Toast');
  await ready(
    window,
    `(() => {
    const cards = [...document.querySelectorAll('.wr-style-preview-frame .wr-toast-item')];
    return cards.length === 4 && cards.every(card => getComputedStyle(card).boxShadow !== 'none' && card.querySelector('.wr-toast-icon') !== null);
  })()`,
  );
  const toastPreview: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const frame = document.querySelector('.wr-style-preview-frame');
      const preview = frame?.querySelector('.wr-toast-preview');
      const cards = [...(preview?.querySelectorAll('.wr-toast-item') ?? [])];
      if (!(frame instanceof HTMLElement) || !(preview instanceof HTMLElement) || cards.length !== 4) return null;
      const bounds = frame.getBoundingClientRect();
      const states = ['sucess', 'alert', 'danger', 'notifier'];
      return cards.map((card, index) => {
        const item = card.getBoundingClientRect();
        const icon = card.querySelector('.wr-toast-icon');
        const button = card.querySelector('.wr-toast-close');
        return {
          state: card.dataset.toastState, expected: states[index],
          shadow: getComputedStyle(card).boxShadow,
          left: item.left - bounds.left, right: bounds.right - item.right,
          top: item.top - bounds.top, bottom: bounds.bottom - item.bottom,
          icon: icon instanceof SVGElement && Math.abs(icon.getBoundingClientRect().width - 22) < 0.1 && Math.abs(icon.getBoundingClientRect().height - 22) < 0.1 && getComputedStyle(icon).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(icon).backgroundImage === 'none',
          dismiss: button instanceof HTMLButtonElement && button.querySelector('svg') !== null,
        };
      });
    })()`,
    true,
  );
  if (
    !Array.isArray(toastPreview) ||
    toastPreview.length !== 4 ||
    toastPreview.some(
      (item: {
        state: string;
        expected: string;
        shadow: string;
        left: number;
        right: number;
        top: number;
        bottom: number;
        icon: boolean;
        dismiss: boolean;
      }) =>
        item.state !== item.expected ||
        item.shadow === 'none' ||
        Math.min(item.left, item.right, item.top, item.bottom) < 30 ||
        !item.icon ||
        !item.dismiss,
    )
  )
    throw new Error(
      'Toast Styles preview clips the shadow or is missing its icon and close button: ' +
        JSON.stringify(toastPreview),
    );
  const toastScreenshot = path.resolve('node_modules', '.cache', 'webrad-toast-styles-polish.png');
  await fs.mkdir(path.dirname(toastScreenshot), { recursive: true });
  window.webContents.invalidate();
  await paint(window);
  const toastCapture = await capturePresentedSmokePage(
    window,
    Date.now() + 10_000,
    'Toast Styles preview',
  );
  if (toastCapture.isEmpty()) throw new Error('Toast Styles screenshot is empty.');
  await fs.writeFile(toastScreenshot, toastCapture.toPNG());
  options.log(
    'renderer Toast style preview passed: four states, icons, dismiss controls and uncut shadow space; screenshot=' +
      toastScreenshot,
  );
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
  await window.webContents.executeJavaScript(
    `document.querySelector('.wr-style-name-field input').focus()`,
    true,
  );
  await setField(window, '.wr-style-name-field input', 'Discard this smoke rename');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await ready(
    window,
    `document.querySelector('.wr-style-name-field input')?.value === 'PrimaryButton' && document.querySelector('.wr-style-library .wr-style-list [aria-selected="true"] strong')?.textContent?.trim() === 'PrimaryButton'`,
  );
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
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(labelledControl('Transition duration'))}).focus()`,
    true,
  );
  await setField(window, labelledControl('Transition duration'), '');
  await setField(window, labelledControl('Transition duration'), '-');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Transition duration'))})?.value === '200' && document.querySelector(${JSON.stringify(labelledControl('Transition duration'))})?.getAttribute('role') === 'spinbutton'`,
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
  await setField(window, searchSelector, 'text color');
  await click(window, labelledControl('Predefined colors for Text color'));
  await click(window, '[aria-label="Use theme text for Text color"]');
  await setField(window, '[aria-label="Style theme layer"]', 'dark');
  await setField(window, searchSelector, 'text color');
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Set Text color'))})?.getAttribute('data-style-inherited-from') === 'Shared / Base'`,
  );
  await click(window, labelledControl('Configure Text color'));
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Text color'))})?.value === '#f1f5f9'`,
  );
  await click(window, labelledControl('Clear Text color'));
  await ready(
    window,
    `document.querySelector(${JSON.stringify(labelledControl('Set Text color'))})?.getAttribute('data-style-inherited-from') === 'Shared / Base'`,
  );
  await setField(window, '[aria-label="Style theme layer"]', 'shared');
  await setField(window, '[aria-label="Styles preview theme"]', 'light');
  options.log(
    'renderer UX Styles editing passed: native Escape cancels rename and incomplete numeric drafts; theme override inherits Shared value and origin; clearing restores inheritance',
  );
  const typography: unknown = await window.webContents.executeJavaScript(`(() => {
    const node = document.querySelector('.wr-style-preview-frame .wr-webpage');
    if (!(node instanceof HTMLElement)) throw new Error('Missing theme typography sample');
    const style = getComputedStyle(node);
    if (!style.fontFamily.includes('Roboto')) throw new Error('Default theme font must be Roboto');
    return [style.fontFamily.split(',')[0].trim(), style.fontSize, style.fontWeight];
  })()`);
  for (const [mode, expected] of [
    ['dark', 'rgb(241, 245, 249)'],
    ['light', 'rgb(15, 23, 42)'],
  ] as const) {
    await setField(window, '[aria-label="Styles preview theme"]', mode);
    await ready(
      window,
      `(() => {
      const node = document.querySelector('.wr-style-preview-frame .wr-webpage');
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      return style.color === ${JSON.stringify(expected)} &&
        JSON.stringify([style.fontFamily.split(',')[0].trim(), style.fontSize, style.fontWeight]) === ${JSON.stringify(JSON.stringify(typography))};
    })()`,
    );
  }
  await click(window, '[aria-label="Themes"]');
  await ready(
    window,
    `document.querySelectorAll('[data-theme-role]').length === ${String(THEME_COLOR_NAMES.length)} && document.querySelector('[aria-label="Color palette"]') === null`,
  );
  const originalTheme: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('[aria-label="Initial application theme"]')?.value`,
    true,
  );
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-styles-themes-panel button')).find((button) => button.textContent.trim() === 'Add color').click()`,
    true,
  );
  await paint(window);
  const customId: unknown = await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('[data-custom-theme-color]')).at(-1)?.getAttribute('data-custom-theme-color')`,
    true,
  );
  if (typeof customId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(customId))
    throw new Error('Missing custom theme color.');
  await setField(window, `[aria-label="Color ${customId} name"]`, 'Smoke brand');
  await setField(window, `[aria-label="light ${customId} value"]`, '#0d9488');
  await ready(
    window,
    `document.querySelector('[aria-label="dark ${customId} value"]')?.value === '#0d9488' && document.querySelector('[aria-label="dark ${customId} value"]')?.disabled === true`,
  );
  await click(window, `[aria-label="Use same color in both themes for ${customId}"]`);
  await setField(window, `[aria-label="dark ${customId} value"]`, '#5eead4');
  await setField(window, '[aria-label="Initial application theme"]', 'system');
  await click(window, '.wr-styles-themes-panel .wr-styles-theme-actions button:last-child');
  await click(window, '[aria-label="Themes"]');
  await ready(
    window,
    `document.querySelector('[aria-label="Initial application theme"]')?.value === 'system' && document.querySelector('[aria-label="Color ${customId} name"]')?.value === 'Smoke brand' && document.querySelector('[aria-label="light ${customId} value"]')?.value === '#0d9488' && document.querySelector('[aria-label="dark ${customId} value"]')?.value === '#5eead4' && document.querySelector('[aria-label="Use same color in both themes for ${customId}"]')?.checked === false`,
  );
  await click(window, `[aria-label="Remove theme color ${customId}"]`);
  await setField(window, '[aria-label="Initial application theme"]', String(originalTheme));
  await click(window, '.wr-styles-themes-panel .wr-styles-theme-actions button:last-child');
  options.log(
    'renderer unified themes Styles passed: Color palette absent / semantic color picker / Light and Dark rendered colors / fixed and adaptive custom colors / saved System mode / original mode restored',
  );
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
  options.log(
    'renderer Styles presented screenshots passed: Toast, 1275px and 1600px; newly presented marker-free images',
  );
}
