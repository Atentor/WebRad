import { createUpdateSmokeService, runUpdateSmoke } from './update-smoke';
import { createApplicationUpdates, scheduleUpdateChecks } from './application-updates';
import { registerUpdateIpc } from './update-ipc';
import { requireTrustedSender, hasUnsavedProjectChanges } from './project-ipc';
import { runProjectResourcesSmoke } from './project-resources-smoke';
import { runDebuggerSmoke } from './debugger-smoke';
import { runDeploySmoke } from './deploy-smoke';
import { runNativeBuildSmoke } from './native-build-smoke';
import { runPageTitleSmoke } from './page-title-smoke';
import { appendFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, nativeImage, net, session, type WebFrameMain } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { compileProject } from '@webrad/compiler';
import { resolveCompilerEnvironment } from './compiler-environment';
import { synchronizeInstallationIcon } from './installation-icon';
import { applicationWindowIconPath } from './application-icon';
import { presentMainWindow } from './main-window-presentation';
import { installApplicationMenu } from './menu';
import { closePreviewServer, publishPreviewHtml, revokePreview } from './preview-server';
import { closeRendererServer, publishRenderer } from './renderer-server';
import { installReportPreviewWindows } from './report-preview-windows';
import { loadProjectFiles } from './project-files';
import { installDirtyGuard, registerIpcHandlers } from './project-ipc';
import {
  runRestGoBrowserSmoke,
  runRestGoPageEventsSmoke,
  runRestGoSettingsSmoke,
} from './restgo-smoke';
import { runDataGridConfigurationSmoke } from './data-grid-smoke';
import { runIconSmoke } from './icon-smoke';
import { runStylesWorkspaceSmoke } from './styles-smoke';
import { runPopupLayoutSmoke } from './popup-smoke';
import { runBugReportSmoke } from './bug-report-smoke';
import { runApiClientBrowserSmoke, runApiClientDesignerSmoke } from './api-client-smoke';
import { runMonacoCaretSmoke } from './monaco-caret-smoke';
import {
  runEmptyEventCleanupSmoke,
  runTypedKeyboardInteractionSmoke,
} from './monaco-workspace-smoke';
import { captureDesignerButtonStyle, assertPreviewButtonStyle } from './component-style-smoke';
import type { WebRadBridge } from '../shared/contracts';
import { trackSmokeRendererHealth } from './smoke-renderer-health';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let pendingMainWindow: Promise<BrowserWindow> | null = null;
let mainWindowLifecycleStarted = false;
const smokeMode = process.argv.includes('--webrad-smoke');
if (smokeMode) app.disableHardwareAcceleration();
const smokeAutoExit = process.argv.includes('--webrad-smoke-auto-exit');
const smokeProjectArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-project='),
);
const smokeProjectPath = smokeProjectArgument?.slice('--webrad-smoke-project='.length);
const smokeScreenshotArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-screenshot='),
);
const smokeScreenshotPath = smokeMode
  ? smokeScreenshotArgument?.slice('--webrad-smoke-screenshot='.length)
  : undefined;

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
      process.argv
        .find((value) => value.startsWith('--webrad-smoke-log='))
        ?.slice('--webrad-smoke-log='.length) ??
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

async function runPreviewServerSmoke(previewHtml: string | undefined): Promise<void> {
  if (previewHtml === undefined) return;
  const smokeOwnerId = -1;
  const previewUrl = await publishPreviewHtml(smokeOwnerId, previewHtml);
  let previewWindow: BrowserWindow | null = null;
  try {
    const previewResponse = await net.fetch(previewUrl);
    const responseHtml = await previewResponse.text();
    const contentSecurityPolicy = previewResponse.headers.get('content-security-policy') ?? '';
    if (
      !previewResponse.ok ||
      responseHtml !==
        previewHtml.replace(
          '<head>',
          '<head><base href="' + new URL('./', previewUrl).pathname + '">',
        ) ||
      !contentSecurityPolicy.includes("script-src 'unsafe-inline'")
    ) {
      throw new Error(
        `Preview HTTP server smoke failed: status=${String(previewResponse.status)} csp=${JSON.stringify(contentSecurityPolicy)}`,
      );
    }
    smokeLog('preview HTTP server passed');

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
    const renderedPages = (await previewWindow.webContents.executeJavaScript(
      "document.querySelectorAll('[data-webrad-page-id]').length",
      true,
    )) as unknown;
    if (renderedPages !== 1) {
      throw new Error(`Preview renderer smoke failed: rendered pages=${String(renderedPages)}`);
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
  const fontEvidence = await waitForRendererResult(
    window,
    `(async () => {
      const [normalFaces, italicFaces] = await Promise.all([
        document.fonts.load("300 13px 'JetBrains Mono'", 'WebRAD'),
        document.fonts.load("italic 300 13px 'JetBrains Mono'", 'comment'),
      ]);
      const editorText = document.querySelector('.monaco-editor .view-lines .view-line');
      const fontFamily =
        editorText instanceof HTMLElement ? getComputedStyle(editorText).fontFamily : '';
      return {
        normal: normalFaces.filter(
          (face) =>
            face.status === 'loaded' &&
            face.family === 'JetBrains Mono' &&
            face.weight === '300' &&
            face.style === 'normal',
        ).length,
        italic: italicFaces.filter(
          (face) =>
            face.status === 'loaded' &&
            face.family === 'JetBrains Mono' &&
            face.weight === '300' &&
            face.style === 'italic',
        ).length,
        fontFamily,
      };
    })()`,
    'the packaged JetBrains Mono webfont in Monaco',
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      Number(Reflect.get(value, 'normal')) > 0 &&
      Number(Reflect.get(value, 'italic')) > 0 &&
      String(Reflect.get(value, 'fontFamily')).includes('JetBrains Mono'),
  );
  smokeLog(`renderer Monaco font passed: ${JSON.stringify(fontEvidence)}`);

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
      Reflect.get(value, 'pageClass') === true &&
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
        pageClass: source.includes('PageMainGenerated'),
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
  // Place the cursor on the empty line immediately before the handler's closing brace.
  // This is a real expression-statement position, so the custom Delphi-style provider
  // must contribute the active page component Names without modifying the source.
  sendRendererKey(window, process.platform === 'darwin' ? 'Down' : 'End', [commandModifier]);
  sendRendererKey(window, 'Up');
  sendRendererKey(window, 'Up');
  sendRendererKey(window, 'Home');
  sendRendererKey(window, 'Space', ['control']);

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
       const componentNames = ['LBLNome', 'EDTNome', 'BTNMostrar'];
       if (
         rows.length === 0 ||
         labels.length === 0 ||
         !componentNames.every((name) => labels.includes(name))
       ) return '';
       return JSON.stringify({ rows: rows.length, labels: labels.slice(0, 5) });
    })()`,
    'the visible Monaco autocomplete widget after Ctrl+Space',
    10_000,
  );
  smokeLog(`renderer Monaco autocomplete passed: ${suggestions}`);
  sendRendererKey(window, 'Escape');

  // Exercise the native TypeScript member provider on a bare component name.
  await window.webContents.insertText('EDTNome.va');
  await waitForRendererResult(
    window,
    "[...document.querySelectorAll('.monaco-editor .view-line')].some((line) => line.textContent?.includes('EDTNome.va'))",
    'the typed bare component member in Monaco',
    (value) => value === true,
  );
  sendRendererKey(window, 'Space', ['control']);
  const componentMembers = await waitForRendererString(
    window,
    `(() => {
      const widget = document.querySelector('.monaco-editor .suggest-widget.visible');
      if (!(widget instanceof HTMLElement)) return '';
      const labels = [...widget.querySelectorAll('.monaco-list-row')]
        .map((row) => row.querySelector('.label-name, .monaco-highlighted-label')?.textContent?.trim() ?? '');
      return labels.includes('value') ? JSON.stringify(labels.slice(0, 8)) : '';
    })()`,
    'native property completions for EDTNome without this',
    10_000,
  ).catch(async (error: unknown) => {
    const evidence = await window.webContents.executeJavaScript(`({
      source: [...document.querySelectorAll('.monaco-editor .view-line')].map((line) => line.textContent),
      widget: document.querySelector('.monaco-editor .suggest-widget')?.textContent,
      focused: document.activeElement?.className
    })()`);
    smokeLog(`renderer Monaco component member failure: ${JSON.stringify(evidence)}`);
    throw error;
  });
  smokeLog(`renderer Monaco component members passed: ${componentMembers}`);
  const memberPosition = await window.webContents.executeJavaScript(
    "document.querySelector('.wr-status-position')?.getAttribute('aria-label')",
    true,
  );
  sendRendererKey(window, 'Enter');
  await waitForRendererResult(
    window,
    `(() => {
      const position = document.querySelector('.wr-status-position')?.getAttribute('aria-label');
      return position?.split(',')[0] === ${JSON.stringify(String(memberPosition).split(',')[0])} &&
        [...document.querySelectorAll('.monaco-editor .view-line')].some(line => line.textContent?.includes('EDTNome.value')) &&
        document.querySelector('.monaco-editor .suggest-widget.visible') === null;
    })()`,
    'Enter accepting the member without inserting a line',
    (value) => value === true,
  );
  // Reopen on an already complete member: native smart mode used to insert a newline here.
  sendRendererKey(window, 'Space', ['control']);
  await waitForRendererString(
    window,
    `(() => {
      const widget = document.querySelector('.monaco-editor .suggest-widget.visible');
      return widget?.querySelector('.monaco-list-row.focused .label-name')?.textContent === 'value' ? 'value' : '';
    })()`,
    'the selected already complete member',
    10_000,
  );
  const completePosition = await window.webContents.executeJavaScript(
    "document.querySelector('.wr-status-position')?.getAttribute('aria-label')",
    true,
  );
  sendRendererKey(window, 'Enter');
  await waitForRendererResult(
    window,
    `document.querySelector('.wr-status-position')?.getAttribute('aria-label') === ${JSON.stringify(completePosition)} && document.querySelector('.monaco-editor .suggest-widget.visible') === null`,
    'Enter closing unchanged completion without inserting a line',
    (value) => value === true,
  );
  smokeLog(
    'renderer Monaco context Enter passed: accepted member and unchanged completion without newline',
  );
  for (let index = 0; index < 'EDTNome.value'.length; index += 1) {
    sendRendererKey(window, 'Left', ['shift']);
  }
  sendRendererKey(window, 'Backspace');
  await runMonacoCaretSmoke(window, {
    log: smokeLog,
    sendKey: (keyCode, modifiers) => sendRendererKey(window, keyCode, modifiers),
    screenshotPath: smokeScreenshotPath,
  });
  if (smokeProjectPath !== undefined) {
    await runEmptyEventCleanupSmoke(window, smokeProjectPath, smokeLog);
    await runTypedKeyboardInteractionSmoke(window, smokeLog);
  }
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

async function waitForPreviewFrameResult(
  frame: WebFrameMain,
  expression: string,
  description: string,
  timeoutMilliseconds = 20_000,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastResult: unknown;
  while (Date.now() < deadline) {
    try {
      lastResult = await frame.executeJavaScript(expression, true);
      if (lastResult === true) return lastResult;
    } catch {
      // The frame can briefly be unavailable while the isolated Preview navigates.
    }
    await wait(50);
  }
  throw new Error(
    `Timed out waiting for ${description}. Last result: ${JSON.stringify(lastResult)}`,
  );
}

async function clickRendererControl(
  window: BrowserWindow,
  selector: string,
  description: string,
): Promise<void> {
  await waitForRendererResult(
    window,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLElement)) return false;
      if (control instanceof HTMLButtonElement && control.disabled) return false;
      control.click();
      return true;
    })()`,
    description,
    (value) => value === true,
  );
}

async function runDesignerThemeSmoke(window: BrowserWindow): Promise<void> {
  for (const [theme, toolbarColor, sidebarColor, canvasColor] of [
    ['light', 'rgb(249, 250, 252)', 'rgb(249, 250, 252)', 'rgb(238, 241, 245)'],
    ['dark', 'rgb(51, 51, 51)', 'rgb(37, 37, 38)', 'rgb(30, 30, 30)'],
  ] as const) {
    window.webContents.send('webrad:menu-command', 'view.toggleTheme');
    const evidence = await waitForRendererResult(
      window,
      "(() => { const color = (selector) => { const node = document.querySelector(selector); return node instanceof HTMLElement ? getComputedStyle(node).backgroundColor : ''; }; return { theme: document.documentElement.dataset.theme, toolbar: color('.wr-toolbar'), sidebar: color('.wr-left-rail'), canvas: color('.wr-designer-workspace') }; })()",
      'the ' + theme + ' workspace theme and computed colors',
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        Reflect.get(value, 'theme') === theme &&
        Reflect.get(value, 'toolbar') === toolbarColor &&
        Reflect.get(value, 'sidebar') === sidebarColor &&
        Reflect.get(value, 'canvas') === canvasColor,
    );
    smokeLog('renderer ' + theme + ' theme passed: ' + JSON.stringify(evidence));
  }
}

async function runDesignerWorkspaceSmoke(window: BrowserWindow): Promise<void> {
  await clickRendererControl(window, 'button[aria-label="Design"]', 'the Design activity');
  await waitForRendererResult(
    window,
    `(() => {
        const workspace = document.querySelector('.wr-editor-workspace');
        const tabs = workspace?.querySelector(':scope > .wr-view-tabs');
        const content = workspace?.querySelector(':scope > .wr-editor-content');
        const buttons = tabs?.querySelectorAll('button');
        if (!workspace || !tabs || !content || buttons?.length !== 2) return false;
        const outer = workspace.getBoundingClientRect();
        const bar = tabs.getBoundingClientRect();
        const body = content.getBoundingClientRect();
        const first = buttons[0].getBoundingClientRect();
        const last = buttons[1].getBoundingClientRect();
        return Math.abs(bar.top - outer.top) < 1 && Math.abs(bar.bottom - body.top) < 1 &&
          Math.abs((first.left + last.right) / 2 - (bar.left + bar.right) / 2) < 1 &&
          tabs.querySelector('[aria-label="Design"][aria-selected="true"]') !== null &&
          document.querySelector('.wr-activity-bar [role="tab"]') === null;
      })()`,
    'Design/Code controls centered above the canvas',
    (value) => value === true,
  );
  smokeLog('renderer document view navigation passed');
  await clickRendererControl(
    window,
    '[role="treeitem"][data-component-id="hello-webrad-component-label-name-v1"]',
    'LBLNome in the element tree',
  );
  const selectionEvidence = await waitForRendererResult(
    window,
    `(() => {
      const treeItem = document.querySelector('[role="treeitem"][data-component-id="hello-webrad-component-label-name-v1"]');
      const inspector = document.querySelector('.wr-object-inspector');
      const name = inspector?.querySelector('.wr-inspector-selection strong')?.textContent?.trim();
      const nameEditor = [...(inspector?.querySelectorAll('input') ?? [])].some((input) => input.value === 'LBLNome');
      const selectedHit = document.querySelector('.wr-design-hit.selected[data-component-id="hello-webrad-component-label-name-v1"]');
      return {
        treeSelected: treeItem?.getAttribute('aria-selected') === 'true',
        inspectorName: name,
        nameEditor,
        canvasSelected: selectedHit !== null,
      };
    })()`,
    'shared element-tree, canvas, and Inspector selection',
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      Reflect.get(value, 'treeSelected') === true &&
      Reflect.get(value, 'inspectorName') === 'LBLNome' &&
      Reflect.get(value, 'nameEditor') === true &&
      Reflect.get(value, 'canvasSelected') === true,
  );
  smokeLog(`renderer element tree selection passed: ${JSON.stringify(selectionEvidence)}`);
  await clickRendererControl(
    window,
    'button[role="tab"][aria-label="Responsive"], button[role="tab"][data-sidebar-view="responsive"]',
    'the Responsive sidebar',
  );
  const viewportEvidence: string[] = [];
  for (const [label, viewport, width] of [
    ['Tablet', 'tablet', 768],
    ['Mobile', 'mobile', 390],
  ] as const) {
    await clickRendererControl(
      window,
      `button[aria-label="${label}"]`,
      `the ${label} responsive viewport`,
    );
    await waitForRendererResult(
      window,
      `(() => {
        const surface = document.querySelector('.wr-page-surface');
        return surface instanceof HTMLElement && surface.dataset.viewport === ${JSON.stringify(viewport)} && Number.parseFloat(surface.style.width) === ${String(width)};
      })()`,
      `the ${String(width)}px ${label} Designer projection`,
      (value) => value === true,
    );
    viewportEvidence.push(`${label}:${String(width)}`);
  }
  await clickRendererControl(
    window,
    'button[aria-label="Default"]',
    'the restored Default viewport',
  );
  const originalSize = window.getSize();
  const originalWidth = originalSize[0];
  const originalHeight = originalSize[1];
  if (originalWidth === undefined || originalHeight === undefined)
    throw new Error('Missing window size.');
  for (const width of [originalWidth - 120, originalWidth]) {
    window.setSize(width, originalHeight);
    await waitForRendererResult(
      window,
      `(() => {
        const host = document.querySelector('.wr-designer-scroll');
        const surface = document.querySelector('.wr-page-surface');
        const frame = document.querySelector('.wr-page-zoom-frame');
        if (!(host instanceof HTMLElement) || !(surface instanceof HTMLElement) || !(frame instanceof HTMLElement)) return false;
        const style = getComputedStyle(host);
        const available = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return surface.dataset.viewport === 'desktop' && available > 0 && Math.abs(parseFloat(frame.style.width) - available) < 1;
      })()`,
      'the Default canvas filling the resized Designer host',
      (value) => value === true,
    );
  }
  viewportEvidence.push('Default:available width (window resize verified)');
  smokeLog(`renderer responsive viewport passed: ${viewportEvidence.join(', ')}`);
  const toolbarEvidence = await waitForRendererResult(
    window,
    `(() => {
    const toolbar = document.querySelector('.wr-toolbar');
    const tabs = toolbar?.querySelectorAll('[role="tab"]');
    const currentTab = tabs?.[0];
    const surface = document.querySelector('.wr-page-surface');
    return {
      currentDocument: currentTab?.textContent?.trim(),
      singleDocument: tabs?.length === 1 && currentTab?.getAttribute('aria-selected') === 'true',
      simplifiedControls: toolbar !== null && toolbar.querySelector('select, [aria-label="Arrange selection"], .wr-toolbar-selection') === null,
      designerScale: surface instanceof HTMLElement ? surface.style.transform : '',
    };
  })()`,
    'the current-document toolbar and default Designer scale',
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      Reflect.get(value, 'singleDocument') === true &&
      Reflect.get(value, 'simplifiedControls') === true &&
      Reflect.get(value, 'designerScale') === 'scale(1)',
  );
  await clickRendererControl(window, 'button[aria-label="Design"]', 'the restored Builder sidebar');
  smokeLog(`renderer Designer toolbar contract passed: ${JSON.stringify(toolbarEvidence)}`);

  await runDesignerThemeSmoke(window);
}

async function captureDesignerSmokeScreenshot(window: BrowserWindow): Promise<void> {
  if (smokeScreenshotPath === undefined) return;
  if (!path.isAbsolute(smokeScreenshotPath)) {
    throw new Error('Smoke screenshot destination must be an absolute path.');
  }
  await clickRendererControl(window, 'button[aria-label="Design"]', 'Design before screenshot');
  await waitForRendererString(
    window,
    `document.querySelector('.wr-designer-workspace') === null ? '' : 'ready'`,
    'the Designer screenshot surface',
  );
  const outputOpen = await window.webContents.executeJavaScript(
    `(document.querySelector('.wr-bottom-slot')?.getBoundingClientRect().height ?? 0) > 0`,
    true,
  );
  if (outputOpen === true) {
    await clickRendererControl(
      window,
      'button[aria-label="Toggle output"]',
      'collapse Output before screenshot',
    );
  }
  await clickRendererControl(
    window,
    '[role="treeitem"][data-component-id="hello-webrad-component-button-show-v1"]',
    'BTNMostrar before screenshot',
  );

  await waitForRendererResult(
    window,
    `(() => {
    const inspector = document.querySelector('.wr-inspector-selection strong')?.textContent?.trim();
    const surface = document.querySelector('.wr-page-surface');
    const output = document.querySelector('.wr-bottom-slot');
    return inspector === 'BTNMostrar' && surface?.style.transform === 'scale(1)' && (output === null || output.getBoundingClientRect().height === 0);
  })()`,
    'the selected component and default-scale Designer screenshot',
    (value) => value === true,
  );
  await window.webContents.executeJavaScript(
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    true,
  );
  await fs.mkdir(path.dirname(smokeScreenshotPath), { recursive: true });
  const screenshot = await window.webContents.capturePage();
  if (screenshot.isEmpty()) throw new Error('Designer screenshot was empty.');
  await fs.writeFile(smokeScreenshotPath, screenshot.toPNG());
  const size = screenshot.getSize();
  smokeLog(
    `renderer Designer screenshot saved: ${smokeScreenshotPath} (${String(size.width)}x${String(size.height)})`,
  );
}

async function runRendererWorkflowSmoke(window: BrowserWindow): Promise<void> {
  if (process.argv.includes('--webrad-smoke-updates')) {
    await runUpdateSmoke(window, smokeLog);
    return;
  }
  if (process.argv.includes('--webrad-smoke-deploy') && smokeProjectPath !== undefined) {
    await runDeploySmoke(window, smokeProjectPath, smokeLog, smokeScreenshotPath);
    return;
  }
  if (process.argv.includes('--webrad-smoke-debugger') && smokeProjectPath !== undefined) {
    await runDebuggerSmoke(window, smokeProjectPath, smokeLog);
    return;
  }
  if (process.argv.includes('--webrad-smoke-resources') && smokeProjectPath !== undefined) {
    await runProjectResourcesSmoke(window, smokeProjectPath, smokeLog, smokeScreenshotPath);
    return;
  }
  if (process.argv.includes('--webrad-smoke-native-build') && smokeProjectPath !== undefined) {
    await clickRendererControl(
      window,
      'button[aria-label="Open project (Ctrl+O)"]',
      'Open project',
    );
    await waitForRendererResult(
      window,
      'document.querySelector(\'button[aria-label="Build Application"]\')?.disabled === false',
      'the opened project Native Build action',
      (value) => value === true,
    );
    await runNativeBuildSmoke(window, {
      projectPath: smokeProjectPath,
      log: smokeLog,
      ...(smokeScreenshotPath === undefined ? {} : { screenshotPath: smokeScreenshotPath }),
    });
    return;
  }
  const shellResult = (await window.webContents.executeJavaScript(
    `(() => ({
      shell: Boolean(document.querySelector('.wr-ide-shell')) && Boolean(document.querySelector('.wr-activity-bar')),
      toolbar: Boolean(document.querySelector('.wr-toolbar')),
      toolbarActions: ['New project (Ctrl+N)', 'Open project (Ctrl+O)', 'Save (Ctrl+S)', 'Undo (Ctrl+Z)', 'Redo (Ctrl+Y)', 'Build and run (F9)']
        .map(label => {
          const button = document.querySelector('.wr-toolbar button[aria-label="' + label + '"]');
          return button instanceof HTMLButtonElement ? !button.disabled : null;
        }),
      workspaceNavigation: ['Project Explorer', 'Styles', 'Project Settings', 'RestGo integration', 'Toggle output']
      .every(label => document.querySelector('.wr-activity-bar button[aria-label="' + label + '"]') instanceof HTMLButtonElement)
      && document.querySelector('.wr-activity-bar [role="tablist"]') === null
      && document.querySelector('.wr-view-tabs') === null,
      toolbarBrandIcon: Boolean(document.querySelector('img.wr-toolbar-mark')),
      toolbarThemeToggle: Boolean(document.querySelector('.wr-theme-toggle')),
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
  const toolbarActions = Reflect.get(shellResult, 'toolbarActions');
  const workspaceNavigation = Reflect.get(shellResult, 'workspaceNavigation');
  const toolbarBrandIcon = Reflect.get(shellResult, 'toolbarBrandIcon');
  const toolbarThemeToggle = Reflect.get(shellResult, 'toolbarThemeToggle');
  const welcomeIcon = Reflect.get(shellResult, 'welcomeIcon');
  const favicon = Reflect.get(shellResult, 'favicon');
  const bridge = Reflect.get(shellResult, 'bridge');
  const expectedBridge = Object.keys({
    nativeBuild: true,
    updates: true,
    debugger: true,
    deploy: true,
    build: true,
    commands: true,
    files: true,
    lifecycle: true,
    links: true,
    platform: true,
    project: true,
    restgoAdmin: true,
    restgoDevelopment: true,
    styles: true,
  } satisfies Record<keyof WebRadBridge, true>).sort();
  if (
    shell !== true ||
    toolbar !== true ||
    JSON.stringify(toolbarActions) !== JSON.stringify([true, true, false, false, false, false]) ||
    workspaceNavigation !== true ||
    toolbarBrandIcon !== false ||
    toolbarThemeToggle !== false ||
    typeof welcomeIcon !== 'string' ||
    welcomeIcon.length === 0 ||
    favicon !== welcomeIcon ||
    !Array.isArray(bridge) ||
    JSON.stringify(bridge) !== JSON.stringify(expectedBridge)
  ) {
    throw new Error(`Renderer shell smoke failed: ${JSON.stringify(shellResult)}`);
  }
  smokeLog('renderer shell passed');
  await runBugReportSmoke(window);
  smokeLog('renderer bug report browser link passed');
  const loadedIcon = await waitForRendererString(
    window,
    `(() => {
      const icon = document.querySelector('img.wr-welcome-mark');
      return icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0 ? icon.src : '';
    })()`,
    'the WebRAD application icon',
  );
  if (loadedIcon !== welcomeIcon) throw new Error('Renderer application icons do not match.');
  smokeLog('renderer application icon passed');

  window.webContents.send('webrad:menu-command', 'help.about');
  await waitForRendererResult(
    window,
    `(() => {
const dialog = document.querySelector('[role="dialog"]');
const icon = dialog?.querySelector('img');
const bounds = dialog?.getBoundingClientRect();
return dialog?.textContent?.includes('About WebRAD') === true &&
dialog.textContent.includes('Powered by') && dialog.textContent.includes('Atentor') &&
dialog.querySelector('a[href="https://atentor.com"]') !== null &&
dialog.querySelector('a.wr-about-website[href="https://webrad.atentor.com"]') !== null &&
dialog.textContent.includes('Version ') && bounds !== undefined && bounds.width > 0 && bounds.height > 0 &&
icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0 &&
document.querySelector('.wr-ide-modal-host')?.inert === true && dialog.contains(document.activeElement);
})()`,
    'the visible About WebRAD modal',
    (value) => value === true,
  );
  await clickRendererControl(window, '[aria-label="Close About WebRAD"]', 'Close About WebRAD');
  await waitForRendererResult(
    window,
    `document.querySelector('[role="dialog"]') === null && document.querySelector('.wr-ide-modal-host')?.inert === false`,
    'the closed About WebRAD modal',
    (value) => value === true,
  );
  smokeLog('renderer About WebRAD modal passed');

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
  await waitForRendererResult(
    window,
    "document.querySelector('.wr-designer-workspace') !== null",
    'the loaded project Designer before switching sidebar',
    (value) => value === true,
  );
  const preference = JSON.parse(
    await fs.readFile(
      path.join(path.dirname(smokeProjectPath), '.webrad-smoke-preferences', 'last-project.json'),
      'utf8',
    ),
  ) as unknown;
  if (
    typeof preference !== 'object' ||
    preference === null ||
    Reflect.get(preference, 'formatVersion') !== 1 ||
    Reflect.get(preference, 'projectFilePath') !== path.resolve(smokeProjectPath)
  ) {
    throw new Error('Renderer smoke did not persist the last opened project.');
  }
  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve());
    window.webContents.reload();
  });
  await waitForRendererResult(
    window,
    "document.querySelector('.wr-page-surface') !== null && document.querySelector('.wr-welcome-mark') === null",
    'the last saved project restored automatically after renderer startup',
    (value) => value === true,
  );
  smokeLog('renderer last project restore passed');
  await clickRendererControl(
    window,
    'button[aria-label="Project Explorer"]',
    'the Project Explorer activity',
  );
  await waitForRendererString(
    window,
    `document.querySelector('[role="tree"][aria-label="HelloWebRad project"]')?.getAttribute('aria-label') ?? ''`,
    'the HelloWebRad project in Project Explorer',
  );

  await clickRendererControl(
    window,
    'button[aria-label="Toggle output"]',
    'the expanded Output dock',
  );
  await waitForRendererResult(
    window,
    "(document.querySelector('.wr-bottom-slot')?.getBoundingClientRect().height ?? 0) > 0",
    'the visible Output dock',
    (value) => value === true,
  );
  const bottomDock = (await window.webContents.executeJavaScript(
    `(() => {
      const editor = document.querySelector('.wr-editor-slot');
      const tray = document.querySelector('.wr-nonvisual-tray');
      const bottom = document.querySelector('.wr-bottom-slot');
      if (!(editor instanceof HTMLElement) || !(tray instanceof HTMLElement) || !(bottom instanceof HTMLElement)) {
        return { ready: false };
      }
      const editorBounds = editor.getBoundingClientRect();
      const trayBounds = tray.getBoundingClientRect();
      const bottomBounds = bottom.getBoundingClientRect();
      return {
        ready: true,
        belowNonvisualTray: bottomBounds.top >= trayBounds.bottom,
        alignedWithEditor:
          Math.abs(bottomBounds.left - editorBounds.left) <= 1 &&
          Math.abs(bottomBounds.right - editorBounds.right) <= 1
      };
    })()`,
    true,
  )) as unknown;
  if (
    typeof bottomDock !== 'object' ||
    bottomDock === null ||
    Reflect.get(bottomDock, 'ready') !== true ||
    Reflect.get(bottomDock, 'belowNonvisualTray') !== true ||
    Reflect.get(bottomDock, 'alignedWithEditor') !== true
  ) {
    throw new Error(`Renderer bottom dock smoke failed: ${JSON.stringify(bottomDock)}`);
  }
  smokeLog('renderer bottom dock passed');
  await clickRendererControl(
    window,
    'button[aria-label="Toggle output"]',
    'the collapsed Output dock',
  );
  await waitForRendererResult(
    window,
    "(document.querySelector('.wr-bottom-slot')?.getBoundingClientRect().height ?? 0) === 0",
    'the collapsed Output dock',
    (value) => value === true,
  );

  const stylesOpened = (await window.webContents.executeJavaScript(
    `(() => {
      const item = document.querySelector('.wr-project-tool-row');
      if (!(item instanceof HTMLElement)) return false;
      item.click();
      return true;
    })()`,
    true,
  )) as unknown;
  if (stylesOpened !== true) throw new Error('Renderer smoke could not open Styles.');
  const stylesWorkspace = await waitForRendererString(
    window,
    `(() => {
      const workspace = document.querySelector('[aria-label="Styles editor"]');
      const viewTabs = document.querySelector('.wr-view-tabs');
      return workspace !== null && viewTabs === null ? 'ready' : '';
    })()`,
    'the visual Styles workspace',
  );
  if (stylesWorkspace !== 'ready')
    throw new Error('Styles workspace did not open without the removed guidance banner.');
  await clickRendererControl(
    window,
    '[data-style-component-type="WebButton"]',
    'Button style component',
  );
  await waitForRendererString(
    window,
    `Array.from(document.querySelectorAll('.wr-style-list strong')).some((item) => item.textContent?.trim() === 'PrimaryButton') ? 'ready' : ''`,
    'the persisted PrimaryButton style',
  );
  await runStylesWorkspaceSmoke(window, { log: smokeLog });
  await clickRendererControl(
    window,
    'button[aria-label="Project Explorer"]',
    'Project Explorer after Styles',
  );
  const pageReopened = (await window.webContents.executeJavaScript(
    `(() => {
      const page = document.querySelector('.wr-page-row');
      if (!(page instanceof HTMLElement)) return false;
      page.click();
      return true;
    })()`,
    true,
  )) as unknown;
  if (pageReopened !== true) throw new Error('Renderer smoke could not return from Styles.');
  await waitForRendererString(
    window,
    `document.querySelector('.wr-designer-workspace') === null ? '' : 'ready'`,
    'the Designer after Styles',
  );
  await waitForRendererString(
    window,
    `document.querySelector('[data-component-type="WebButton"]')?.classList.contains('bg-[#0284c7]') === true ? 'ready' : ''`,
    'the selected visual style in the Designer',
  );
  const compiledStylesState = await waitForRendererString(
    window,
    `(() => {
      const styleSheets = Array.from(document.querySelectorAll('style[data-webrad-project-styles]'));
      if (styleSheets.some((style) => style.textContent?.includes('background-color: #0284c7'))) return 'ready';
      const error = Array.from(document.querySelectorAll('.wr-output-line span'))
        .map((item) => item.textContent?.trim() ?? '')
        .find((message) => message.includes('Could not compile the live style preview'));
      return error === undefined ? '' : 'error:' + error;
    })()`,
    'the compiled Tailwind CSS in the Designer',
  );
  if (compiledStylesState !== 'ready') {
    throw new Error(`Renderer live Tailwind compilation failed: ${compiledStylesState}`);
  }
  smokeLog('renderer Styles workspace passed');
  smokeLog('renderer project open passed');
  await runDesignerWorkspaceSmoke(window);

  await runNativeBuildSmoke(window, { projectPath: smokeProjectPath, log: smokeLog });

  await runPageTitleSmoke(window, { projectPath: smokeProjectPath, log: smokeLog });

  await runRestGoSettingsSmoke(window, { projectPath: smokeProjectPath, log: smokeLog });
  const designerButtonStyle = await captureDesignerButtonStyle(window);

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
  await waitForRendererResult(
    window,
    "(() => { const node = document.querySelector('.monaco-editor .monaco-editor-background'); return node instanceof HTMLElement && getComputedStyle(node).backgroundColor === 'rgb(30, 30, 30)'; })()",
    'the graphite Monaco editor background',
    (value) => value === true,
  );
  smokeLog('renderer Monaco graphite passed');

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
  await waitForPreviewFrameResult(
    previewFrame,
    `(() =>
      document.querySelector('[data-webrad-name="EDTNome"]') instanceof HTMLInputElement &&
      document.querySelector('[data-webrad-name="BTNMostrar"]') instanceof HTMLButtonElement
    )()`,
    'the mounted Preview controls after F9',
  );
  await assertPreviewButtonStyle(previewFrame, designerButtonStyle);
  smokeLog('renderer Designer/Preview button style parity passed');
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
      const computedButton = getComputedStyle(button);
      return {
        message: globalThis.__webradSmokeMessage,
        styled:
          button.classList.contains('bg-[#0284c7]') &&
          button.classList.contains('hover:bg-[#0369a1]') &&
          computedButton.color === 'rgb(255, 255, 255)' &&
          computedButton.borderRadius === '8px' &&
          computedButton.boxShadow !== 'none' &&
          computedButton.transitionDuration !== '0s'
      };
    })()`,
    true,
  )) as unknown;
  const message =
    typeof interaction === 'object' && interaction !== null
      ? Reflect.get(interaction, 'message')
      : undefined;
  const styled =
    typeof interaction === 'object' && interaction !== null
      ? Reflect.get(interaction, 'styled')
      : undefined;
  if (message !== 'Olá Ada' || styled !== true) {
    throw new Error(`Renderer F9 Preview interaction failed: ${JSON.stringify(interaction)}`);
  }
  smokeLog('renderer F9 preview passed: Olá Ada; Tailwind style applied');
  const keyboardInteraction = await previewFrame.executeJavaScript(
    `(() => {
    const edit = document.querySelector('[data-webrad-name="EDTNome"]');
    if (!(edit instanceof HTMLInputElement)) return false;
    const event = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
    const dispatched = edit.dispatchEvent(event);
    const passed = dispatched === false && event.defaultPrevented && edit.value === 'typed keyboard';
    edit.value = 'Ada';
    return passed;
  })()`,
    true,
  );
  if (keyboardInteraction !== true)
    throw new Error(
      'Compiled typed keyboard Interaction did not receive its native event and sender.',
    );
  smokeLog(
    'renderer typed Interaction Preview passed: key, preventDefault and sender executed after F9',
  );
  const isolation = (await previewFrame.executeJavaScript(
    `(() => {
      let parentBlocked = false;
      try { void parent.document; } catch { parentBlocked = true; }
      return {
        origin: location.origin,
        parentBlocked,
        noBridge: typeof globalThis.webrad === 'undefined',
        noNode: typeof globalThis.require === 'undefined' && typeof globalThis.process === 'undefined',
      };
    })()`,
    true,
  )) as unknown;
  if (
    typeof isolation !== 'object' ||
    isolation === null ||
    Reflect.get(isolation, 'origin') !== new URL(previewUrl).origin ||
    Reflect.get(isolation, 'parentBlocked') !== true ||
    Reflect.get(isolation, 'noBridge') !== true ||
    Reflect.get(isolation, 'noNode') !== true
  ) {
    throw new Error(`Renderer Preview isolation failed: ${JSON.stringify(isolation)}`);
  }
  smokeLog(`renderer Preview isolation passed: ${JSON.stringify(isolation)}`);
  await runRestGoBrowserSmoke(smokeLog, window);
  await captureDesignerSmokeScreenshot(window);
  await runRestGoPageEventsSmoke(window, { projectPath: smokeProjectPath, log: smokeLog });
  await runDataGridConfigurationSmoke(window, { projectPath: smokeProjectPath, log: smokeLog });
  await runIconSmoke(window, { projectPath: smokeProjectPath, log: smokeLog });
  await runApiClientDesignerSmoke(window, {
    projectPath: smokeProjectPath,
    log: smokeLog,
    screenshotPath: smokeScreenshotPath,
  });
  await runApiClientBrowserSmoke(smokeLog);
  await runPopupLayoutSmoke(smokeLog, smokeScreenshotPath);
}
try {
  synchronizeInstallationIcon({
    platform: process.platform,
    packaged: app.isPackaged,
    executablePath: process.execPath,
    resourcesPath: process.resourcesPath,
    arguments: process.argv,
  });
} catch (error: unknown) {
  console.warn('[IDE] Failed to synchronize the Windows installation icon.', error);
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

async function createWindow(): Promise<BrowserWindow> {
  smokeLog('creating BrowserWindow');
  const rendererDirectory = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  const rendererUrl = new URL(
    MAIN_WINDOW_VITE_DEV_SERVER_URL ?? (await publishRenderer(rendererDirectory)),
  ).href;
  const window = new BrowserWindow({
    width: smokeMode ? 1600 : 1440,
    height: smokeMode ? 950 : 920,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#1e1e1e',
    icon: applicationWindowIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // Smoke windows stay hidden, so keep renderer timers alive for debounced
      // live style compilation while preserving normal Electron throttling.
      backgroundThrottling: !smokeMode,
      // Hidden smoke windows still need a compositor surface. Without offscreen
      // rendering Chromium can reduce Monaco's animation frames to 1 Hz even
      // with backgroundThrottling disabled, exhausting the functional deadline.
      offscreen: smokeMode,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  let rendererSmokeStarted = false;
  const assertRendererHealthy = smokeAutoExit
    ? trackSmokeRendererHealth(window.webContents)
    : undefined;

  installApplicationMenu(window);
  installDirtyGuard(window, rendererUrl);
  installReportPreviewWindows(window.webContents);
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
  window.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame) return;
    // A Preview with allow-same-origin must stay outside the privileged renderer origin.
    try {
      if (new URL(event.url).origin === new URL(rendererUrl).origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  window.webContents.on('did-finish-load', () => {
    smokeLog(`renderer loaded: ${rendererUrl}`);
    if (!smokeAutoExit || rendererSmokeStarted) return;
    rendererSmokeStarted = true;
    void runRendererWorkflowSmoke(window)
      .then(() => {
        assertRendererHealthy?.();
        smokeLog('renderer workflow completed');

        app.exit(0);
      })
      .catch((error: unknown) => {
        smokeLog('renderer workflow failed', error);
        app.exit(1);
      });
  });
  window.webContents.on('did-fail-load', (_event, code, description) =>
    smokeLog(`renderer failed: ${String(code)} ${description}`),
  );
  void window.loadURL(rendererUrl).catch((error: unknown) => smokeLog('loadURL rejected', error));
  smokeLog('BrowserWindow created');

  return window;
}

function ensureMainWindow(): Promise<BrowserWindow> {
  if (mainWindow !== null && !mainWindow.isDestroyed()) return Promise.resolve(mainWindow);
  if (pendingMainWindow === null) {
    pendingMainWindow = createWindow()
      .then((window) => {
        mainWindow = window;
        return window;
      })
      .finally(() => {
        pendingMainWindow = null;
      });
  }
  return pendingMainWindow;
}

app
  .whenReady()
  .then(async () => {
    smokeLog('app ready');
    app.dock?.setIcon(applicationWindowIconPath());
    verifyApplicationIconResource();
    installPermissionPolicy();
    const previewHtml = await runCompilerSmoke();
    await runPreviewServerSmoke(previewHtml);
    registerIpcHandlers(
      smokeMode && smokeProjectPath !== undefined
        ? {
            automatedOpenProjectPath: smokeProjectPath,
            nativeInspectionLog: smokeLog,
            // Smoke fixtures use isolated preferences and never read or overwrite real user state.
            userDataPath: path.join(path.dirname(smokeProjectPath), '.webrad-smoke-preferences'),
          }
        : !smokeMode
          ? { userDataPath: app.getPath('userData') }
          : {},
    );
    const updates = (
      smokeMode && process.argv.includes('--webrad-smoke-updates')
        ? createUpdateSmokeService
        : createApplicationUpdates
    )(() => !hasUnsavedProjectChanges());
    registerUpdateIpc(updates, requireTrustedSender);
    const stopUpdateChecks = scheduleUpdateChecks(updates);
    app.once('will-quit', stopUpdateChecks);
    await ensureMainWindow();
    mainWindowLifecycleStarted = true;

    app.on('activate', () => {
      if (mainWindow === null) {
        void ensureMainWindow().catch((error: unknown) => {
          console.error('[IDE] Failed to create the application window.', error);
        });
      }
    });
  })
  .catch((error: unknown) => {
    smokeLog('startup failed', error);
    console.error('WebRAD failed to start.', error);
    if (smokeAutoExit) {
      app.exit(1);
      return;
    }
    process.exitCode = 1;
    app.quit();
  });

app.on('window-all-closed', () => {
  if (!mainWindowLifecycleStarted) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  mainWindow = null;
  void Promise.all([closePreviewServer(), closeRendererServer()]).catch((error: unknown) => {
    console.error('[IDE] Failed to close the local application servers.', error);
  });
});
