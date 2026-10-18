import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const packageMetadata = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
const productName = packageMetadata.productName;

if (typeof productName !== 'string' || productName.length === 0) {
  throw new Error('package.json must define a non-empty productName.');
}

const platformDirectory = `${productName}-${process.platform}-${process.arch}`;
const executableName = process.platform === 'win32' ? `${productName}.exe` : productName;
const packageDirectory = path.resolve('out', platformDirectory);
const executablePath =
  process.platform === 'darwin'
    ? path.join(packageDirectory, `${productName}.app`, 'Contents', 'MacOS', executableName)
    : path.join(packageDirectory, executableName);
const fixtureDirectory = path.resolve('examples', 'hello-webrad');
const temporaryRoot = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-packaged-smoke-')),
);
const logPath = path.join(temporaryRoot, 'webrad-smoke.log');
const projectDirectory = path.join(temporaryRoot, 'hello-webrad');
const projectPath = path.join(projectDirectory, 'HelloWebRad.wrproj');
const resourceSmoke = process.argv.includes('--webrad-smoke-resources');
const deploySmoke = process.argv.includes('--webrad-smoke-deploy');
const updateSmoke = process.argv.includes('--webrad-smoke-updates');
const screenshotArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-screenshot='),
);

const outputEntries = await fs.readdir(path.resolve('out'));
if (!outputEntries.includes(platformDirectory)) {
  throw new Error(`Packaged directory must use the exact product name: ${platformDirectory}.`);
}

const packageEntries = await fs.readdir(packageDirectory);
if (
  !packageEntries.includes(process.platform === 'darwin' ? `${productName}.app` : executableName)
) {
  throw new Error(`Packaged executable must use the exact product name: ${executableName}.`);
}

await fs.access(executablePath);
await fs.rm(logPath, { force: true });
await fs.cp(fixtureDirectory, projectDirectory, { recursive: true });

try {
  const child = spawn(
    executablePath,
    [
      '--webrad-smoke',
      '--webrad-smoke-auto-exit',
      `--webrad-smoke-log=${logPath}`,
      ...(updateSmoke
        ? ['--webrad-smoke-updates', `--user-data-dir=${path.join(temporaryRoot, 'chromium')}`]
        : []),
      ...(resourceSmoke || deploySmoke
        ? [
            deploySmoke ? '--webrad-smoke-deploy' : '--webrad-smoke-resources',
            `--user-data-dir=${path.join(temporaryRoot, 'chromium')}`,
          ]
        : []),
      `--webrad-smoke-project=${projectPath}`,
      ...(screenshotArgument === undefined ? [] : [screenshotArgument]),
    ],
    { cwd: packageDirectory, stdio: 'inherit' },
  );

  const timeoutMilliseconds = 240_000;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMilliseconds);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve(code ?? (signal === null ? 1 : 2));
    });
  }).finally(() => clearTimeout(timeout));

  const log = await fs.readFile(logPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(
      `Packaged smoke failed before creating its log (exit ${String(exitCode)}; expected ${logPath}). Check the Electron startup output above. On Linux, chrome-sandbox must be owned by root and have mode 4755.`,
      { cause: error },
    );
  });
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
  const missingEvidence = requiredEvidence.filter((entry) => !log.includes(entry));

  if (exitCode !== 0 || missingEvidence.length > 0) {
    throw new Error(
      `Packaged smoke failed (exit ${String(exitCode)}${timedOut ? `; timed out after ${String(timeoutMilliseconds)}ms` : ''}; missing ${missingEvidence.join(', ') || 'nothing'}).\n${log}`,
    );
  }

  process.stdout.write(log);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
