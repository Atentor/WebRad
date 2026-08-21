import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const forgeCli = path.resolve(
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js',
);
const logPath = path.resolve('node_modules', 'electron', 'dist', 'webrad-smoke.log');
const fixtureDirectory = path.resolve('examples', 'hello-webrad');
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-development-smoke-'));
const projectDirectory = path.join(temporaryRoot, 'hello-webrad');
const projectPath = path.join(projectDirectory, 'HelloWebRad.wrproj');

await fs.rm(logPath, { force: true });
await fs.cp(fixtureDirectory, projectDirectory, { recursive: true });

try {
  const child = spawn(
    process.execPath,
    [
      '--max-old-space-size=4096',
      forgeCli,
      'start',
      '--enable-logging',
      '--',
      '--webrad-smoke',
      '--webrad-smoke-auto-exit',
      `--webrad-smoke-project=${projectPath}`,
    ],
    { stdio: 'inherit' },
  );

  const timeout = setTimeout(() => {
    child.kill();
  }, 90_000);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve(code ?? (signal === null ? 1 : 2));
    });
  }).finally(() => clearTimeout(timeout));

  const log = await fs.readFile(logPath, 'utf8');
  const requiredEvidence = [
    'compiler passed:',
    'preview protocol passed',
    'preview renderer passed',
    'application icon resource passed:',
    'renderer loaded:',
    'renderer shell passed',
    'renderer application icon passed',
    'renderer project open passed',
    'renderer Monaco passed',
    'renderer Monaco TypeScript highlight passed:',
    'renderer Monaco autocomplete passed:',
    'renderer F9 preview passed: Olá Ada',
  ];
  const missingEvidence = requiredEvidence.filter((entry) => !log.includes(entry));

  if (exitCode !== 0 || missingEvidence.length > 0) {
    throw new Error(
      `Development smoke failed (exit ${String(exitCode)}; missing ${missingEvidence.join(', ') || 'nothing'}).\n${log}`,
    );
  }

  process.stdout.write(log);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
