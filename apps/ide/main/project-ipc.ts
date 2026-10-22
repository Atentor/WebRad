import { readSelectedProjectAsset } from './project-asset';
import {
  cancelNativeBuildForOwner,
  isNativeBuildRunning,
  registerNativeBuildIpc,
} from './native-build-ipc';
import { EXTERNAL_LINKS } from '../shared/external-links';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, shell } from 'electron';
import { compileProject, compileTailwindStyles } from '@webrad/compiler';
import { parseComponentStyle, parseProject } from '@webrad/project-model';
import { z } from 'zod';
import type {
  BuildRequest,
  BuildResponse,
  CompileStylesRequest,
  CompileStylesResponse,
  CreateProjectRequest,
  DeployProgress,
  DeployResponse,
  ProjectSession,
  ReadFileRequest,
  SaveProjectRequest,
  WriteFileRequest,
} from '../shared/contracts';
import {
  createProjectFiles,
  loadProjectFiles,
  resolveNewProjectRoot,
  resolveInsideProjectSecure,
  saveProjectFiles,
} from './project-files';
import { publishPreviewHtml, revokePreview } from './preview-server';
import { LastProjectStore } from './last-project';
import { registerRestGoAdminIpc } from './restgo-admin-ipc';
import {
  forgetDebuggerOwner,
  registerDebuggerIpc,
  stopDebuggerForOwner,
  type DebugCompilation,
} from './debugger-ipc';
import type { DebugStartRequest } from '../shared/debugger-contracts';
import { DeployDirectoryGrants } from './deploy-grants';
import {
  resolveDeploymentDirectory,
  validateDeploymentDestination,
  writeDeployment,
} from './deploy-files';

const allowedRoots = new Map<number, Set<string>>();
const activeProjectRoots = new Map<number, string>();
const openedProjectIds = new Map<number, Map<string, string>>();
const deployingWindows = new Set<number>();
const compilingWindows = new Set<number>();
const projectSelectionRevisions = new Map<number, number>();
const trustedRendererUrls = new Map<number, string>();
const dirtyWindows = new Set<number>();
const pendingClose = new Set<number>();
const closeApproved = new Set<number>();
let registered = false;

const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
  })
  .strict();

const saveProjectSchema = z
  .object({
    rootPath: z.string().min(1),
    project: z.unknown(),
    userSources: z.record(z.string(), z.string()),
  })
  .strict();

const saveProjectAsSchema = saveProjectSchema.omit({ rootPath: true }).strict();
const releaseRootSchema = z.string().min(1);

const readFileSchema = z
  .object({ rootPath: z.string().min(1), relativePath: z.string().min(1) })
  .strict();

const writeFileSchema = readFileSchema.extend({ content: z.string() }).strict();
const buildRequestSchema = saveProjectSchema
  .extend({ outputDirectory: z.string().min(1).optional() })
  .strict();
const deployRequestSchema = saveProjectSchema
  .extend({ requestId: z.string().min(1).max(128) })
  .strict();
const compileStylesRequestSchema = z.object({ styles: z.array(z.unknown()) }).strict();

function normalizedRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('The project operation did not originate from a WebRAD window.');
  return window;
}

export function requireTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const window = senderWindow(event);
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Project IPC is restricted to the IDE main frame.');
  }
  const trustedUrl = trustedRendererUrls.get(window.webContents.id);
  if (trustedUrl === undefined || new URL(event.senderFrame.url).href !== trustedUrl) {
    throw new Error('Project IPC did not originate from the trusted WebRAD renderer URL.');
  }
  return window;
}

function grantRoot(event: IpcMainInvokeEvent, rootPath: string, projectId: string): void {
  const window = requireTrustedSender(event);
  const roots = allowedRoots.get(window.webContents.id) ?? new Set<string>();
  roots.add(normalizedRoot(rootPath));
  allowedRoots.set(window.webContents.id, roots);
  activeProjectRoots.set(window.webContents.id, normalizedRoot(rootPath));
  const projects = openedProjectIds.get(window.webContents.id) ?? new Map<string, string>();
  projects.set(normalizedRoot(rootPath), projectId);
  openedProjectIds.set(window.webContents.id, projects);
}

function requireGrantedRoot(event: IpcMainInvokeEvent, rootPath: string): void {
  const window = requireTrustedSender(event);
  if (!allowedRoots.get(window.webContents.id)?.has(normalizedRoot(rootPath))) {
    throw new Error('The renderer requested a filesystem operation outside an opened project.');
  }
}

async function chooseDirectory(title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function ensureNewDestination(rootPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(rootPath);
    if (entries.length > 0) throw new Error(`The destination folder "${rootPath}" is not empty.`);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}

async function createProjectHandler(
  event: IpcMainInvokeEvent,
  input: CreateProjectRequest,
): Promise<ProjectSession | null> {
  requireTrustedSender(event);
  const request = createProjectSchema.parse(input);
  // Directory capabilities always come from a native picker, never an arbitrary renderer path.
  const parentPath = await chooseDirectory(
    'Choose the folder that will contain the new WebRAD project',
  );
  if (!parentPath) return null;
  const rootPath = resolveNewProjectRoot(parentPath, request.name);
  await ensureNewDestination(rootPath);
  const session = await createProjectFiles(rootPath, request.name);

  return session;
}

async function openProjectHandler(
  event: IpcMainInvokeEvent,
  automatedProjectPath?: string,
): Promise<ProjectSession | null> {
  const window = requireTrustedSender(event);
  if (automatedProjectPath !== undefined) {
    // Only the main process can supply this path, and only the packaged smoke does so.
    // It is never accepted from renderer IPC input.
    const session = await loadProjectFiles(automatedProjectPath);

    return session;
  }
  const result = await dialog.showOpenDialog(window, {
    title: 'Open WebRAD project',
    properties: ['openFile'],
    filters: [
      { name: 'WebRAD project', extensions: ['wrproj'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const session = await loadProjectFiles(result.filePaths[0]);

  return session;
}

async function saveProjectHandler(
  event: IpcMainInvokeEvent,
  input: SaveProjectRequest,
): Promise<ProjectSession> {
  const request = saveProjectSchema.parse(input);
  requireGrantedRoot(event, request.rootPath);
  return saveProjectFiles({
    rootPath: request.rootPath,
    project: parseProject(request.project),
    userSources: request.userSources,
  });
}

async function saveProjectAsHandler(
  event: IpcMainInvokeEvent,
  input: Omit<SaveProjectRequest, 'rootPath'>,
): Promise<ProjectSession | null> {
  requireTrustedSender(event);
  const request = saveProjectAsSchema.parse(input);
  const project = parseProject(request.project);
  const parentDirectory = await chooseDirectory('Choose a folder for the WebRAD project');
  if (!parentDirectory) return null;
  const rootPath = path.join(parentDirectory, project.name);
  await ensureNewDestination(rootPath);
  const session = await saveProjectFiles({ rootPath, project, userSources: request.userSources });

  return session;
}

async function releaseProjectHandler(event: IpcMainInvokeEvent, input: unknown): Promise<void> {
  const window = requireTrustedSender(event);
  const rootPath = releaseRootSchema.parse(input);
  allowedRoots.get(window.webContents.id)?.delete(normalizedRoot(rootPath));
  openedProjectIds.get(window.webContents.id)?.delete(normalizedRoot(rootPath));
  if (activeProjectRoots.get(window.webContents.id) === normalizedRoot(rootPath)) {
    cancelNativeBuildForOwner(window.webContents.id);
    activeProjectRoots.delete(window.webContents.id);
    revokePreview(window.webContents.id);
    stopDebuggerForOwner(window.webContents.id);
  }
}

async function readFileHandler(event: IpcMainInvokeEvent, input: ReadFileRequest): Promise<string> {
  const request = readFileSchema.parse(input);
  requireGrantedRoot(event, request.rootPath);
  return fs.readFile(
    await resolveInsideProjectSecure(request.rootPath, request.relativePath),
    'utf8',
  );
}

async function writeFileHandler(event: IpcMainInvokeEvent, input: WriteFileRequest): Promise<void> {
  const request = writeFileSchema.parse(input);
  requireGrantedRoot(event, request.rootPath);
  const target = await resolveInsideProjectSecure(request.rootPath, request.relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, request.content, 'utf8');
}

async function buildHandler(
  event: IpcMainInvokeEvent,
  input: BuildRequest,
): Promise<BuildResponse> {
  const request = buildRequestSchema.parse(input);
  requireGrantedRoot(event, request.rootPath);
  return withCompilation(event.sender.id, async () => {
    stopDebuggerForOwner(event.sender.id);
    revokePreview(event.sender.id);
    const project = parseProject(request.project);
    await saveProjectFiles({
      rootPath: request.rootPath,
      project,
      userSources: request.userSources,
    });
    const outputDirectory = await resolveInsideProjectSecure(
      request.rootPath,
      request.outputDirectory ?? project.settings.outputDirectory,
    );
    const result = await compileProject(project, {
      outputDirectory,
      userSources: request.userSources,
    });
    const previewUrl =
      result.success && result.previewHtml
        ? await publishPreviewHtml(event.sender.id, result.previewHtml, project.assets ?? [])
        : undefined;
    return {
      success: result.success,
      outputDirectory,
      previewUrl,
      diagnostics: result.diagnostics,
    };
  });
}

async function withCompilation<T>(owner: number, operation: () => Promise<T>): Promise<T> {
  if (isNativeBuildRunning(owner) || compilingWindows.has(owner) || deployingWindows.has(owner))
    throw new Error('Wait for the application build to finish.');
  compilingWindows.add(owner);
  try {
    return await operation();
  } finally {
    compilingWindows.delete(owner);
  }
}

async function chooseDeploymentDirectory(
  event: IpcMainInvokeEvent,
  rootPath: string,
  projectId: string,
  grants: DeployDirectoryGrants,
  defaultPath?: string,
): Promise<string | null> {
  requireGrantedRoot(event, rootPath);
  const result = await dialog.showOpenDialog(requireTrustedSender(event), {
    title: 'Choose a folder for the hosted application',
    properties: ['openDirectory', 'createDirectory'],
    ...(defaultPath === undefined ? {} : { defaultPath }),
  });
  if (result.canceled || result.filePaths[0] === undefined) return null;
  requireGrantedRoot(event, rootPath);
  const destination = await resolveDeploymentDirectory(rootPath, result.filePaths[0]);
  await validateDeploymentDestination(destination, projectId);
  await grants.grant(await fs.realpath(rootPath), projectId, destination);
  return destination;
}

async function deployHandler(
  event: IpcMainInvokeEvent,
  input: unknown,
  grants: DeployDirectoryGrants,
): Promise<DeployResponse> {
  const request = deployRequestSchema.parse(input);
  requireGrantedRoot(event, request.rootPath);
  const project = parseProject(request.project);
  const id = event.sender.id;
  if (isNativeBuildRunning(id) || compilingWindows.has(id))
    throw new Error('Wait for the application build to finish.');
  if (openedProjectIds.get(id)?.get(normalizedRoot(request.rootPath)) !== project.id) {
    throw new Error('Deploy must belong to the opened project.');
  }
  if (deployingWindows.has(id)) throw new Error('A deployment is already running in this window.');
  deployingWindows.add(id);
  const progress = (value: Omit<DeployProgress, 'requestId'>): void => {
    event.sender.send('webrad:deploy:progress', {
      requestId: request.requestId,
      ...value,
    } satisfies DeployProgress);
  };
  try {
    const root = await fs.realpath(request.rootPath);
    let destination = await resolveDeploymentDirectory(
      root,
      project.settings.build.deployDirectory,
    );
    if (!(await grants.has(root, project.id, destination))) {
      const selected = await chooseDeploymentDirectory(
        event,
        root,
        project.id,
        grants,
        destination,
      );
      if (selected === null)
        return {
          success: false,
          cancelled: true,
          diagnostics: [{ category: 'info', source: 'ide', message: 'Deploy canceled.' }],
        };
      destination = selected;
    }
    const savedProject = {
      ...project,
      settings: {
        ...project.settings,
        build: { ...project.settings.build, deployDirectory: destination },
      },
    };
    await saveProjectFiles({
      rootPath: request.rootPath,
      project: savedProject,
      userSources: request.userSources,
    });
    await validateDeploymentDestination(destination, project.id);
    progress({ phase: 'compiling', completedFiles: 0, totalFiles: 0 });
    const result = await compileProject(
      {
        ...savedProject,
        settings: {
          ...savedProject.settings,
          environment: savedProject.settings.build.environment,
        },
      },
      {
        outputDirectory: destination,
        userSources: request.userSources,
        target: 'deploy',
        minify: project.settings.build.minify,
        sourcemap: project.settings.build.sourceMaps,
        write: false,
      },
    );
    if (!result.success)
      return { success: false, outputDirectory: destination, diagnostics: result.diagnostics };
    requireGrantedRoot(event, request.rootPath);
    const totalFiles =
      Object.keys(result.files).length + Object.keys(result.binaryFiles ?? {}).length;
    progress({ phase: 'writing', completedFiles: 0, totalFiles });
    const written = await writeDeployment({
      projectRoot: root,
      destination,
      projectId: project.id,
      files: result.files,
      binaryFiles: result.binaryFiles,
      onFileWritten: (completedFiles, total, currentFile) => {
        requireGrantedRoot(event, request.rootPath);
        progress({ phase: 'writing', completedFiles, totalFiles: total, currentFile });
      },
    });
    progress({
      phase: 'complete',
      completedFiles: written.fileCount,
      totalFiles: written.fileCount,
    });
    return {
      success: true,
      outputDirectory: destination,
      fileCount: written.fileCount,
      diagnostics:
        written.cleanupWarning === undefined
          ? result.diagnostics
          : [
              ...result.diagnostics,
              { category: 'warning', source: 'ide', message: written.cleanupWarning },
            ],
    };
  } catch (error) {
    return {
      success: false,
      diagnostics: [
        {
          category: 'error',
          source: 'ide',
          message: error instanceof Error ? error.message : 'Deploy failed.',
        },
      ],
    };
  } finally {
    deployingWindows.delete(id);
  }
}

async function debugCompileHandler(
  event: IpcMainInvokeEvent,
  request: DebugStartRequest,
): Promise<DebugCompilation> {
  requireGrantedRoot(event, request.rootPath);
  return withCompilation(event.sender.id, async () => {
    const project = parseProject(request.project);
    await saveProjectFiles({
      rootPath: request.rootPath,
      project,
      userSources: request.userSources,
    });
    const outputDirectory = await resolveInsideProjectSecure(
      request.rootPath,
      request.outputDirectory ?? project.settings.outputDirectory,
    );
    const result = await compileProject(project, {
      outputDirectory,
      userSources: request.userSources,
      debug: true,
      write: false,
    });
    return {
      build: { success: result.success, outputDirectory, diagnostics: result.diagnostics },
      sourceMap: result.debug?.sourceMap,
      scriptUrl: result.debug?.scriptUrl,
      previewHtml: result.previewHtml,
      assets: project.assets ?? [],
    };
  });
}

async function compileStylesHandler(
  event: IpcMainInvokeEvent,
  input: CompileStylesRequest,
): Promise<CompileStylesResponse> {
  requireTrustedSender(event);
  const request = compileStylesRequestSchema.parse(input);
  const styles = request.styles.map((style) => parseComponentStyle(style));
  return { css: await compileTailwindStyles(styles) };
}

export function hasUnsavedProjectChanges(): boolean {
  return dirtyWindows.size > 0;
}

export function installDirtyGuard(window: BrowserWindow, trustedRendererUrl: string): void {
  const windowId = window.webContents.id;
  trustedRendererUrls.set(windowId, new URL(trustedRendererUrl).href);
  window.on('close', (event) => {
    const id = windowId;
    if (closeApproved.delete(id) || !dirtyWindows.has(id)) return;
    event.preventDefault();
    const response = dialog.showMessageBoxSync(window, {
      type: 'question',
      title: 'Unsaved changes',
      message: 'Save changes before closing WebRAD?',
      buttons: ['Save Changes', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 0) {
      pendingClose.add(id);
      window.webContents.send('webrad:menu-command', 'file.save');
    } else if (response === 1) {
      dirtyWindows.delete(id);
      closeApproved.add(id);
      window.close();
    }
  });
  window.on('closed', () => {
    const id = windowId;
    cancelNativeBuildForOwner(id);
    revokePreview(id);
    forgetDebuggerOwner(id);
    allowedRoots.delete(id);
    activeProjectRoots.delete(id);
    openedProjectIds.delete(id);
    deployingWindows.delete(id);
    compilingWindows.delete(id);
    projectSelectionRevisions.delete(id);
    trustedRendererUrls.delete(id);
    dirtyWindows.delete(id);
    pendingClose.delete(id);
    closeApproved.delete(id);
  });
}

export interface RegisterIpcHandlersOptions {
  readonly automatedOpenProjectPath?: string;
  readonly userDataPath?: string;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions = {}): void {
  if (registered) return;
  registered = true;
  registerRestGoAdminIpc(requireTrustedSender, options.userDataPath);
  registerDebuggerIpc({ requireTrustedSender, requireGrantedRoot, compile: debugCompileHandler });
  registerNativeBuildIpc({
    userDataPath: options.userDataPath,
    requireTrustedSender,
    beforeBuild: (event) => {
      if (deployingWindows.has(event.sender.id) || compilingWindows.has(event.sender.id))
        throw new Error('Wait for the application build to finish.');
      stopDebuggerForOwner(event.sender.id);
    },
    requireProject: (event, rootPath, projectId) => {
      requireGrantedRoot(event, rootPath);
      if (activeProjectRoots.get(event.sender.id) !== normalizedRoot(rootPath))
        throw new Error('Native Build requires the active opened project.');
      if (
        projectId !== undefined &&
        openedProjectIds.get(event.sender.id)?.get(normalizedRoot(rootPath)) !== projectId
      )
        throw new Error('Native Build must belong to the opened project.');
    },
  });
  const lastProject =
    options.userDataPath === undefined ? undefined : new LastProjectStore(options.userDataPath);
  const deployGrants = new DeployDirectoryGrants(options.userDataPath);
  const rememberSession = async (
    event: IpcMainInvokeEvent,
    session: ProjectSession | null,
  ): Promise<void> => {
    if (
      session !== null &&
      activeProjectRoots.get(event.sender.id) === normalizedRoot(session.rootPath)
    ) {
      await lastProject?.remember(session.projectFilePath);
    }
  };
  const selectProject = async (
    event: IpcMainInvokeEvent,
    loadSession: () => Promise<ProjectSession | null>,
    remember = true,
  ): Promise<ProjectSession | null> => {
    const window = requireTrustedSender(event);
    const id = window.webContents.id;
    const revision = (projectSelectionRevisions.get(id) ?? 0) + 1;
    projectSelectionRevisions.set(id, revision);
    const session = await loadSession();
    // A manual selection supersedes restoration or any earlier pending selection.
    if (session === null || projectSelectionRevisions.get(id) !== revision) return null;
    cancelNativeBuildForOwner(id);
    stopDebuggerForOwner(id);
    revokePreview(id);
    grantRoot(event, session.rootPath, session.project.id);
    if (remember) await rememberSession(event, session);
    return projectSelectionRevisions.get(id) === revision ? session : null;
  };
  ipcMain.handle('webrad:links:open', async (event, ...input: unknown[]) => {
    requireTrustedSender(event);
    if (input.length !== 1) throw new Error('External links require exactly one target.');
    const target = z.enum(['atentor', 'restgo', 'webrad', 'issues']).parse(input[0]);
    await shell.openExternal(EXTERNAL_LINKS[target]);
  });

  ipcMain.handle('webrad:project:restore', async (event, ...input: unknown[]) => {
    requireTrustedSender(event);
    if (input.length > 0)
      throw new Error('Restoring the last project does not accept renderer input.');
    return selectProject(event, async () => (await lastProject?.restore()) ?? null, false);
  });
  ipcMain.handle('webrad:project:create', (event, input) =>
    selectProject(event, () => createProjectHandler(event, input)),
  );
  ipcMain.handle('webrad:project:open', (event) =>
    selectProject(event, () => openProjectHandler(event, options.automatedOpenProjectPath)),
  );
  ipcMain.handle('webrad:project:save', async (event, input) => {
    const session = await saveProjectHandler(event, input);
    await rememberSession(event, session);
    return session;
  });
  ipcMain.handle('webrad:project:save-as', (event, input) =>
    selectProject(event, () => saveProjectAsHandler(event, input)),
  );
  ipcMain.handle('webrad:project:import-asset', async (event, ...input: unknown[]) => {
    if (input.length !== 1) throw new Error('Asset import requires one project root.');
    const rootPath = releaseRootSchema.parse(input[0]);
    requireGrantedRoot(event, rootPath);
    const result = await dialog.showOpenDialog(requireTrustedSender(event), {
      title: 'Import project asset',
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths[0] === undefined) return null;
    requireGrantedRoot(event, rootPath);
    return readSelectedProjectAsset(result.filePaths[0]);
  });
  ipcMain.handle('webrad:project:release', releaseProjectHandler);
  ipcMain.handle('webrad:files:read', readFileHandler);
  ipcMain.handle('webrad:files:write', writeFileHandler);
  ipcMain.handle('webrad:build:run', buildHandler);
  ipcMain.handle('webrad:deploy:choose-directory', async (event, ...input: unknown[]) => {
    if (input.length !== 1)
      throw new Error('Choosing a deploy folder requires exactly one project root.');
    const rootPath = releaseRootSchema.parse(input[0]);
    requireGrantedRoot(event, rootPath);
    const projectId = openedProjectIds.get(event.sender.id)?.get(normalizedRoot(rootPath));
    if (projectId === undefined) throw new Error('Choose a deploy folder for an opened project.');
    return chooseDeploymentDirectory(event, rootPath, projectId, deployGrants);
  });
  ipcMain.handle('webrad:deploy:run', (event, ...input: unknown[]) => {
    if (input.length !== 1) throw new Error('Deploy requires exactly one project request.');
    return deployHandler(event, deployRequestSchema.parse(input[0]), deployGrants);
  });
  ipcMain.handle('webrad:styles:compile', compileStylesHandler);
  ipcMain.on('webrad:lifecycle:set-dirty', (event, dirty: unknown) => {
    if (typeof dirty !== 'boolean') return;
    let window: BrowserWindow;
    try {
      window = requireTrustedSender(event);
    } catch {
      return;
    }
    const id = window.webContents.id;
    if (dirty) {
      dirtyWindows.add(id);
      pendingClose.delete(id);
      return;
    }
    dirtyWindows.delete(id);
    if (pendingClose.delete(id)) {
      closeApproved.add(id);
      window.close();
    }
  });
}
