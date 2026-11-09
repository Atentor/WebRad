import { Buffer } from 'node:buffer';
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
  const output = [];
  const child = spawn(process.execPath, [vitest, 'run', ...process.argv.slice(2)], {
    cwd: workspace,
    env: {
      ...process.env,
      TEMP: linkedDirectory,
      TMP: linkedDirectory,
      TMPDIR: linkedDirectory,
    },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => {
    output.push(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output.push(chunk);
    process.stderr.write(chunk);
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
  if (process.exitCode !== 0) {
    const diagnostics = path.join(workspace, 'artifacts', 'tests', `portable-${Date.now()}`);
    await fs.mkdir(diagnostics, { recursive: true });
    await fs.writeFile(path.join(diagnostics, 'vitest.log'), Buffer.concat(output));
    await fs.writeFile(
      path.join(diagnostics, 'environment.json'),
      JSON.stringify(
        {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          exitCode: process.exitCode,
          arguments: process.argv.slice(2),
        },
        null,
        2,
      ) + '\n',
    );
    process.stderr.write(`[IDE] Portable test failure diagnostics: ${diagnostics}\n`);
  }
} finally {
  await cleanupTemporaryRoot();
}
