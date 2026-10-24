import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { waitForSmokeProcess } from './smoke-process.mjs';

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
const nativeBuildSmoke = process.argv.includes('--webrad-smoke-native-build');
const screenshotArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-screenshot='),
);
const smokeVariant = updateSmoke
  ? 'updates'
  : nativeBuildSmoke
    ? 'native-build'
    : deploySmoke
      ? 'deploy'
      : resourceSmoke
        ? 'resources'
        : 'standard';

async function preserveFailureDiagnostics(error) {
  const artifactRoot = path.resolve('artifacts', 'smoke', 'packaged', smokeVariant);
  await fs.mkdir(artifactRoot, { recursive: true });
  const destination = await fs.mkdtemp(path.join(artifactRoot, 'failure-'));
  await fs.writeFile(
    path.join(destination, 'failure.json'),
    `${JSON.stringify(
      {
        runner: 'packaged',
        variant: smokeVariant,
        platform: process.platform,
        arch: process.arch,
        executablePath,
        error: error instanceof Error ? error.stack : String(error),
      },
      null,
      2,
    )}\n`,
  );
  for (const [source, target] of [
    [logPath, path.join(destination, 'webrad-smoke.log')],
    [projectDirectory, path.join(destination, 'hello-webrad')],
  ]) {
    await fs.cp(source, target, { recursive: true }).catch((copyError) => {
      if (copyError.code !== 'ENOENT') throw copyError;
    });
  }
  process.stderr.write(`[IDE] Packaged smoke diagnostics preserved: ${destination}\n`);
}

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

try {
  await fs.access(executablePath);
  await fs.cp(fixtureDirectory, projectDirectory, { recursive: true });
  const child = spawn(
    executablePath,
    [
      '--webrad-smoke',
      '--webrad-smoke-auto-exit',
      `--webrad-smoke-log=${logPath}`,
      `--user-data-dir=${path.join(temporaryRoot, 'chromium')}`,
      ...(updateSmoke ? ['--webrad-smoke-updates'] : []),
      ...(nativeBuildSmoke ? ['--webrad-smoke-native-build'] : []),
      ...(resourceSmoke || deploySmoke
        ? [deploySmoke ? '--webrad-smoke-deploy' : '--webrad-smoke-resources']
        : []),
      `--webrad-smoke-project=${projectPath}`,
      ...(screenshotArgument === undefined ? [] : [screenshotArgument]),
    ],
    {
      cwd: packageDirectory,
      stdio: 'inherit',
      windowsHide: true,
      detached: process.platform !== 'win32',
    },
  );

  const { exitCode, timedOut, terminationError } = await waitForSmokeProcess(child, {
    logPath,
    timeoutMilliseconds: 240_000,
    processGroup: process.platform !== 'win32',
  });
  const timeoutDetails =
    (timedOut === undefined
      ? ''
      : `; timed out after ${String(timedOut.milliseconds)}ms; last progress: ${timedOut.lastProgress}`) +
    (terminationError === undefined ? '' : `; process cleanup failed: ${terminationError}`);

  const log = await fs.readFile(logPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(
      `Packaged smoke failed before creating its log (exit ${String(exitCode)}${timeoutDetails}; expected ${logPath}). Check the Electron startup output above. On Linux, chrome-sandbox must be owned by root and have mode 4755.`,
      { cause: error },
    );
  });
  const requiredEvidence = updateSmoke
    ? [
        'renderer update availability without download passed',
        'renderer update download and unsaved changes guard passed',
        'renderer update install action and restart feedback passed',
      ]
    : nativeBuildSmoke
      ? [
          'renderer Project build menu contract passed',
          'renderer Native Application settings passed',
          'renderer Native Build settings separation passed',
          'renderer Native Build platform options passed:',
          'renderer Native Build requirements checklist passed:',
          'renderer Native Build CI export passed:',
          ...(screenshotArgument === undefined
            ? []
            : [
                'renderer Native Build responsive screenshots passed:',
                'renderer Native Application visual layout passed:',
                'renderer Native Build incompatible host screenshot passed:',
              ]),
        ]
      : deploySmoke
        ? [
            'renderer Deploy directory settings passed',
            'renderer PWA project settings passed',
            'renderer Deploy file progress passed:',
            'renderer Deploy hosting output passed:',
          ]
        : resourceSmoke
          ? [
              'renderer project Models and Units passed',
              'renderer project asset import passed',
              'renderer project resources restore and F9 passed',
              'renderer project Explorer collapse and search passed',
              'renderer project Explorer duplication and persistence passed',
            ]
          : [
              'compiler passed:',
              'preview HTTP server passed',
              'preview renderer passed',
              'application icon resource passed:',
              'renderer loaded:',
              'renderer shell passed',
              'renderer About WebRAD modal passed',
              'renderer New Project template chooser passed: blank and Aurora Workspace / all visual components / Default styles / vertical left sidebar / progress bars, rings and circles / visible user profile / Nonvisual and PokeAPI / RestGO account lifecycle / shared AuroraMenu',
              'renderer application icon passed',
              'renderer project open passed',
              'renderer Native Application settings passed',
              'renderer Native Build platform options passed:',
              'renderer Native Build requirements checklist passed:',
              'renderer Native Build CI export passed:',
              'renderer Page browser title Inspector and F9 passed:',
              'renderer Panel floating Inspector and F9 passed:',
              'renderer Timer Inspector and Interact passed:',
              'renderer Lucide Icons Inspector and F9 passed:',
              'renderer Menu Inspector and F9 passed: project scrollbar,',
              'renderer Menu configurator layout passed:',
              'renderer Menu canvas geometry passed:',
              'renderer Menu horizontal flyouts passed:',
              'renderer icon gallery canonical names passed:',
              'renderer IDE Lucide icons passed:',
              'renderer History routing F9 passed:',
              'renderer mandatory index page passed:',
              'renderer mandatory 404 page passed:',
              'renderer RestGO workspace passed:',
              'renderer RestGO browser passed:',
              'renderer CORS origin passed:',
              'renderer RestGO iframe CORS passed:',
              'renderer RestGO page Interaction passed:',
              'renderer Data Grid configuration passed:',
              'renderer API Client designer passed:',
              'renderer API Client body parameter hint passed',
              'renderer RestGO development login passed:',
              'renderer RestGO API Client synchronization passed:',
              'renderer API Client browser passed:',
              'renderer Popup responsive layout passed:',
              'renderer bare page members passed:',
              'renderer last project restore passed',
              'renderer bottom dock passed',
              'renderer element tree selection passed:',
              'renderer responsive viewport passed:',
              'renderer Designer toolbar contract passed:',
              'renderer bug report and documentation browser links passed',
              'renderer Monaco passed',
              'renderer Monaco TypeScript highlight passed:',
              'renderer Monaco autocomplete passed:',
              'renderer Monaco component members passed:',
              'renderer Monaco caret alignment passed:',
              'renderer Monaco context Enter passed:',
              'renderer empty event save cleanup passed:',
              'renderer typed Interaction authoring passed:',
              'renderer typed Interaction Preview passed:',
              'renderer Monaco workspace state passed:',
              'renderer Monaco workspace restored view:',
              'renderer Monaco event navigation passed:',
              'renderer F9 preview passed: Olá Ada',
              'renderer Designer/Preview button style parity passed / page available width',
              'renderer Preview isolation passed:',
            ];
  const missingEvidence = [...requiredEvidence, 'renderer workflow completed'].filter(
    (entry) => !log.includes(entry),
  );

  if (
    exitCode !== 0 ||
    timedOut !== undefined ||
    terminationError !== undefined ||
    missingEvidence.length > 0
  ) {
    throw new Error(
      `Packaged smoke failed (exit ${String(exitCode)}${timeoutDetails}; missing ${missingEvidence.join(', ') || 'nothing'}).\n${log}`,
    );
  }

  process.stdout.write(log);
} catch (error) {
  await preserveFailureDiagnostics(error).catch((diagnosticError) => {
    process.stderr.write(
      `[IDE] Could not preserve packaged smoke diagnostics: ${diagnosticError}\n`,
    );
  });
  throw error;
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
