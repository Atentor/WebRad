import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const temporaryParent = await fs.realpath(os.tmpdir());
const temporaryRoot = await fs.mkdtemp(path.join(temporaryParent, 'webrad-viewport-smoke-'));
assert.equal(path.dirname(temporaryRoot), temporaryParent);
const entry = path.join(temporaryRoot, 'viewport.cjs');

try {
  await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
        import assert from 'node:assert/strict';
        import { app, BrowserWindow } from 'electron';
        import { resizeSmokeViewport } from './apps/ide/main/smoke-viewport';

        app.whenReady().then(async () => {
          const window = new BrowserWindow({
            show: false, width: 1100, height: 760, minWidth: 1000, minHeight: 680,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
          });
          try {
            await window.loadURL('data:text/html,<html><body>Native viewport smoke</body></html>');
            // Zero does not clear Cocoa's existing minimum in Electron 43.
            window.setMinimumSize(1, 1);
            const viewports = [];
            for (const requested of [{ width: 1080, height: 760 }, { width: 740, height: 700 }]) {
              const actual = await resizeSmokeViewport(window, requested);
              assert.equal(actual.width, requested.width);
              assert(actual.height > 0 && actual.height <= requested.height);
              viewports.push({ requested, actual });
            }
            process.stdout.write('[IDE] Native viewport smoke passed: ' + JSON.stringify(viewports) + '\\n');
          } finally {
            window.destroy();
            app.quit();
          }
        }).catch(error => {
          process.stderr.write('[IDE] Native viewport smoke failed: ' + String(error.stack) + '\\n');
          app.exit(1);
        });
      `,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    outfile: entry,
  });
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [entry], {
    env: environment,
    windowsHide: true,
    stdio: 'inherit',
  });
  const timeout = setTimeout(() => child.kill(), 30_000);
  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`Native viewport smoke exited with ${exitCode}.`);
  } finally {
    clearTimeout(timeout);
  }
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
