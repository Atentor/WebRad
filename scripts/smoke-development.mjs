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
const screenshotArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-screenshot='),
);

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
      ...(screenshotArgument === undefined ? [] : [screenshotArgument]),
    ],
    { stdio: 'inherit' },
  );

  const timeout = setTimeout(() => {
    child.kill();
  }, 120_000);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve(code ?? (signal === null ? 1 : 2));
    });
  }).finally(() => clearTimeout(timeout));

  const log = await fs.readFile(logPath, 'utf8');
  const requiredEvidence = [
    'compiler passed:',
    'preview HTTP server passed',
    'preview renderer passed',
    'application icon resource passed:',
    'renderer loaded:',
    'renderer shell passed',
    'renderer About WebRAD modal passed',
    'renderer application icon passed',
    'renderer project open passed',
    'renderer RestGO settings passed:',
    'renderer RestGO browser passed:',
    'renderer CORS origin passed:',
    'renderer RestGO iframe CORS passed:',
    'renderer RestGO page Interaction passed:',
    'renderer Data Grid configuration passed:',
    'renderer API Client designer passed:',
    'renderer API Client browser passed:',
    'renderer last project restore passed',
    'renderer bottom dock passed',
    'renderer element tree selection passed:',
    'renderer responsive viewport passed:',
    'renderer toolbar zoom passed:',
    'renderer Monaco passed',
    'renderer Monaco TypeScript highlight passed:',
    'renderer Monaco autocomplete passed:',
    'renderer Monaco component members passed:',
    'renderer Monaco caret alignment passed:',
    'renderer F9 preview passed: Olá Ada',
    'renderer Preview isolation passed:',
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
