import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { waitForSmokeProcess } from './smoke-process.mjs';
import { preserveMacOSSmokeDiagnostics } from './smoke-macos-diagnostics.mjs';

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
const packagesSmoke = process.argv.includes('--webrad-smoke-packages');
const deploySmoke = process.argv.includes('--webrad-smoke-deploy');
const updateSmoke = process.argv.includes('--webrad-smoke-updates');
const nativeBuildSmoke = process.argv.includes('--webrad-smoke-native-build');
const screenshotArgument = process.argv.find((value) =>
  value.startsWith('--webrad-smoke-screenshot='),
);
const smokeVariant = packagesSmoke
  ? 'packages'
  : updateSmoke
    ? 'updates'
    : nativeBuildSmoke
      ? 'native-build'
      : deploySmoke
        ? 'deploy'
        : resourceSmoke
          ? 'resources'
          : 'standard';

async function preserveFailureDiagnostics(error) {
  const screenshotDirectory = path.join(packageDirectory, 'node_modules', '.cache');
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
    [path.join(temporaryRoot, 'native-diagnostics'), path.join(destination, 'native-diagnostics')],
    [projectDirectory, path.join(destination, 'hello-webrad')],
    [screenshotDirectory, path.join(destination, 'screenshots')],
    ...(packagesSmoke
      ? [
          [
            path.join(packageDirectory, 'artifacts', 'smoke', 'packages'),
            path.join(destination, 'screenshots'),
          ],
        ]
      : []),
  ]) {
    await fs
      .cp(source, target, {
        recursive: true,
        filter: (entry) =>
          source !== screenshotDirectory ||
          entry === source ||
          /^webrad-.*\.png$/u.test(path.basename(entry)),
      })
      .catch((copyError) => {
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
      ...(packagesSmoke ? ['--webrad-smoke-packages'] : []),
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
  const requiredEvidence = packagesSmoke
    ? [
        'renderer Packages install and Explorer passed',
        'renderer Packages dialog passed',
        'renderer Packages empty layout passed',
        'renderer Packages notebook layout passed',
        'renderer Packages native menu passed',
        'renderer Packages presented screenshots passed:',
        'renderer Packages Monaco passed',
        'renderer Packages Preview passed',
        'renderer Packages Debug passed',
        'renderer Packages Web PWA passed',
        'renderer Packages lifecycle passed',
      ]
    : updateSmoke
      ? [
          'renderer update availability without download passed',
          'renderer update download and unsaved changes guard passed',
          'renderer update install action and restart feedback passed',
        ]
      : nativeBuildSmoke
        ? [
            'renderer Project build menu contract passed',
            'renderer Native Application settings passed',
            'renderer Project Settings draft protection and validation navigation passed',
            'renderer Native Build result target attribution passed',
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
                'renderer project Models and Units passed: focused native input, Select All, exact saved text',
                'renderer project asset import passed',
                'renderer project resources restore and F9 passed',
                'renderer project Explorer collapse and search passed',
                'renderer project Explorer duplication and persistence passed',
                'renderer project Explorer confirmed deletion and persistence passed',
                'renderer project Explorer keyboard, filtered results and inline rename passed: native selection and draft, duplicate-name rejection, stable renamed ID',
              ]
            : [
                'compiler passed:',
                'preview HTTP server passed',
                'preview renderer passed',
                'application icon resource passed:',
                'renderer loaded:',
                'renderer shell passed',
                'renderer welcome project actions passed: New Project click',
                'renderer welcome Open Project action passed',
                'renderer workbench keyboard resizing passed',
                'renderer application menu cleanup passed: Component absent',
                'renderer footer removal passed: full-height workbench',
                'renderer About WebRAD modal passed',
                'renderer New Project template chooser passed: blank and Aurora Workspace / all visual components / Default styles / vertical left sidebar / progress bars, rings and circles / visible user profile / Nonvisual and PokeAPI / RestGO account lifecycle / shared AuroraMenu / Aurora, Prism, Flat and WebRAD Light/Dark themes / WebRAD square controls / theme-aware previews / fixed creation actions / HTML example / Flat white and graphite surfaces, softer blue and 8px cards/buttons / Flat brighter blue hover / centered template buttons / all-theme Roboto 15px normal button text and 22px icons / Prism brighter hover / WebRAD pressed state',
                'renderer application icon passed',
                'renderer project open passed',
                'renderer Native Application settings passed',
                'renderer Project Settings draft protection and validation navigation passed',
                'renderer Native Build result target attribution passed',
                'renderer Native Build platform options passed:',
                'renderer Native Build requirements checklist passed:',
                'renderer Native Build CI export passed:',
                'renderer Page browser title Inspector and F9 passed:',
                'renderer Page parameters Inspector and F9 passed:',
                'renderer Panel floating Inspector and F9 passed:',
                'renderer Timer Inspector and Interact passed:',
                'renderer Lucide Icons Inspector and F9 passed:',
                'renderer HTML Inspector and F9 passed:',
                'renderer Date Inspector and F9 passed: complete original page restored;',
                'renderer Edit mask Inspector and F9 passed:',
                'renderer Date popup field alignment passed:',
                'renderer HTML HTTPS embed projection passed:',
                'renderer component aspect ratios Inspector and F9 passed:',
                'renderer Menu Inspector and F9 passed: project scrollbar, Light/Dark switch configuration and local preview, persisted themeToggle, desktop/mobile application theme and focus, header icon opposite logo,',
                'renderer reusable Menu Interaction passed:',
                'renderer reusable creation dialog passed:',
                'renderer native Menu persistence passed:',
                'renderer native shared Menu Interaction passed:',
                'renderer Designer insertion feedback passed:',
                'renderer Menu icon geometry passed:',
                'renderer Menu search Enter passed:',
                'renderer Menu search focus passed: focused Preview iframe,',
                'renderer Menu configurator layout passed:',
                'renderer Menu subtree removal undo passed:',
                'renderer Menu mobile icon position passed:',
                'renderer Menu RestGO user binding controls passed:',
                'renderer Menu user settings option passed:',
                'renderer Menu user settings language passed:',
                'renderer Menu account link URLs passed:',
                'renderer Menu profile icon-only interaction passed:',
                'renderer Menu canvas geometry passed:',
                'renderer Menu compiled viewports passed:',
                'renderer Menu horizontal flyouts passed:',
                'renderer icon gallery canonical names passed:',
                'renderer IDE Lucide icons passed:',
                'renderer History routing F9 passed:',
                'renderer mandatory index page passed:',
                'renderer Page automatic routes passed:',
                'renderer mandatory 404 page passed:',
                'renderer RestGO workspace passed:',
                'renderer RestGO pending draft close protection passed',
                'renderer RestGO browser passed:',
                'renderer CORS origin passed:',
                'renderer RestGO iframe CORS passed:',
                'renderer RestGO page Interaction passed:',
                'renderer Login configuration and F9 passed: compact editor; Aurora appearance; compact template; project styles; mobile fields at least 16px type and 44px height;',
                'renderer Login authentication passed:',
                'renderer Login recovery passed:',
                'renderer Data Grid configuration passed: table palette icon;',
                'renderer Charts configuration passed: chart-no-axes-combined palette icon;',
                'renderer Charts typography and title icon passed: native color input/change;',
                'renderer Charts fixed preview scrolling passed:',
                'renderer Charts presented screenshots passed:',
                'renderer Charts fixture restored:',
                'renderer API Client designer passed:',
                'renderer API Client authorization passed:',
                'renderer API Client response refresh passed:',
                'renderer API Client compiled authorization passed:',
                'renderer API Client body parameter hint passed',
                'renderer RestGO development login passed:',
                'renderer RestGO development connection passed:',
                'renderer RestGO API Client synchronization passed:',
                'renderer API Client browser passed:',
                'renderer Popup responsive layout passed:',
                'renderer unified themes Styles passed:',
                'renderer UX Styles editing passed:',
                'renderer UX Designer editing passed:',
                'renderer UX resize targets passed:',
                'renderer application themes runtime passed:',
                'renderer bare page members passed:',
                'renderer last project restore passed',
                'renderer bottom dock passed',
                'renderer element tree selection passed:',
                'renderer Label text wrap Inspector passed:',
                'renderer responsive viewport passed:',
                'renderer Designer toolbar contract passed:',
                'renderer bug report and documentation browser links passed',
                'renderer Monaco passed',
                'renderer Monaco nonintrusive Problems passed',
                'renderer Monaco TypeScript highlight passed:',
                'renderer Monaco autocomplete passed:',
                'renderer Monaco component members passed:',
                'renderer Monaco caret alignment passed:',
                'renderer Monaco context Enter passed:',
                'renderer empty event save cleanup passed:',
                'renderer typed Interaction authoring passed:',
                'renderer Inspector visual polish passed:',
                'renderer typed Interaction Preview passed:',
                'renderer Monaco workspace state passed:',
                'renderer Monaco workspace restored view:',
                'renderer Monaco event navigation passed:',
                'renderer F9 preview passed: Olá Ada',
                'renderer Designer/Preview button style parity passed / page available width / centered button content / 8px button corners / normal button text',
                'renderer Preview isolation passed:',
                'renderer Preview viewports passed:',
                'renderer Preview route address synchronization passed',
                'renderer Preview build error recovery passed:',
                'renderer exclusive Preview and Stop passed:',
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

  await preserveMacOSSmokeDiagnostics(
    logPath,
    path.resolve('artifacts', 'smoke', 'packaged', smokeVariant),
  );
  if (packagesSmoke) {
    await fs.cp(
      path.join(packageDirectory, 'artifacts', 'smoke', 'packages', String(child.pid)),
      path.resolve('artifacts', 'smoke', 'packaged', 'packages', String(child.pid)),
      { recursive: true },
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
