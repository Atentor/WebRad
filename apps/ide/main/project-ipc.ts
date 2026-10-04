import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { compileProject, compileTailwindStyles } from '@webrad/compiler';
import { parseComponentStyle, parseProject } from '@webrad/project-model';
import { z } from 'zod';
import type {
  BuildRequest,
  BuildResponse,
  CompileStylesRequest,
  CompileStylesResponse,
  CreateProjectRequest,
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
import { publishPreviewHtml, revokePreview } from './preview-protocol';
import { LastProjectStore } from './last-project';

const allowedRoots = new Map<number, Set<string>>();
const activeProjectRoots = new Map<number, string>();
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

function requireTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
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

function grantRoot(event: IpcMainInvokeEvent, rootPath: string): void {
  const window = requireTrustedSender(event);
  const roots = allowedRoots.get(window.webContents.id) ?? new Set<string>();
  roots.add(normalizedRoot(rootPath));
  allowedRoots.set(window.webContents.id, roots);
  activeProjectRoots.set(window.webContents.id, normalizedRoot(rootPath));
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
  if (activeProjectRoots.get(window.webContents.id) === normalizedRoot(rootPath)) {
    activeProjectRoots.delete(window.webContents.id);
  }
  revokePreview(window.webContents.id);
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
      ? publishPreviewHtml(event.sender.id, result.previewHtml)
      : undefined;
  return {
    success: result.success,
    outputDirectory,
    previewUrl,
    diagnostics: result.diagnostics,
  };
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
    revokePreview(id);
    allowedRoots.delete(id);
    activeProjectRoots.delete(id);
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
  const lastProject =
    options.userDataPath === undefined ? undefined : new LastProjectStore(options.userDataPath);
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
    grantRoot(event, session.rootPath);
    if (remember) await rememberSession(event, session);
    return projectSelectionRevisions.get(id) === revision ? session : null;
  };
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
  ipcMain.handle('webrad:project:release', releaseProjectHandler);
  ipcMain.handle('webrad:files:read', readFileHandler);
  ipcMain.handle('webrad:files:write', writeFileHandler);
  ipcMain.handle('webrad:build:run', buildHandler);
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
