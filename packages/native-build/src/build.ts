import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { NativeBundleFormat } from '@webrad/project-model';
import type {
  NativeBuildArtifact,
  NativeBuildEvent,
  NativeBuildResult,
  NativeBuildStage,
  NativePrerequisiteReport,
} from './contracts.js';
import { generateTauriProject, type GenerateTauriProjectOptions } from './generator.js';
import { ensureSafeDirectory, isPathWithin } from './paths.js';
import { checkNativePrerequisites, findNativeTool } from './prerequisites.js';
import {
  NativeProcessError,
  nativeEnvironmentSecrets,
  redactNativeLog,
  runNativeProcess,
} from './process-runner.js';
import { createNativeBuildPlan } from './targets.js';
import { createNativeCiWorkflow } from './ci.js';
import { configureNativeMobileProject } from './mobile.js';

export interface NativeBuildOptions extends Omit<GenerateTauriProjectOptions, 'directory'> {
  readonly buildId: string;
  readonly workspaceRoot: string;
  readonly cargoTargetRoot?: string;
  readonly outputDirectory: string;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: NativeBuildEvent) => void;
}
async function workspaceRoot(directory: string): Promise<string> {
  const root = await ensureSafeDirectory(directory);
  const marker = path.join(root, '.webrad-native-workspace');
  const entries = await readdir(root);
  if (!entries.length)
    await writeFile(marker, 'WebRAD Native Build workspace v1\n', { flag: 'wx', mode: 0o600 });
  else if (
    (await lstat(marker)).isSymbolicLink() ||
    (await readFile(marker, 'utf8')) !== 'WebRAD Native Build workspace v1\n'
  )
    throw new Error('The native cache directory is not a WebRAD-owned workspace.');
  return root;
}
async function discoverArtifacts(directory: string, format: NativeBundleFormat): Promise<string[]> {
  const result: string[] = [];
  const extension = {
    nsis: '.exe',
    msi: '.msi',
    deb: '.deb',
    rpm: '.rpm',
    appimage: '.appimage',
    app: '.app',
    dmg: '.dmg',
    apk: '.apk',
    aab: '.aab',
    'ios-app': '.app',
    ipa: '.ipa',
  }[format as Exclude<NativeBundleFormat, 'web' | 'exe'>];
  const walk = async (current: string) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Artifact traversal encountered a symbolic link: ${entry.name}.`);
      if (entry.name.toLowerCase().endsWith(extension)) result.push(candidate);
      else if (entry.isDirectory()) await walk(candidate);
    }
  };
  await walk(directory);
  return result;
}
async function copyArtifact(source: string, destination: string): Promise<number> {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error('Native artifacts may not be symbolic links.');
  if (info.isDirectory()) {
    await mkdir(destination);
    let bytes = 0;
    for (const entry of await readdir(source))
      bytes += await copyArtifact(path.join(source, entry), path.join(destination, entry));
    return bytes;
  }
  if (!info.isFile() || info.size === 0)
    throw new Error('The native toolchain produced an empty or invalid artifact.');
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  return info.size;
}
async function validateArtifact(filename: string, format: NativeBundleFormat): Promise<void> {
  const info = await lstat(filename);
  if (info.isSymbolicLink()) throw new Error('A native artifact cannot be a symbolic link.');
  if (format === 'app' || format === 'ios-app') {
    if (
      !info.isDirectory() ||
      !(await lstat(path.join(filename, format === 'app' ? 'Contents/Info.plist' : 'Info.plist'))
        .then((entry) => entry.isFile() && !entry.isSymbolicLink())
        .catch(() => false))
    )
      throw new Error('The toolchain did not produce a valid application bundle.');
    return;
  }
  if (!info.isFile() || info.size < 16)
    throw new Error('The native artifact is empty or incomplete.');
  const handle = await open(filename, 'r');
  const bytes = Buffer.alloc(8);
  try {
    await handle.read(bytes, 0, bytes.length, 0);
  } finally {
    await handle.close();
  }
  const valid =
    format === 'exe' || format === 'nsis'
      ? bytes.subarray(0, 2).toString() === 'MZ'
      : ['apk', 'aab', 'ipa'].includes(format)
        ? bytes.subarray(0, 2).toString() === 'PK'
        : format === 'msi'
          ? bytes.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
          : format === 'deb'
            ? bytes.toString() === '!<arch>\n'
            : format === 'rpm'
              ? bytes.subarray(0, 4).equals(Buffer.from([0xed, 0xab, 0xee, 0xdb]))
              : format === 'appimage'
                ? bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
                : true;
  if (!valid) throw new Error(`The native toolchain produced an invalid ${format} artifact.`);
  if (format === 'dmg') {
    const trailer = Buffer.alloc(4);
    const image = await open(filename, 'r');
    try {
      if (info.size < 512) throw new Error('The DMG image is incomplete.');
      await image.read(trailer, 0, 4, info.size - 512);
    } finally {
      await image.close();
    }
    if (trailer.toString() !== 'koly')
      throw new Error('The native toolchain produced an invalid UDIF DMG image.');
  }
}
export async function buildNativeApplication(
  options: NativeBuildOptions,
): Promise<NativeBuildResult> {
  let directory = options.workspaceRoot;
  let prerequisites: NativePrerequisiteReport | undefined;
  const lines: string[] = [];
  const secrets = [
    ...nativeEnvironmentSecrets(process.env),
    ...[
      options.settings.signing.androidKeystorePathEnvironmentVariable,
      options.settings.signing.androidKeystorePasswordEnvironmentVariable,
      options.settings.signing.androidKeyAliasEnvironmentVariable,
      options.settings.signing.androidKeyPasswordEnvironmentVariable,
    ]
      .map((name) => process.env[name])
      .filter((value): value is string => Boolean(value)),
  ];
  const emit = (
    stage: NativeBuildStage,
    message: string,
    stream: 'stdout' | 'stderr' | 'info' = 'info',
  ) => {
    const safe = redactNativeLog(message, secrets);
    const event: NativeBuildEvent = {
      buildId: options.buildId,
      stage,
      message: safe,
      stream,
      timestamp: new Date().toISOString(),
    };
    lines.push(`${event.timestamp} [${stage}] [${stream}] ${safe}`);
    if (lines.length > 25_000) lines.splice(0, 1000);
    options.onEvent?.(event);
  };
  const checkCancelled = () => {
    if (options.signal?.aborted)
      throw new NativeProcessError('Native build cancelled.', 'cancelled');
  };
  try {
    checkCancelled();
    emit('preparing', 'Preparing an isolated Tauri 2 workspace.');
    const root = await workspaceRoot(options.workspaceRoot);
    directory = await mkdtemp(path.join(root, 'build-'));
    emit('generating-tauri', 'Generating the Tauri 2 project from compiled WebRAD files.');
    await generateTauriProject({ ...options, directory });
    checkCancelled();
    emit(
      'checking-dependencies',
      'Checking toolchains. No system tools are installed automatically.',
    );
    prerequisites = await checkNativePrerequisites(options.settings, {
      signal: options.signal,
      onLog: (message, stream) => emit('checking-dependencies', message, stream),
    });
    for (const check of prerequisites.checks)
      emit(
        'checking-dependencies',
        `${check.name}: ${check.status}${check.version ? ` (${check.version})` : ''}. ${check.status === 'available' ? '' : check.instruction}`,
      );
    if (!prerequisites.ready)
      throw new Error(
        'Native prerequisites are incomplete. See the dependency report and installation instructions.',
      );
    const plan = createNativeBuildPlan(options.settings);
    const cargo = await findNativeTool('cargo');
    if (!cargo) throw new Error('Cargo became unavailable after prerequisite detection.');
    const cacheKey = createHash('sha256')
      .update(JSON.stringify(options.settings))
      .update(JSON.stringify(options.files))
      .update(
        JSON.stringify(
          Object.entries(options.binaryFiles ?? {}).map(([name, content]) => [
            name,
            createHash('sha256').update(content).digest('hex'),
          ]),
        ),
      )
      .digest('hex');
    const cacheRoot = options.cargoTargetRoot ?? path.join(os.tmpdir(), 'webrad-cargo-targets');
    const cache = await ensureSafeDirectory(path.join(cacheRoot, cacheKey));
    const env = { ...process.env, CARGO_TARGET_DIR: cache, CARGO_TERM_COLOR: 'never', CI: 'true' };
    const requestedOutput = path.resolve(options.outputDirectory);
    if (isPathWithin(cache, requestedOutput) || isPathWithin(requestedOutput, cache))
      throw new Error('Native artifacts must be exported outside the Cargo target cache.');
    const run = (args: readonly string[], stage: NativeBuildStage) => {
      checkCancelled();
      emit(stage, `cargo ${args.join(' ')}`);
      return runNativeProcess({
        command: cargo,
        args,
        cwd: directory,
        env,
        signal: options.signal,
        secrets,
        onLog: (message, stream) => emit(stage, message, stream),
      });
    };
    if (plan.platform === 'android' || plan.platform === 'ios') {
      await run(
        ['tauri', plan.platform, 'init', '--ci', '--skip-targets-install'],
        'generating-tauri',
      );
      await configureNativeMobileProject(directory, options.settings);
    }
    await run(
      [
        'tauri',
        'icon',
        plan.platform === 'android' || plan.platform === 'ios'
          ? 'app-icon-mobile.png'
          : 'app-icon.png',
      ],
      'generating-tauri',
    );
    for (const command of plan.commands) await run(command.args, command.stage);
    checkCancelled();
    emit('packaging', 'Validating and collecting native artifacts.');
    const format = options.settings.build.bundleFormat;
    const profile = options.settings.build.configuration;
    const artifactRoot =
      plan.platform === 'android'
        ? path.join(
            directory,
            'src-tauri',
            'gen',
            'android',
            'app',
            'build',
            'outputs',
            format === 'apk' ? 'apk' : 'bundle',
          )
        : plan.platform === 'ios'
          ? path.join(directory, 'src-tauri', 'gen', 'apple', 'build')
          : path.join(
              cache,
              plan.cliTarget,
              profile,
              'bundle',
              format === 'app' ? 'macos' : format,
            );
    let candidates =
      format === 'exe'
        ? [path.join(cache, plan.cliTarget, profile, 'webrad-application.exe')]
        : await discoverArtifacts(artifactRoot, format);
    if (plan.platform === 'ios' && format === 'ios-app' && candidates.length > 1) {
      const exported = candidates.filter((filename) => !filename.includes('.xcarchive'));
      candidates = exported.length ? exported : candidates.slice(0, 1);
    }
    if (!candidates.length)
      throw new Error(`Tauri exited successfully but produced no ${format} artifact.`);
    if (plan.platform === 'macos' && options.settings.signing.appleNotarizationProfile) {
      const xcrun = await findNativeTool('xcrun');
      if (!xcrun) throw new Error('xcrun is required for notarization.');
      const invoke = (command: string, args: readonly string[]) =>
        runNativeProcess({
          command,
          args,
          cwd: directory,
          env,
          signal: options.signal,
          secrets,
          onLog: (message, stream) => emit('packaging', message, stream),
        });
      for (const candidate of candidates) {
        let submission = candidate;
        if (format === 'app') {
          const ditto = await findNativeTool('ditto');
          if (!ditto) throw new Error('ditto is required to archive an app for notarization.');
          submission = path.join(directory, 'notarization.zip');
          await invoke(ditto, ['-c', '-k', '--keepParent', candidate, submission]);
        }
        const result = await invoke(xcrun, [
          'notarytool',
          'submit',
          submission,
          '--keychain-profile',
          options.settings.signing.appleNotarizationProfile,
          '--wait',
          '--output-format',
          'json',
        ]);
        const response: unknown = JSON.parse(result.stdout);
        if (
          !response ||
          typeof response !== 'object' ||
          !('status' in response) ||
          response.status !== 'Accepted'
        )
          throw new Error(
            'Apple notarization did not accept the application. Inspect the retained build log.',
          );
        await invoke(xcrun, ['stapler', 'staple', candidate]);
        await invoke(xcrun, ['stapler', 'validate', candidate]);
      }
    }
    const output = await ensureSafeDirectory(options.outputDirectory);
    if (
      isPathWithin(directory, output) ||
      isPathWithin(output, directory) ||
      isPathWithin(output, root) ||
      isPathWithin(cache, output) ||
      isPathWithin(output, cache)
    )
      throw new Error('Native artifacts must be exported outside the build workspace and cache.');
    const artifacts: NativeBuildArtifact[] = [];
    for (const candidate of candidates) {
      checkCancelled();
      await validateArtifact(candidate, format);
      const destination = path.join(output, path.basename(candidate));
      const size = await copyArtifact(candidate, destination);
      artifacts.push({ path: destination, name: path.basename(destination), format, size });
    }
    emit(
      'completed',
      `${artifacts.length} native artifact(s) produced. Unsigned development artifacts may be restricted by platform distribution policies.`,
    );
    await writeFile(path.join(directory, 'native-build.log'), `${lines.join('\n')}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    return {
      buildId: options.buildId,
      status: 'completed',
      artifacts,
      workspaceDirectory: directory,
      outputDirectory: output,
      prerequisites,
    };
  } catch (error) {
    const cancelled =
      (error instanceof NativeProcessError && error.reason === 'cancelled') ||
      options.signal?.aborted === true;
    const message = redactNativeLog(
      error instanceof Error ? error.message : String(error),
      secrets,
    );
    emit(cancelled ? 'cancelled' : 'failed', message);
    if (directory !== options.workspaceRoot)
      await writeFile(path.join(directory, 'native-build.log'), `${lines.join('\n')}\n`, {
        flag: 'wx',
        mode: 0o600,
      }).catch(() => undefined);
    return {
      buildId: options.buildId,
      status: cancelled ? 'cancelled' : 'failed',
      artifacts: [],
      workspaceDirectory: directory,
      outputDirectory: options.outputDirectory,
      ...(prerequisites ? { prerequisites } : {}),
      error: message,
    };
  }
}

export async function exportNativeBuildProject(
  options: GenerateTauriProjectOptions,
): Promise<GeneratedExport> {
  const generated = await generateTauriProject(options);
  const workflow = createNativeCiWorkflow(options.settings);
  // This export belongs in the user's application repository. It never publishes the WebRAD IDE.
  await ensureSafeDirectory(path.join(generated.directory, '.github', 'workflows'));
  await writeFile(
    path.join(generated.directory, '.github', 'workflows', 'native-application.yml'),
    workflow,
    { flag: 'wx', mode: 0o600 },
  );
  return { directory: generated.directory };
}
export interface GeneratedExport {
  readonly directory: string;
}
