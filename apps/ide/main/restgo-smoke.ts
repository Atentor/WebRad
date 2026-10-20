import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import { compileProjectToMemory } from '@webrad/compiler';
import {
  bindComponentEvent,
  createProject,
  DEFAULT_REST_GO_PROJECT_SETTINGS,
} from '@webrad/project-model';
import { BrowserWindow, type WebFrameMain } from 'electron';

import { publishPreviewHtml, revokePreview } from './preview-server';

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
      if (!(button instanceof HTMLElement) || button.disabled) return false;
      button.click();
      return true;
    })()`,
  );
}

async function setField(window: BrowserWindow, label: string, value: string): Promise<void> {
  const updated: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const label = Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label'))
        .find((item) => item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(label)});
      const control = label?.querySelector('input, select');
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false;
      const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    true,
  );
  if (updated !== true) throw new Error(`RestGO settings smoke could not edit ${label}.`);
}

async function openSettings(window: BrowserWindow): Promise<void> {
  await click(window, 'button[aria-label="RestGo integration"]');
  await click(window, '.wr-restgo-sidebar button:first-child');
}

async function saveProject(window: BrowserWindow, projectPath: string): Promise<void> {
  await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
  await rendererReady(
    window,
    'document.querySelector(\'.wr-restgo-runtime-settings button[type="submit"]\')?.disabled === true',
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
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label')).find(label => label.textContent?.includes('Enable native RestGO integration'))?.querySelector('input')?.click()`,
    true,
  );
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
  const screenshot = await window.webContents.capturePage();
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-restgo-settings.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  await saveProject(window, projectPath);
  await click(window, 'button[aria-label="Close RestGo"]');
  await openSettings(window);
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-restgo-runtime-settings input')).some(input => input.type === 'password' && input.value === 'rgo.settings-smoke')`,
  );
  await setField(window, 'RestGO instance URL', 'https://draft.example.test');
  await setField(window, 'Application API token', 'rgo.unsaved-token');
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
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-restgo-runtime-settings label')).find(label => label.textContent?.includes('Enable native RestGO integration'))?.querySelector('input')?.click()`,
    true,
  );
  await click(window, '.wr-restgo-runtime-settings button[type="submit"]');
  await rendererReady(
    window,
    `document.querySelector('.wr-restgo-runtime-settings button[type="submit"]')?.disabled === true`,
  );
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
      await window.webContents.insertText('return;');
      await rendererReady(
        window,
        `document.querySelector('.monaco-editor')?.textContent?.includes('return;') === true`,
      );
    }
  }
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  const pagePath = path.join(path.dirname(projectPath), 'pages', 'PageMain.wrpage');
  const sourcePath = path.join(path.dirname(projectPath), 'pages', 'PageMain.ts');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const model = JSON.parse(await fs.readFile(pagePath, 'utf8')) as {
      rootComponentId: string;
      components: Array<{ id: string; events: Record<string, string> }>;
    };
    const root = model.components.find((component) => component.id === model.rootComponentId);
    const source = await fs.readFile(sourcePath, 'utf8');
    if (
      root?.events.OnLogin === 'PageMainLogin' &&
      root.events.OnLogout === 'PageMainLogout' &&
      root.events.OnUnauthenticated === 'PageMainUnauthenticated' &&
      source.includes('CustomEvent<WebPageLoginEventDetail>') &&
      source.includes('CustomEvent<WebPageLogoutEventDetail>') &&
      source.includes(
        'async PageMainUnauthenticated(sender: WebPage, event: Event): Promise<void>',
      ) &&
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
    if (route === '/auth/token' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      capturedRequest.body = body;
      if (
        body.email !== user.email ||
        body.password !== 'senha-de-teste' ||
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
        bindComponentEvent(page, page.rootComponentId, 'OnLogin', 'PageMainLogin'),
        page.rootComponentId,
        'OnUnauthenticated',
        'PageMainUnauthenticated',
      ),
      page.rootComponentId,
      'OnLogout',
      'PageMainLogout',
    );
    const project = { ...original, pages: [boundPage] };
    const result = await compileProjectToMemory(project, {
      userSources: {
        'pages/PageMain.ts': `import { RestGO, getRestGoClient, type WebPage, type WebPageLoginEventDetail, type WebPageLogoutEventDetail } from '@webrad/runtime';
import { createClient } from '@webrad/restgo-sdk';
import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  private usuarioId = '';
  public PageMainUnauthenticated(_sender: WebPage): void {
    this.element.dataset.unauthenticatedCount = String(Number(this.element.dataset.unauthenticatedCount ?? 0) + 1);
  }
  public PageMainLogin(_sender: WebPage, event: CustomEvent<WebPageLoginEventDetail>): void {
    this.usuarioId = event.detail.user.id;
    this.element.dataset.loginUser = this.usuarioId;
    this.element.dataset.loginCount = String(Number(this.element.dataset.loginCount ?? 0) + 1);
  }
  public PageMainLogout(_sender: WebPage, event: CustomEvent<WebPageLogoutEventDetail>): void {
    this.element.dataset.logoutUser = event.detail.user.id;
    this.usuarioId = '';
    this.element.dataset.currentUser = this.usuarioId;
  }
  public constructor(element: HTMLElement) {
    super(element);
    const standalone = createClient(${JSON.stringify(baseUrl)}, { persistSession: false });
    (globalThis as unknown as { createRestGoSmokeClient: typeof createClient }).createRestGoSmokeClient = createClient;
    this.element.dataset.restgoIdentity = String(
      RestGO.auth === getRestGoClient().auth && typeof standalone.login === 'function'
    );
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
        preload: path.join(__dirname, 'preload.js'),
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
