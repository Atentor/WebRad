import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import path from 'node:path';

import { componentRegistry } from '@webrad/component-registry';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  createDefaultApiClientConfiguration,
  createProject,
  DEFAULT_REST_GO_PROJECT_SETTINGS,
} from '@webrad/project-model';
import { BrowserWindow } from 'electron';

import { publishPreviewHtml, revokePreview } from './preview-server';

interface ApiClientDesignerSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
  readonly screenshotPath?: string;
}

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result: unknown = await window.webContents.executeJavaScript(expression, true);
    if (result === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API Client smoke timed out: ${expression}`);
}

async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(
    window,
    `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof HTMLElement) || control.disabled) return false;
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
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return false;
    const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype
      : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`,
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
      .find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(text)} || candidate.textContent.trim() === ${JSON.stringify(text)});
    if (!(control instanceof HTMLElement) || control.disabled) return false;
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
    if (!(dialog instanceof HTMLElement) || !(footer instanceof HTMLElement) || !(operations instanceof HTMLElement) || !(editor instanceof HTMLElement)) return false;
    const bounds = dialog.getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const operationsBounds = operations.getBoundingClientRect();
    const editorBounds = editor.getBoundingClientRect();
    const arranged = ${String(stacked)} ? operationsBounds.bottom <= editorBounds.top + 1 : operationsBounds.right <= editorBounds.left + 1;
    return arranged && dialog.scrollWidth <= dialog.clientWidth + 1 && editor.scrollWidth <= editor.clientWidth + 1 && bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && footerBounds.bottom <= innerHeight + 1;
  })()`,
  );
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
    window.setMinimumSize(0, 0);
    for (const [width, height, suffix] of [
      [1080, 760, 'compact'],
      [740, 700, 'narrow'],
    ] as const) {
      window.setContentSize(width, height);
      await ready(window, `innerWidth === ${String(width)} && innerHeight === ${String(height)}`);
      await verifyDialogViewport(window, width <= 760);
      await capture(window, `${screenshotRoot}-custom-${suffix}.png`);
    }
  } finally {
    window.setContentSize(originalWidth, originalHeight);
    window.setMinimumSize(minimumWidth, minimumHeight);
    await ready(
      window,
      `innerWidth === ${String(originalWidth)} && innerHeight === ${String(originalHeight)}`,
    );
  }
}

/** Exercises actual Chromium controls, HTTP tests, and Project Model persistence. */
export async function runApiClientDesignerSmoke(
  window: BrowserWindow,
  { projectPath, log, screenshotPath }: ApiClientDesignerSmokeOptions,
): Promise<void> {
  const calls: Array<{ method: string; path: string; authorization: string | undefined }> = [];
  const server = createServer((request, response) => {
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
    response.end(JSON.stringify({ data: [{ id: 42, name: 'Cliente de teste' }] }));
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
      `Array.from(document.querySelectorAll('.wr-api-client-dialog button')).some((button) => button.textContent.trim() === 'Send test request' && button.disabled)`,
    );
    await setControl(window, '[aria-label="Method"]', 'GET');
    for (const tab of ['Query parameters', 'Headers', 'Body', 'Options']) {
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
    await clickText(window, 'Remove operation');
    await ready(
      window,
      `document.querySelector('.wr-api-no-operations') !== null && document.querySelector('.wr-api-remove-operation').disabled === true && document.querySelector('.wr-api-operation-list').children.length === 0`,
    );
    await capture(window, `${screenshotRoot}-empty.png`);
    await clickText(window, 'Save API Client');
    await ready(window, `document.querySelector('.wr-api-client-dialog') === null`);
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    const emptyPagePath = path.join(path.dirname(projectPath), 'pages', 'PageMain.wrpage');
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
    await ready(
      window,
      `(() => {
      const label = Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label')).find((item) => item.textContent.includes('Enable native RestGO integration'));
      const control = label?.querySelector('input');
      if (!(control instanceof HTMLInputElement)) return false;
      if (!control.checked) control.click();
      return true;
    })()`,
    );
    await ready(
      window,
      `(() => {
      const label = Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label')).find((item) => item.querySelector('span')?.textContent.trim() === 'RestGO instance URL');
      const control = label?.querySelector('input');
      if (!(control instanceof HTMLInputElement)) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(control, ${JSON.stringify(baseUrl)});
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
    );
    await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
    await ready(
      window,
      `document.querySelector('.wr-restgo-runtime-settings button[type="submit"]')?.disabled === true`,
    );
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
    const pagePath = path.join(path.dirname(projectPath), 'pages', 'PageMain.wrpage');
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
        if (source.includes('designer-smoke-jwt') || source.includes('Cliente de teste')) {
          throw new Error('API Client persisted test credentials or sampled response data.');
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!persisted) throw new Error('API Client RestGO binding did not persist.');
    log(
      `renderer API Client designer passed: tabs, all methods, light/dark theme, 1080/740 viewport, custom HTTP test, delete final endpoint, save/reopen empty list, recreate endpoint, fixed RestGO URL, Bearer test, safe persistence; screenshots ${screenshotRoot}-custom.png, ${screenshotRoot}-custom-light.png, ${screenshotRoot}-custom-compact.png, ${screenshotRoot}-custom-narrow.png, ${screenshotRoot}-empty.png and ${screenshotRoot}-restgo.png`,
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
    const project = {
      ...original,
      pages: [
        {
          ...page,
          components: [
            ...page.components.map((candidate) =>
              candidate.id === root.id
                ? { ...root, children: [...root.children, component.id] }
                : candidate,
            ),
            component,
          ],
        },
      ],
    };
    const result = await compileProjectToMemory(project, {
      userSources: {
        'pages/PageMain.ts': `import type { WebApiClient } from '@webrad/runtime';
import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  public constructor(element: HTMLElement) {
    super(element);
    (globalThis as unknown as { apiSmoke: WebApiClient }).apiSmoke = this.ApiSmoke;
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
    const endpointCalls = calls.filter((call) => call.path.startsWith('/backend/v2/demo/'));
    if (
      endpointCalls.length !== methods.length + 2 ||
      endpointCalls.at(-1)?.authorization !== 'Bearer api-client-browser-jwt-1' ||
      rotation !== 1
    )
      throw new Error(`API Client browser request mismatch: ${JSON.stringify(calls)}`);
    log(
      `renderer API Client browser passed: ${JSON.stringify(evidence)}; ${String(endpointCalls.length)} real authenticated HTTP requests`,
    );
  } finally {
    browser?.destroy();
    revokePreview(ownerId);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}
