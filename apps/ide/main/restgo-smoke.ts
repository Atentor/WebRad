import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import { compileProjectToMemory } from '@webrad/compiler';
import { createProject, DEFAULT_REST_GO_PROJECT_SETTINGS } from '@webrad/project-model';
import { BrowserWindow } from 'electron';

import { publishPreviewHtml, revokePreview } from './preview-protocol';

interface RestGoSettingsSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
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
      const label = Array.from(document.querySelectorAll('.wr-project-settings-dialog label'))
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
  await click(window, 'button[aria-label="Project Settings"]');
  await click(window, '#project-settings-tab-authentication');
}

async function saveProject(window: BrowserWindow, projectPath: string): Promise<void> {
  await click(window, '.wr-project-settings-actions button.primary');
  await rendererReady(window, 'document.querySelector(".wr-project-settings-dialog") === null');
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
        Reflect.get(restGo, 'apiVersion') === 2 &&
        Reflect.get(restGo, 'defaultDatabase') === 'clientes' &&
        Reflect.get(restGo, 'sessionStorage') === 'memory'
      )
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('RestGO settings were not persisted to the project file.');
}

/** Exercises real renderer controls and disk persistence on the isolated smoke fixture. */
export async function runRestGoSettingsSmoke(
  window: BrowserWindow,
  { projectPath, log }: RestGoSettingsSmokeOptions,
): Promise<void> {
  await openSettings(window);
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-project-settings-dialog label'))
      .find((label) => label.textContent?.includes('Enable native RestGO integration'))
      ?.querySelector('input')?.click()`,
    true,
  );
  await setField(window, 'RestGO instance URL', 'https://restgo.example.test/backend');
  await setField(window, 'Dynamic API version', '2');
  await setField(window, 'Default database slug', 'clientes');
  await setField(window, 'Session storage', 'memory');
  await click(window, '#project-settings-tab-integrations');
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-project-settings-dialog input'))
      .some((input) => input.value === 'https://restgo.example.test/backend')`,
  );
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  const screenshot = await window.webContents.capturePage();
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-restgo-settings.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.writeFile(screenshotPath, screenshot.toPNG());
  await saveProject(window, projectPath);
  const manifest = JSON.parse(await fs.readFile(projectPath, 'utf8')) as {
    settings?: { restGo?: Record<string, unknown> };
  };
  const configuration = manifest.settings?.restGo;
  if (
    configuration?.enabled !== true ||
    configuration.baseUrl !== 'https://restgo.example.test/backend' ||
    configuration.apiVersion !== 2 ||
    configuration.defaultDatabase !== 'clientes' ||
    configuration.sessionStorage !== 'memory'
  )
    throw new Error(`RestGO settings save mismatch: ${JSON.stringify(configuration)}`);

  await openSettings(window);
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-project-settings-dialog input'))
      .some((input) => input.value === 'https://restgo.example.test/backend')`,
  );
  await setField(window, 'RestGO instance URL', 'https://discarded.example.test');
  await click(window, 'button[aria-label="Close project settings"]');
  await openSettings(window);
  await rendererReady(
    window,
    `Array.from(document.querySelectorAll('.wr-project-settings-dialog input'))
      .some((input) => input.value === 'https://restgo.example.test/backend')`,
  );
  await window.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('.wr-project-settings-dialog label'))
      .find((label) => label.textContent?.includes('Enable native RestGO integration'))
      ?.querySelector('input')?.click()`,
    true,
  );
  await click(window, '.wr-project-settings-actions button.primary');
  await rendererReady(window, 'document.querySelector(".wr-project-settings-dialog") === null');
  log(
    `renderer RestGO settings passed: save, disk persistence, reopen, cancel; screenshot ${screenshotPath}`,
  );
}

/** Checks generated browser output against a local fixture of the documented HTTP contracts. */
export async function runRestGoBrowserSmoke(log: (message: string) => void): Promise<void> {
  const calls: string[] = [];
  let revoked = false;
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'cliente@example.test',
    fullName: 'Cliente',
    avatarUrl: null,
    active: true,
    emailConfirmed: true,
  };
  const fileId = '00000000-0000-4000-8000-000000000002';
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
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Range, X-RestGo-Pagination',
    );
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    calls.push(`${request.method ?? ''} ${route}`);
    response.setHeader('Content-Type', 'application/json');
    if (route === '/auth/token' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      if (body.email !== user.email || body.password !== 'senha-de-teste') {
        response.writeHead(401).end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
      }
      response.end(
        JSON.stringify({
          token: 'smoke-user-jwt',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          user,
        }),
      );
      return;
    }
    if (request.headers.authorization !== 'Bearer smoke-user-jwt' || revoked) {
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
  try {
    const project = createProject('RestGoSmoke', {
      settings: {
        restGo: {
          ...DEFAULT_REST_GO_PROJECT_SETTINGS,
          enabled: true,
          baseUrl,
          apiVersion: 2,
          persistSession: false,
        },
      },
    });
    const result = await compileProjectToMemory(project, {
      userSources: {
        'pages/PageMain.ts': `import { RestGO, getRestGoClient } from '@webrad/runtime';
import { createClient } from '@webrad/restgo-sdk';
import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  public constructor(element: HTMLElement) {
    super(element);
    const standalone = createClient(${JSON.stringify(baseUrl)}, { persistSession: false });
    this.element.dataset.restgoIdentity = String(
      RestGO.auth === getRestGoClient().auth && typeof standalone.auth.signInWithPassword === 'function'
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
    await window.loadURL(publishPreviewHtml(ownerId, result.previewHtml));
    const evidence: unknown = await window.webContents.executeJavaScript(
      `(async () => {
        const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
        if (document.querySelector('[data-restgo-identity="true"]') === null) throw new Error('Native client identity failed');
        const session = check(await RestGO.auth.signInWithPassword({ email: 'cliente@example.test', password: 'senha-de-teste' }));
        if (session.user.email !== 'cliente@example.test') throw new Error('Sign in user mismatch');
        const validated = check(await RestGO.auth.getSession());
        if (validated.user.id !== session.user.id) throw new Error('Server validation mismatch');
        const file = check(await RestGO.storage.upload(new Blob(['Olá RestGO'], { type: 'text/plain' }), { name: 'documento.txt', isPublic: true }));
        const url = check(RestGO.storage.getPublicUrl(file.id)).publicUrl;
        if (!url.startsWith(${JSON.stringify(baseUrl)})) throw new Error('Public URL base mismatch');
        const downloaded = check(await RestGO.storage.download(file.id));
        if (await downloaded.text() !== 'Olá RestGO') throw new Error('Download content mismatch');
        const rows = check(await RestGO.api.from('demo').endpoint('list').get());
        if (rows[0].id !== 42) throw new Error('Versioned endpoint mismatch');
        check(await RestGO.storage.remove(file.id));
        check(await RestGO.auth.signOut());
        if (check(await RestGO.auth.getSession()) !== null) throw new Error('Sign out retained a session');
        return { nativeIdentity: true, auth: true, multipart: true, download: true, dynamicApi: true, signedOut: true };
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
    for (const call of [
      'POST /auth/token',
      'GET /auth/session',
      'POST /storage/files',
      `GET /storage/files/${fileId}/download`,
      'GET /v2/demo/list',
      `DELETE /storage/files/${fileId}`,
      'POST /auth/logout',
    ]) {
      if (!calls.includes(call)) throw new Error(`RestGO browser smoke omitted ${call}.`);
    }
    log(
      `renderer RestGO browser passed: real fetch against local HTTP contract fixture; ${JSON.stringify(evidence)}`,
    );
  } finally {
    if (window !== null && !window.isDestroyed()) window.destroy();
    revokePreview(ownerId);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}
