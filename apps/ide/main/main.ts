import { appendFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, nativeImage, net, session, type WebFrameMain } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { compileProject } from '@webrad/compiler';
import { resolveCompilerEnvironment } from './compiler-environment';
import { presentMainWindow } from './main-window-presentation';
import { installApplicationMenu } from './menu';
import { publishPreviewHtml, registerPreviewProtocol, revokePreview } from './preview-protocol';
import { loadProjectFiles } from './project-files';
import { installDirtyGuard, registerIpcHandlers } from './project-ipc';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let mainWindowLifecycleStarted = false;
const smokeMode = process.argv.includes('--webrad-smoke');
const smokeAutoExit = process.argv.includes('--webrad-smoke-auto-exit');
const smokeProjectArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-project='),
);
const smokeProjectPath = smokeProjectArgument?.slice('--webrad-smoke-project='.length);

function applicationWindowIconPath(): string {
  const fileName = process.platform === 'win32' ? 'Icon.ico' : 'Icon.png';
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.resolve(__dirname, '..', '..', fileName);
}

function verifyApplicationIconResource(): void {
  if (!smokeMode) return;
  const icon = nativeImage.createFromPath(applicationWindowIconPath());
  if (icon.isEmpty()) throw new Error('Packaged application icon could not be loaded.');
  const size = icon.getSize();
  smokeLog(`application icon resource passed: ${String(size.width)}x${String(size.height)}`);
}

function smokeLog(message: string, error?: unknown): void {
  if (!smokeMode) return;
  const detail = error instanceof Error ? `\n${error.stack ?? error.message}` : '';
  try {
    appendFileSync(
      path.join(path.dirname(process.execPath), 'webrad-smoke.log'),
      `${new Date().toISOString()} ${message}${detail}\n`,
      'utf8',
    );
  } catch {
    // Smoke logging must never affect normal startup.
  }
}

function installPermissionPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setDevicePermissionHandler(() => false);
}

async function runCompilerSmoke(): Promise<string | undefined> {
  if (!smokeMode || smokeProjectPath === undefined) return undefined;
  const session = await loadProjectFiles(smokeProjectPath);
  const outputDirectory = path.join(
    app.getPath('temp'),
    `webrad-compiler-smoke-${String(process.pid)}`,
  );
  try {
    const result = await compileProject(session.project, {
      outputDirectory,
      userSources: session.userSources,
    });
    if (!result.success || result.previewHtml === undefined) {
      throw new Error(`Compiler smoke failed: ${JSON.stringify(result.diagnostics)}`);
    }
    smokeLog(`compiler passed: ${Object.keys(result.files).sort().join(', ')}`);
    return result.previewHtml;
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}

async function runPreviewProtocolSmoke(previewHtml: string | undefined): Promise<void> {
  if (previewHtml === undefined) return;
  const smokeOwnerId = -1;
  const previewUrl = publishPreviewHtml(smokeOwnerId, previewHtml);
  let previewWindow: BrowserWindow | null = null;
  try {
    const previewResponse = await net.fetch(previewUrl);
    const responseHtml = await previewResponse.text();
    const contentSecurityPolicy = previewResponse.headers.get('content-security-policy') ?? '';
    if (
      !previewResponse.ok ||
      responseHtml !== previewHtml ||
      !contentSecurityPolicy.includes("script-src 'unsafe-inline'")
    ) {
      throw new Error(
        `Preview protocol smoke failed: status=${String(previewResponse.status)} csp=${JSON.stringify(contentSecurityPolicy)}`,
      );
    }
    smokeLog('preview protocol passed');

    previewWindow = new BrowserWindow({
      icon: applicationWindowIconPath(),
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await previewWindow.loadURL(previewUrl);
    const renderedForms = (await previewWindow.webContents.executeJavaScript(
      "document.querySelectorAll('[data-webrad-form-id]').length",
      true,
    )) as unknown;
    if (renderedForms !== 1) {
      throw new Error(`Preview renderer smoke failed: rendered forms=${String(renderedForms)}`);
    }
    smokeLog('preview renderer passed');
  } finally {
    if (previewWindow && !previewWindow.isDestroyed()) previewWindow.destroy();
    revokePreview(smokeOwnerId);
  }
}

function wait(delayMilliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMilliseconds));
}

async function waitForRendererString(
  window: BrowserWindow,
  expression: string,
  description: string,
  timeoutMilliseconds = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = (await window.webContents.executeJavaScript(expression, true)) as unknown;
    if (typeof value === 'string' && value.length > 0) return value;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function waitForRendererResult(
  window: BrowserWindow,
  expression: string,
  description: string,
  isReady: (value: unknown) => boolean,
  timeoutMilliseconds = 20_000,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastResult: unknown;
  while (Date.now() < deadline) {
    lastResult = (await window.webContents.executeJavaScript(expression, true)) as unknown;
    if (isReady(lastResult)) return lastResult;
    await wait(50);
  }
  throw new Error(
    `Timed out waiting for ${description}. Last result: ${JSON.stringify(lastResult)}`,
  );
}

function sendRendererKey(
  window: BrowserWindow,
  keyCode: string,
  modifiers: NonNullable<Electron.KeyboardInputEvent['modifiers']> = [],
): void {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
}

async function runMonacoLanguageSmoke(window: BrowserWindow): Promise<void> {
  const isHighlightedTypeScript = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) return false;
    const keywords = Reflect.get(value, 'keywords');
    return (
      Number(Reflect.get(value, 'lines')) >= 1 &&
      Number(Reflect.get(value, 'tokens')) >= 4 &&
      Number(Reflect.get(value, 'tokenClasses')) >= 3 &&
      Number(Reflect.get(value, 'colors')) >= 3 &&
      Array.isArray(keywords) &&
      keywords.includes('import') &&
      Reflect.get(value, 'formClass') === true &&
      Reflect.get(value, 'inlayHintsHidden') === true
    );
  };
  const highlightingEvidence = await waitForRendererResult(
    window,
    `(() => {
      const editor = document.querySelector('.monaco-editor');
      if (!(editor instanceof HTMLElement)) return null;
      const lines = [...editor.querySelectorAll('.view-lines .view-line')];
      const tokens = [...editor.querySelectorAll('.view-lines span[class*="mtk"]')]
        .filter((node) => node instanceof HTMLElement)
        .map((node) => ({
          text: node.textContent ?? '',
          tokenClass: [...node.classList].find((name) => /^mtk\\d+$/.test(name)) ?? '',
          color: getComputedStyle(node).color,
        }));
      const tokenClasses = [...new Set(tokens.map((token) => token.tokenClass).filter(Boolean))];
      const colors = [...new Set(tokens.map((token) => token.color).filter(Boolean))];
      const source = lines.map((line) => line.textContent ?? '').join('\\n');
      const expectedKeywords = ['import', 'export', 'class', 'extends', 'async'];
      const highlightedKeywords = expectedKeywords.filter((keyword) =>
        tokens.some((token) => token.text.trim() === keyword && token.tokenClass.length > 0),
      );
      return {
        lines: lines.length,
        tokens: tokens.length,
        tokenClasses: tokenClasses.length,
        colors: colors.length,
        keywords: highlightedKeywords,
        formClass: source.includes('FrmMainGenerated'),
        eventHandler: source.includes('BTNMostrarClick'),
        inlayHintsHidden: !source.includes('message:'),
        samples: tokens.slice(0, 12),
      };
    })()`,
    'TypeScript tokenization and syntax highlighting in Monaco',
    isHighlightedTypeScript,
  );
  const highlighting = JSON.stringify(highlightingEvidence);
  smokeLog(`renderer Monaco TypeScript highlight passed: ${highlighting}`);

  const focused = (await window.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector(
        '.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea',
      );
      if (!(input instanceof HTMLElement)) return false;
      input.focus();
      return document.activeElement === input;
    })()`,
    true,
  )) as unknown;
  if (focused !== true)
    throw new Error('Renderer Monaco autocomplete smoke could not focus the editor.');

  window.webContents.focus();
  const commandModifier: NonNullable<Electron.KeyboardInputEvent['modifiers']>[number] =
    process.platform === 'darwin' ? 'meta' : 'control';
  sendRendererKey(window, 'Home', [commandModifier]);
  sendRendererKey(window, 'Space', [commandModifier]);

  const suggestions = await waitForRendererString(
    window,
    `(() => {
      const widget = document.querySelector('.monaco-editor .suggest-widget.visible');
      if (!(widget instanceof HTMLElement) || getComputedStyle(widget).display === 'none') return '';
      const rows = [...widget.querySelectorAll('.monaco-list-row')]
        .filter((row) => row instanceof HTMLElement && row.offsetParent !== null);
      const labels = rows
        .map((row) =>
          row.querySelector('.label-name, .monaco-highlighted-label')?.textContent?.trim() ?? '',
        )
        .filter(Boolean);
      if (rows.length === 0 || labels.length === 0) return '';
      return JSON.stringify({ rows: rows.length, labels: labels.slice(0, 5) });
    })()`,
    'the visible Monaco autocomplete widget after Ctrl+Space',
    10_000,
  );
  smokeLog(`renderer Monaco autocomplete passed: ${suggestions}`);
  sendRendererKey(window, 'Escape');
}

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const match = findFrame(child, url);
    if (match !== undefined) return match;
  }
  return undefined;
}

async function waitForPreviewFrame(window: BrowserWindow, url: string): Promise<WebFrameMain> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const frame = findFrame(window.webContents.mainFrame, url);
    if (frame !== undefined) return frame;
    await wait(50);
  }
  throw new Error(`Timed out waiting for Preview frame ${url}.`);
}

async function runRendererWorkflowSmoke(window: BrowserWindow): Promise<void> {
  const shellResult = (await window.webContents.executeJavaScript(
    `(() => ({
      shell: Boolean(document.querySelector('.wr-ide-shell')),
      toolbar: Boolean(document.querySelector('.wr-toolbar')),
      brandIcon: document.querySelector('img.wr-brand-mark')?.src ?? '',
      welcomeIcon: document.querySelector('img.wr-welcome-mark')?.src ?? '',
      favicon: document.querySelector('link[rel~="icon"]')?.href ?? '',
      bridge: Object.keys(globalThis.webrad ?? {}).sort()
    }))()`,
    true,
  )) as unknown;
  if (typeof shellResult !== 'object' || shellResult === null) {
    throw new Error('Renderer shell smoke returned no result.');
  }
  const shell = Reflect.get(shellResult, 'shell');
  const toolbar = Reflect.get(shellResult, 'toolbar');
  const brandIcon = Reflect.get(shellResult, 'brandIcon');
  const welcomeIcon = Reflect.get(shellResult, 'welcomeIcon');
  const favicon = Reflect.get(shellResult, 'favicon');
  const bridge = Reflect.get(shellResult, 'bridge');
  const expectedBridge = ['build', 'commands', 'files', 'lifecycle', 'platform', 'project'];
  if (
    shell !== true ||
    toolbar !== true ||
    typeof brandIcon !== 'string' ||
    brandIcon.length === 0 ||
    welcomeIcon !== brandIcon ||
    favicon !== brandIcon ||
    !Array.isArray(bridge) ||
    JSON.stringify(bridge) !== JSON.stringify(expectedBridge)
  ) {
    throw new Error(`Renderer shell smoke failed: ${JSON.stringify(shellResult)}`);
  }
  smokeLog('renderer shell passed');
  const loadedIcon = await waitForRendererString(
    window,
    `(() => {
      const icon = document.querySelector('img.wr-brand-mark');
      return icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0 ? icon.src : '';
    })()`,
    'the WebRAD application icon',
  );
  if (loadedIcon !== brandIcon) throw new Error('Renderer application icons do not match.');
  smokeLog('renderer application icon passed');

  if (smokeProjectPath === undefined) return;
  const opened = (await window.webContents.executeJavaScript(
    `(() => {
      const button = document.querySelector('button[aria-label="Open project (Ctrl+O)"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
    true,
  )) as unknown;
  if (opened !== true) throw new Error('Renderer smoke could not invoke Open Project.');
  await waitForRendererString(
    window,
    `document.querySelector('[role="tree"][aria-label="HelloWebRad project"]')?.getAttribute('aria-label') ?? ''`,
    'the HelloWebRad project in Project Explorer',
  );
  const projectIcon = await waitForRendererString(
    window,
    `document.querySelector('img.wr-project-icon')?.src ?? ''`,
    'the project application icon',
  );
  if (projectIcon !== brandIcon)
    throw new Error('Project icon does not match the application icon.');
  smokeLog('renderer project open passed');

  const codeDispatched = (await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true }))`,
    true,
  )) as unknown;
  if (codeDispatched !== false) {
    throw new Error('Renderer F12 smoke event was not handled and canceled.');
  }
  await waitForRendererString(
    window,
    `document.querySelector('.monaco-editor') === null ? '' : 'ready'`,
    'the Monaco editor after F12',
  );
  smokeLog('renderer Monaco passed');
  await runMonacoLanguageSmoke(window);

  const dispatched = (await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
    true,
  )) as unknown;
  if (dispatched !== false) {
    throw new Error('Renderer F9 smoke event was not handled and canceled.');
  }
  const previewUrl = await waitForRendererString(
    window,
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
    'PreviewPane after F9',
  );
  const previewFrame = await waitForPreviewFrame(window, previewUrl);
  const interaction = (await previewFrame.executeJavaScript(
    `(() => {
      globalThis.__webradSmokeMessage = '';
      globalThis.alert = (message) => { globalThis.__webradSmokeMessage = String(message); };
      const edit = document.querySelector('[data-webrad-name="EDTNome"]');
      const button = document.querySelector('[data-webrad-name="BTNMostrar"]');
      if (!(edit instanceof HTMLInputElement)) return { error: 'EDTNome was not mounted.' };
      if (!(button instanceof HTMLButtonElement)) return { error: 'BTNMostrar was not mounted.' };
      edit.value = 'Ada';
      button.click();
      return { message: globalThis.__webradSmokeMessage };
    })()`,
    true,
  )) as unknown;
  const message =
    typeof interaction === 'object' && interaction !== null
      ? Reflect.get(interaction, 'message')
      : undefined;
  if (message !== 'Olá Ada') {
    throw new Error(`Renderer F9 Preview interaction failed: ${JSON.stringify(interaction)}`);
  }
  smokeLog('renderer F9 preview passed: Olá Ada');
}

// Vite can wrap this CommonJS boolean in a default-export object.
const squirrelValue: unknown = squirrelStartup;
const started =
  squirrelValue === true ||
  (typeof squirrelValue === 'object' &&
    squirrelValue !== null &&
    Reflect.get(squirrelValue, 'default') === true);
smokeLog(`startup: squirrel=${String(started)} argv=${JSON.stringify(process.argv)}`);

if (started) {
  app.quit();
}

Object.assign(
  process.env,
  resolveCompilerEnvironment({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    developmentRoot: path.resolve(__dirname, '..', '..'),
    platform: process.platform,
    architecture: process.arch,
  }),
);

function createWindow(): BrowserWindow {
  smokeLog('creating BrowserWindow');
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#171a21',
    icon: applicationWindowIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const rendererEntry = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  const rendererUrl = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL ?? pathToFileURL(rendererEntry).href)
    .href;

  installApplicationMenu(window);
  installDirtyGuard(window, rendererUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.once('ready-to-show', () => {
    presentMainWindow(window, { hidden: smokeMode });
  });

  const preventUntrustedNavigation = (event: Electron.Event, targetUrl: string): void => {
    if (new URL(targetUrl).href !== rendererUrl) event.preventDefault();
  };
  window.webContents.on('will-navigate', preventUntrustedNavigation);
  window.webContents.on('will-redirect', preventUntrustedNavigation);
  window.webContents.on('did-finish-load', () => {
    smokeLog(`renderer loaded: ${rendererUrl}`);
    if (!smokeAutoExit) return;
    void runRendererWorkflowSmoke(window)
      .then(() => {
        app.quit();
      })
      .catch((error: unknown) => {
        smokeLog('renderer workflow failed', error);
        process.exitCode = 1;
        app.quit();
      });
  });
  window.webContents.on('did-fail-load', (_event, code, description) =>
    smokeLog(`renderer failed: ${String(code)} ${description}`),
  );
  void window.loadURL(rendererUrl).catch((error: unknown) => smokeLog('loadURL rejected', error));
  smokeLog('BrowserWindow created');

  return window;
}

app
  .whenReady()
  .then(async () => {
    smokeLog('app ready');
    app.dock?.setIcon(applicationWindowIconPath());
    verifyApplicationIconResource();
    installPermissionPolicy();
    const previewHtml = await runCompilerSmoke();
    registerPreviewProtocol();
    await runPreviewProtocolSmoke(previewHtml);
    registerIpcHandlers(
      smokeMode && smokeProjectPath !== undefined
        ? { automatedOpenProjectPath: smokeProjectPath }
        : {},
    );
    mainWindow = createWindow();
    mainWindowLifecycleStarted = true;

    app.on('activate', () => {
      if (mainWindow === null) {
        mainWindow = createWindow();
      }
    });
  })
  .catch((error: unknown) => {
    smokeLog('startup failed', error);
    console.error('WebRAD failed to start.', error);
    process.exitCode = 1;
    app.quit();
  });

app.on('window-all-closed', () => {
  if (!mainWindowLifecycleStarted) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  mainWindow = null;
});
