import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import { compileProjectToMemory } from './compiler-service';
import {
  bindComponentEvent,
  createProject,
  DEFAULT_REST_GO_PROJECT_SETTINGS,
} from '@webrad/project-model';
import { BrowserWindow, type WebFrameMain } from 'electron';

import { publishPreviewHtml, revokePreview } from './preview-server';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { createDefaultWebLoginConfiguration } from '@webrad/runtime/login-model';
import { monacoHandlerInputReadyExpression } from './monaco-smoke-input';
import { capturePresentedSmokePage } from './smoke-capture';
import { resizeSmokeViewport } from './smoke-viewport';

interface RestGoSettingsSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

async function restGoPreviewFrame(window: BrowserWindow, url: string): Promise<WebFrameMain> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const frame = window.webContents.mainFrame.frames.find((candidate) => candidate.url === url);
    if (frame !== undefined) {
      const ready: unknown = await frame.executeJavaScript(
        `document.querySelector('[data-restgo-identity="true"]') !== null`,
        true,
      );
      if (ready === true) return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`RestGO smoke timed out waiting for the sandboxed Preview frame ${url}.`);
}

async function rendererReady(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready: unknown = await window.webContents.executeJavaScript(expression, true);
    if (ready === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`RestGO settings smoke timed out: ${expression}`);
}

async function click(window: BrowserWindow, selector: string): Promise<void> {
  await rendererReady(
    window,
    `(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!(button instanceof HTMLElement) || button.matches(':disabled')) return false;
      button.click();
      return true;
    })()`,
  );
}

async function setField(window: BrowserWindow, label: string, value: string): Promise<void> {
  await rendererReady(
    window,
    `(() => {
      const label = Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label'))
        .find((item) => item.querySelector('input, select')?.getAttribute('aria-label') === ${JSON.stringify(label)}
          || item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(label)});
      const control = label?.querySelector('input, select');
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement) || control.matches(':disabled')) return false;
      if (control.getClientRects().length === 0) return false;
      const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label'))
      .find((item) => item.querySelector('input, select')?.getAttribute('aria-label') === ${JSON.stringify(label)}
        || item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(label)})
      ?.querySelector('input, select')?.value === ${JSON.stringify(value)}`,
  );
}

async function setIntegrationEnabled(window: BrowserWindow, enabled: boolean): Promise<void> {
  const selector = '.wr-restgo-runtime-settings .wr-restgo-settings-group input[type="checkbox"]';
  await rendererReady(
    window,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement) || control.matches(':disabled')) return false;
      if (control.checked !== ${String(enabled)}) control.click();
      return control.checked === ${String(enabled)};
    })()`,
  );
  await rendererReady(
    window,
    `document.querySelector(${JSON.stringify(selector)})?.checked === ${String(enabled)}`,
  );
}

async function configurationApplied(window: BrowserWindow, enabled: boolean): Promise<void> {
  await rendererReady(
    window,
    `document.querySelector('.wr-restgo-workspace')?.getAttribute('aria-busy') === 'false'
      && document.querySelector('.wr-restgo-runtime-settings')?.textContent.includes('Up to date') === true
      && document.querySelector('.wr-restgo-runtime-settings button[type="submit"]')?.matches(':disabled') === true
      && document.querySelector('.wr-restgo-sidebar-instance .wr-restgo-dot')?.classList.contains('is-active') === ${String(enabled)}
      && document.querySelector('.wr-restgo-sidebar-instance small')?.textContent === 'https://restgo.example.test/backend'
      && document.querySelector('.wr-restgo-workspace [role="alert"]') === null`,
  );
}

async function openSettings(window: BrowserWindow): Promise<void> {
  await click(window, 'button[aria-label="RestGo integration"]');
  await click(window, '.wr-restgo-sidebar button:first-child');
}

async function connectionLayoutEvidence(
  window: BrowserWindow,
  screenshotPath: string,
): Promise<string> {
  const [originalWidth, originalHeight] = window.getContentSize();
  const [minimumWidth, minimumHeight] = window.getMinimumSize();
  if (
    originalWidth === undefined ||
    originalHeight === undefined ||
    minimumWidth === undefined ||
    minimumHeight === undefined
  )
    throw new Error('RestGO Connection smoke could not read the original window dimensions.');
  const narrowPath = screenshotPath.replace(/\.png$/, '-narrow.png');
  const toolsPath = screenshotPath.replace(/\.png$/, '-narrow-tools.png');
  const desktopToolsPath = screenshotPath.replace(/\.png$/, '-desktop-tools.png');
  const desktopSessionPath = screenshotPath.replace(/\.png$/, '-desktop-session.png');
  const narrowSessionPath = screenshotPath.replace(/\.png$/, '-narrow-session.png');
  const desktopLoginPath = screenshotPath.replace(/\.png$/, '-desktop-login.png');
  const narrowLoginPath = screenshotPath.replace(/\.png$/, '-narrow-login.png');
  try {
    window.setMinimumSize(1, 1);
    for (const [width, height, narrow, outputPath] of [
      [1440, 900, false, screenshotPath],
      [900, 800, true, narrowPath],
    ] as const) {
      await resizeSmokeViewport(window, { width, height });
      await rendererReady(
        window,
        `(() => {
          const form = document.querySelector('details.wr-restgo-development-form');
          const summary = form?.querySelector('summary');
          if (!(form instanceof HTMLDetailsElement) || !(summary instanceof HTMLElement)) return false;
          if (!form.open) summary.click();
          return form.open;
        })()`,
      );
      await rendererReady(
        window,
        `(() => {
          const connection = document.querySelector('.wr-restgo-connection');
          const body = connection?.closest('.wr-restgo-workspace-body');
          const application = connection?.querySelector('.wr-restgo-runtime-settings');
          const tools = connection?.querySelector('.wr-restgo-ide-tools');
          const admin = tools?.querySelector('.wr-restgo-admin-settings');
          const login = tools?.querySelector('.wr-restgo-development-login');
          if (![body, connection, application, tools, admin, login].every(element => element instanceof HTMLElement)) return false;
          if (application.querySelector('h2')?.textContent !== 'Application connection') return false;
          if (!application.textContent.includes('Project settings') || !tools.textContent.includes('IDE only')) return false;
          if (application.contains(admin) || application.contains(login)) return false;
          const icons = [application, admin, login].map(section => section.querySelector('.wr-restgo-connection-heading > .wr-icon'));
          if (!icons.every(icon => {
            if (!(icon instanceof SVGSVGElement)) return false;
            const bounds = icon.getBoundingClientRect();
            const style = getComputedStyle(icon);
            return Math.abs(bounds.width - 24) <= 1 && Math.abs(bounds.height - 24) <= 1
              && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage === 'none'
              && style.padding === '0px' && icon.getAttribute('aria-hidden') === 'true';
          })) return false;
          const apiDefaults = application.querySelector('section.wr-restgo-api-defaults');
          const session = application.querySelector('section.wr-restgo-session-settings');
          if (!(apiDefaults instanceof HTMLElement) || !(session instanceof HTMLElement)) return false;
          const loginForm = login.querySelector('details.wr-restgo-development-form');
          const loginFields = loginForm?.querySelector('.wr-restgo-login-fields');
          if (!(loginForm instanceof HTMLDetailsElement) || !loginForm.open || !(loginFields instanceof HTMLElement)) return false;
          const fields = [apiDefaults.querySelector('input[type="password"]'), apiDefaults.querySelector('input[type="text"]'), session.querySelector('select'), session.querySelector('input[type="text"]'), loginFields.querySelector('input[type="email"]'), loginFields.querySelector('input[type="password"]')];
          if (!fields.every(field => {
            if (!(field instanceof HTMLElement) || field.getClientRects().length === 0) return false;
            const label = field.closest('label');
            return label instanceof HTMLElement && Math.abs(field.getBoundingClientRect().width - label.getBoundingClientRect().width) <= 2;
          })) return false;
          const [apiToken, database, storage, storageKey, loginEmail, loginPassword] = fields;
          const bounds = connection.getBoundingClientRect();
          const bodyBounds = body.getBoundingClientRect();
          const bodyStyle = getComputedStyle(body);
          const paddingLeft = parseFloat(bodyStyle.paddingLeft);
          const paddingRight = parseFloat(bodyStyle.paddingRight);
          const availableWidth = body.clientWidth - paddingLeft - paddingRight;
          const twoColumns = availableWidth >= 760;
          if ((innerWidth === 1440 && !twoColumns) || (innerWidth === 900 && twoColumns)) return false;
          const pairMatches = (first, second) => {
            const left = first.getBoundingClientRect();
            const right = second.getBoundingClientRect();
            if (twoColumns) return right.left >= left.right - 1 && Math.abs(right.top - left.top) <= 2 && Math.abs(right.width - left.width) <= 2;
            return right.top >= left.bottom - 1 && Math.abs(right.left - left.left) <= 2 && Math.abs(right.width - left.width) <= 2;
          };
          if (!pairMatches(apiToken, database) || !pairMatches(storage, storageKey) || !pairMatches(loginEmail, loginPassword)) return false;
          const contentLeft = bodyBounds.left + body.clientLeft + paddingLeft;
          const fillsAvailableWidth = availableWidth > 0
            && Math.abs(bounds.left - contentLeft) <= 2
            && Math.abs(bounds.width - availableWidth) <= 2
            && body.scrollWidth <= body.clientWidth + 1;
          const appBounds = application.getBoundingClientRect();
          const toolsBounds = tools.getBoundingClientRect();
          const fits = [application, tools, admin, login].every(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && Math.abs(rect.left - bounds.left) <= 2 && Math.abs(rect.width - bounds.width) <= 2 && rect.right <= bounds.right + 1 && element.scrollWidth <= element.clientWidth + 1;
          });
          const url = application.querySelector('input[type="url"]');
          if (!(url instanceof HTMLInputElement) || url.value !== 'https://restgo.example.test/backend') return false;
          const readable = url.getBoundingClientRect().height >= 30 && parseFloat(getComputedStyle(url).fontSize) >= 12;
          return fillsAvailableWidth && fits && readable && connection.scrollWidth <= connection.clientWidth + 1 && toolsBounds.top >= appBounds.bottom - 1
            && Math.abs(toolsBounds.left - appBounds.left) <= 1
            && Math.abs(toolsBounds.width - appBounds.width) <= 1
            && login.getBoundingClientRect().top >= admin.getBoundingClientRect().bottom - 1;
        })()`,
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-login-fields').scrollIntoView({ block: 'center' })`,
        true,
      );
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const loginScreenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO Connection ${narrow ? 'narrow' : 'desktop'} development login`,
      );
      await fs.writeFile(narrow ? narrowLoginPath : desktopLoginPath, loginScreenshot.toPNG());
      await rendererReady(
        window,
        `(() => {
          const form = document.querySelector('details.wr-restgo-development-form');
          const summary = form?.querySelector('summary');
          if (!(form instanceof HTMLDetailsElement) || !(summary instanceof HTMLElement)) return false;
          if (form.open) summary.click();
          return !form.open;
        })()`,
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-runtime-settings').scrollIntoView({ block: 'start' })`,
        true,
      );
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const screenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO Connection ${narrow ? 'narrow' : 'desktop'}`,
      );
      await fs.writeFile(outputPath, screenshot.toPNG());
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-session-settings').scrollIntoView({ block: 'start' })`,
        true,
      );
      const sessionScreenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO Connection ${narrow ? 'narrow' : 'desktop'} user session`,
      );
      await fs.writeFile(
        narrow ? narrowSessionPath : desktopSessionPath,
        sessionScreenshot.toPNG(),
      );
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-ide-tools').scrollIntoView({ block: 'start' })`,
        true,
      );
      const toolsScreenshot = await capturePresentedSmokePage(
        window,
        Date.now() + 10_000,
        `RestGO Connection ${narrow ? 'narrow' : 'desktop'} IDE tools`,
      );
      await fs.writeFile(narrow ? toolsPath : desktopToolsPath, toolsScreenshot.toPNG());
    }
  } finally {
    try {
      await resizeSmokeViewport(window, { width: originalWidth, height: originalHeight });
      await window.webContents.executeJavaScript(
        `document.querySelector('.wr-restgo-runtime-settings')?.scrollIntoView({ block: 'start' })`,
        true,
      );
    } finally {
      window.setMinimumSize(minimumWidth, minimumHeight);
    }
  }
  return `${narrowPath}, ${desktopSessionPath}, ${narrowSessionPath}, ${desktopToolsPath}, ${toolsPath}, ${desktopLoginPath}, ${narrowLoginPath}`;
}

async function saveProject(window: BrowserWindow, projectPath: string): Promise<void> {
  await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
  await configurationApplied(window, true);
  await rendererReady(
    window,
    `document.querySelector('.wr-restgo-runtime-settings button[type="submit"]')?.textContent?.includes('Apply configuration') === true
      && document.querySelector('.wr-restgo-runtime-settings')?.textContent?.includes('Save the project (Ctrl+S)') === true`,
  );
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const manifest = JSON.parse(await fs.readFile(projectPath, 'utf8')) as unknown;
    if (typeof manifest === 'object' && manifest !== null) {
      const settings: unknown = Reflect.get(manifest, 'settings');
      const restGo: unknown =
        typeof settings === 'object' && settings !== null
          ? Reflect.get(settings, 'restGo')
          : undefined;
      if (
        typeof restGo === 'object' &&
        restGo !== null &&
        Reflect.get(restGo, 'enabled') === true &&
        Reflect.get(restGo, 'baseUrl') === 'https://restgo.example.test/backend' &&
        Reflect.get(restGo, 'apiVersion') === 1 &&
        Reflect.get(restGo, 'defaultDatabase') === 'clientes' &&
        Reflect.get(restGo, 'sessionStorage') === 'memory' &&
        Reflect.get(restGo, 'apiToken') === 'rgo.settings-smoke'
      )
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('RestGO settings were not persisted to the project file.');
}

/** Exercises real renderer controls and disk persistence on the isolated smoke fixture. */
/** Exercises workspace controls and disk persistence on the isolated smoke fixture. */
export async function runRestGoSettingsSmoke(
  window: BrowserWindow,
  { projectPath, log }: RestGoSettingsSmokeOptions,
): Promise<void> {
  await openSettings(window);
  await rendererReady(
    window,
    `document.querySelector('.wr-restgo-api-defaults input[type="password"]')?.getClientRects().length > 0
      && document.querySelector('.wr-restgo-api-defaults input[type="text"]')?.getClientRects().length > 0
      && document.querySelector('.wr-restgo-session-settings select')?.getClientRects().length > 0
      && document.querySelector('.wr-restgo-session-settings input[type="text"]')?.getClientRects().length > 0`,
  );
  await setIntegrationEnabled(window, true);
  await setField(window, 'RestGO instance URL', 'https://restgo.example.test/backend');
  await setField(window, 'Application API token', 'rgo.settings-smoke');
  await setField(window, 'Default database slug', 'clientes');
  await setField(window, 'Session storage', 'memory');
  await click(window, '.wr-restgo-sidebar button:nth-child(2)');
  await click(window, '.wr-restgo-sidebar button:first-child');
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-restgo-runtime-settings input')).some(input => input.value === 'https://restgo.example.test/backend')`,
  );
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-restgo-settings.png');
  await rendererReady(
    window,
    `document.querySelector('.wr-restgo-api-defaults input[type="password"]')?.getClientRects().length > 0
      && document.querySelector('.wr-restgo-api-defaults input[type="text"]')?.getClientRects().length > 0
      && document.querySelector('.wr-restgo-session-settings select')?.getClientRects().length > 0
      && document.querySelector('.wr-restgo-session-settings input[type="text"]')?.getClientRects().length > 0`,
  );
  const narrowScreenshots = await connectionLayoutEvidence(window, screenshotPath);
  log(
    `renderer RestGO connection layout passed: project and IDE cards, unboxed heading icons; visible API defaults and session settings; full-width single-column desktop and narrow geometry; screenshots ${screenshotPath}, ${narrowScreenshots}`,
  );
  await saveProject(window, projectPath);
  await click(window, 'button[aria-label="Close RestGo"]');
  await openSettings(window);
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-restgo-runtime-settings input')).some(input => input.type === 'password' && input.value === 'rgo.settings-smoke')`,
  );
  await setField(window, 'RestGO instance URL', 'https://draft.example.test');
  await setField(window, 'Application API token', 'rgo.unsaved-token');
  await rendererReady(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.includes('Pending edits') === true`,
  );
  await window.webContents.executeJavaScript(
    `(() => {
    window.__webradRestGoCloseGuard = { original: window.confirm, messages: [] };
    window.confirm = message => { window.__webradRestGoCloseGuard.messages.push(message); return false; };
  })()`,
    true,
  );
  try {
    window.webContents.send('webrad:menu-command', 'file.closeProject');
    await rendererReady(
      window,
      `window.__webradRestGoCloseGuard.messages.some(message => message.includes('RestGo'))
      && document.querySelector('.wr-restgo-workspace') !== null
      && Array.from(document.querySelectorAll('.wr-restgo-runtime-settings input')).some(input => input.value === 'https://draft.example.test')`,
    );
  } finally {
    await window.webContents.executeJavaScript(
      `(() => {
      window.confirm = window.__webradRestGoCloseGuard.original;
      delete window.__webradRestGoCloseGuard;
    })()`,
      true,
    );
  }
  log('renderer RestGO pending draft close protection passed');
  const manifest = JSON.parse(await fs.readFile(projectPath, 'utf8')) as {
    settings?: { restGo?: Record<string, unknown> };
  };
  if (
    manifest.settings?.restGo?.baseUrl !== 'https://restgo.example.test/backend' ||
    manifest.settings.restGo.apiToken !== 'rgo.settings-smoke'
  )
    throw new Error('Unapplied workspace edits changed the saved RestGO settings.');
  await setField(window, 'RestGO instance URL', 'https://restgo.example.test/backend');
  await setField(window, 'Application API token', 'rgo.settings-smoke');
  await setIntegrationEnabled(window, false);
  await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
  await configurationApplied(window, false);
  await click(window, 'button[aria-label="Project Explorer"]');
  log(
    `renderer RestGO workspace passed: save, disk persistence, reopen and unapplied draft isolation; screenshot ${screenshotPath}`,
  );
}

/** Verifies page Interaction authoring and persistence through the actual IDE renderer. */
export async function runRestGoPageEventsSmoke(
  window: BrowserWindow,
  { projectPath, log }: RestGoSettingsSmokeOptions,
): Promise<void> {
  await click(window, 'button[aria-label="Design"]');
  await click(window, '[role="treeitem"][data-component-id="hello-webrad-component-form-main-v1"]');
  await click(window, 'button[role="tab"][aria-label="Events"]');
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-inspector-event-row label'))
    .some((label) => label.textContent === 'OnUnauthenticated')`,
  );
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-restgo-page-events.png');
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.writeFile(screenshotPath, (await window.webContents.capturePage()).toPNG());
  for (const name of ['OnLogin', 'OnLogout', 'OnUnauthenticated']) {
    if (name !== 'OnLogin') {
      await click(window, 'button[aria-label="Design"]');
      await click(window, 'button[role="tab"][aria-label="Events"]');
    }
    await rendererReady(
      window,
      `(() => {
      const row = Array.from(document.querySelectorAll('.wr-inspector-event-row'))
        .find((row) => row.querySelector('label')?.textContent === ${JSON.stringify(name)});
      if (!row) return false;
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    })()`,
    );
    await rendererReady(window, `document.querySelector('.monaco-editor') !== null`);
    if (name === 'OnUnauthenticated') {
      // This smoke verifies persistence of a working binding; empty stubs are pruned on Save.
      // The editor DOM mounts before event navigation restores the model, caret and focus.
      await rendererReady(window, monacoHandlerInputReadyExpression('indexUnauthenticated'));
      window.webContents.focus();
      await window.webContents.insertText('return;');
      await rendererReady(
        window,
        `document.querySelector('.monaco-editor')?.textContent?.includes('return;') === true`,
      );
    }
  }
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  const pagePath = path.join(path.dirname(projectPath), 'pages', 'index.wrpage');
  const sourcePath = path.join(path.dirname(projectPath), 'pages', 'index.ts');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const model = JSON.parse(await fs.readFile(pagePath, 'utf8')) as {
      rootComponentId: string;
      components: Array<{ id: string; events: Record<string, string> }>;
    };
    const root = model.components.find((component) => component.id === model.rootComponentId);
    const source = await fs.readFile(sourcePath, 'utf8');
    if (
      root?.events.OnLogin === 'indexLogin' &&
      root.events.OnLogout === 'indexLogout' &&
      root.events.OnUnauthenticated === 'indexUnauthenticated' &&
      source.includes('CustomEvent<WebPageLoginEventDetail>') &&
      source.includes('CustomEvent<WebPageLogoutEventDetail>') &&
      source.includes('async indexUnauthenticated(sender: WebPage, event: Event): Promise<void>') &&
      source.includes('const { user } = event.detail;')
    ) {
      log(
        `renderer RestGO page Interaction passed: typed handlers and saved bindings; screenshot ${screenshotPath}`,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('RestGO page Interaction handlers or event bindings were not saved.');
}

/** Checks generated browser output against a local fixture of the documented HTTP contracts. */
export async function runRestGoBrowserSmoke(
  log: (message: string) => void,
  ideWindow?: BrowserWindow,
): Promise<void> {
  const calls: string[] = [];
  const requests: Array<{
    method: string;
    route: string;
    origin: string;
    authorization: string | undefined;
    contentType: string | undefined;
    body?: Record<string, unknown>;
  }> = [];
  const preflights: Array<{ route: string; origin: string; headers: string }> = [];
  let revoked = false;
  let rotation = 0;
  let accessExpired = false;
  let forcedExpiry = false;
  let currentPassword = 'senha-de-teste';
  let recoveryReturnUrl = '';
  let recoveryToken = '';
  let recoverySequence = 0;
  const consumedRecoveryTokens = new Set<string>();
  const token = (): string => `smoke-user-jwt-${String(rotation)}`;
  const refreshToken = (): string => `rgr_${String(rotation).padStart(43, '0')}`;
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'cliente@example.test',
    fullName: 'Cliente',
    avatarUrl: null,
    active: true,
    emailConfirmed: true,
  };
  const fileId = '00000000-0000-4000-8000-000000000002';
  const paymentAttempts = new Map<
    string,
    {
      id: string;
      sourceKey: string;
      mode: 'payment' | 'subscription';
      idempotencyKey: string;
      reads: number;
      canceled: boolean;
      opened: boolean;
      confirmationReads: number;
    }
  >();
  const paymentNavigations: string[] = [];
  const paymentHistoryCursors: string[] = [];
  const historicalPaymentId = '00000000-0000-4000-8000-000000000009';
  const paymentResponse = (slug: string) => {
    const attempt = paymentAttempts.get(slug);
    if (!attempt) throw new Error('Missing payment fixture attempt.');
    const ready = attempt.reads >= 2;
    const settled = attempt.opened && attempt.reads >= 3;
    return {
      id: attempt.id,
      mode: attempt.mode,
      status: settled ? (attempt.mode === 'payment' ? 'succeeded' : 'active') : 'pending',
      checkoutState: ready ? 'completed' : 'pending',
      checkoutUrl: ready && !settled ? `https://checkout.example.test/${slug}` : undefined,
      synchronizationPending: settled && attempt.confirmationReads < 2,
      providerName: slug === 'stripe-smoke' ? 'stripe' : 'asaas',
      provider: {
        status: settled ? (attempt.mode === 'payment' ? 'succeeded' : 'active') : 'pending',
        subscriptionId: settled && attempt.mode === 'subscription' ? 'sub_fixture' : undefined,
        periodEnd: settled && attempt.mode === 'subscription' ? '2030-01-01T00:00:00Z' : undefined,
        cancelAtPeriodEnd: attempt.canceled,
      },
    };
  };
  const session = () => ({
    token: token(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    refreshToken: refreshToken(),
    refreshExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    user,
  });
  const file = {
    id: fileId,
    ownerId: user.id,
    ownerEmail: user.email,
    originalName: 'documento.txt',
    contentType: 'text/plain',
    sizeBytes: 12,
    isPublic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    downloadUrl: `/storage/files/${fileId}/download`,
  };
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !isHttpOrigin(origin)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Range, X-RestGo-Pagination',
    );
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Max-Age', '0');
      preflights.push({
        route,
        origin,
        headers: request.headers['access-control-request-headers'] ?? '',
      });
      response.writeHead(204).end();
      return;
    }
    calls.push(`${request.method ?? ''} ${route}`);
    const capturedRequest = {
      method: request.method ?? '',
      route,
      origin,
      authorization: request.headers.authorization,
      contentType: request.headers['content-type'],
      body: undefined as Record<string, unknown> | undefined,
    };
    requests.push(capturedRequest);
    response.setHeader('Content-Type', 'application/json');
    if (route === '/cors/renderer') {
      if (request.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        capturedRequest.body = body;
        if (body.source !== 'api-client-renderer') {
          response.writeHead(400).end(JSON.stringify({ error: 'Renderer JSON body mismatch' }));
          return;
        }
        response.end(JSON.stringify({ origin, body }));
        return;
      }
      if (
        request.method === 'GET' &&
        request.headers.authorization === 'Bearer renderer-cors-smoke'
      ) {
        response.end(JSON.stringify({ origin, authorization: request.headers.authorization }));
        return;
      }
      response.writeHead(400).end(JSON.stringify({ error: 'Renderer Authorization mismatch' }));
      return;
    }
    if (route === '/auth/users' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      capturedRequest.body = body;
      if (
        request.headers.authorization !== undefined ||
        typeof body.email !== 'string' ||
        body.password !== 'senha-de-teste' ||
        'admin' in body
      ) {
        response
          .writeHead(400)
          .end(JSON.stringify({ error: 'Expected anonymous common-user registration' }));
        return;
      }
      response.writeHead(201).end(
        JSON.stringify({
          ...user,
          id: 'registered-user',
          email: body.email,
          fullName: body.fullName ?? body.email,
          createdAt: '2026-10-04T00:00:00Z',
          updatedAt: '2026-10-04T00:00:00Z',
        }),
      );
      return;
    }
    if (
      (route === '/auth/password-reset/request' || route === '/auth/password-reset/confirm') &&
      request.method === 'POST'
    ) {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      capturedRequest.body = body;
      if (request.headers.authorization !== undefined) {
        response.writeHead(400).end(JSON.stringify({ error: 'Recovery must be anonymous' }));
        return;
      }
      if (route.endsWith('/request')) {
        if (typeof body.email !== 'string' || typeof body.url !== 'string') {
          response
            .writeHead(400)
            .end(JSON.stringify({ error: 'Expected recovery email and return URL' }));
          return;
        }
        recoveryReturnUrl = body.url;
        recoveryToken = `smoke-password-reset-${++recoverySequence}`;
      } else {
        if (body.token !== recoveryToken || consumedRecoveryTokens.has(recoveryToken)) {
          response
            .writeHead(400)
            .end(JSON.stringify({ error: 'Invalid or expired recovery link' }));
          return;
        }
        if (typeof body.password !== 'string' || body.password.length < 8) {
          response.writeHead(400).end(JSON.stringify({ error: 'Password is too short' }));
          return;
        }
        consumedRecoveryTokens.add(recoveryToken);
        currentPassword = body.password;
        revoked = true;
      }
      response.end(JSON.stringify({ success: true }));
      return;
    }
    if (route === '/auth/token' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      capturedRequest.body = body;
      if (
        body.email !== user.email ||
        body.password !== currentPassword ||
        request.headers.authorization !== undefined
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
      }
      revoked = false;
      response.end(JSON.stringify(session()));
      return;
    }
    if (route === '/auth/refresh' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      capturedRequest.body = body;
      if (
        request.headers.authorization !== undefined ||
        body.refreshToken !== refreshToken() ||
        revoked ||
        Object.keys(body).length !== 1
      ) {
        response.writeHead(401).end(JSON.stringify({ error: 'Invalid or consumed refresh token' }));
        return;
      }
      // Leave both browser processes enough time to contend for the same real Web Lock.
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (body.refreshToken !== refreshToken()) {
        response.writeHead(401).end(JSON.stringify({ error: 'Consumed refresh token' }));
        return;
      }
      rotation++;
      accessExpired = false;
      user.fullName = `Cliente ${String(rotation)}`;
      response.end(JSON.stringify(session()));
      return;
    }
    if (route === '/v2/demo/anonymous' && request.method === 'GET') {
      if (request.headers.authorization !== 'rgo.browser-smoke') {
        response.writeHead(401).end(JSON.stringify({ error: 'Expected raw application token' }));
        return;
      }
      response.end(JSON.stringify({ success: true, data: [{ anonymous: true }] }));
      return;
    }

    if (route === '/v2/demo/list' && !forcedExpiry) {
      forcedExpiry = true;
      accessExpired = true;
    }
    if (request.headers.authorization !== `Bearer ${token()}` || revoked || accessExpired) {
      response.writeHead(401).end(JSON.stringify({ error: 'Invalid session' }));
      return;
    }
    if (route.startsWith('/payment/')) {
      const parts = route.split('/');
      const slug = parts[2] ?? '';
      if (slug !== 'stripe-smoke' && slug !== 'asaas-smoke') {
        response.writeHead(404).end(JSON.stringify({ error: 'Unknown gateway' }));
        return;
      }
      if (request.method === 'POST' && parts[3] === 'checkouts') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        capturedRequest.body = body;
        const mode = slug === 'stripe-smoke' ? 'payment' : 'subscription';
        const sourceKey = mode === 'payment' ? '9007199254740993' : 'subscription-order';
        if (
          Object.keys(body).length !== 3 ||
          body.sourceKey !== sourceKey ||
          body.mode !== mode ||
          typeof body.idempotencyKey !== 'string'
        ) {
          response.writeHead(400).end(JSON.stringify({ error: 'Invalid customer checkout input' }));
          return;
        }
        const prior = paymentAttempts.get(slug);
        if (prior && prior.idempotencyKey !== body.idempotencyKey) {
          response
            .writeHead(409)
            .end(JSON.stringify({ error: 'Checkout retry changed idempotency key' }));
          return;
        }
        if (!prior)
          paymentAttempts.set(slug, {
            id:
              mode === 'payment'
                ? '00000000-0000-4000-8000-000000000010'
                : '00000000-0000-4000-8000-000000000011',
            sourceKey,
            mode,
            idempotencyKey: body.idempotencyKey,
            reads: 0,
            canceled: false,
            opened: false,
            confirmationReads: 0,
          });
        const operation = paymentResponse(slug);
        response
          .writeHead(operation.checkoutState === 'pending' ? 202 : 200)
          .end(JSON.stringify(operation));
        return;
      }
      const attempt = paymentAttempts.get(slug);
      if (!attempt) {
        response.writeHead(404).end(JSON.stringify({ error: 'Unknown operation' }));
        return;
      }
      if (request.method === 'GET' && parts.length === 4 && parts[3] === 'operations') {
        const cursor =
          new URL(request.url ?? '/', 'http://localhost').searchParams.get('before') ?? '';
        paymentHistoryCursors.push(cursor);
        if (cursor !== '' && cursor !== attempt.id) {
          response.writeHead(400).end(JSON.stringify({ error: 'Invalid history cursor' }));
          return;
        }
        const operation = paymentResponse(slug);
        response.end(
          JSON.stringify({
            data:
              cursor === ''
                ? [{ ...operation, checkoutUrl: undefined }]
                : [
                    {
                      ...operation,
                      id: historicalPaymentId,
                      status: 'succeeded',
                      checkoutState: 'completed',
                      checkoutUrl: undefined,
                      synchronizationPending: false,
                      provider: { status: 'succeeded', cancelAtPeriodEnd: false },
                    },
                  ],
            nextCursor: cursor === '' ? attempt.id : '',
          }),
        );
        return;
      }
      if (parts[3] !== 'operations' || parts[4] !== attempt.id) {
        response.writeHead(404).end(JSON.stringify({ error: 'Operation ownership mismatch' }));
        return;
      }
      if (request.method === 'POST' && parts[5] === 'cancel') {
        if (attempt.mode !== 'subscription' || !attempt.opened || attempt.reads < 3) {
          response.writeHead(409).end(JSON.stringify({ error: 'Subscription unavailable' }));
          return;
        }
        attempt.canceled = true;
      } else if (request.method === 'GET' && parts.length === 5) {
        attempt.reads++;
        if (attempt.opened && attempt.reads >= 3) attempt.confirmationReads++;
      } else {
        response.writeHead(404).end(JSON.stringify({ error: 'Unknown payment action' }));
        return;
      }
      const operation = paymentResponse(slug);
      response
        .writeHead(operation.checkoutState === 'pending' ? 202 : 200)
        .end(JSON.stringify(operation));
      return;
    }
    if (route === '/auth/session') response.end(JSON.stringify({ success: true, user }));
    else if (route === '/auth/logout' && request.method === 'POST') {
      revoked = true;
      response.end(JSON.stringify({ success: true }));
    } else if (route === '/storage/files' && request.method === 'POST') {
      const contentType = request.headers['content-type'] ?? '';
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = Buffer.concat(chunks).toString('utf8');
      if (
        !contentType.includes('multipart/form-data; boundary=') ||
        !body.includes('name="file"') ||
        !body.includes('Olá RestGO')
      ) {
        response.writeHead(400).end(JSON.stringify({ error: 'Expected a real multipart file' }));
        return;
      }
      response.writeHead(201).end(JSON.stringify(file));
    } else if (route === `/storage/files/${fileId}/download`) {
      response.setHeader('Content-Type', 'text/plain');
      response.end('Olá RestGO');
    } else if (route === `/storage/files/${fileId}` && request.method === 'DELETE') {
      response.writeHead(204).end();
    } else if (route === '/v2/demo/list' && request.method === 'GET') {
      response.end(
        JSON.stringify({
          success: true,
          data: [{ id: 42, nome: 'Cliente' }],
          page: 1,
          total_pages: 1,
        }),
      );
    } else response.writeHead(404).end(JSON.stringify({ error: 'Unknown fixture route' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('RestGO smoke fixture has no port.');
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const ownerId = -2;
  let window: BrowserWindow | null = null;
  let otherWindow: BrowserWindow | null = null;
  let iframeWindow: BrowserWindow | null = null;
  let harnessPreviewUrl: string | undefined;
  const harness = createServer((_request, response) => {
    if (harnessPreviewUrl === undefined) {
      response.writeHead(503).end();
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><body><iframe
      sandbox="allow-forms allow-modals allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      src=${JSON.stringify(harnessPreviewUrl)}></iframe></body></html>`);
  });
  try {
    for (const origin of ['null', 'webrad-preview://isolated-smoke']) {
      const denied = await fetch(`${baseUrl}/auth/token`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      if (denied.status !== 403 || denied.headers.has('access-control-allow-origin')) {
        throw new Error(`RestGO CORS fixture accepted the opaque/custom Origin ${origin}.`);
      }
    }
    if (ideWindow !== undefined) {
      const rendererEvidence: unknown = await ideWindow.webContents.executeJavaScript(
        `(async () => {
          if (!/^https?:$/.test(location.protocol) || location.origin === 'null') throw new Error('IDE renderer has an opaque Origin');
          const posted = await fetch(${JSON.stringify(`${baseUrl}/cors/renderer`)}, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'api-client-renderer' }),
          });
          const body = await posted.json();
          if (!posted.ok || body.origin !== location.origin || body.body.source !== 'api-client-renderer') throw new Error('IDE JSON CORS request failed');
          const authorized = await fetch(${JSON.stringify(`${baseUrl}/cors/renderer`)}, {
            headers: { Authorization: 'Bearer renderer-cors-smoke' },
          });
          const bearer = await authorized.json();
          if (!authorized.ok || bearer.origin !== location.origin || bearer.authorization !== 'Bearer renderer-cors-smoke') throw new Error('IDE Authorization CORS request failed');
          return { origin: location.origin, json: true, bearer: true };
        })()`,
        true,
      );
      log(`renderer CORS origin passed: ${JSON.stringify(rendererEvidence)}`);
    }
    const original = createProject('RestGoSmoke', {
      settings: {
        restGo: {
          ...DEFAULT_REST_GO_PROJECT_SETTINGS,
          enabled: true,
          baseUrl,
          apiVersion: 2,
          persistSession: false,
          apiToken: 'rgo.browser-smoke',
        },
      },
    });
    const page = original.pages[0];
    if (!page) throw new Error('RestGO smoke requires an entry page.');
    const boundPage = bindComponentEvent(
      bindComponentEvent(
        bindComponentEvent(page, page.rootComponentId, 'OnLogin', 'indexLogin'),
        page.rootComponentId,
        'OnUnauthenticated',
        'indexUnauthenticated',
      ),
      page.rootComponentId,
      'OnLogout',
      'indexLogout',
    );
    const login = defaultComponentRegistry.createComponent('WebLogin', {
      name: 'LoginTemplate',
      parentId: boundPage.rootComponentId,
      existingNames: boundPage.components,
      props: { configuration: { ...createDefaultWebLoginConfiguration(), closeOnLogin: false } },
      events: {
        OnLogin: 'TemplateLogin',
        OnRegister: 'TemplateRegistered',
        OnRecoveryRequested: 'TemplateRecoveryRequested',
        OnPasswordReset: 'TemplatePasswordReset',
      },
    });
    const paymentComponents = ['stripe-smoke', 'asaas-smoke'].map((gatewaySlug, index) =>
      defaultComponentRegistry.createComponent('WebPayments', {
        name: `Payments${index + 1}`,
        parentId: boundPage.rootComponentId,
        existingNames: [...boundPage.components, login],
        props: { gatewaySlug, mode: index === 0 ? 'payment' : 'subscription', autoResume: false },
        events: {
          OnOperationChange: 'PaymentChanged',
          OnPaymentSucceeded: 'PaymentSucceeded',
          OnSubscriptionActivated: 'SubscriptionActivated',
          OnSubscriptionCanceled: 'SubscriptionCanceled',
          OnCheckoutOpened: 'CheckoutOpened',
          OnHistoryChange: 'HistoryChanged',
          OnRestored: 'PaymentRestored',
        },
      }),
    );
    const loginPage = {
      ...boundPage,
      components: [
        ...boundPage.components.map((node) =>
          node.id === boundPage.rootComponentId
            ? {
                ...node,
                children: [
                  ...node.children,
                  login.id,
                  ...paymentComponents.map((component) => component.id),
                ],
              }
            : node,
        ),
        login,
        ...paymentComponents,
      ],
    };
    const project = { ...original, pages: [loginPage] };
    const result = await compileProjectToMemory(project, {
      userSources: {
        'pages/index.ts': `import { RestGO, getRestGoClient, type WebPage, type WebPageLoginEventDetail, type WebPageLogoutEventDetail, type WebLogin, type WebLoginUserEvent, type WebLoginRecoveryEvent, type WebPayments, type WebPaymentsOperationEventDetail, type WebPaymentsCheckoutEventDetail, type WebPaymentsHistoryEventDetail, type WebPaymentsResumeEventDetail } from '@webrad/runtime';
import { createClient } from '@webrad/restgo-sdk';
import { indexGenerated } from './index.generated';
export class index extends indexGenerated {
  private usuarioId = '';
  public PaymentChanged(sender: WebPayments, event: CustomEvent<WebPaymentsOperationEventDetail>): void {
    if (sender !== this.Payments1 && sender !== this.Payments2) throw new Error('Payments lost its concrete scoped instance');
    if (event.detail.operation) this.element.dataset.paymentStatus = event.detail.operation.status;
  }
  public PaymentSucceeded(sender: WebPayments, event: CustomEvent<WebPaymentsCheckoutEventDetail>): void {
    if (sender !== this.Payments1 || event.detail.operation.status !== 'succeeded') throw new Error('Payment success event lost its concrete instance/state');
    this.element.dataset.paymentSucceeded = 'true';
  }
  public SubscriptionActivated(sender: WebPayments, event: CustomEvent<WebPaymentsCheckoutEventDetail>): void {
    if (sender !== this.Payments2 || event.detail.operation.status !== 'active') throw new Error('Subscription activation event mismatch');
    this.element.dataset.subscriptionActivated = 'true';
  }
  public SubscriptionCanceled(sender: WebPayments, event: CustomEvent<WebPaymentsCheckoutEventDetail>): void {
    if (sender !== this.Payments2 || !event.detail.operation.provider.cancelAtPeriodEnd) throw new Error('Subscription cancellation event mismatch');
    this.element.dataset.subscriptionCanceled = 'true';
  }
  public CheckoutOpened(sender: WebPayments, event: CustomEvent<WebPaymentsCheckoutEventDetail>): void {
    if ((sender !== this.Payments1 && sender !== this.Payments2) || !event.detail.operation.checkoutUrl) throw new Error('Checkout navigation event mismatch');
    this.element.dataset.checkoutsOpened = String(Number(this.element.dataset.checkoutsOpened ?? 0) + 1);
  }
  public HistoryChanged(sender: WebPayments, event: CustomEvent<WebPaymentsHistoryEventDetail>): void {
    if (sender !== this.Payments1 || sender.history !== event.detail.items || sender.hasMore !== event.detail.hasMore) throw new Error('History event/cache mismatch');
    this.element.dataset.historyChanges = String(Number(this.element.dataset.historyChanges ?? 0) + 1);
  }
  public PaymentRestored(sender: WebPayments, event: CustomEvent<WebPaymentsResumeEventDetail>): void {
    if (sender !== this.Payments1 || event.detail.automatic || event.detail.checkpoint.operationId !== event.detail.operation?.id) throw new Error('Explicit automatic-storage recovery event mismatch');
    this.element.dataset.paymentRestored = 'true';
  }
  private async ExercisePayments(): Promise<void> {
    const first = Payments1.Pay('9007199254740993', { interval: 1, timeout: 5000 });
    const same = this.Payments1.Pay('9007199254740993', { interval: 1, timeout: 5000 });
    if (first !== same) throw new Error('Duplicate Pay calls were not coalesced');
    const [operation, duplicate] = await Promise.all([first, same]);
    if (operation.id !== duplicate.id || operation.mode !== 'payment' || operation.checkoutState !== 'completed' || !operation.checkoutUrl || operation.status !== 'pending')
      throw new Error('One-call Pay did not preserve checkout readiness versus financial success');
    const originalKey = Payments1.attempt?.idempotencyKey;
    if (!originalKey || Number(this.element.dataset.checkoutsOpened) !== 1) throw new Error('Pay did not persist and open exactly one checkout');
    this.Payments1.Clear();
    const restored = await Payments1.Resume('9007199254740993', { watch: false, timeout: 5000 });
    if (restored?.id !== operation.id || Payments1.attempt?.idempotencyKey !== originalKey || this.element.dataset.paymentRestored !== 'true')
      throw new Error('Automatic checkpoint storage did not recover the original attempt');
    const refreshed = await Payments1.Refresh();
    if (refreshed?.id !== operation.id) throw new Error('Selected-operation refresh mismatch');
    const confirmed = await Payments1.WaitForConfirmation({ interval: 1, timeout: 5000, waitForSynchronization: true });
    if (confirmed.status !== 'succeeded' || confirmed.synchronizationPending || Payments1.status !== 'succeeded' || this.element.dataset.paymentSucceeded !== 'true')
      throw new Error('Payment confirmation/source synchronization event mismatch');
    const replay = await this.Payments1.Pay('9007199254740993', { timeout: 5000 });
    if (replay.id !== operation.id || Payments1.attempt?.idempotencyKey !== originalKey || Number(this.element.dataset.checkoutsOpened) !== 1)
      throw new Error('Settled Pay created another attempt or reopened checkout');
    const firstPage = await Payments1.LoadHistory();
    if (firstPage.length !== 1 || firstPage[0]?.id !== operation.id || firstPage[0]?.checkoutUrl !== undefined || !Payments1.hasMore || Payments1.nextCursor !== operation.id)
      throw new Error('Automatic history cache/cursor mismatch');
    const history = await Payments1.LoadMore();
    if (history.length !== 2 || history[1]?.id !== ${JSON.stringify(historicalPaymentId)} || Payments1.history !== history || Payments1.hasMore || Payments1.nextCursor !== '')
      throw new Error('LoadMore did not append the final history page');
    const lastPage = await Payments1.LoadMore();
    if (lastPage !== history || this.element.dataset.historyChanges !== '2') throw new Error('LoadMore after the last page was not a no-op');
    const subscription = await this.Payments2.Subscribe('subscription-order', { interval: 1, timeout: 5000 });
    if (subscription.mode !== 'subscription' || !subscription.checkoutUrl || Number(this.element.dataset.checkoutsOpened) !== 2) throw new Error('Subscribe did not open hosted checkout automatically');
    const active = await this.Payments2.WaitForConfirmation({ interval: 1, timeout: 5000, waitForSynchronization: true });
    if (active.status !== 'active' || !this.Payments2.canCancelSubscription || this.element.dataset.subscriptionActivated !== 'true') throw new Error('Subscription confirmation mismatch');
    const canceled = await this.Payments2.CancelSubscription();
    if (!canceled.provider.cancelAtPeriodEnd || !canceled.provider.periodEnd || this.Payments2.canCancelSubscription || this.element.dataset.subscriptionCanceled !== 'true')
      throw new Error('Selected-subscription cancellation lost the paid period or event');
    this.element.dataset.paymentsComplete = 'true';
  }
  public TemplateLogin(sender: WebLogin, event: CustomEvent<WebLoginUserEvent>): void {
    if (sender !== this.LoginTemplate || this.LoginTemplate.controls.email.value !== event.detail.user.email)
      throw new Error('Login template lost its concrete mounted instance');
    this.element.dataset.templateLogin = event.detail.user.id;
  }
  public TemplateRegistered(_sender: WebLogin, event: CustomEvent<WebLoginUserEvent>): void {
    this.element.dataset.templateRegistered = event.detail.user.id;
  }
  public TemplateRecoveryRequested(_sender: WebLogin, event: CustomEvent<WebLoginRecoveryEvent>): void {
    this.element.dataset.templateRecoveryRequested = event.detail.email;
  }
  public TemplatePasswordReset(sender: WebLogin): void {
    if (sender.hasRecoveryToken || sender.controls.password.value || sender.view !== 'login')
      throw new Error('Password reset retained credentials or the reset form');
    this.element.dataset.templatePasswordReset = 'true';
  }
  public indexUnauthenticated(_sender: WebPage): void {
    this.element.dataset.unauthenticatedCount = String(Number(this.element.dataset.unauthenticatedCount ?? 0) + 1);
  }
  public indexLogin(_sender: WebPage, event: CustomEvent<WebPageLoginEventDetail>): void {
    this.usuarioId = event.detail.user.id;
    this.element.dataset.loginUser = this.usuarioId;
    this.element.dataset.loginCount = String(Number(this.element.dataset.loginCount ?? 0) + 1);
  }
  public indexLogout(_sender: WebPage, event: CustomEvent<WebPageLogoutEventDetail>): void {
    this.element.dataset.logoutUser = event.detail.user.id;
    this.usuarioId = '';
    this.element.dataset.currentUser = this.usuarioId;
    if (this.Payments1.operation || this.Payments1.attempt || this.Payments2.operation || this.Payments2.attempt)
      throw new Error('Payments retained another session context after logout');
  }
  public constructor(element: HTMLElement) {
    super(element);
    if (new URL(location.href).searchParams.has('reset_token') || location.hash.includes('reset_token='))
      throw new Error('Recovery link was not cleaned before authored construction');
    const standalone = createClient(${JSON.stringify(baseUrl)}, { persistSession: false });
    (globalThis as unknown as { createRestGoSmokeClient: typeof createClient }).createRestGoSmokeClient = createClient;
    this.element.dataset.restgoIdentity = String(
      RestGO.auth === getRestGoClient().auth && typeof standalone.login === 'function'
    );
    const paymentsAction = document.createElement('button');
    paymentsAction.dataset.paymentsExercise = 'true';
    paymentsAction.textContent = 'Exercise payment HTTP fixture';
    paymentsAction.addEventListener('click', () => {
      void this.ExercisePayments().catch((error: unknown) => {
        this.element.dataset.paymentsError = error instanceof Error ? error.message : String(error);
      });
    });
    this.element.append(paymentsAction);
  }
}`,
      },
    });
    if (!result.success || result.previewHtml === undefined) {
      throw new Error(
        `RestGO browser smoke compilation failed: ${JSON.stringify(result.diagnostics)}`,
      );
    }
    window = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, navigationUrl) => {
      const destination = new URL(navigationUrl);
      if (destination.hostname !== 'checkout.example.test') return;
      event.preventDefault();
      const slug = destination.pathname.slice(1);
      paymentNavigations.push(navigationUrl);
      const attempt = paymentAttempts.get(slug);
      if (attempt) attempt.opened = true;
    });
    const previewUrl = await publishPreviewHtml(ownerId, result.previewHtml);
    await window.loadURL(previewUrl);
    await rendererReady(
      window,
      `document.querySelector('[data-unauthenticated-count="1"]') !== null`,
    );
    const verifyAnonymousToken = `(async () => {
      const result = await RestGO.api.from('demo').endpoint('anonymous').get();
      if (result.error || result.data?.[0]?.anonymous !== true) throw new Error('Anonymous Authorization token failed');
      return true;
    })()`;
    await window.webContents.executeJavaScript(verifyAnonymousToken, true);

    const evidence: unknown = await window.webContents.executeJavaScript(
      `(async () => {
        const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
        if (document.querySelector('[data-restgo-identity="true"]') === null) throw new Error('Native client identity failed');
        const registered = check(await RestGO.auth.signUp({ email: 'cadastro@example.test', password: 'senha-de-teste', fullName: 'Conta comum' }));
        if (registered.id !== 'registered-user' || check(await RestGO.getSession()) !== null) throw new Error('Public signup started a session');
        const session = check(await RestGO.login('cliente@example.test', 'senha-de-teste', true));
        if (session.user.email !== 'cliente@example.test') throw new Error('Sign in user mismatch');
        if (!session.refreshToken || !session.refreshExpiresAt) throw new Error('Missing refresh pair');
        const page = document.querySelector('[data-restgo-identity="true"]');
        if (page.dataset.loginUser !== session.user.id) throw new Error('OnLogin did not save the current user');
        document.querySelector('[data-payments-exercise="true"]').click();
        const paymentsDeadline = Date.now() + 5000;
        while (Date.now() < paymentsDeadline && page.dataset.paymentsComplete !== 'true' && !page.dataset.paymentsError)
          await new Promise(resolve => setTimeout(resolve, 10));
        if (page.dataset.paymentsComplete !== 'true') throw new Error(page.dataset.paymentsError || 'Compiled Payments did not complete');
        check(await RestGO.auth.signUp({ email: 'outra@example.test', password: 'senha-de-teste' }));
        const events = [];
        const subscription = RestGO.onAuthStateChange((event) => events.push(event));
        const validated = check(await RestGO.getSession());
        if (validated.user.id !== session.user.id) throw new Error('Server validation mismatch');
        const currentUser = check(await RestGO.getUser());
        if (currentUser.id !== session.user.id) throw new Error('Direct getUser mismatch');
        const file = check(await RestGO.storage.upload(new Blob(['Ol\u00E1 RestGO'], { type: 'text/plain' }), { name: 'documento.txt', isPublic: true }));
        const url = check(RestGO.storage.getPublicUrl(file.id)).publicUrl;
        if (!url.startsWith(${JSON.stringify(baseUrl)})) throw new Error('Public URL base mismatch');
        const downloaded = check(await RestGO.storage.download(file.id));
        if (await downloaded.text() !== 'Olá RestGO') throw new Error('Download content mismatch');
        const rows = check(await RestGO.api.from('demo').endpoint('list').get());
        if (rows[0].id !== 42) throw new Error('Versioned endpoint mismatch');
        const renewed = check(await RestGO.refreshSession());
        if (renewed.refreshToken === session.refreshToken || !events.includes('TOKEN_REFRESHED')) throw new Error('Rotation event mismatch');
        const consumed = await fetch(${JSON.stringify(`${baseUrl}/auth/refresh`)}, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (consumed.status !== 401) throw new Error('Refresh token was reusable');
        subscription.unsubscribe();
        check(await RestGO.storage.remove(file.id));
        check(await RestGO.logout());
        if (check(await RestGO.getSession()) !== null) throw new Error('Sign out retained a session');
        if (page.dataset.loginCount !== '1') throw new Error('Validation or refresh repeated OnLogin');
        if (page.dataset.logoutUser !== session.user.id || page.dataset.currentUser !== '') throw new Error('OnLogout did not clear page variables');
        if (page.dataset.unauthenticatedCount !== '2') throw new Error('OnUnauthenticated missed anonymous entry or sign out');
        return { nativeIdentity: true, auth: true, pageEvents: true, refresh: true, multipart: true, download: true, dynamicApi: true, signedOut: true };
      })()`,
      true,
    );
    if (
      typeof evidence !== 'object' ||
      evidence === null ||
      Reflect.get(evidence, 'signedOut') !== true
    ) {
      throw new Error(`RestGO browser smoke failed: ${JSON.stringify(evidence)}`);
    }
    const paymentRequests = requests.filter((request) => request.route.startsWith('/payment/'));
    if (
      paymentRequests.length === 0 ||
      paymentRequests.some(
        (request) => !request.authorization?.startsWith('Bearer smoke-user-jwt-'),
      ) ||
      !paymentRequests.some((request) => request.route.endsWith('/cancel')) ||
      paymentRequests.filter((request) => request.route.endsWith('/checkouts')).length !== 2 ||
      paymentNavigations.length !== 2 ||
      !paymentNavigations.includes('https://checkout.example.test/stripe-smoke') ||
      !paymentNavigations.includes('https://checkout.example.test/asaas-smoke') ||
      paymentHistoryCursors.length !== 2 ||
      paymentHistoryCursors[0] !== '' ||
      paymentHistoryCursors[1] !== paymentAttempts.get('stripe-smoke')?.id
    )
      throw new Error('Compiled Payments did not use customer-only payment routes.');
    log(
      'renderer Payments compiled runtime passed: one-call Pay and Subscribe, native checkout navigation intercepted, duplicate coalescing, HTTP 202, automatic checkpoint persistence and recovery, selected refresh, synchronized confirmation events, cached paginated history and final-page no-op, selected Asaas subscription cancellation and logout cleanup; HTTP fixture',
    );
    await window.webContents.executeJavaScript(verifyAnonymousToken, true);

    for (const call of [
      'POST /auth/users',
      'POST /auth/token',
      'GET /auth/session',
      'POST /auth/refresh',
      'POST /storage/files',
      `GET /storage/files/${fileId}/download`,
      'GET /v2/demo/list',
      `DELETE /storage/files/${fileId}`,
      'POST /auth/logout',
    ]) {
      if (!calls.includes(call)) throw new Error(`RestGO browser smoke omitted ${call}.`);
    }
    if (calls.filter((call) => call === 'GET /v2/demo/list').length !== 2 || rotation !== 2)
      throw new Error('RestGO browser smoke did not retry the expired request exactly once.');

    await window.webContents.executeJavaScript(
      `(() => {
      const host = document.querySelector('[data-webrad-name="LoginTemplate"]');
      host.querySelector('[data-login-action="register"]').click();
      const set = (name, value) => { const input = host.querySelector('input[name="' + name + '"]'); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
      set('fullName', 'Conta template'); set('email', 'cadastro@example.test');
      set('password', 'senha-de-teste'); set('passwordConfirmation', 'different');
      host.querySelector('.wr-login-submit').click();
    })()`,
      true,
    );
    await rendererReady(
      window,
      `document.querySelector('.wr-login-feedback[data-error="true"]')?.textContent === 'Passwords do not match.'`,
    );
    await window.webContents.executeJavaScript(
      `(() => {
      document.querySelector('input[name="passwordConfirmation"]').value = 'senha-de-teste';
      document.querySelector('.wr-login-submit').click();
    })()`,
      true,
    );
    await rendererReady(
      window,
      `document.querySelector('[data-template-registered="registered-user"]') !== null
      && document.querySelector('.wr-weblogin')?.dataset.loginView === 'login' && !document.querySelector('.wr-login-fields')?.disabled`,
    );
    const anonymous = await window.webContents.executeJavaScript(
      `RestGO.CurrentUser === null && document.querySelector('input[name="password"]').value === ''`,
      true,
    );
    if (anonymous !== true)
      throw new Error('Login template registration retained a password or started a session.');
    await window.webContents.executeJavaScript(
      `(() => {
      document.querySelector('input[name="email"]').value = 'cliente@example.test';
      document.querySelector('input[name="password"]').value = 'invalid-password';
      document.querySelector('.wr-login-submit').click();
    })()`,
      true,
    );
    await rendererReady(
      window,
      `document.querySelector('.wr-login-feedback[data-error="true"]')?.textContent === 'Invalid credentials' && !document.querySelector('.wr-login-fields')?.disabled`,
    );
    await window.webContents.executeJavaScript(
      `(() => {
      document.querySelector('input[name="password"]').value = 'senha-de-teste';
      document.querySelector('.wr-login-submit').click();
    })()`,
      true,
    );
    await rendererReady(
      window,
      `document.querySelector('[data-template-login]')?.dataset.templateLogin === RestGO.CurrentUser?.id && RestGO.CurrentUser !== null`,
    );
    const cleared = await window.webContents.executeJavaScript(
      `document.querySelector('input[name="password"]').value === ''`,
      true,
    );
    if (cleared !== true)
      throw new Error('Login template retained a password after authentication.');
    await window.webContents.executeJavaScript(
      `RestGO.logout().then(result => { if (result.error) throw new Error(result.error.message); })`,
      true,
    );
    log(
      'renderer Login authentication passed: compiled typed instance, confirmation mismatch, anonymous signup, invalid credentials, form login, shared session and cleared passwords; HTTP fixture',
    );

    otherWindow = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    await otherWindow.loadURL(previewUrl);
    const setup = `(async () => {
      if (!navigator.locks) throw new Error('Preview has no Web Locks');
      window.sharedRefreshClient = window.createRestGoSmokeClient(${JSON.stringify(baseUrl)}, { storageKey: 'webrad-smoke-refresh', apiToken: 'rgo.browser-smoke' });
      await window.sharedRefreshClient.auth.ready;
    })()`;
    await window.webContents.executeJavaScript(
      `localStorage.removeItem('webrad-smoke-refresh')`,
      true,
    );
    await window.webContents.executeJavaScript(setup, true);
    await window.webContents.executeJavaScript(
      `(async () => {
      const result = await window.sharedRefreshClient.auth.signInWithPassword({ email: 'cliente@example.test', password: 'senha-de-teste' });
      if (result.error) throw result.error;
    })()`,
      true,
    );
    await otherWindow.webContents.executeJavaScript(setup, true);
    const before = rotation;
    const renew = `(async () => {
      const result = await window.sharedRefreshClient.auth.refreshSession();
      if (result.error) throw result.error;
      return result.data.refreshToken;
    })()`;
    const pairs = await Promise.all([
      window.webContents.executeJavaScript(renew, true),
      otherWindow.webContents.executeJavaScript(renew, true),
    ]);
    if (rotation !== before + 1 || pairs[0] !== pairs[1])
      throw new Error('Concurrent browser windows consumed the refresh token twice.');
    await window.webContents.executeJavaScript(
      `(async () => {
      const result = await window.sharedRefreshClient.auth.signOut();
      if (result.error) throw result.error;
      window.sharedRefreshClient.dispose();
    })()`,
      true,
    );
    const remoteSession: unknown = await otherWindow.webContents.executeJavaScript(
      `(async () => {
      const result = await window.sharedRefreshClient.auth.getSession();
      window.sharedRefreshClient.dispose();
      return result.data;
    })()`,
      true,
    );
    if (remoteSession !== null)
      throw new Error('Logout was not propagated to the other browser window.');

    harnessPreviewUrl = previewUrl;
    await new Promise<void>((resolve, reject) => {
      harness.once('error', reject);
      harness.listen(0, '127.0.0.1', resolve);
    });
    const harnessAddress = harness.address();
    if (harnessAddress === null || typeof harnessAddress === 'string') {
      throw new Error('RestGO iframe smoke harness has no port.');
    }
    const harnessUrl = `http://127.0.0.1:${String(harnessAddress.port)}`;
    const previewOrigin = new URL(previewUrl).origin;
    if (!isHttpOrigin(previewOrigin) || previewOrigin === harnessUrl) {
      throw new Error('RestGO Preview must have an HTTP Origin separate from its parent.');
    }
    iframeWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    iframeWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const iframeRequestOffset = requests.length;
    const iframePreflightOffset = preflights.length;
    await iframeWindow.loadURL(harnessUrl);
    const parentHasBridge: unknown = await iframeWindow.webContents.executeJavaScript(
      `typeof window.webrad?.project?.open === 'function'`,
      true,
    );
    if (parentHasBridge !== true) {
      throw new Error('RestGO iframe smoke parent did not load the real IDE preload.');
    }
    const frame = await restGoPreviewFrame(iframeWindow, previewUrl);
    const iframeEvidence: unknown = await frame.executeJavaScript(
      `(async () => {
        const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
        if (location.origin !== ${JSON.stringify(previewOrigin)} || parent === window) throw new Error('Preview iframe lost its HTTP Origin');
        if (document.referrer !== '') throw new Error('Preview iframe received the renderer URL');
        let parentDocumentBlocked = false;
        let parentBridgeBlocked = false;
        try { void parent.document; } catch (error) { parentDocumentBlocked = error.name === 'SecurityError'; }
        try { void parent.webrad; } catch (error) { parentBridgeBlocked = error.name === 'SecurityError'; }
        if (!parentDocumentBlocked || !parentBridgeBlocked || typeof window.webrad !== 'undefined' || typeof require !== 'undefined' || typeof process !== 'undefined') throw new Error('Preview iframe can access parent or preload APIs');
        localStorage.setItem('webrad-iframe-cors-smoke', 'ok');
        if (localStorage.getItem('webrad-iframe-cors-smoke') !== 'ok') throw new Error('Preview iframe browser storage is unavailable');
        localStorage.removeItem('webrad-iframe-cors-smoke');
        const session = check(await RestGO.login('cliente@example.test', 'senha-de-teste', true));
        if (session.user.email !== 'cliente@example.test') throw new Error('Iframe JSON login failed');
        const validated = check(await RestGO.getSession());
        if (validated.user.id !== session.user.id) throw new Error('Iframe Bearer session failed');
        const renewed = check(await RestGO.refreshSession());
        if (renewed.refreshToken === session.refreshToken) throw new Error('Iframe refresh rotation failed');
        const uploaded = check(await RestGO.storage.upload(new Blob(['Ol\u00E1 RestGO'], { type: 'text/plain' }), { name: 'documento.txt', isPublic: true }));
        const downloaded = check(await RestGO.storage.download(uploaded.id));
        if (await downloaded.text() !== 'Ol\u00E1 RestGO') throw new Error('Iframe storage download failed');
        check(await RestGO.storage.remove(uploaded.id));
        check(await RestGO.logout());
        return { origin: location.origin, jsonLogin: true, bearer: true, refresh: true, multipart: true, download: true, browserStorage: true, parentBlocked: true, preloadBlocked: true, webSecurity: true };
      })()`,
      true,
    );
    if (
      typeof iframeEvidence !== 'object' ||
      iframeEvidence === null ||
      Reflect.get(iframeEvidence, 'preloadBlocked') !== true
    ) {
      throw new Error(`RestGO iframe CORS smoke failed: ${JSON.stringify(iframeEvidence)}`);
    }
    const iframeRequests = requests.slice(iframeRequestOffset);
    const iframePreflights = preflights.slice(iframePreflightOffset);
    if (
      iframeRequests.length === 0 ||
      iframeRequests.some((request) => request.origin !== previewOrigin) ||
      !iframePreflights.some(
        (request) =>
          request.origin === previewOrigin &&
          request.headers.toLowerCase().includes('content-type'),
      ) ||
      !iframePreflights.some(
        (request) =>
          request.origin === previewOrigin &&
          request.headers.toLowerCase().includes('authorization'),
      )
    ) {
      throw new Error(
        'RestGO iframe did not send real HTTP Origin and JSON/Bearer CORS preflights.',
      );
    }
    const iframeLogin = iframeRequests.find(
      (request) => request.method === 'POST' && request.route === '/auth/token',
    );
    const iframeSession = iframeRequests.find(
      (request) => request.method === 'GET' && request.route === '/auth/session',
    );
    const iframeRefresh = iframeRequests.find(
      (request) => request.method === 'POST' && request.route === '/auth/refresh',
    );
    if (
      !iframeLogin?.contentType?.startsWith('application/json') ||
      iframeLogin.body?.email !== user.email ||
      iframeLogin.body.password !== 'senha-de-teste' ||
      !iframeSession?.authorization?.startsWith('Bearer smoke-user-jwt-') ||
      typeof iframeRefresh?.body?.refreshToken !== 'string'
    ) {
      throw new Error(
        'RestGO iframe Origin, JSON login body, Bearer GET or refresh body mismatch.',
      );
    }
    log(`renderer RestGO iframe CORS passed: ${JSON.stringify(iframeEvidence)}`);
    log(
      `renderer RestGO browser passed: real fetch, automatic/manual rotation, single retry, Web Locks across two browser windows, shared logout; ${JSON.stringify(evidence)}`,
    );

    await window.webContents.executeJavaScript(
      `(() => {
      const url = new URL(location.href);
      url.searchParams.set('recovery_source', 'kept');
      url.hash = '/index?recovery_context=kept';
      history.replaceState(null, '', url.href);
      document.querySelector('[data-login-action="recovery"]').click();
      document.querySelector('input[name="email"]').value = 'cliente@example.test';
      document.querySelector('.wr-login-submit').click();
    })()`,
      true,
    );
    await rendererReady(
      window,
      `document.querySelector('[data-template-recovery-requested="cliente@example.test"]') !== null
      && !document.querySelector('.wr-login-fields').disabled`,
    );
    const returnUrl = new URL(recoveryReturnUrl);
    if (
      returnUrl.hash ||
      returnUrl.searchParams.get('recovery_source') !== 'kept' ||
      returnUrl.searchParams.get('webrad_recovery_route') !== '/index?recovery_context=kept' ||
      returnUrl.searchParams.get('webrad_recovery_owner') !== login.id
    )
      throw new Error(
        'Login recovery did not preserve the application route and target placement.',
      );
    const recoveryLink = new URL(returnUrl);
    recoveryLink.hash = new URLSearchParams({ reset_token: recoveryToken }).toString();
    const expiredLink = new URL(returnUrl);
    expiredLink.hash = 'reset_token=expired-smoke-link';
    const fillNewPassword = async (password: string, confirmation = password): Promise<void> => {
      if (!window) throw new Error('Login recovery browser closed.');
      await window.webContents.executeJavaScript(
        `(() => {
        document.querySelector('input[name="password"]').value = ${JSON.stringify(password)};
        document.querySelector('input[name="passwordConfirmation"]').value = ${JSON.stringify(confirmation)};
        document.querySelector('.wr-login-submit').click();
      })()`,
        true,
      );
    };
    await window.loadURL(expiredLink.href);
    await rendererReady(
      window,
      `document.querySelector('.wr-weblogin')?.dataset.loginView === 'reset'`,
    );
    await fillNewPassword('nova-senha-de-teste');
    await rendererReady(
      window,
      `document.querySelector('.wr-login-feedback[data-error="true"]')?.textContent === 'Invalid or expired recovery link'
      && !document.querySelector('.wr-login-fields').disabled`,
    );
    await window.loadURL(recoveryLink.href);
    await rendererReady(
      window,
      `document.querySelector('.wr-weblogin')?.dataset.loginView === 'reset'`,
    );
    const protectedLink = await window.webContents.executeJavaScript(
      `(() => {
      const url = new URL(location.href);
      return !url.searchParams.has('reset_token') && !url.searchParams.has('webrad_recovery_owner')
        && !url.searchParams.has('webrad_recovery_route') && url.hash === '#/index?recovery_context=kept'
        && !document.documentElement.outerHTML.includes(${JSON.stringify(recoveryToken)})
        && document.querySelector('input[name="email"]').disabled
        && document.querySelector('input[name="password"]').autocomplete === 'new-password'
        && document.querySelector('input[name="passwordConfirmation"]').required;
    })()`,
      true,
    );
    if (protectedLink !== true)
      throw new Error(
        'Login recovery exposed the token, changed route context, or omitted required fields.',
      );
    const confirmationsBeforeMismatch = calls.filter(
      (call) => call === 'POST /auth/password-reset/confirm',
    ).length;
    await fillNewPassword('nova-senha-de-teste', 'different-password');
    await rendererReady(
      window,
      `document.querySelector('.wr-login-feedback[data-error="true"]')?.textContent === 'Passwords do not match.'`,
    );
    if (
      calls.filter((call) => call === 'POST /auth/password-reset/confirm').length !==
      confirmationsBeforeMismatch
    )
      throw new Error('Login recovery submitted mismatched passwords.');
    await fillNewPassword('nova-senha-de-teste');
    await rendererReady(
      window,
      `document.querySelector('[data-template-password-reset="true"]') !== null
      && document.querySelector('.wr-weblogin')?.dataset.loginView === 'login'
      && !document.querySelector('.wr-login-fields').disabled`,
    );
    const anonymousReset = await window.webContents.executeJavaScript(
      `RestGO.CurrentUser === null
      && document.querySelector('input[name="password"]').value === ''`,
      true,
    );
    if (anonymousReset !== true)
      throw new Error('Password recovery started a session or retained a password.');
    await window.webContents.executeJavaScript(
      `(() => {
      document.querySelector('input[name="email"]').value = 'cliente@example.test';
      document.querySelector('input[name="password"]').value = 'nova-senha-de-teste';
      document.querySelector('.wr-login-submit').click();
    })()`,
      true,
    );
    await rendererReady(
      window,
      `document.querySelector('[data-template-login]')?.dataset.templateLogin === RestGO.CurrentUser?.id
      && RestGO.CurrentUser !== null`,
    );
    await window.webContents.executeJavaScript(
      `RestGO.logout().then(result => { if (result.error) throw new Error(result.error.message); })`,
      true,
    );
    await window.loadURL(recoveryLink.href);
    await rendererReady(
      window,
      `document.querySelector('.wr-weblogin')?.dataset.loginView === 'reset'`,
    );
    await fillNewPassword('nova-senha-de-teste');
    await rendererReady(
      window,
      `document.querySelector('.wr-login-feedback[data-error="true"]')?.textContent === 'Invalid or expired recovery link'`,
    );
    log(
      'renderer Login recovery passed: anonymous email request, route/placement preservation, pre-construction URL cleanup, expired and reused links, password confirmation, typed reset event, no automatic session and new-password login; HTTP fixture',
    );
  } finally {
    if (window !== null && !window.isDestroyed()) window.destroy();
    if (otherWindow !== null && !otherWindow.isDestroyed()) otherWindow.destroy();
    if (iframeWindow !== null && !iframeWindow.isDestroyed()) iframeWindow.destroy();
    revokePreview(ownerId);
    if (harness.listening) {
      harness.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        harness.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}
