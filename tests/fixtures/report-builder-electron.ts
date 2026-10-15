import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { app, BrowserWindow, type WebContents, type WebFrameMain } from 'electron';
import { PDFDocument } from 'pdf-lib';
import { compileProjectToMemory } from '@webrad/compiler';
import { installReportPreviewWindows } from '../../apps/ide/main/report-preview-windows';
import { closePreviewServer, publishPreviewHtml } from '../../apps/ide/main/preview-server';
import { reportBuilderProject, reportBuilderSources } from './report-builder';

const output = path.resolve(
  process.env.WEBRAD_REPORT_ELECTRON_OUTPUT ?? 'out/report-builder-review',
);
const preload = path.join(output, 'electron', 'preload.cjs');
app.setPath('userData', path.join(output, 'electron-user-data'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
app.on('window-all-closed', () => undefined);
app.on('child-process-gone', (_event, details) =>
  process.stderr.write(`Electron child process: ${JSON.stringify(details)}\n`),
);
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.on('show', () => window.hide());
  window.webContents.on('render-process-gone', (_event, details) =>
    process.stderr.write(`Electron renderer: ${JSON.stringify(details)}\n`),
  );
  window.webContents.on('console-message', (details) =>
    process.stderr.write(`Electron console: ${details.message}\n`),
  );
});

async function poll<T>(
  read: () => Promise<T> | T,
  valid: (value: T) => boolean,
  label: string,
  timeout = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let value: T;
  do {
    value = await read();
    if (valid(value)) return value;
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

interface LastPreferences {
  getLastWebPreferences(): Record<string, unknown>;
}
function preferences(contents: WebContents): Record<string, unknown> {
  const reader = contents as WebContents & LastPreferences;
  assert.equal(typeof reader.getLastWebPreferences, 'function');
  return reader.getLastWebPreferences();
}
async function readFrame(frame: WebFrameMain, expression: string): Promise<unknown> {
  return frame.executeJavaScript(expression, true);
}

async function run(): Promise<void> {
  await app.whenReady();
  let requests = 0;
  let hostHtml = '';
  const server = createServer((request, response) => {
    if (request.url === '/host') {
      response.setHeader('Content-Type', 'text/html');
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-src http://127.0.0.1:*; style-src 'unsafe-inline'",
      );
      response.end(hostHtml);
      return;
    }
    if (request.url !== '/customers') {
      response.statusCode = 404;
      response.end();
      return;
    }
    requests++;
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        customers: Array.from({ length: 80 }, (_, index) => ({
          id: index + 1,
          name: `Customer ${String(index + 1)}`,
        })),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let parent: BrowserWindow | undefined;
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const project = reportBuilderProject(`http://127.0.0.1:${String(address.port)}`);
    const compiled = await compileProjectToMemory(project, { userSources: reportBuilderSources() });
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    assert.ok(compiled.previewHtml);
    parent = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        preload,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    const installWindowHandler = parent.webContents.setWindowOpenHandler.bind(parent.webContents);
    parent.webContents.setWindowOpenHandler = (handler) =>
      installWindowHandler((details) => {
        const result = handler(details);
        process.stdout.write(
          `Report window policy: ${JSON.stringify({ target: details.url, frameName: details.frameName, frames: parent!.webContents.mainFrame.framesInSubtree.map((entry) => entry.url), action: result.action })}\n`,
        );
        if (!result.createWindow) return result;
        const create = result.createWindow;
        return {
          ...result,
          createWindow: (options) => {
            process.stdout.write(
              `Report child constructor preferences: ${JSON.stringify(options.webPreferences)}\n`,
            );
            const child = create(options);
            process.stdout.write(
              `Report child created: ${JSON.stringify({ id: child.id, preferences: preferences(child) })}\n`,
            );
            return child;
          },
        };
      });
    installReportPreviewWindows(parent.webContents);
    const previewUrl = await publishPreviewHtml(parent.webContents.id, compiled.previewHtml);
    hostHtml =
      '<!doctype html><meta charset="utf-8"><title>Report smoke parent</title>' +
      `<iframe title="Compiled Preview" src="${previewUrl}" style="width:100vw;height:100vh;border:0"></iframe>`;
    // Like the real IDE, the host and Preview have distinct loopback HTTP
    // origins. An opaque data: host would force noopener for third-party Blob
    // navigation and cannot represent the application's WindowProxy behavior.
    await parent.loadURL(`http://127.0.0.1:${String(address.port)}/host`);
    const parentState = (await parent.webContents.executeJavaScript(
      '({ bridge: typeof window.webradSmokeBridge, marker: window.webradSmokeBridge?.marker, require: typeof require })',
    )) as Record<string, unknown>;
    assert.deepEqual(parentState, {
      bridge: 'object',
      marker: 'parent-only',
      require: 'undefined',
    });
    const frame = await poll(
      () =>
        parent!.webContents.mainFrame.framesInSubtree.find(
          (candidate) => candidate.url === previewUrl,
        ),
      (value) => value !== undefined,
      'published Preview frame',
    );
    assert.ok(frame);
    process.stdout.write(
      `Electron sandbox: ${JSON.stringify({ noSandbox: app.commandLine.hasSwitch('no-sandbox'), processes: app.getAppMetrics().map((entry) => ({ type: entry.type, sandboxed: entry.sandboxed })) })}\n`,
    );
    const root = 'document.querySelector("[data-webrad-page-id]")';
    await poll(
      () => readFrame(frame, `${root}?.dataset.ready ?? ${root}?.dataset.error`),
      (value) => value === 'true',
      'compiled Preview readiness',
    );
    assert.deepEqual(
      await readFrame(
        frame,
        '({ bridge: typeof window.webradSmokeBridge, require: typeof require, process: typeof process })',
      ),
      { bridge: 'undefined', require: 'undefined', process: 'undefined' },
    );
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    await readFrame(frame, 'document.querySelector("[data-webrad-name=Modal]").click()');
    await poll(
      () =>
        readFrame(
          frame,
          'Boolean(document.querySelector("dialog[data-report-preview][open] iframe"))',
        ),
      (value) => value === true,
      'modal PDF frame',
    );
    await delay(700);
    const modalType = await readFrame(
      frame,
      'document.querySelector("dialog iframe").contentDocument?.contentType',
    );
    assert.equal(modalType, 'application/pdf');
    await readFrame(frame, 'document.querySelector("dialog[data-report-preview] button").click()');
    await readFrame(frame, 'document.querySelector("[data-webrad-name=NewTab]").click()');
    await poll(
      () => readFrame(frame, `${root}.dataset.tab ?? ${root}.dataset.error`),
      (value) => value === 'true',
      'ReportBuilder new-tab generation',
    );
    const child = await poll(
      () => BrowserWindow.getAllWindows().find((candidate) => candidate.id !== parent!.id),
      (value) => value !== undefined,
      'report child',
    );
    assert.ok(child);
    await poll(
      () => child.webContents.getURL(),
      (url) => url.startsWith(`blob:${new URL(previewUrl).origin}/`),
      'report Blob navigation',
    );
    const childUrl = child.webContents.getURL();
    const pdfBase64 = await readFrame(
      frame,
      `fetch(${JSON.stringify(childUrl)}).then(response => response.arrayBuffer()).then(buffer => btoa(Array.from(new Uint8Array(buffer), byte => String.fromCharCode(byte)).join('')))`,
    );
    assert.equal(typeof pdfBase64, 'string');
    const bytes = Buffer.from(pdfBase64 as string, 'base64');
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 4);
    const childPreferences = preferences(child.webContents);
    assert.equal(
      await parent.webContents.executeJavaScript('window.webradSmokeBridge?.marker'),
      'parent-only',
    );
    assert.ok(childPreferences.preload === undefined || childPreferences.preload === '');
    assert.equal(childPreferences.nodeIntegration, false);
    assert.equal(childPreferences.contextIsolation, true);
    assert.equal(childPreferences.sandbox, true);
    const childState = (await child.webContents.executeJavaScript(
      '({ bridge: typeof window.webradSmokeBridge, require: typeof require, process: typeof process })',
    )) as Record<string, unknown>;
    assert.deepEqual(childState, {
      bridge: 'undefined',
      require: 'undefined',
      process: 'undefined',
    });
    assert.equal(requests, 1);
    assert.equal(
      await readFrame(frame, 'window.open("about:blank", "report-blocked") === null'),
      true,
    );
    await fs.writeFile(path.join(output, 'electron-report.pdf'), bytes);
    await fs.writeFile(
      path.join(output, 'electron-evidence.json'),
      JSON.stringify(
        {
          parentState,
          childState,
          parentBridgePresent: true,
          childPreferences: {
            preload: childPreferences.preload ?? null,
            nodeIntegration: childPreferences.nodeIntegration,
            contextIsolation: childPreferences.contextIsolation,
            sandbox: childPreferences.sandbox,
          },
          previewUrl,
          childUrl,
          pageCount: pdf.getPageCount(),
          bytes: bytes.length,
          apiRequests: requests,
          aboutBlankDenied: true,
          modalContentType: modalType,
        },
        null,
        2,
      ),
    );
    parent.destroy();
    await poll(
      () => child.isDestroyed(),
      (destroyed) => destroyed,
      'report window cleanup',
    );
    parent = undefined;
    process.stdout.write(
      'ReportBuilder Electron smoke passed: real compiled Preview, PDF Blob child, no inherited preload or Node bridge.\n',
    );
  } finally {
    parent?.destroy();
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePreviewServer();
  }
}

void run().then(
  () => app.exit(0),
  async (error: unknown) => {
    await fs.writeFile(
      path.join(output, 'electron-error.json'),
      JSON.stringify(
        { message: String(error), stack: error instanceof Error ? error.stack : undefined },
        null,
        2,
      ),
    );
    process.stderr.write(`${String(error)}\n`);
    app.exit(1);
  },
);
