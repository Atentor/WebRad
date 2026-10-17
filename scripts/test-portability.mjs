import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const temporaryParent = await fs.realpath(os.tmpdir());
const temporaryRoot = await fs.mkdtemp(path.join(temporaryParent, 'webrad-test-portability-'));
const realDirectory = path.join(temporaryRoot, 'real');
const linkedDirectory = path.join(temporaryRoot, 'linked');

async function cleanupTemporaryRoot() {
  const actualRoot = await fs.realpath(temporaryRoot);
  if (
    path.dirname(actualRoot) !== temporaryParent ||
    !path.basename(actualRoot).startsWith('webrad-test-portability-')
  ) {
    throw new Error('Refusing to remove an unexpected portability test directory.');
  }
  await fs.rm(actualRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

try {
  await fs.mkdir(realDirectory);
  await fs.symlink(
    realDirectory,
    linkedDirectory,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  process.stdout.write(`[IDE] Testing with linked temporary paths (${process.platform}).\n`);
  const child = spawn(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
    cwd: workspace,
    env: {
      ...process.env,
      TEMP: linkedDirectory,
      TMP: linkedDirectory,
      TMPDIR: linkedDirectory,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await cleanupTemporaryRoot();
}
