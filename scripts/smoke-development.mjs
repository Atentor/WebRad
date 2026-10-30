import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { waitForDevelopmentSmoke } from './smoke-process.mjs';
import { preserveMacOSSmokeDiagnostics } from './smoke-macos-diagnostics.mjs';

const forgeCli = path.resolve(
  'node_modules',
  '@electron-forge',
  'cli',
  'dist',
  'electron-forge.js',
);
const fixtureDirectory = path.resolve('examples', 'hello-webrad');
const temporaryRoot = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-development-smoke-')),
);
const logPath = path.join(temporaryRoot, 'webrad-smoke.log');
const projectDirectory = path.join(temporaryRoot, 'hello-webrad');
const projectPath = path.join(projectDirectory, 'HelloWebRad.wrproj');
const resourceSmoke = process.argv.includes('--webrad-smoke-resources');
const debuggerSmoke = process.argv.includes('--webrad-smoke-debugger');
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
      : debuggerSmoke
        ? 'debugger'
        : resourceSmoke
          ? 'resources'
          : 'standard';

async function preserveFailureDiagnostics(error) {
  const artifactRoot = path.resolve('artifacts', 'smoke', 'development', smokeVariant);
  await fs.mkdir(artifactRoot, { recursive: true });
  const destination = await fs.mkdtemp(path.join(artifactRoot, 'failure-'));
  await fs.writeFile(
    path.join(destination, 'failure.json'),
    `${JSON.stringify(
      {
        runner: 'development',
        variant: smokeVariant,
        platform: process.platform,
        arch: process.arch,
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
  ]) {
    await fs.cp(source, target, { recursive: true }).catch((copyError) => {
      if (copyError.code !== 'ENOENT') throw copyError;
    });
  }
  process.stderr.write(`[IDE] Development smoke diagnostics preserved: ${destination}\n`);
}

try {
  await fs.cp(fixtureDirectory, projectDirectory, { recursive: true });
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
      `--user-data-dir=${path.join(temporaryRoot, 'chromium')}`,
      ...(updateSmoke ? ['--webrad-smoke-updates'] : []),
      ...(nativeBuildSmoke ? ['--webrad-smoke-native-build'] : []),
      ...(resourceSmoke || debuggerSmoke || deploySmoke
        ? [
            debuggerSmoke
              ? '--webrad-smoke-debugger'
              : deploySmoke
                ? '--webrad-smoke-deploy'
                : '--webrad-smoke-resources',
          ]
        : []),
      `--webrad-smoke-project=${projectPath}`,
      ...(screenshotArgument === undefined ? [] : [screenshotArgument]),
    ],
    { stdio: 'inherit', windowsHide: true, detached: process.platform !== 'win32' },
  );

  const { exitCode, timedOut, terminationError } = await waitForDevelopmentSmoke(child, {
    logPath,
    functionalTimeoutMilliseconds: debuggerSmoke ? 180_000 : 120_000,
    processGroup: process.platform !== 'win32',
  });
  const timeoutDetails =
    (timedOut === undefined
      ? ''
      : `; ${timedOut.phase} timeout after ${String(timedOut.milliseconds / 1000)}s; last progress: ${timedOut.lastProgress}`) +
    (terminationError === undefined ? '' : `; process cleanup failed: ${terminationError}`);

  const log = await fs.readFile(logPath, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(
      `Development smoke failed before creating its log (exit ${String(exitCode)}${timeoutDetails}; expected ${logPath}). Check the Electron startup output above. On Linux, chrome-sandbox must be owned by root and have mode 4755.`,
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
          'renderer project Explorer collapse and search passed',
          'renderer project Explorer duplication and persistence passed',
          'renderer project Explorer keyboard, filtered results and inline rename passed',
          'renderer project Explorer confirmed deletion and persistence passed',
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
          'renderer New Project template chooser passed: blank and Aurora Workspace / all visual components / Default styles / vertical left sidebar / progress bars, rings and circles / visible user profile / Nonvisual and PokeAPI / RestGO account lifecycle / shared AuroraMenu / Aurora, Prism, Flat and WebRAD Light/Dark themes / WebRAD square controls / theme-aware previews / fixed creation actions / HTML example / Flat white and graphite surfaces, softer blue and 8px cards/buttons / Flat brighter blue hover / left-aligned template buttons / all-theme medium button text and 27px icons / Prism brighter hover / WebRAD pressed state',
          'renderer application icon passed',
          'renderer project open passed',
          'renderer Native Application settings passed',
          'renderer Project Settings draft protection and validation navigation passed',
          'renderer Native Build result target attribution passed',
          'renderer Native Build settings separation passed',
          'renderer Native Build platform options passed:',
          'renderer Native Build requirements checklist passed:',
          'renderer Native Build CI export passed:',
          'renderer Page browser title Inspector and F9 passed:',
          'renderer Panel floating Inspector and F9 passed:',
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
          'renderer Data Grid configuration passed:',
          'renderer Timer Inspector and Interact passed:',
          'renderer Lucide Icons Inspector and F9 passed:',
          'renderer HTML Inspector and F9 passed:',
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
          'renderer API Client designer passed:',
          'renderer API Client body parameter hint passed',
          'renderer RestGO development login passed:',
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
          'renderer typed Interaction Preview passed:',
          'renderer Monaco workspace state passed:',
          'renderer Monaco workspace restored view:',
          'renderer Monaco event navigation passed:',
          'renderer F9 preview passed: Olá Ada',
          'renderer Designer/Preview button style parity passed / page available width / left-aligned button content / 8px button corners / medium button text',
          'renderer Preview isolation passed:',
          'renderer Preview viewports passed:',
          'renderer Preview route address synchronization passed',
          'renderer Preview build error recovery passed:',
          'renderer exclusive Preview and Stop passed:',
        ];
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
          'renderer Project Settings draft protection and validation navigation passed',
          'renderer Native Build result target attribution passed',
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
        : standardEvidence;
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
      `Development smoke failed (exit ${String(exitCode)}${timeoutDetails}; missing ${missingEvidence.join(', ') || 'nothing'}).\n${log}`,
    );
  }

  await preserveMacOSSmokeDiagnostics(
    logPath,
    path.resolve('artifacts', 'smoke', 'development', smokeVariant),
  );
  process.stdout.write(log);
} catch (error) {
  await preserveFailureDiagnostics(error).catch((diagnosticError) => {
    process.stderr.write(
      `[IDE] Could not preserve development smoke diagnostics: ${diagnosticError}\n`,
    );
  });
  throw error;
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
