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
const fixtureDirectory = path.resolve('examples', 'hello-webrad');
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-development-smoke-'));
const logPath = path.join(temporaryRoot, 'webrad-smoke.log');
const projectDirectory = path.join(temporaryRoot, 'hello-webrad');
const projectPath = path.join(projectDirectory, 'HelloWebRad.wrproj');
const resourceSmoke = process.argv.includes('--webrad-smoke-resources');
const debuggerSmoke = process.argv.includes('--webrad-smoke-debugger');
const deploySmoke = process.argv.includes('--webrad-smoke-deploy');
const updateSmoke = process.argv.includes('--webrad-smoke-updates');
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
      `--webrad-smoke-log=${logPath}`,
      ...(updateSmoke
        ? ['--webrad-smoke-updates', `--user-data-dir=${path.join(temporaryRoot, 'chromium')}`]
        : []),
      ...(resourceSmoke || debuggerSmoke || deploySmoke
        ? [
            debuggerSmoke
              ? '--webrad-smoke-debugger'
              : deploySmoke
                ? '--webrad-smoke-deploy'
                : '--webrad-smoke-resources',
            `--user-data-dir=${path.join(temporaryRoot, 'chromium')}`,
          ]
        : []),
      `--webrad-smoke-project=${projectPath}`,
      ...(screenshotArgument === undefined ? [] : [screenshotArgument]),
    ],
    { stdio: 'inherit' },
  );

  const timeout = setTimeout(
    () => {
      child.kill();
    },
    debuggerSmoke ? 180_000 : 120_000,
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve(code ?? (signal === null ? 1 : 2));
    });
  }).finally(() => clearTimeout(timeout));

  const log = await fs.readFile(logPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(
      `Development smoke failed before creating its log (exit ${String(exitCode)}; expected ${logPath}). Check the Electron startup output above. On Linux, chrome-sandbox must be owned by root and have mode 4755.`,
      { cause: error },
    );
  });
  const standardEvidence = debuggerSmoke
    ? [
        'renderer debugger breakpoints and stepping passed',
        'renderer debugger inspection and evaluation passed',
        'renderer debugger Monaco controls and persistence passed',
        'renderer debugger Monaco variable hover passed',
        'renderer debugger Monaco breakpoint focus passed',
        'renderer debugger toolbar toggle and feedback passed',
        'renderer debugger restart and teardown passed',
      ]
    : resourceSmoke
      ? [
          'renderer project Models and Units passed',
          'renderer project asset import passed',
          'renderer project resources restore and F9 passed',
        ]
      : [
          'compiler passed:',
          'preview HTTP server passed',
          'preview renderer passed',
          'application icon resource passed:',
          'renderer loaded:',
          'renderer shell passed',
          'renderer About WebRAD modal passed',
          'renderer application icon passed',
          'renderer project open passed',
          'renderer RestGO workspace passed:',
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
          'renderer Monaco workspace state passed:',
          'renderer F9 preview passed: Olá Ada',
          'renderer Designer/Preview button style parity passed',
          'renderer Preview isolation passed:',
        ];
  const requiredEvidence = updateSmoke
    ? [
        'renderer update availability without download passed',
        'renderer update download and unsaved changes guard passed',
        'renderer update install action and restart feedback passed',
      ]
    : deploySmoke
      ? [
          'renderer Deploy menu and directory settings passed',
          'renderer PWA project settings passed',
          'renderer Deploy file progress passed:',
          'renderer Deploy hosting output passed:',
        ]
      : standardEvidence;
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
