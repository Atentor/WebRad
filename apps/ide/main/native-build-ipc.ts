import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  clipboard,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';
import { z } from 'zod';
import { compileProject } from '@webrad/compiler';
import {
  buildNativeApplication,
  checkNativePrerequisites,
  exportNativeBuildProject,
} from '@webrad/native-build';
import {
  NativeApplicationSettingsSchema,
  parseProject,
  type WebRadProject,
} from '@webrad/project-model';
import type { NativeBuildProgress, NativeBuildResponse } from '../shared/native-build-contracts';
import { DeployDirectoryGrants } from './deploy-grants';
import { resolveDeploymentDirectory, writeDeployment } from './deploy-files';
import { saveProjectFiles } from './project-files';

const requestSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    rootPath: z.string().min(1),
    project: z.unknown(),
    userSources: z.record(z.string(), z.string()),
  })
  .strict();
const resultActionSchema = z.object({ requestId: z.string().min(1).max(128) }).strict();
const copyArtifactSchema = resultActionSchema
  .extend({ artifactIndex: z.number().int().min(0) })
  .strict();
const inspectSchema = z
  .object({ rootPath: z.string().min(1), settings: NativeApplicationSettingsSchema })
  .strict();

export interface NativeBuildIpcOptions {
  readonly inspectionLog?: (message: string) => void;
  readonly userDataPath?: string;
  readonly requireTrustedSender: (event: IpcMainInvokeEvent) => BrowserWindow;
  readonly requireProject: (
    event: IpcMainInvokeEvent,
    rootPath: string,
    projectId?: string,
  ) => void;
  readonly beforeBuild?: (event: IpcMainInvokeEvent) => void;
}

interface ActiveBuild {
  readonly requestId: string;
  readonly rootPath: string;
  readonly controller: AbortController;
}
interface CompletedBuild {
  readonly rootPath: string;
  readonly projectId: string;
  readonly result: NativeBuildResponse;
}
const active = new Map<number, ActiveBuild>();
const inspections = new Map<number, AbortController>();
const completed = new Map<number, Map<string, CompletedBuild>>();
const workspaceLocks = new Set<string>();

export function isNativeBuildRunning(owner: number): boolean {
  return active.has(owner);
}

export function cancelNativeBuildForOwner(owner: number): void {
  active.get(owner)?.controller.abort();
  inspections.get(owner)?.abort();
  inspections.delete(owner);
  completed.delete(owner);
}

function onlyArgument(input: unknown[]): unknown {
  if (input.length !== 1) throw new Error('Native Build requires exactly one argument.');
  return input[0];
}

/** Static model URLs and an explicit allowlist; authored TypeScript is never parsed as configuration. */
export function nativeNetworkOrigins(project: WebRadProject): string[] {
  const origins = new Set<string>(project.settings.nativeApplication.security.networkOrigins);
  const add = (value: unknown): void => {
    if (typeof value !== 'string') return;
    try {
      const url = new URL(value);
      if (
        ['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        origins.add(url.origin);
    } catch {
      /* Relative assets stay within the bundled frontend. */
    }
  };
  if (project.settings.restGo.enabled) add(project.settings.restGo.baseUrl);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, member] of Object.entries(value)) {
      if (
        [
          'baseUrl',
          'url',
          'path',
          'endpoint',
          'src',
          'source',
          'poster',
          'sourceUrl',
          'posterUrl',
        ].includes(key)
      )
        add(member);
      if (typeof member === 'object' && member !== null) visit(member);
    }
  };
  for (const document of [...project.pages, ...project.reusableElements]) {
    for (const component of Object.values(document.components)) visit(component.props);
  }
  for (const variable of project.settings.environmentVariables)
    add(variable.values[project.settings.build.environment]);
  return [...origins].sort();
}

export function registerNativeBuildIpc(options: NativeBuildIpcOptions): void {
  ipcMain.handle('webrad:native-build:inspect', async (event, ...input: unknown[]) => {
    options.requireTrustedSender(event);
    const request = inspectSchema.parse(onlyArgument(input));
    options.requireProject(event, request.rootPath);
    const owner = event.sender.id;
    inspections.get(owner)?.abort();
    const controller = new AbortController();
    inspections.set(owner, controller);
    try {
      const report = await checkNativePrerequisites(request.settings, {
        signal: controller.signal,
        onLog: options.inspectionLog,
      });
      controller.signal.throwIfAborted();
      options.requireTrustedSender(event);
      options.requireProject(event, request.rootPath);
      return report;
    } finally {
      if (inspections.get(owner) === controller) inspections.delete(owner);
    }
  });
  // Picker capabilities deliberately live only for this IDE session. Saved project paths grant no access.
  const grants = new DeployDirectoryGrants();
  const choose = async (event: IpcMainInvokeEvent, rootPath: string): Promise<string | null> => {
    options.requireProject(event, rootPath);
    const selection = await dialog.showOpenDialog(options.requireTrustedSender(event), {
      title: 'Choose a folder for application builds',
      properties: ['openDirectory', 'createDirectory'],
    });
    options.requireProject(event, rootPath);
    if (selection.canceled || selection.filePaths[0] === undefined) return null;
    const root = await fs.realpath(rootPath);
    const destination = await resolveDeploymentDirectory(root, selection.filePaths[0]);
    await grants.grant(root, 'native-build-output', destination);
    return destination;
  };

  ipcMain.handle('webrad:native-build:choose-directory', (event, ...input: unknown[]) =>
    choose(event, z.string().min(1).parse(onlyArgument(input))),
  );

  const run = async (
    event: IpcMainInvokeEvent,
    input: unknown,
    exportCi: boolean,
  ): Promise<NativeBuildResponse> => {
    options.requireTrustedSender(event);
    const request = requestSchema.parse(input);
    const project = parseProject(request.project);
    options.requireProject(event, request.rootPath, project.id);
    const owner = event.sender.id;
    if (active.has(owner))
      throw new Error('An application build is already running in this window.');
    if (completed.get(owner)?.has(request.requestId))
      throw new Error('Build request IDs must be unique.');
    options.beforeBuild?.(event);
    const controller = new AbortController();
    active.set(owner, { requestId: request.requestId, rootPath: request.rootPath, controller });
    let workspaceKey: string | undefined;
    let outputDirectory: string | undefined;
    let configuredOutputDirectory: string | undefined;
    const progress = (
      stage: NativeBuildProgress['stage'],
      message: string,
      stream: NativeBuildProgress['stream'] = 'info',
    ): void => {
      if (!event.sender.isDestroyed())
        event.sender.send('webrad:native-build:progress', {
          requestId: request.requestId,
          stage,
          message,
          stream,
        } satisfies NativeBuildProgress);
    };
    const check = (): void => {
      controller.signal.throwIfAborted();
      options.requireProject(event, request.rootPath, project.id);
    };
    try {
      progress(
        'preparing',
        exportCi ? 'Preparing a standalone CI build project.' : 'Preparing application build.',
      );
      const root = await fs.realpath(request.rootPath);
      check();
      workspaceKey = createHash('sha256')
        .update(root)
        .update('\0')
        .update(project.id)
        .digest('hex');
      if (workspaceLocks.has(workspaceKey)) {
        workspaceKey = undefined;
        throw new Error('This project is already being built in another window.');
      }
      workspaceLocks.add(workspaceKey);
      const settings = project.settings.nativeApplication;
      if (exportCi && settings.build.platform === 'web')
        throw new Error('Select a native platform to export a Tauri CI project.');
      let destination = settings.build.outputDirectory.trim()
        ? await resolveDeploymentDirectory(root, settings.build.outputDirectory)
        : null;
      // Build explicitly authorizes an absolute destination for this request.
      // Relative defaults still require selection; all paths retain validation.
      if (
        destination === null ||
        (!path.isAbsolute(settings.build.outputDirectory) &&
          !(await grants.has(root, 'native-build-output', destination)))
      ) {
        destination = await choose(event, request.rootPath);
        if (destination === null) controller.abort();
      }
      check();
      if (destination === null) throw new Error('An output folder is required.');
      configuredOutputDirectory = destination;
      const folderName = Array.from(project.name, (character) =>
        character.charCodeAt(0) < 32 ? '_' : character,
      )
        .join('')
        .replace(/[<>:"/\\|?*]/gu, '_')
        .replace(/[. ]+$/u, '')
        .trim();
      if (
        !folderName ||
        folderName === '.' ||
        folderName === '..' ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(folderName)
      )
        throw new Error('The project name cannot be used as an output folder.');
      const finalOutput = await resolveDeploymentDirectory(
        root,
        path.join(destination, folderName),
      );
      // Build separately so compilation failures preserve the previous output.
      outputDirectory = path.join(
        destination,
        `${exportCi ? 'ci-project' : settings.build.platform}-${randomUUID()}`,
      );
      const savedProject = {
        ...project,
        settings: {
          ...project.settings,
          nativeApplication: {
            ...settings,
            build: { ...settings.build, outputDirectory: destination },
          },
        },
      };
      await saveProjectFiles({
        rootPath: root,
        project: savedProject,
        userSources: request.userSources,
      });
      check();
      progress('compiling-webrad', 'Compiling pages, components and authored TypeScript.');
      const web = settings.build.platform === 'web';
      const compilation = await compileProject(savedProject, {
        outputDirectory,
        userSources: request.userSources,
        write: false,
        target: web ? 'deploy' : 'native',
        minify: settings.build.configuration === 'release' && project.settings.build.minify,
        sourcemap: project.settings.build.sourceMaps,
      });
      check();
      if (!compilation.success) {
        progress('failed', 'WebRAD compilation failed. See compiler diagnostics.');
        return {
          requestId: request.requestId,
          success: false,
          outputDirectory,
          configuredOutputDirectory,
          artifacts: [],
          diagnostics: compilation.diagnostics,
        };
      }
      const networkOrigins = nativeNetworkOrigins(savedProject);
      const nativeSettings = {
        ...settings,
        icon: settings.icon ?? project.settings.applicationIcon,
      };
      let response: NativeBuildResponse;
      if (web) {
        progress('packaging', 'Writing the Web/PWA application.');
        await writeDeployment({
          projectRoot: root,
          destination: outputDirectory,
          projectId: project.id,
          files: compilation.files,
          binaryFiles: compilation.binaryFiles,
          onFileWritten: check,
        });
        check();
        response = {
          requestId: request.requestId,
          success: true,
          outputDirectory,
          artifacts: [{ path: path.join(outputDirectory, 'index.html'), format: 'web' }],
          diagnostics: compilation.diagnostics,
          prerequisites: await checkNativePrerequisites(settings, { signal: controller.signal }),
        };
      } else if (exportCi) {
        progress('generating-tauri', 'Generating the standalone Tauri project and workflow.');
        await exportNativeBuildProject({
          settings: nativeSettings,
          files: compilation.files,
          binaryFiles: compilation.binaryFiles,
          directory: outputDirectory,
          networkOrigins,
        });
        check();
        await fs.stat(path.join(outputDirectory, 'src-tauri', 'tauri.conf.json'));
        response = {
          requestId: request.requestId,
          success: true,
          outputDirectory,
          artifacts: [{ path: outputDirectory, format: 'ci-project' }],
          diagnostics: compilation.diagnostics,
        };
      } else {
        const result = await buildNativeApplication({
          buildId: request.requestId,
          settings: nativeSettings,
          files: compilation.files,
          binaryFiles: compilation.binaryFiles,
          networkOrigins,
          cargoTargetRoot: path.join(
            options.userDataPath ?? path.join(os.tmpdir(), 'webrad-native-build'),
            'cargo-targets',
          ),
          workspaceRoot: path.join(
            options.userDataPath ?? path.join(os.tmpdir(), 'webrad-native-build'),
            'native-build',
            workspaceKey,
          ),
          outputDirectory,
          signal: controller.signal,
          onEvent: (entry) => progress(entry.stage, entry.message, entry.stream),
        });
        const dependencyErrors =
          result.prerequisites?.checks
            .filter((entry) => entry.status !== 'available')
            .map((entry) => ({
              category: 'error' as const,
              source: 'ide' as const,
              message: `${entry.name}${entry.version ? ` (${entry.version})` : ''}${entry.minimumVersion ? `; minimum ${entry.minimumVersion}` : ''}: ${entry.instruction}`,
            })) ?? [];
        response = {
          requestId: request.requestId,
          success: result.status === 'completed' && result.artifacts.length > 0,
          cancelled: result.status === 'cancelled',
          outputDirectory,
          artifacts: result.status === 'completed' ? result.artifacts : [],
          ...(result.prerequisites ? { prerequisites: result.prerequisites } : {}),
          diagnostics: [
            ...compilation.diagnostics,
            ...dependencyErrors,
            ...(result.error
              ? [{ category: 'error' as const, source: 'ide' as const, message: result.error }]
              : []),
          ],
        };
      }
      if (response.success) {
        const rejectLinks = async (directory: string): Promise<void> => {
          for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink())
              throw new Error('Build output cannot contain symbolic links or junctions.');
            if (entry.isDirectory()) await rejectLinks(path.join(directory, entry.name));
          }
        };
        await fs.mkdir(finalOutput, { recursive: true });
        await rejectLinks(finalOutput);
        check();
        await fs.cp(outputDirectory, finalOutput, { recursive: true, force: true });
        const stagingOutput = outputDirectory;
        response = {
          ...response,
          outputDirectory: finalOutput,
          artifacts: response.artifacts.map((artifact) => ({
            ...artifact,
            path: path.join(finalOutput, path.relative(stagingOutput, artifact.path)),
          })),
        };
        // This is the fresh per-request staging child created above, never the configured destination.
        if (path.dirname(stagingOutput) === destination && stagingOutput !== finalOutput)
          await fs.rm(stagingOutput, { recursive: true, force: true });
        outputDirectory = finalOutput;
      }
      response = { ...response, configuredOutputDirectory };
      if (response.success) {
        check();
        const results = completed.get(owner) ?? new Map<string, CompletedBuild>();
        results.set(request.requestId, {
          rootPath: request.rootPath,
          projectId: project.id,
          result: response,
        });
        while (results.size > 20) {
          const key = results.keys().next().value;
          if (key === undefined) break;
          results.delete(key);
        }
        completed.set(owner, results);
      }
      progress(
        response.cancelled ? 'cancelled' : response.success ? 'completed' : 'failed',
        response.success
          ? 'Application artifacts are ready.'
          : response.cancelled
            ? 'Build cancelled.'
            : 'Build failed. See diagnostics.',
      );
      return response;
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = cancelled
        ? 'Build cancelled.'
        : error instanceof Error
          ? error.message
          : 'Native build failed.';
      progress(cancelled ? 'cancelled' : 'failed', message);
      return {
        requestId: request.requestId,
        success: false,
        cancelled,
        outputDirectory,
        configuredOutputDirectory,
        artifacts: [],
        diagnostics: [{ category: cancelled ? 'info' : 'error', source: 'ide', message }],
      };
    } finally {
      active.delete(owner);
      if (workspaceKey !== undefined) workspaceLocks.delete(workspaceKey);
    }
  };
  ipcMain.handle('webrad:native-build:run', (event, ...input: unknown[]) =>
    run(event, onlyArgument(input), false),
  );
  ipcMain.handle('webrad:native-build:export-ci', (event, ...input: unknown[]) =>
    run(event, onlyArgument(input), true),
  );
  ipcMain.handle('webrad:native-build:cancel', (event, ...input: unknown[]) => {
    options.requireTrustedSender(event);
    const requestId = z.string().min(1).max(128).parse(onlyArgument(input));
    const build = active.get(event.sender.id);
    if (build?.requestId === requestId) build.controller.abort();
  });

  const resultFor = (event: IpcMainInvokeEvent, requestId: string): CompletedBuild => {
    options.requireTrustedSender(event);
    const build = completed.get(event.sender.id)?.get(requestId);
    if (build === undefined) throw new Error('No completed build belongs to this window.');
    options.requireProject(event, build.rootPath, build.projectId);
    return build;
  };
  ipcMain.handle('webrad:native-build:open-output', async (event, ...input: unknown[]) => {
    const request = resultActionSchema.parse(onlyArgument(input));
    const build = resultFor(event, request.requestId);
    const directory = build.result.outputDirectory;
    if (directory === undefined) throw new Error('This build has no output folder.');
    await resolveDeploymentDirectory(build.rootPath, directory);
    if (!(await fs.stat(directory)).isDirectory())
      throw new Error('The output folder no longer exists.');
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
  });
  ipcMain.handle('webrad:native-build:copy-artifact', async (event, ...input: unknown[]) => {
    const request = copyArtifactSchema.parse(onlyArgument(input));
    const build = resultFor(event, request.requestId);
    const artifact = build.result.artifacts[request.artifactIndex];
    if (artifact === undefined) throw new Error('Unknown build artifact.');
    const directory = build.result.outputDirectory;
    if (directory === undefined) throw new Error('This build has no output folder.');
    await resolveDeploymentDirectory(build.rootPath, directory);
    const relative = path.relative(directory, artifact.path);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error('Artifact is outside the build output.');
    let current = directory;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if ((await fs.lstat(current)).isSymbolicLink())
        throw new Error('Linked artifacts are not allowed.');
    }
    await fs.stat(artifact.path);
    clipboard.writeText(artifact.path);
  });
}
