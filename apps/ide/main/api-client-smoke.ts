import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import path from 'node:path';

import { componentRegistry } from '@webrad/component-registry';
import { compileProjectToMemory } from './compiler-service';
import {
  createDefaultApiClientConfiguration,
  createProject,
  DEFAULT_REST_GO_PROJECT_SETTINGS,
} from '@webrad/project-model';
import { BrowserWindow } from 'electron';

import { publishPreviewHtml, revokePreview } from './preview-server';
import { resizeSmokeViewport } from './smoke-viewport';
import { capturePresentedSmokePage } from './smoke-capture';
import type { RestGoAdminEndpoint } from '../shared/restgo-admin';

interface ApiClientDesignerSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
  readonly screenshotPath?: string;
}

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  let lastResult: unknown;
  while (Date.now() < deadline) {
    lastResult = await window.webContents.executeJavaScript(expression, true);
    if (lastResult === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const evidence: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const workspace = document.querySelector('.wr-restgo-workspace');
      const configuration = document.querySelector('.wr-restgo-runtime-settings');
      const enabled = configuration?.querySelector('input[type="checkbox"]');
      const instance = configuration?.querySelector('input[type="url"]');
      const development = document.querySelector('.wr-restgo-development-login');
      const fieldset = development?.querySelector('fieldset');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        dialog: document.querySelector('.wr-api-client-dialog') !== null,
        method: document.querySelector('[aria-label="Method"]')?.value,
        notes: [...document.querySelectorAll('.wr-api-client-dialog [role="note"], .wr-api-client-dialog [role="alert"]')].map(note => note.textContent),
        buttons: [...document.querySelectorAll('.wr-api-client-dialog button')].map(button => ({ label: button.getAttribute('aria-label'), text: button.textContent?.trim(), disabled: button.matches(':disabled') })),
        focused: document.activeElement?.getAttribute('aria-label'),
        restGo: {
          mounted: workspace !== null,
          hidden: workspace !== null && workspace.closest('[hidden]') !== null,
          busy: workspace?.getAttribute('aria-busy'),
          applicationEnabled: enabled?.checked,
          instanceUrl: instance?.value,
          toggleDisabled: enabled?.matches(':disabled'),
          applyDisabled: configuration?.querySelector('button[type="submit"]')?.matches(':disabled'),
          configurationApplied: configuration?.textContent.includes('Up to date'),
          projectedInstance: document.querySelector('.wr-restgo-sidebar-instance small')?.textContent,
          projectedEnabled: document.querySelector('.wr-restgo-sidebar-instance .wr-restgo-dot')?.classList.contains('is-active'),
          alerts: [...document.querySelectorAll('.wr-restgo-workspace [role="alert"], .wr-error-boundary')].map(element => element.textContent),
          developmentPresent: development !== null,
          developmentBusy: development?.getAttribute('aria-busy'),
          developmentFieldsetPresent: fieldset !== null && fieldset !== undefined,
          developmentDisabled: fieldset?.matches(':disabled'),
          developmentConnected: development !== null && development.querySelector('[role="status"]') !== null,
        },
      };
    })()`,
    true,
  );
  throw new Error(
    `API Client smoke timed out: ${JSON.stringify({ expression, lastResult, evidence })}`,
  );
}

async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(
    window,
    `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLElement) || control.matches(':disabled')) return false;
    control.click();
    return true;
  })()`,
  );
}

async function setControl(window: BrowserWindow, selector: string, value: string): Promise<void> {
  await ready(
    window,
    `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || control.matches(':disabled') || control.readOnly) return false;
    const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype
      : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
  );
  await ready(
    window,
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
  );
}

async function clickText(
  window: BrowserWindow,
  text: string,
  scope = '.wr-api-client-dialog',
): Promise<void> {
  await ready(
    window,
    `(() => {
    const control = Array.from(document.querySelectorAll(${JSON.stringify(`${scope} button, ${scope} summary`)}))
      .find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(text)} || candidate.textContent.trim() === ${JSON.stringify(text)} ||
        (candidate.getAttribute('role') === 'tab' && candidate.textContent.trim().replace(/ \\(\\d+\\)$/, '') === ${JSON.stringify(text)}));
    if (!(control instanceof HTMLElement) || control.matches(':disabled')) return false;
    control.click();
    return true;
  })()`,
  );
}

async function capture(window: BrowserWindow, screenshotPath: string): Promise<void> {
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.writeFile(screenshotPath, (await window.webContents.capturePage()).toPNG());
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  const content = Buffer.concat(chunks).toString('utf8');
  return content.length === 0 ? null : (JSON.parse(content) as unknown);
}

async function verifyDialogViewport(window: BrowserWindow, stacked = false): Promise<void> {
  await ready(
    window,
    `(() => {
    const dialog = document.querySelector('.wr-api-client-dialog');
    const footer = document.querySelector('.wr-api-client-actions');
    const operations = document.querySelector('.wr-api-operations');
    const editor = document.querySelector('.wr-api-request-editor');
    const request = document.querySelector('.wr-api-request-top');
    const settings = document.querySelector('.wr-api-operation-form');
    const schema = document.querySelector('.wr-api-schema-editor');
    const name = document.querySelector('[aria-label="Operation name"]');
    const hint = document.querySelector('.wr-api-connection-hint');
    if (!(dialog instanceof HTMLElement) || !(footer instanceof HTMLElement) || !(operations instanceof HTMLElement) || !(editor instanceof HTMLElement)) return false;
    if (!(request instanceof HTMLElement) || !(settings instanceof HTMLElement) || !(schema instanceof HTMLElement) || !(name instanceof HTMLElement) || !(hint instanceof HTMLElement)) return false;
    const bounds = dialog.getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const operationsBounds = operations.getBoundingClientRect();
    const editorBounds = editor.getBoundingClientRect();
    const requestBounds = request.getBoundingClientRect();
    const settingsBounds = settings.getBoundingClientRect();
    const schemaBounds = schema.getBoundingClientRect();
    const arranged = ${String(stacked)} ? operationsBounds.bottom <= editorBounds.top + 1 : operationsBounds.right <= editorBounds.left + 1;
    const sections = requestBounds.bottom <= settingsBounds.top + 1 && settingsBounds.bottom <= schemaBounds.top + 1;
    const readable = parseFloat(getComputedStyle(name).fontSize) >= 12 && parseFloat(getComputedStyle(hint).fontSize) >= 12;
    return arranged && sections && readable && dialog.scrollWidth <= dialog.clientWidth + 1 && editor.scrollWidth <= editor.clientWidth + 1 && bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && footerBounds.bottom <= innerHeight + 1;
  })()`,
  );
}

async function captureAdministrativeLayout(
  window: BrowserWindow,
  screenshotRoot: string,
  baseUrl: string,
): Promise<void> {
  const [originalWidth, originalHeight] = window.getContentSize();
  const [minimumWidth, minimumHeight] = window.getMinimumSize();
  if (
    originalWidth === undefined ||
    originalHeight === undefined ||
    minimumWidth === undefined ||
    minimumHeight === undefined
  ) {
    throw new Error('RestGO administrative layout smoke could not read window dimensions.');
  }
  try {
    window.setMinimumSize(1, 1);
    for (const [width, height, wide, suffix] of [
      [1440, 900, true, ''],
      [900, 800, false, '-narrow'],
    ] as const) {
      await resizeSmokeViewport(window, { width, height });
      await ready(
        window,
        `(() => {
          const body = document.querySelector('.wr-restgo-workspace-body');
          const card = document.querySelector('.wr-restgo-admin-settings');
          const content = card?.querySelector('.wr-restgo-connected-content');
          const identity = content?.querySelector('.wr-restgo-identity');
          const summary = content?.querySelector('.wr-restgo-connection-summary');
          const actions = content?.querySelector('.wr-restgo-admin-actions');
          if (![body, card, content, identity, summary, actions].every(item => item instanceof HTMLElement)) return false;
          if (document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') !== 'false') return false;
          if (!identity.textContent.includes('Connected to RestGO') || identity.querySelector('code')?.textContent !== ${JSON.stringify(baseUrl)}) return false;
          if (!identity.textContent.includes('Administrative token')) return false;
          const entries = [...summary.children];
          const names = ['Databases', 'Endpoints', 'Publications'];
          if (entries.length !== 3 || !entries.every((entry, index) => entry.textContent.includes(names[index]) && entry.querySelector('strong')?.textContent === '1')) return false;
          const buttons = [...actions.querySelectorAll('button')];
          if (!['Refresh catalog', 'Disconnect'].every(name => buttons.some(button => button.textContent.trim() === name && !button.matches(':disabled')))) return false;
          if (!card.textContent.includes('This token stays in the IDE')) return false;
          const style = getComputedStyle(body);
          const availableWidth = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          if ((availableWidth >= 850) !== ${String(wide)}) return false;
          const identityRect = identity.getBoundingClientRect();
          const summaryRect = summary.getBoundingClientRect();
          const actionsRect = actions.getBoundingClientRect();
          const arranged = ${String(wide)}
            ? summaryRect.left >= identityRect.right - 1 && actionsRect.top >= identityRect.bottom - 1 && actionsRect.right <= summaryRect.left + 1
            : summaryRect.top >= identityRect.bottom - 1 && actionsRect.top >= summaryRect.bottom - 1;
          const cells = entries.map(entry => entry.getBoundingClientRect());
          const horizontal = cells[1].left >= cells[0].right - 1 && cells[2].left >= cells[1].right - 1;
          const readable = entries.every(entry => entry.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(entry).fontSize) >= 11);
          const noOverflow = [body, card, content, identity, summary, actions, ...entries].every(item => item.scrollWidth <= item.clientWidth + 1);
          return arranged && horizontal && readable && noOverflow;
        })()`,
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-admin-settings').scrollIntoView({ block: 'start' })`,
        true,
      );
      const outputPath = `${screenshotRoot}-connection-admin-connected${suffix}.png`;
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const screenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO administrative connection ${wide ? 'desktop' : 'narrow'}`,
      );
      await fs.writeFile(outputPath, screenshot.toPNG());
    }
  } finally {
    try {
      await resizeSmokeViewport(window, { width: originalWidth, height: originalHeight });
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-admin-settings')?.scrollIntoView({ block: 'start' })`,
        true,
      );
    } finally {
      window.setMinimumSize(minimumWidth, minimumHeight);
    }
  }
}

async function captureThemeAndViewportVariants(
  window: BrowserWindow,
  screenshotRoot: string,
): Promise<void> {
  await window.webContents.executeJavaScript(
    `document.documentElement.dataset.theme = 'light'`,
    true,
  );
  await ready(
    window,
    `document.documentElement.dataset.theme === 'light' && getComputedStyle(document.querySelector('.wr-api-client-dialog')).backgroundColor === 'rgb(249, 250, 252)'`,
  );
  await verifyDialogViewport(window);
  await capture(window, `${screenshotRoot}-custom-light.png`);
  await window.webContents.executeJavaScript(
    `document.documentElement.dataset.theme = 'dark'`,
    true,
  );
  await ready(window, `document.documentElement.dataset.theme === 'dark'`);
  const [originalWidth, originalHeight] = window.getContentSize();
  const [minimumWidth, minimumHeight] = window.getMinimumSize();
  if (
    originalWidth === undefined ||
    originalHeight === undefined ||
    minimumWidth === undefined ||
    minimumHeight === undefined
  ) {
    throw new Error('API Client viewport smoke could not read the original window dimensions.');
  }
  try {
    // macOS treats 0x0 as unspecified and keeps Cocoa's previous minimum.
    window.setMinimumSize(1, 1);
    for (const [width, height, suffix] of [
      [1080, 760, 'compact'],
      [740, 700, 'narrow'],
    ] as const) {
      await resizeSmokeViewport(window, { width, height });
      await verifyDialogViewport(window, width <= 760);
      await capture(window, `${screenshotRoot}-custom-${suffix}.png`);
    }
  } finally {
    try {
      await resizeSmokeViewport(window, { width: originalWidth, height: originalHeight });
    } finally {
      window.setMinimumSize(minimumWidth, minimumHeight);
    }
  }
}

async function capturePublishedApiLayout(
  window: BrowserWindow,
  screenshotRoot: string,
): Promise<void> {
  const [originalWidth, originalHeight] = window.getContentSize();
  const [minimumWidth, minimumHeight] = window.getMinimumSize();
  if (
    originalWidth === undefined ||
    originalHeight === undefined ||
    minimumWidth === undefined ||
    minimumHeight === undefined
  ) {
    throw new Error('RestGO published APIs smoke could not read window dimensions.');
  }
  try {
    window.setMinimumSize(1, 1);
    for (const [width, height, suffix] of [
      [1440, 900, ''],
      [900, 800, '-narrow'],
    ] as const) {
      await resizeSmokeViewport(window, { width, height });
      await ready(
        window,
        `(() => {
          const body = document.querySelector('.wr-restgo-workspace-body');
          const list = document.querySelector('.wr-restgo-published:not([hidden]) .wr-restgo-api-cards');
          if (!(body instanceof HTMLElement) || !(list instanceof HTMLElement)) return false;
          const cards = [...list.querySelectorAll('.wr-restgo-api-card')];
          if (cards.length !== 3 || document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') !== 'false') return false;
          const names = ['anotacoes', 'clientes', 'pedidos'];
          const listBounds = list.getBoundingClientRect();
          const arranged = cards.every((card, index) => {
            if (!(card instanceof HTMLElement)) return false;
            const rect = card.getBoundingClientRect();
            const previous = cards[index - 1]?.getBoundingClientRect();
            const title = card.querySelector('.wr-restgo-api-title h2');
            const methods = card.querySelectorAll('.wr-restgo-api-method');
            const buttons = [...card.querySelectorAll('.wr-restgo-api-actions button')];
            if (buttons.length !== 2 || !(buttons[0] instanceof HTMLButtonElement)) return false;
            const action = card.querySelector('.wr-restgo-publish-action');
            const inactive = index === 1;
            if (!(action instanceof HTMLButtonElement) || action.matches(':disabled')) return false;
            if (!action.classList.contains(inactive ? 'is-publish' : 'is-unpublish')) return false;
            if (action.textContent.trim() !== (inactive ? 'Publish' : 'Unpublish')) return false;
            if (action.getAttribute('aria-label') !== (inactive ? 'Publish ' : 'Unpublish ') + names[index]) return false;
            if (card.querySelector('.wr-restgo-badge')?.textContent !== (inactive ? 'Unpublished' : 'Ready')) return false;
            const icon = action.querySelector('.wr-icon');
            if (!(icon instanceof SVGSVGElement) || icon.getAttribute('aria-hidden') !== 'true'
              || icon.getAttribute('data-lucide-icon') !== (inactive ? 'cloud-upload' : 'eye-off')) return false;
            const actionStyle = getComputedStyle(action);
            const editStyle = getComputedStyle(buttons[0]);
            if (actionStyle.color === editStyle.color || actionStyle.backgroundColor === editStyle.backgroundColor
              || action.getBoundingClientRect().height < 30) return false;
            return title?.textContent === names[index] && methods.length > 0
              && buttons.length === 2 && buttons.every(button => !button.matches(':disabled'))
              && card.querySelector('.wr-restgo-api-url')?.getAttribute('title')
              && Math.abs(rect.left - listBounds.left) <= 1 && Math.abs(rect.width - listBounds.width) <= 1
              && (!previous || rect.top >= previous.bottom - 1) && card.scrollWidth <= card.clientWidth + 1;
          });
          if (!arranged) return false;
          const firstAction = cards[0].querySelector('.wr-restgo-publish-action');
          const secondAction = cards[1].querySelector('.wr-restgo-publish-action');
          if (!(firstAction instanceof HTMLButtonElement) || !(secondAction instanceof HTMLButtonElement)) return false;
          const firstStyle = getComputedStyle(firstAction);
          const secondStyle = getComputedStyle(secondAction);
          if (firstStyle.color === secondStyle.color || firstStyle.backgroundColor === secondStyle.backgroundColor) return false;
          return listBounds.width > 0 && list.scrollWidth <= list.clientWidth + 1
            && body.scrollWidth <= body.clientWidth + 1;
        })()`,
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-published:not([hidden]) .wr-restgo-api-cards').scrollIntoView({ block: 'start' })`,
        true,
      );
      const outputPath = `${screenshotRoot}-restgo-published${suffix}.png`;
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const screenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO published APIs ${suffix ? 'narrow' : 'desktop'}`,
      );
      await fs.writeFile(outputPath, screenshot.toPNG());
      await window.webContents.executeJavaScript(
        `(() => {
          const input = document.querySelector('[aria-label="Search published APIs"]');
          if (input instanceof HTMLInputElement) {
            input.scrollIntoView({ block: 'center' });
            input.focus();
          }
        })()`,
        true,
      );
      await ready(
        window,
        `(() => {
          const input = document.querySelector('[aria-label="Search published APIs"]');
          const field = input?.closest('.wr-restgo-search');
          const icon = field?.querySelector('.wr-icon');
          if (!(input instanceof HTMLInputElement) || !(field instanceof HTMLElement) || !(icon instanceof SVGSVGElement)) return false;
          if (document.activeElement !== input || !field.matches(':focus-within')) return false;
          const outer = getComputedStyle(field);
          const inner = getComputedStyle(input);
          const bounds = field.getBoundingClientRect();
          const iconBounds = icon.getBoundingClientRect();
          const inputBounds = input.getBoundingClientRect();
          return outer.outlineStyle === 'solid' && outer.outlineWidth === '2px'
            && outer.outlineOffset === '-1px' && inner.outlineStyle === 'none' && inner.boxShadow === 'none'
            && iconBounds.left >= bounds.left && iconBounds.right <= inputBounds.left
            && inputBounds.right <= bounds.right && bounds.width > 0;
        })()`,
      );
      await setControl(window, '[aria-label="Search published APIs"]', 'clientes');
      await ready(
        window,
        `document.querySelectorAll('.wr-restgo-published:not([hidden]) .wr-restgo-api-card').length === 1 && document.querySelector('.wr-restgo-api-title h2')?.textContent === 'clientes' && document.activeElement === document.querySelector('[aria-label="Search published APIs"]')`,
      );
      const focusedPath = `${screenshotRoot}-restgo-published-search-focus${suffix}.png`;
      const focusedScreenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO published search focus ${suffix ? 'narrow' : 'desktop'}`,
      );
      await fs.writeFile(focusedPath, focusedScreenshot.toPNG());
      await setControl(window, '[aria-label="Search published APIs"]', '');
      await ready(
        window,
        `document.querySelectorAll('.wr-restgo-published:not([hidden]) .wr-restgo-api-card').length === 3`,
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('[aria-label="Search published APIs"]')?.blur()`,
        true,
      );
      await ready(
        window,
        `(() => {
          const input = document.querySelector('[aria-label="Search published APIs"]');
          const field = input?.closest('.wr-restgo-search');
          return input instanceof HTMLInputElement && field instanceof HTMLElement
            && document.activeElement !== input && !field.matches(':focus-within')
            && getComputedStyle(field).outlineStyle === 'none';
        })()`,
      );
    }
  } finally {
    try {
      await resizeSmokeViewport(window, { width: originalWidth, height: originalHeight });
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-published:not([hidden])')?.scrollIntoView({ block: 'start' })`,
        true,
      );
    } finally {
      window.setMinimumSize(minimumWidth, minimumHeight);
    }
  }
}

async function exerciseRestGoEndpointEditor(
  window: BrowserWindow,
  screenshotRoot: string,
): Promise<void> {
  const openSql = async (method: string): Promise<void> => {
    await ready(
      window,
      `(() => {
      const button = document.querySelector('[aria-label="Edit SQL for ${method}"]');
      if (!(button instanceof HTMLButtonElement) || button.matches(':disabled')) return false;
      button.focus();
      button.click();
      return true;
    })()`,
    );
    await ready(
      window,
      `document.querySelector('.wr-restgo-sql-dialog textarea')?.getAttribute('aria-label') === 'SQL for ${method}'`,
    );
  };
  await ready(
    window,
    `document.querySelector('.wr-restgo-sql-summary') !== null && document.querySelector('.wr-restgo-publication-list') !== null`,
  );
  await clickText(window, 'Edit access', '.wr-restgo-publication-editor');
  await ready(
    window,
    `(() => {
    const form = document.querySelector('.wr-restgo-publication-form');
    const fields = form?.querySelectorAll('select');
    return fields?.[0]?.value === '1' && fields?.[1]?.value === 'jwt';
  })()`,
  );
  await clickText(window, 'Cancel edit', '.wr-restgo-publication-editor');
  await ready(window, `document.querySelector('.wr-restgo-publication-form') === null`);
  const [originalWidth, originalHeight] = window.getContentSize();
  const [minimumWidth, minimumHeight] = window.getMinimumSize();
  if (
    originalWidth === undefined ||
    originalHeight === undefined ||
    minimumWidth === undefined ||
    minimumHeight === undefined
  ) {
    throw new Error('RestGO endpoint editor smoke could not read window dimensions.');
  }
  try {
    window.setMinimumSize(1, 1);
    for (const [width, height, suffix] of [
      [1440, 900, ''],
      [900, 800, '-narrow'],
    ] as const) {
      await resizeSmokeViewport(window, { width, height });
      await ready(
        window,
        `(() => {
        const editor = document.querySelector('.wr-restgo-endpoint-editor');
        if (!(editor instanceof HTMLElement) || editor.querySelector('textarea')) return false;
        const sections = [...editor.querySelectorAll('.wr-restgo-editor-section')];
        const tabs = editor.querySelector('.wr-restgo-method-tabs');
        return sections.length === 3 && tabs instanceof HTMLElement
          && tabs.querySelector('[aria-selected="true"]')?.textContent.trim() === 'GET'
          && editor.querySelector('.wr-restgo-method-heading')?.textContent.includes('Deactivate GET') === true
          && editor.scrollWidth <= editor.clientWidth + 1
          && sections.every(section => section.scrollWidth <= section.clientWidth + 1)
          && document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false'
          && document.querySelector('.wr-restgo-progress') === null;
      })()`,
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-endpoint-editor').scrollIntoView({ block: 'start' })`,
        true,
      );
      const overview = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        'RestGO endpoint overview',
      );
      await fs.mkdir(path.dirname(screenshotRoot), { recursive: true });
      await fs.writeFile(`${screenshotRoot}-endpoint-overview${suffix}.png`, overview.toPNG());
      await openSql('GET');
      await setControl(window, '.wr-restgo-sql-dialog textarea', 'SELECT :cancelled_sql');
      await ready(
        window,
        `(() => {
    const dialog = document.querySelector('.wr-restgo-sql-dialog');
    const input = dialog?.querySelector('textarea');
    const footer = dialog?.querySelector('.wr-restgo-sql-footer');
    if (!(dialog instanceof HTMLElement) || !(input instanceof HTMLTextAreaElement) || !(footer instanceof HTMLElement))
        return false;
    const rect = dialog.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const controls = [...dialog.querySelectorAll('button:not(:disabled), textarea')];
    const first = controls[0];
    const last = controls.at(-1);
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement))
        return false;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    if (document.activeElement !== last)
        return false;
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    if (document.activeElement !== first)
        return false;
    input.focus();
    return dialog.getAttribute('aria-modal') === 'true' && document.activeElement === input
        && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1
        && inputRect.height >= 100 && inputRect.width > 0 && inputRect.bottom <= footerRect.top + 1
        && footerRect.bottom <= rect.bottom + 1 && dialog.scrollWidth <= dialog.clientWidth + 1 && rect.width >= Math.min(1440, innerWidth - 48) - 2;
})();
`,
      );
      const popup = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        'RestGO SQL editor',
      );
      await fs.writeFile(`${screenshotRoot}-sql-editor${suffix}.png`, popup.toPNG());
      await clickText(window, 'Cancel', '.wr-restgo-sql-dialog');
      await ready(
        window,
        `document.querySelector('.wr-restgo-sql-dialog') === null
        && document.querySelector('.wr-restgo-sql-preview')?.textContent.includes('cancelled_sql') === false
        && document.querySelector('.wr-restgo-endpoint-form button[type="submit"]')?.matches(':disabled') === true
        && document.activeElement?.getAttribute('aria-label') === 'Edit SQL for GET'`,
      );
    }
  } finally {
    try {
      await resizeSmokeViewport(window, { width: originalWidth, height: originalHeight });
    } finally {
      window.setMinimumSize(minimumWidth, minimumHeight);
    }
  }
  await openSql('GET');
  await window.webContents.executeJavaScript(
    `document.querySelector('.wr-restgo-sql-dialog textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-restgo-sql-dialog') === null && document.activeElement?.getAttribute('aria-label') === 'Edit SQL for GET'`,
  );
  for (const [method, script] of [
    ['GET', 'SELECT :rgouserid, :pesquisa'],
    ['PUT', 'SELECT :rgouserid, :caption'],
  ] as const) {
    if (method === 'PUT') await clickText(window, 'PUT', '.wr-restgo-method-tabs');
    await openSql(method);
    await setControl(window, '.wr-restgo-sql-dialog textarea', script);
    await clickText(window, 'Apply SQL', '.wr-restgo-sql-dialog');
    await ready(
      window,
      `document.querySelector('.wr-restgo-sql-dialog') === null
      && document.querySelector('.wr-restgo-sql-preview')?.textContent === ${JSON.stringify(script)}
      && document.querySelector('.wr-restgo-endpoint-form button[type="submit"]')?.matches(':disabled') === false`,
    );
  }
}

/** Exercises actual Chromium controls, HTTP tests, and Project Model persistence. */
export async function runApiClientDesignerSmoke(
  window: BrowserWindow,
  { projectPath, log, screenshotPath }: ApiClientDesignerSmokeOptions,
): Promise<void> {
  const calls: Array<{ method: string; path: string; authorization: string | undefined }> = [];
  const synchronizationEndpoints: RestGoAdminEndpoint[] = ['GET', 'PUT'].map((method, index) => ({
    id: 11 + index,
    ativo: true,
    slug: 'anotacoes',
    versao: 1,
    metodo: method as 'GET' | 'PUT',
    script: 'SELECT :rgouserid, :active',
    tipo: 'normal',
    idoperacao: null,
  }));
  let publishedLayoutFixture = false;
  let publishedLayoutCustomerActive = true;
  const publishedLayoutEndpoints: RestGoAdminEndpoint[] = [
    {
      id: 13,
      ativo: true,
      slug: 'clientes',
      versao: 1,
      metodo: 'GET',
      script: 'SELECT 1',
      tipo: 'normal',
      idoperacao: null,
    },
    {
      id: 14,
      ativo: true,
      slug: 'pedidos',
      versao: 1,
      metodo: 'GET',
      script: 'SELECT 1',
      tipo: 'normal',
      idoperacao: null,
    },
  ];
  const developmentUser = {
    id: 'development-user',
    email: 'development@example.test',
    fullName: 'Development',
    avatarUrl: null,
    active: true,
    emailConfirmed: true,
  };
  let developmentRotation = 0;
  let developmentSignedIn = false;
  let developmentExpired = false;
  const developmentSession = () => ({
    token: `development-smoke-jwt-${String(developmentRotation)}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshToken: `development-smoke-refresh-${String(developmentRotation)}`,
    refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
    user: developmentUser,
  });
  const server = createServer(async (request, response) => {
    if (request.url === '/backend/v2/demo/no-cors') {
      calls.push({
        method: request.method ?? '',
        path: request.url,
        authorization: request.headers.authorization,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, REPORT',
    );
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
      response.writeHead(204).end();
      return;
    }
    calls.push({
      method: request.method ?? '',
      path: request.url ?? '',
      authorization: request.headers.authorization,
    });
    response.setHeader('Content-Type', 'application/json');
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (
      [
        '/backend/endpoints',
        '/backend/bancos',
        '/backend/endpoints-bancos',
        '/backend/api-operations',
      ].includes(route) ||
      route.startsWith('/backend/endpoints/') ||
      route.startsWith('/backend/endpoints-bancos/')
    ) {
      if (request.headers.authorization !== 'rgo.synchronization-smoke') {
        response
          .writeHead(403)
          .end(JSON.stringify({ error: 'Administrative fixture token required' }));
        return;
      }
      if (publishedLayoutFixture && request.method === 'POST') {
        if (route === '/backend/endpoints/13/activate') {
          response.end('{}');
          return;
        }
        if (
          route === '/backend/endpoints-bancos/21/activate' ||
          route === '/backend/endpoints-bancos/21/deactivate'
        ) {
          publishedLayoutCustomerActive = route.endsWith('/activate');
          response.end('{}');
          return;
        }
      }
      if (route.startsWith('/backend/endpoints/')) {
        const index = synchronizationEndpoints.findIndex(
          (endpoint) => endpoint.id === Number(route.split('/').at(-1)),
        );
        if (index < 0) {
          response.writeHead(404).end('{}');
          return;
        }
        if (request.method === 'PUT') {
          const input = await readBody(request);
          if (!input || typeof input !== 'object') {
            response.writeHead(400).end('{}');
            return;
          }
          synchronizationEndpoints[index] = { ...synchronizationEndpoints[index]!, ...input };
        }
        response.end(JSON.stringify(synchronizationEndpoints[index]));
        return;
      }
      response.end(
        JSON.stringify(
          route === '/backend/endpoints'
            ? publishedLayoutFixture
              ? [...synchronizationEndpoints, ...publishedLayoutEndpoints]
              : synchronizationEndpoints
            : route === '/backend/bancos'
              ? [
                  {
                    id: 1,
                    ativo: true,
                    slug: 'demo',
                    host: 'localhost',
                    port: 5432,
                    database: 'demo',
                    descri: '',
                    sslMode: 'require',
                  },
                ]
              : route === '/backend/endpoints-bancos'
                ? [
                    {
                      id: 20,
                      ativo: true,
                      idbanco: 1,
                      idendpoint: 11,
                      bancoSlug: 'demo',
                      endpointSlug: 'anotacoes',
                      versao: 1,
                      requiresAuthentication: true,
                      isPublic: false,
                    },
                    ...(publishedLayoutFixture
                      ? [
                          {
                            id: 21,
                            ativo: publishedLayoutCustomerActive,
                            idbanco: 1,
                            idendpoint: 13,
                            bancoSlug: 'demo',
                            endpointSlug: 'clientes',
                            versao: 1,
                            requiresAuthentication: false,
                            isPublic: true,
                          },
                          {
                            id: 22,
                            ativo: true,
                            idbanco: 1,
                            idendpoint: 14,
                            bancoSlug: 'demo',
                            endpointSlug: 'pedidos',
                            versao: 1,
                            requiresAuthentication: false,
                            isPublic: false,
                          },
                        ]
                      : []),
                  ]
                : [],
        ),
      );
      return;
    }
    if (request.url === '/backend/auth/token') {
      const body = await readBody(request);
      if (
        !body ||
        typeof body !== 'object' ||
        Reflect.get(body, 'email') !== developmentUser.email ||
        Reflect.get(body, 'password') !== 'development-smoke-password' ||
        request.headers.authorization
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Invalid development credentials' }));
        return;
      }
      developmentSignedIn = true;
      response.end(JSON.stringify(developmentSession()));
      return;
    }
    if (request.url === '/backend/auth/refresh') {
      const body = await readBody(request);
      if (
        !developmentSignedIn ||
        !body ||
        typeof body !== 'object' ||
        Reflect.get(body, 'refreshToken') !== developmentSession().refreshToken ||
        request.headers.authorization
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Invalid development refresh' }));
        return;
      }
      developmentRotation++;
      developmentExpired = false;
      response.end(JSON.stringify(developmentSession()));
      return;
    }
    if (request.url === '/backend/auth/session' || request.url === '/backend/auth/logout') {
      if (
        !developmentSignedIn ||
        developmentExpired ||
        request.headers.authorization !== `Bearer ${developmentSession().token}`
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Expired development session' }));
        return;
      }
      if (request.url.endsWith('/logout')) developmentSignedIn = false;
      response.end(JSON.stringify({ success: true, user: developmentUser }));
      return;
    }
    response.end(
      JSON.stringify(
        route === '/backend/v2/demo/authorization'
          ? {
              authorized:
                request.headers.authorization ===
                `Basic ${Buffer.from('smoke-user:smoke-password').toString('base64')}`,
            }
          : { data: [{ id: 42, name: 'Cliente de teste' }] },
      ),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('API Client fixture has no port.');
  const baseUrl = `http://127.0.0.1:${String(address.port)}/backend`;
  const screenshotRoot =
    screenshotPath === undefined
      ? path.resolve('node_modules', '.cache', 'webrad-api-client')
      : path.join(
          path.dirname(screenshotPath),
          `${path.basename(screenshotPath, path.extname(screenshotPath))}-api-client`,
        );
  try {
    await click(window, 'button[aria-label="Design"]');
    await setControl(window, 'input[aria-label="Search components"]', 'API Client');
    await ready(
      window,
      `(() => {
      const item = Array.from(document.querySelectorAll('.wr-palette-item')).find((button) => button.textContent.trim() === 'API Client');
      if (!(item instanceof HTMLElement)) return false;
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    })()`,
    );
    await ready(
      window,
      `(() => {
      const item = document.querySelector('.wr-nonvisual-item[aria-label$=", API Client"]');
      if (!(item instanceof HTMLElement)) return false;
      const trayIcon = item.querySelector('.wr-nonvisual-item-icon svg');
      const paletteIcon = Array.from(document.querySelectorAll('.wr-palette-item')).find((button) => button.textContent.trim() === 'API Client')?.querySelector('svg');
      if (!trayIcon || !paletteIcon || trayIcon.getAttribute('data-lucide-icon') !== paletteIcon.getAttribute('data-lucide-icon')) throw new Error('Nonvisual tray icon does not match the palette');
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    })()`,
    );
    await ready(window, `document.querySelector('.wr-api-client-dialog') !== null`);
    await setControl(window, '[aria-label="Base URL"]', baseUrl);
    await setControl(window, '[aria-label="Operation name"]', 'LoadCustomers');
    await setControl(window, '[aria-label="Path"]', '/v2/demo/customers');
    const methods: unknown = await window.webContents.executeJavaScript(
      `Array.from(document.querySelector('[aria-label="Method"]').options).map((option) => option.value)`,
      true,
    );
    if (
      !Array.isArray(methods) ||
      ![
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
        'TRACE',
        'CONNECT',
        '__custom__',
      ].every((method) => methods.includes(method))
    ) {
      throw new Error(`API Client method selector is incomplete: ${JSON.stringify(methods)}`);
    }
    await setControl(window, '[aria-label="Method"]', '__custom__');
    await setControl(window, '[aria-label="Custom method"]', 'REPORT');
    await ready(
      window,
      `document.querySelector('[aria-label="Custom method"]').value === 'REPORT'`,
    );
    await setControl(window, '[aria-label="Method"]', 'TRACE');
    await ready(
      window,
      `document.querySelector('.wr-api-client-dialog button[aria-label="Send test request"]')?.disabled === true && [...document.querySelectorAll('.wr-api-client-dialog [role="note"]')].some(note => note.textContent?.includes('Browsers prohibit TRACE'))`,
    );
    if (calls.length !== 0)
      throw new Error('API Client sent an HTTP request for a prohibited method.');
    await setControl(window, '[aria-label="Method"]', 'GET');
    for (const tab of ['Query parameters', 'Authorization', 'Headers', 'Body', 'Options']) {
      await clickText(window, tab);
      await ready(
        window,
        `Array.from(document.querySelectorAll('.wr-api-client-dialog [role="tab"]')).some((tab) => tab.textContent.trim() === ${JSON.stringify(tab)} && tab.getAttribute('aria-selected') === 'true')`,
      );
    }
    await clickText(window, 'Query parameters');
    await verifyDialogViewport(window);
    await capture(window, `${screenshotRoot}-custom.png`);
    await captureThemeAndViewportVariants(window, screenshotRoot);
    await clickText(window, 'Send test request');
    await ready(
      window,
      `document.querySelector('.wr-api-response-status')?.textContent.includes('200') === true`,
    );
    if (calls[0]?.authorization !== undefined || calls[0]?.path !== '/backend/v2/demo/customers') {
      throw new Error(`API Client generic request mismatch: ${JSON.stringify(calls)}`);
    }
    await ready(window, `document.querySelector('[aria-label="Save data"]') !== null`);
    await verifyDialogViewport(window);
    await window.webContents.executeJavaScript(
      `document.querySelector('.wr-api-schema-editor').scrollIntoView({ block: 'center' })`,
      true,
    );
    await capture(window, `${screenshotRoot}-response.png`);
    await setControl(window, '[aria-label="Path"]', '/v2/demo/no-cors');
    await clickText(window, 'Send test request');
    await ready(
      window,
      `(() => {
        const message = document.querySelector('.wr-api-test-result [role="alert"]')?.textContent ?? '';
        return message.includes('Original error:') && message.includes('Request origin:') &&
          message.includes('Target origin:') && message.includes('Credentials mode:') &&
          message.includes('CORS') && message.includes('server may have received');
      })()`,
    );
    if (!calls.some((call) => call.path === '/backend/v2/demo/no-cors'))
      throw new Error('API Client CORS diagnostic fixture was not reached.');
    log(
      'renderer API Client network diagnostics passed: browser-blocked response, origins and guidance',
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('.wr-api-request-editor').scrollTop = 0`,
      true,
    );
    await clickText(window, 'Authorization');
    await setControl(window, '[aria-label="Authorization scope"]', 'client');
    await setControl(window, '[aria-label="Authorization type"]', 'basic');
    await setControl(window, '[aria-label="Basic Auth username"]', 'smoke-user');
    await setControl(window, '[aria-label="Basic Auth password"]', 'smoke-password');
    await setControl(window, '[aria-label="Authorization scope"]', 'request');
    await ready(
      window,
      `document.querySelector('[aria-label="Authorization type"]').value === 'inherit'`,
    );
    await setControl(window, '[aria-label="Path"]', '/v2/demo/authorization');
    await clickText(window, 'Send test request');
    await ready(
      window,
      `document.querySelector('[aria-label="Save authorized"]') !== null && document.querySelector('[aria-label="Save data"]') === null`,
    );
    if (
      calls.at(-1)?.authorization !==
      `Basic ${Buffer.from('smoke-user:smoke-password').toString('base64')}`
    )
      throw new Error('API Client did not send inherited Basic authorization.');
    await capture(window, `${screenshotRoot}-authorization.png`);
    await clickText(window, 'Save API Client');
    await ready(window, `document.querySelector('.wr-api-client-dialog') === null`);
    const openClient = async (): Promise<void> => {
      await ready(
        window,
        `(() => {
        const item = document.querySelector('.wr-nonvisual-item[aria-label$=", API Client"]');
        if (!(item instanceof HTMLElement)) return false;
        item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      })()`,
      );
      await ready(window, `document.querySelector('.wr-api-client-dialog') !== null`);
    };
    await openClient();
    await clickText(window, 'Authorization');
    await setControl(window, '[aria-label="Authorization scope"]', 'client');
    await ready(
      window,
      `document.querySelector('[aria-label="Authorization type"]').value === 'basic' && document.querySelector('[aria-label="Basic Auth username"]').value === 'smoke-user' && document.querySelector('[aria-label="Basic Auth password"]').value === 'smoke-password' && document.querySelector('[aria-label="Basic Auth password"]').type === 'password'`,
    );
    await setControl(window, '[aria-label="Authorization type"]', 'inherit');
    log(
      'renderer API Client authorization passed: client Basic Auth, inherited request, real HTTP header, save/reopen; masked password',
    );
    log(
      'renderer API Client response refresh passed: changing endpoint removes previous response fields after Send',
    );
    await clickText(window, 'Remove operation');
    await ready(
      window,
      `document.querySelector('.wr-api-no-operations') !== null && document.querySelector('.wr-api-remove-operation').disabled === true && document.querySelector('.wr-api-operation-list').children.length === 0`,
    );
    await capture(window, `${screenshotRoot}-empty.png`);
    await clickText(window, 'Save API Client');
    await ready(window, `document.querySelector('.wr-api-client-dialog') === null`);
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    const emptyPagePath = path.join(path.dirname(projectPath), 'pages', 'index.wrpage');
    const emptyDeadline = Date.now() + 10_000;
    let emptyPersisted = false;
    while (Date.now() < emptyDeadline) {
      const page = JSON.parse(await fs.readFile(emptyPagePath, 'utf8')) as {
        components: Array<{
          type: string;
          props: { apiClientConfig?: { operations?: unknown[] } };
        }>;
      };
      emptyPersisted = page.components.some(
        (component) =>
          component.type === 'WebApiClient' &&
          component.props.apiClientConfig?.operations?.length === 0,
      );
      if (emptyPersisted) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!emptyPersisted)
      throw new Error('Deleting the final API endpoint did not persist an empty list.');
    await openClient();
    await ready(window, `document.querySelector('.wr-api-no-operations') !== null`);
    await click(window, 'button[aria-label="Add operation"]');
    await setControl(window, '[aria-label="Operation name"]', 'LoadCustomers');
    await setControl(window, '[aria-label="Path"]', '/v2/demo/customers');
    await ready(
      window,
      `document.querySelector('[aria-label="Base URL"]').value === ${JSON.stringify(baseUrl)}`,
    );
    await clickText(window, 'Send test request');
    await ready(
      window,
      `document.querySelector('.wr-api-response-status')?.textContent.includes('200') === true`,
    );
    await clickText(window, 'Save API Client');
    await ready(window, `document.querySelector('.wr-api-client-dialog') === null`);
    await click(window, 'button[aria-label="RestGo integration"]');
    await click(window, '.wr-restgo-sidebar button:first-child');
    const enableSelector =
      '.wr-restgo-runtime-settings .wr-restgo-settings-group input[type="checkbox"]';
    await ready(
      window,
      `(() => {
        const control = document.querySelector(${JSON.stringify(enableSelector)});
        return control instanceof HTMLInputElement && !control.matches(':disabled');
      })()`,
    );
    const enabled: unknown = await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(enableSelector)})?.checked`,
      true,
    );
    if (enabled !== true) await click(window, enableSelector);
    await ready(
      window,
      `document.querySelector(${JSON.stringify(enableSelector)})?.checked === true`,
    );
    await setControl(window, '.wr-restgo-runtime-settings input[type="url"]', baseUrl);
    await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
    // A disabled Apply button can mean pending work. Require the committed
    // Project Model projection and the completed workspace before using auth.
    await ready(
      window,
      `document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('.wr-restgo-runtime-settings button[type="submit"]')?.matches(':disabled') === true
        && document.querySelector('.wr-restgo-runtime-settings')?.textContent.includes('Up to date') === true
        && document.querySelector('.wr-restgo-sidebar-instance .wr-restgo-dot')?.classList.contains('is-active') === true
        && document.querySelector('.wr-restgo-sidebar-instance small')?.textContent === ${JSON.stringify(baseUrl)}
        && document.querySelector('.wr-restgo-runtime-settings input[type="url"]')?.value === ${JSON.stringify(baseUrl)}
        && document.querySelector('.wr-restgo-workspace [role="alert"]') === null`,
    );
    await ready(
      window,
      `document.querySelector('.wr-restgo-development-login')?.getAttribute('aria-busy') === 'false'
        && document.querySelector('.wr-restgo-development-login fieldset')?.matches(':disabled') === false`,
    );
    log(
      'renderer RestGO development connection passed: enabled SDK, expected instance URL and settled configuration',
    );
    await click(window, '.wr-restgo-development-form > summary');
    await ready(
      window,
      `document.querySelector('details.wr-restgo-development-form')?.open === true
        && document.querySelector('.wr-restgo-development-login input[type="email"]')?.getClientRects().length > 0
        && document.querySelector('.wr-restgo-development-login input[type="password"]')?.getClientRects().length > 0`,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('.wr-restgo-development-login').scrollIntoView({ block: 'center' })`,
      true,
    );
    await capture(window, `${screenshotRoot}-development-login.png`);
    await setControl(
      window,
      '.wr-restgo-development-login input[type="email"]',
      developmentUser.email,
    );
    await setControl(
      window,
      '.wr-restgo-development-login input[type="password"]',
      'development-smoke-password',
    );
    await clickText(window, 'Sign in', '.wr-restgo-development-login');
    await ready(
      window,
      `document.querySelector('.wr-restgo-development-login [role="status"]')?.textContent.includes(${JSON.stringify(developmentUser.email)}) === true`,
    );
    await capture(window, `${screenshotRoot}-development-signed-in.png`);
    developmentExpired = true;
    await click(window, 'button[aria-label="Project Explorer"]');
    await ready(
      window,
      `(() => {
      const item = document.querySelector('.wr-nonvisual-item[aria-label$=", API Client"]');
      if (!(item instanceof HTMLElement)) return false;
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    })()`,
    );
    await setControl(window, '[aria-label="Connection"]', 'restgo-session');
    await ready(
      window,
      `document.querySelector('[aria-label="Base URL"]').readOnly === true && document.querySelector('[aria-label="Base URL"]').value === ${JSON.stringify(baseUrl)}`,
    );
    await clickText(window, 'Send test request');
    await ready(
      window,
      `document.querySelector('.wr-api-response-status')?.textContent.includes('200') === true`,
    );
    if (
      calls.at(-1)?.authorization !== 'Bearer development-smoke-jwt-1' ||
      developmentRotation !== 1
    ) {
      throw new Error('API Client did not renew and use the saved development login.');
    }
    await clickText(window, 'Test authentication');
    await setControl(window, '[aria-label="Test JWT"]', 'designer-smoke-jwt');
    await clickText(window, 'Test authentication');
    await capture(window, `${screenshotRoot}-restgo.png`);
    await clickText(window, 'Send test request');
    await ready(
      window,
      `document.querySelector('.wr-api-response-status')?.textContent.includes('200') === true`,
    );
    if (
      calls.at(-1)?.authorization !== 'Bearer designer-smoke-jwt' ||
      calls.at(-1)?.path !== '/backend/v2/demo/customers'
    ) {
      throw new Error(`API Client RestGO test request mismatch: ${JSON.stringify(calls)}`);
    }
    await clickText(window, 'Save API Client');
    await ready(window, `document.querySelector('.wr-api-client-dialog') === null`);
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    const pagePath = path.join(path.dirname(projectPath), 'pages', 'index.wrpage');
    const deadline = Date.now() + 10_000;
    let persisted = false;
    while (Date.now() < deadline) {
      const source = await fs.readFile(pagePath, 'utf8');
      const page = JSON.parse(source) as {
        components: Array<{
          type: string;
          props: {
            apiClientConfig?: { connection?: string; operations?: Array<{ name: string }> };
          };
        }>;
      };
      persisted = page.components.some(
        (component) =>
          component.type === 'WebApiClient' &&
          component.props.apiClientConfig?.connection === 'restgo-session' &&
          component.props.apiClientConfig.operations?.[0]?.name === 'LoadCustomers',
      );
      if (persisted) {
        if (
          source.includes('designer-smoke-jwt') ||
          source.includes('Cliente de teste') ||
          source.includes('development-smoke') ||
          source.includes(developmentUser.email)
        ) {
          throw new Error('API Client persisted test credentials or sampled response data.');
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!persisted) throw new Error('API Client RestGO binding did not persist.');
    const projectSource = await fs.readFile(projectPath, 'utf8');
    if (
      projectSource.includes('development-smoke') ||
      projectSource.includes(developmentUser.email)
    ) {
      throw new Error('The project persisted development authentication credentials.');
    }
    await click(window, 'button[aria-label="RestGo integration"]');
    await click(window, '.wr-restgo-sidebar button:first-child');
    await ready(
      window,
      `document.querySelector('.wr-restgo-development-login [role="status"]')?.textContent.includes(${JSON.stringify(developmentUser.email)}) === true`,
    );
    await clickText(window, 'Sign out', '.wr-restgo-development-login');
    await ready(
      window,
      `document.querySelector('.wr-restgo-development-login input[type="email"]') !== null && document.querySelector('.wr-restgo-development-login fieldset')?.disabled === false`,
    );
    if (developmentSignedIn)
      throw new Error('Development logout did not revoke the server session.');
    log(
      'renderer RestGO development login passed: user login, saved session restoration, JWT renewal, automatic API Client authentication, manual override, project isolation and logout',
    );
    await setControl(
      window,
      '.wr-restgo-admin-settings input[type="password"]',
      'rgo.synchronization-smoke',
    );
    await click(window, '.wr-restgo-admin-settings button[type="submit"]');
    await ready(
      window,
      `document.querySelector('.wr-restgo-status')?.textContent.includes('Admin connected') === true`,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('.wr-restgo-connection').scrollIntoView({ block: 'start' })`,
      true,
    );
    await captureAdministrativeLayout(window, screenshotRoot, baseUrl);
    log(
      'renderer RestGO administrative layout passed: connected state, catalog counts, actions and desktop/narrow geometry',
    );
    publishedLayoutFixture = true;
    await click(window, '.wr-restgo-sidebar nav button:nth-child(2)');
    await clickText(window, 'Refresh', '.wr-restgo-header-tools');
    await ready(
      window,
      `document.querySelectorAll('.wr-restgo-published:not([hidden]) .wr-restgo-api-card').length === 3 && document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false'`,
    );
    await clickText(window, 'Unpublish', '.wr-restgo-api-card:nth-child(2)');
    await ready(
      window,
      `document.querySelector('.wr-restgo-api-card:nth-child(2) .wr-restgo-badge')?.textContent === 'Unpublished' && document.querySelector('.wr-restgo-api-card:nth-child(2) .wr-restgo-publish-action')?.textContent.trim() === 'Publish' && document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('.wr-restgo-workspace .wr-restgo-notice') === null && document.querySelector('.wr-restgo-workspace [role=alert]') === null`,
    );
    if (publishedLayoutCustomerActive)
      throw new Error('RestGO fixture publication was not unpublished.');
    await capturePublishedApiLayout(window, screenshotRoot);
    await clickText(window, 'Publish', '.wr-restgo-api-card:nth-child(2)');
    await ready(
      window,
      `document.querySelector('.wr-restgo-api-card:nth-child(2) .wr-restgo-badge')?.textContent === 'Ready' && document.querySelector('.wr-restgo-api-card:nth-child(2) .wr-restgo-publish-action')?.textContent.trim() === 'Unpublish' && document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('.wr-restgo-workspace .wr-restgo-notice') === null && document.querySelector('.wr-restgo-workspace [role=alert]') === null`,
    );
    if (!publishedLayoutCustomerActive)
      throw new Error('RestGO fixture publication was not republished.');
    publishedLayoutFixture = false;
    await clickText(window, 'Refresh', '.wr-restgo-header-tools');
    await ready(
      window,
      `document.querySelectorAll('.wr-restgo-published:not([hidden]) .wr-restgo-api-card').length === 1 && document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false'`,
    );
    log(
      'renderer RestGO published APIs layout passed: single-column layout, publication action states, search focus and filtering at desktop and narrow widths',
    );
    await click(window, 'button[aria-label="Project Explorer"]');
    await ready(
      window,
      `(() => { const item = document.querySelector('.wr-nonvisual-item[aria-label$=", API Client"]'); if (!(item instanceof HTMLElement)) return false; item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`,
    );
    await clickText(window, 'Remove operation');
    await clickText(window, 'Import from RestGo');
    await ready(
      window,
      `document.querySelectorAll('.wr-restgo-api-picker-row').length === 1 && document.querySelectorAll('.wr-restgo-api-picker-methods .wr-restgo-method-badge').length === 2`,
    );
    await setControl(window, '[aria-label="Search published RestGo APIs"]', 'PUT');
    await ready(
      window,
      `document.querySelectorAll('.wr-restgo-api-picker-row').length === 1 && document.querySelector('.wr-restgo-api-picker-row')?.textContent.includes('GET') === true`,
    );
    await setControl(window, '[aria-label="Search published RestGo APIs"]', '');
    await capture(window, `${screenshotRoot}-restgo-grouped-import.png`);
    await click(window, '[aria-label="Import demo/anotacoes v1"]');

    await clickText(window, 'Import 1 endpoint', '.wr-restgo-api-picker');
    await ready(
      window,
      `document.querySelectorAll('.wr-api-operation-list > button').length === 1 && document.querySelector('[aria-label="Method"]')?.value === 'GET' && [...document.querySelectorAll('[aria-label="Method"] option')].map(option => option.value).join(',') === 'GET,PUT'`,
    );
    await setControl(window, '[aria-label="Operation name"]', 'LoadNotes');
    await setControl(window, '[aria-label="Query parameters value rgouserid"]', 'user-42');
    await setControl(window, '[aria-label="Method"]', 'PUT');
    await clickText(window, 'Body');
    await ready(
      window,
      `document.querySelector('[aria-label="Request body"]')?.value.includes('user-42') === true`,
    );
    await setControl(window, '[aria-label="Method"]', 'GET');
    await clickText(window, 'Query parameters');
    await ready(
      window,
      `document.querySelector('[aria-label="Query parameters value rgouserid"]')?.value === 'user-42' && document.querySelectorAll('.wr-api-operation-list > button').length === 1`,
    );
    log(
      'renderer RestGO API Client grouped import passed: one endpoint row, method search, single request, published method selection and shared inputs',
    );
    await clickText(window, 'Save API Client');
    await click(window, 'button[aria-label="RestGo integration"]');
    await click(window, '.wr-restgo-sidebar nav button:first-child');
    const configuredDefaultDatabase: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('[aria-label="Default database slug"]')?.value`,
      true,
    );
    if (configuredDefaultDatabase !== 'demo') {
      await setControl(window, '[aria-label="Default database slug"]', 'demo');
      await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
      await ready(
        window,
        `document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('.wr-restgo-runtime-settings button[type="submit"]')?.matches(':disabled') === true`,
      );
    }
    await click(window, '.wr-restgo-sidebar nav button:nth-child(3)');
    await ready(
      window,
      `document.querySelector('[aria-label="Filter endpoints by database"]')?.value === '1' && document.querySelectorAll('.wr-restgo-endpoint-list-item').length === 1`,
    );
    await setControl(window, '[aria-label="Filter endpoints by database"]', '');
    await clickText(window, 'Refresh', '.wr-restgo-header-tools');
    await ready(
      window,
      `document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('[aria-label="Filter endpoints by database"]')?.value === ''`,
    );
    await setControl(window, '[aria-label="Search endpoints"]', 'no-matching-endpoint');
    await ready(window, `document.querySelectorAll('.wr-restgo-endpoint-list-item').length === 0`);
    await setControl(window, '[aria-label="Search endpoints"]', '');
    await setControl(window, '[aria-label="Filter endpoints by database"]', '1');
    await ready(window, `document.querySelectorAll('.wr-restgo-endpoint-list-item').length === 1`);

    await click(window, '.wr-restgo-endpoint-list-item');
    const endpointWritesBeforeSql = calls.filter(
      (call) => call.method === 'PUT' && call.path.startsWith('/backend/endpoints/'),
    ).length;
    await exerciseRestGoEndpointEditor(window, screenshotRoot);
    if (
      calls.filter((call) => call.method === 'PUT' && call.path.startsWith('/backend/endpoints/'))
        .length !== endpointWritesBeforeSql
    ) {
      throw new Error('Applying or cancelling SQL wrote to RestGO before Save endpoint.');
    }
    log(
      'renderer RestGO endpoint editor passed: grouped overview, publication access, SQL popup, cancel, Escape, focus, draft-only apply and desktop/narrow screenshots',
    );
    await clickText(window, 'Save endpoint', '.wr-restgo-endpoint-editor');
    await ready(
      window,
      `document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('.wr-restgo-notice')?.textContent.includes('Endpoint methods saved on RestGO.') === true && document.querySelector('.wr-restgo-endpoint-editor button[type="submit"]')?.disabled === true && document.querySelector('.wr-restgo-workspace [role="alert"]') === null`,
    );
    await click(window, 'button[aria-label="Project Explorer"]');
    await ready(
      window,
      `(() => { const item = document.querySelector('.wr-nonvisual-item[aria-label$=", API Client"]'); if (!(item instanceof HTMLElement)) return false; item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`,
    );
    await ready(
      window,
      `document.querySelector('[aria-label="Operation name"]')?.value === 'LoadNotes' && document.querySelector('[aria-label="Query parameters value rgouserid"]')?.value === 'user-42' && document.querySelector('[aria-label="Query parameters name pesquisa"]') !== null && document.querySelector('[aria-label="Query parameters name active"]') === null`,
    );
    await clickText(window, 'Save API Client');
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    const getSyncDeadline = Date.now() + 10_000;
    let getSynchronizedOnDisk = false;
    while (Date.now() < getSyncDeadline) {
      const text = await fs.readFile(pagePath, 'utf8');
      if (text.includes('pesquisa') && text.includes('user-42')) {
        getSynchronizedOnDisk = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!getSynchronizedOnDisk)
      throw new Error('The grouped GET request did not persist synchronized inputs.');
    await openClient();
    await ready(
      window,
      `document.querySelector('[aria-label="Method"]')?.matches(':disabled') === false && document.querySelector('[aria-label="Method"]')?.value === 'GET'`,
    );
    await setControl(window, '[aria-label="Method"]', 'PUT');
    await clickText(window, 'Body');
    await ready(
      window,
      `(() => {
        const body = document.querySelector('[aria-label="Request body"]');
        const hint = document.getElementById(body?.getAttribute('aria-describedby') ?? '');
        return hint?.textContent === 'Use angle brackets for dynamic parameters, for example: <title>.' && hint.getBoundingClientRect().height > 0;
      })()`,
    );
    log('renderer API Client body parameter hint passed');
    await ready(
      window,
      `(() => { const body = document.querySelector('[aria-label="Request body"]')?.value ?? ''; return body.includes('"caption"') && body.includes('"rgouserid"') && !body.includes('"active"'); })()`,
    );
    await capture(window, `${screenshotRoot}-synchronized.png`);
    await clickText(window, 'Save API Client');
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    const syncDeadline = Date.now() + 10_000;
    let synchronizedOnDisk = false;
    while (Date.now() < syncDeadline) {
      const savedPage: unknown = JSON.parse(await fs.readFile(pagePath, 'utf8'));
      const text = JSON.stringify(savedPage);
      if (
        text.includes('caption') &&
        text.includes('user-42') &&
        text.includes('"apiId":"20:12"') &&
        text.includes('"method":"PUT"') &&
        !text.includes('"name":"pesquisa"')
      ) {
        synchronizedOnDisk = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!synchronizedOnDisk)
      throw new Error('RestGo endpoint changes did not persist in the existing API Client.');
    await click(window, 'button[aria-label="RestGo integration"]');
    await clickText(window, 'Refresh', '.wr-restgo-header-tools');
    await ready(
      window,
      `document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false'`,
    );
    await click(window, 'button[aria-label="Project Explorer"]');
    await openClient();
    await ready(
      window,
      `document.querySelector('[aria-label="Method"]')?.value === 'PUT' && document.querySelector('[aria-label="Operation name"]')?.value === 'LoadNotes' && document.querySelectorAll('.wr-api-operation-list > button').length === 1`,
    );
    await clickText(window, 'Body');
    await ready(
      window,
      `document.querySelector('[aria-label="Request body"]')?.value.includes('caption') === true && document.querySelector('[aria-label="Request body"]')?.value.includes('user-42') === true`,
    );
    await clickText(window, 'Save API Client');
    log(
      'renderer RestGO API Client synchronization passed: edit and save GET/PUT SQL, reconcile existing query/JSON inputs, preserve request name and values, save project and reopen client',
    );
    log(
      `renderer API Client designer passed: request, settings and response layout, readable controls, tabs, all methods, light/dark theme, 1080/740 viewport, custom HTTP test, delete final endpoint, save/reopen empty list, recreate endpoint, fixed RestGO URL, Bearer test, safe persistence; screenshots ${screenshotRoot}-custom.png, ${screenshotRoot}-custom-light.png, ${screenshotRoot}-custom-compact.png, ${screenshotRoot}-custom-narrow.png, ${screenshotRoot}-response.png, ${screenshotRoot}-empty.png and ${screenshotRoot}-restgo.png`,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}

/** Checks generated browser output rather than a mocked runtime or designer. */
export async function runApiClientBrowserSmoke(log: (message: string) => void): Promise<void> {
  const calls: Array<{
    method: string;
    path: string;
    authorization: string | undefined;
    contentType: string | undefined;
  }> = [];
  let rotation = 0;
  let loggedOut = false;
  const token = (): string => `api-client-browser-jwt-${String(rotation)}`;
  const refreshToken = (): string => `rgr_${String(rotation).padStart(43, '0')}`;
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'cliente@example.test',
    fullName: 'Cliente',
    avatarUrl: null,
    active: true,
    emailConfirmed: true,
  };
  const session = () => ({
    token: token(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshToken: refreshToken(),
    refreshExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    user,
  });
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, REPORT',
    );
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Operation, X-Default',
    );
    if (request.method === 'OPTIONS' && request.headers['access-control-request-method']) {
      response.writeHead(204).end();
      return;
    }
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    calls.push({
      method: request.method ?? '',
      path: request.url ?? '',
      authorization: request.headers.authorization,
      contentType: request.headers['content-type'],
    });
    response.setHeader('Content-Type', 'application/json');
    if (route === '/backend/auth/token' && request.method === 'POST') {
      const body = await readBody(request);
      if (
        typeof body !== 'object' ||
        body === null ||
        Reflect.get(body, 'email') !== user.email ||
        Reflect.get(body, 'password') !== 'senha-de-teste' ||
        request.headers.authorization !== undefined
      ) {
        response.writeHead(400).end(JSON.stringify({ error: 'Invalid fixture login' }));
        return;
      }
      loggedOut = false;
      response.end(JSON.stringify(session()));
      return;
    }
    if (route === '/backend/auth/refresh' && request.method === 'POST') {
      const body = await readBody(request);
      if (
        typeof body !== 'object' ||
        body === null ||
        Reflect.get(body, 'refreshToken') !== refreshToken() ||
        loggedOut
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Invalid fixture refresh' }));
        return;
      }
      rotation++;
      response.end(JSON.stringify(session()));
      return;
    }
    if (route === '/backend/v2/demo/basic') {
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from('smoke-user:smoke-password').toString('base64')}`
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Expected Basic authorization' }));
        return;
      }
      response.end(JSON.stringify({ jwt: request.headers.authorization }));
      return;
    }
    if (request.headers.authorization !== `Bearer ${token()}` || loggedOut) {
      response
        .writeHead(401)
        .end(JSON.stringify({ error: 'Expected the current authenticated user JWT' }));
      return;
    }
    if (route === '/backend/auth/session') {
      response.end(JSON.stringify({ success: true, user }));
      return;
    }
    if (route === '/backend/auth/logout' && request.method === 'POST') {
      loggedOut = true;
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (route.startsWith('/backend/v2/demo/')) {
      if (request.method === 'HEAD' || request.method === 'OPTIONS') response.writeHead(204).end();
      else if (route === '/backend/v2/demo/upload') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
        const text = Buffer.concat(chunks).toString('utf8');
        if (
          !request.headers['content-type']?.includes('multipart/form-data; boundary=') ||
          !text.includes('documento.txt') ||
          !text.includes('conteudo-de-teste')
        ) {
          response
            .writeHead(400)
            .end(JSON.stringify({ error: 'Expected browser-generated multipart upload' }));
          return;
        }
        response.end(JSON.stringify({ uploaded: true }));
      } else {
        response.end(
          JSON.stringify({
            method: request.method,
            jwt: request.headers.authorization,
            query: new URL(request.url ?? '/', 'http://localhost').searchParams.get('page'),
            operationHeader: request.headers['x-operation'],
            defaultHeader: request.headers['x-default'],
          }),
        );
      }
      return;
    }
    response.writeHead(404).end(JSON.stringify({ error: 'Unknown API Client fixture route' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('API Client browser fixture has no port.');
  const baseUrl = `http://127.0.0.1:${String(address.port)}/backend`;
  const ownerId = -3;
  let browser: BrowserWindow | null = null;
  try {
    const original = createProject('ApiClientSmoke', {
      settings: {
        restGo: {
          ...DEFAULT_REST_GO_PROJECT_SETTINGS,
          enabled: true,
          baseUrl,
          persistSession: false,
          sessionStorage: 'memory',
          apiToken: 'rgo.must-not-be-user-auth',
        },
      },
    });
    const page = original.pages[0];
    if (page === undefined) throw new Error('API Client browser smoke requires an entry page.');
    const root = page.components.find((component) => component.id === page.rootComponentId);
    if (root === undefined) throw new Error('API Client browser smoke requires a root component.');
    const defaultConfiguration = createDefaultApiClientConfiguration();
    const template = defaultConfiguration.operations[0];
    if (template === undefined)
      throw new Error('API Client browser smoke requires a default operation.');
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'REPORT'] as const;
    const component = componentRegistry.createComponent('WebApiClient', {
      id: 'api-client-browser-smoke',
      name: 'ApiSmoke',
      parentId: root.id,
      props: {
        baseUrl: 'https://ignored.example.test/untrusted',
        apiClientConfig: {
          ...defaultConfiguration,
          connection: 'restgo-session',
          defaultHeaders: [
            { id: 'default-header', name: 'X-Default', value: 'configured', enabled: true },
          ],
          operations: methods.map((method) => ({
            ...template,
            id: `operation-${method}`,
            name: `Request${method}`,
            method,
            path: `/v2/demo/${method.toLowerCase()}`,
            headers: [
              { id: `header-${method}`, name: 'X-Operation', value: method, enabled: true },
            ],
            query: [{ id: `query-${method}`, name: 'page', value: '2', enabled: true }],
            body: {
              kind: method === 'POST' ? 'json' : 'none',
              content: method === 'POST' ? '{"name":"Cliente"}' : '',
            },
          })),
        },
      },
    });
    const basicComponent = componentRegistry.createComponent('WebApiClient', {
      id: 'api-client-basic-smoke',
      name: 'BasicSmoke',
      parentId: root.id,
      props: {
        baseUrl,
        apiClientConfig: {
          ...defaultConfiguration,
          authorization: { type: 'basic', username: 'smoke-user', password: 'smoke-password' },
          operations: [{ ...template, name: 'BasicRequest', path: '/v2/demo/basic' }],
        },
      },
    });
    const project = {
      ...original,
      pages: [
        {
          ...page,
          components: [
            ...page.components.map((candidate) =>
              candidate.id === root.id
                ? { ...root, children: [...root.children, component.id, basicComponent.id] }
                : candidate,
            ),
            component,
            basicComponent,
          ],
        },
      ],
    };
    const result = await compileProjectToMemory(project, {
      userSources: {
        'pages/index.ts': `import type { WebApiClient } from '@webrad/runtime';
import { indexGenerated } from './index.generated';
export class index extends indexGenerated {
  public constructor(element: HTMLElement) {
    super(element);
    (globalThis as unknown as { apiSmoke: WebApiClient }).apiSmoke = this.ApiSmoke;
    (globalThis as unknown as { basicSmoke: WebApiClient }).basicSmoke = this.BasicSmoke;
  }
}`,
      },
    });
    if (!result.success || result.previewHtml === undefined)
      throw new Error(
        `API Client browser compilation failed: ${JSON.stringify(result.diagnostics)}`,
      );
    browser = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await browser.loadURL(await publishPreviewHtml(ownerId, result.previewHtml));
    await ready(browser, `typeof window.apiSmoke?.execute === 'function'`);
    const evidence: unknown = await browser.webContents.executeJavaScript(
      `(async () => {
      const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
      check(await RestGO.login('cliente@example.test', 'senha-de-teste'));
      const client = window.apiSmoke;
      const basic = await window.basicSmoke.BasicRequest.execute();
      if (basic.jwt !== ${JSON.stringify(`Basic ${Buffer.from('smoke-user:smoke-password').toString('base64')}`)})
        throw new Error('Compiled API Client did not apply saved Basic authorization');
      if (client.baseUrl !== ${JSON.stringify(baseUrl)}) throw new Error('Bound API Client did not use the project base URL');
      let locked = false;
      try { client.baseUrl = 'https://escaped.example.test'; } catch { locked = true; }
      if (!locked) throw new Error('Bound API Client accepted a base URL override');
      for (const method of ${JSON.stringify(methods)}) {
        const response = await client.execute('Request' + method);
        if (method === 'HEAD' || method === 'OPTIONS') {
          if (response !== undefined) throw new Error('Bodyless HTTP response was not empty');
        } else if (response.method !== method || response.query !== '2' || response.operationHeader !== method || response.defaultHeader !== 'configured' || response.jwt !== 'Bearer api-client-browser-jwt-0') {
          throw new Error('Named ' + method + ' request contract mismatch: ' + JSON.stringify(response));
        }
      }
      check(await RestGO.refreshSession());
      const refreshed = await client.execute('RequestGET');
      if (refreshed.jwt !== 'Bearer api-client-browser-jwt-1') throw new Error('API Client retained the JWT from before refresh');
      const form = new FormData();
      form.append('file', new Blob(['conteudo-de-teste'], { type: 'text/plain' }), 'documento.txt');
      const uploaded = await client.post('/v2/demo/upload', form, { headers: { Authorization: 'Bearer forged-jwt' } });
      if (uploaded.uploaded !== true) throw new Error('Authenticated multipart failed');
      const rejectedPaths = ['https://escaped.example.test/api', '//escaped.example.test/api', '../escape', '/%2e%2e/escape'];
      for (const path of rejectedPaths) {
        let rejected = false;
        try { await client.get(path); } catch { rejected = true; }
        if (!rejected) throw new Error('Bound URL escaped the configured prefix: ' + path);
      }
      check(await RestGO.logout());
      let unauthenticated = false;
      try { await client.execute('RequestGET'); } catch { unauthenticated = true; }
      if (!unauthenticated) throw new Error('API Client sent a bound request after logout');
      return { methods: ${JSON.stringify(methods)}, refreshedJwt: true, fixedBase: true, multipart: true, escapedPathsRejected: true, anonymousRejected: true };
    })()`,
      true,
    );
    if (
      typeof evidence !== 'object' ||
      evidence === null ||
      Reflect.get(evidence, 'anonymousRejected') !== true
    )
      throw new Error(`API Client browser evidence mismatch: ${JSON.stringify(evidence)}`);
    const endpointCalls = calls.filter(
      (call) => call.path.startsWith('/backend/v2/demo/') && call.path !== '/backend/v2/demo/basic',
    );
    if (
      endpointCalls.length !== methods.length + 2 ||
      endpointCalls.at(-1)?.authorization !== 'Bearer api-client-browser-jwt-1' ||
      rotation !== 1
    )
      throw new Error(`API Client browser request mismatch: ${JSON.stringify(calls)}`);
    log(
      `renderer API Client browser passed: ${JSON.stringify(evidence)}; ${String(endpointCalls.length)} real authenticated HTTP requests`,
    );
    log(
      'renderer API Client compiled authorization passed: saved Basic Auth, typed request instance and real browser HTTP header',
    );
  } finally {
    browser?.destroy();
    revokePreview(ownerId);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}
