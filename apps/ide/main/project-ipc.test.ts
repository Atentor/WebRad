import os from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createProject } from '@webrad/project-model';
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSession, SaveProjectRequest } from '../shared/contracts';
import type * as ProjectFiles from './project-files';

const mocks = vi.hoisted(() => ({
  readAsset: vi.fn(),
  compileProject: vi.fn(),
  handlers: new Map<string, (event: unknown, ...input: unknown[]) => unknown>(),
  openExternal: vi.fn().mockResolvedValue(undefined),
  fromWebContents: vi.fn(),
  chooseDirectory: vi.fn(),
  createProjectFiles: vi.fn(),
  loadProjectFiles: vi.fn(),
  saveProjectFiles: vi.fn(),
  restore: vi.fn(),
  remember: vi.fn(),
  statePaths: [] as string[],
}));

vi.mock('@webrad/compiler', () => ({
  compileProject: mocks.compileProject,
  compileTailwindStyles: vi.fn(),
}));

vi.mock('./project-asset', () => ({ readSelectedProjectAsset: mocks.readAsset }));

vi.mock('electron', () => ({
  shell: { openExternal: mocks.openExternal },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showOpenDialog: mocks.chooseDirectory, showMessageBoxSync: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...input: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    },
    on: vi.fn(),
  },
}));

vi.mock('./project-files', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectFiles>()),
  createProjectFiles: mocks.createProjectFiles,
  loadProjectFiles: mocks.loadProjectFiles,
  saveProjectFiles: mocks.saveProjectFiles,
}));

vi.mock('./preview-server', () => ({ publishPreviewHtml: vi.fn(), revokePreview: vi.fn() }));

vi.mock('./last-project', () => ({
  LastProjectStore: class {
    constructor(userDataPath: string) {
      mocks.statePaths.push(userDataPath);
    }

    restore = mocks.restore;
    remember = mocks.remember;
  },
}));

const rendererUrl = 'file:///webrad/renderer/index.html';
const mainFrame = { url: rendererUrl };
const webContents = { id: 17, mainFrame, send: vi.fn() };
const window = { webContents, on: vi.fn(), close: vi.fn() };
const event = { sender: webContents, senderFrame: mainFrame };
const temporaryRoots: string[] = [];

function session(name: string): ProjectSession {
  const rootPath = path.join(os.tmpdir(), `webrad-ipc-last-project-${name}`);
  return {
    rootPath,
    projectFilePath: path.join(rootPath, `${name}.wrproj`),
    project: createProject(name),
    userSources: {},
  };
}

function saveRequest(projectSession: ProjectSession): SaveProjectRequest {
  return {
    rootPath: projectSession.rootPath,
    project: projectSession.project,
    userSources: projectSession.userSources,
  };
}

async function invoke(channel: string, sender = event, ...input: unknown[]): Promise<unknown> {
  const handler = mocks.handlers.get(channel);
  if (handler === undefined) throw new Error(`Missing IPC handler: ${channel}`);
  return handler(sender, ...input);
}

async function register(userDataPath?: string): Promise<void> {
  const { installDirtyGuard, registerIpcHandlers } = await import('./project-ipc');
  installDirtyGuard(window as unknown as BrowserWindow, rendererUrl);
  registerIpcHandlers(userDataPath === undefined ? {} : { userDataPath });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.handlers.clear();
  mocks.statePaths.splice(0);
  mocks.fromWebContents.mockReturnValue(window);
  mocks.restore.mockResolvedValue(null);
  mocks.remember.mockResolvedValue(undefined);
  mocks.chooseDirectory.mockResolvedValue({ canceled: true, filePaths: [] });
  mocks.compileProject.mockReset();
  mocks.compileProject.mockResolvedValue({
    success: true,
    diagnostics: [],
    files: { 'index.html': '<html>app</html>', 'pages/main.js': 'export {}' },
    binaryFiles: { 'assets/icon.png': Uint8Array.from([0, 255]) },
  });
});

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!path.resolve(root).startsWith((await fs.realpath(os.tmpdir())) + path.sep))
      throw new Error('Unsafe test cleanup.');
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function deploymentSession(): Promise<{
  opened: ProjectSession;
  output: string;
  userData: string;
}> {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-deploy-ipc-')));
  temporaryRoots.push(parent);
  const opened = session('Deploy');
  opened.rootPath = path.join(parent, 'source');
  opened.projectFilePath = path.join(opened.rootPath, 'Deploy.wrproj');
  await fs.mkdir(opened.rootPath);
  const output = path.join(parent, 'output');
  await fs.mkdir(output);
  opened.project = {
    ...opened.project,
    settings: {
      ...opened.project.settings,
      environment: 'development',
      build: {
        ...opened.project.settings.build,
        deployDirectory: output,
        environment: 'production',
        minify: true,
        sourceMaps: false,
      },
    },
  };
  mocks.loadProjectFiles.mockResolvedValue(opened);
  mocks.saveProjectFiles.mockResolvedValue(opened);
  mocks.chooseDirectory.mockResolvedValue({ canceled: false, filePaths: [opened.projectFilePath] });
  return { opened, output, userData: path.join(parent, 'preferences') };
}

describe('deploy IPC', () => {
  it('requires a trusted opened project, validates argument counts, and rejects renderer output overrides', async () => {
    await register();
    const unopened = session('UnopenedDeploy');
    const request = { ...saveRequest(unopened), requestId: 'deployment-1' };
    await expect(invoke('webrad:deploy:run', event, request)).rejects.toThrow(
      'outside an opened project',
    );
    await expect(
      invoke('webrad:deploy:choose-directory', event, unopened.rootPath),
    ).rejects.toThrow('outside an opened project');
    await expect(
      invoke('webrad:deploy:choose-directory', event, unopened.rootPath, '/override'),
    ).rejects.toThrow('exactly one');
    await expect(
      invoke('webrad:deploy:run', event, { ...request, outputDirectory: '/override' }),
    ).rejects.toThrow();
    await expect(invoke('webrad:deploy:run', event, request, {})).rejects.toThrow('exactly one');
    await expect(
      invoke('webrad:deploy:run', { ...event, senderFrame: { url: rendererUrl } }, request),
    ).rejects.toThrow('main frame');
    expect(mocks.compileProject).not.toHaveBeenCalled();
  });

  it('grants only the native selection and exports exact file progress with production settings', async () => {
    const { opened, output } = await deploymentSession();
    await register();
    await invoke('webrad:project:open');
    mocks.chooseDirectory.mockResolvedValue({ canceled: false, filePaths: [output] });
    expect(await invoke('webrad:deploy:choose-directory', event, opened.rootPath)).toBe(output);
    mocks.chooseDirectory.mockClear();
    const response = await invoke('webrad:deploy:run', event, {
      ...saveRequest(opened),
      requestId: 'deploy-success',
    });
    expect(response).toMatchObject({ success: true, outputDirectory: output, fileCount: 3 });
    expect(mocks.chooseDirectory).not.toHaveBeenCalled();
    expect(mocks.compileProject).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ environment: 'production' }) }),
      expect.objectContaining({
        target: 'deploy',
        outputDirectory: output,
        write: false,
        minify: true,
        sourcemap: false,
      }),
    );
    expect(mocks.saveProjectFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({
          settings: expect.objectContaining({ environment: 'development' }),
        }),
      }),
    );
    const events = webContents.send.mock.calls
      .filter(([channel]) => channel === 'webrad:deploy:progress')
      .map(
        ([, progress]) =>
          progress as {
            requestId: string;
            phase: string;
            completedFiles: number;
            totalFiles: number;
          },
      );
    expect(events).toEqual([
      { requestId: 'deploy-success', phase: 'compiling', completedFiles: 0, totalFiles: 0 },
      { requestId: 'deploy-success', phase: 'writing', completedFiles: 0, totalFiles: 3 },
      {
        requestId: 'deploy-success',
        phase: 'writing',
        completedFiles: 1,
        totalFiles: 3,
        currentFile: 'index.html',
      },
      {
        requestId: 'deploy-success',
        phase: 'writing',
        completedFiles: 2,
        totalFiles: 3,
        currentFile: 'pages/main.js',
      },
      {
        requestId: 'deploy-success',
        phase: 'writing',
        completedFiles: 3,
        totalFiles: 3,
        currentFile: 'assets/icon.png',
      },
      { requestId: 'deploy-success', phase: 'complete', completedFiles: 3, totalFiles: 3 },
    ]);
    expect(await fs.readFile(path.join(output, 'assets/icon.png'))).toEqual(Buffer.from([0, 255]));
  });

  it('requires a native selection for an ungranted saved path and persists a newly selected destination before compiling', async () => {
    const { opened, output } = await deploymentSession();
    await register();
    await invoke('webrad:project:open');
    const selected = path.join(path.dirname(output), 'selected');
    await fs.mkdir(selected);
    mocks.chooseDirectory.mockResolvedValue({ canceled: false, filePaths: [selected] });
    const response = await invoke('webrad:deploy:run', event, {
      ...saveRequest(opened),
      requestId: 'new-choice',
    });
    expect(response).toMatchObject({ success: true, outputDirectory: selected });
    expect(mocks.chooseDirectory).toHaveBeenLastCalledWith(
      window,
      expect.objectContaining({ defaultPath: output }),
    );
    expect(mocks.saveProjectFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        project: expect.objectContaining({
          settings: expect.objectContaining({
            build: expect.objectContaining({ deployDirectory: selected }),
          }),
        }),
      }),
    );
    await expect(fs.stat(path.join(output, 'index.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('returns cancellation without compilation or file writes', async () => {
    const { opened, output } = await deploymentSession();
    await register();
    await invoke('webrad:project:open');
    mocks.chooseDirectory.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(
      await invoke('webrad:deploy:run', event, { ...saveRequest(opened), requestId: 'cancel' }),
    ).toMatchObject({ success: false, cancelled: true });
    expect(mocks.compileProject).not.toHaveBeenCalled();
    expect(mocks.saveProjectFiles).not.toHaveBeenCalled();
    expect(await fs.readdir(output)).toEqual([]);
  });

  it('reuses persisted native grants after reopening, while rejecting another project identity', async () => {
    const { opened, output, userData } = await deploymentSession();
    await register(userData);
    await invoke('webrad:project:open');
    mocks.chooseDirectory.mockResolvedValue({ canceled: false, filePaths: [output] });
    await invoke('webrad:deploy:choose-directory', event, opened.rootPath);
    vi.resetModules();
    await register(userData);
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [opened.projectFilePath],
    });
    await invoke('webrad:project:open');
    mocks.chooseDirectory.mockClear();
    expect(
      await invoke('webrad:deploy:run', event, { ...saveRequest(opened), requestId: 'reopened' }),
    ).toMatchObject({ success: true });
    expect(mocks.chooseDirectory).not.toHaveBeenCalled();
    await expect(
      invoke('webrad:deploy:run', event, {
        ...saveRequest(opened),
        project: { ...opened.project, id: 'other-project' },
        requestId: 'wrong-owner',
      }),
    ).rejects.toThrow('opened project');
  });

  it('preserves previous output on compiler errors and reports diagnostics without completion progress', async () => {
    const { opened, output } = await deploymentSession();
    await register();
    await invoke('webrad:project:open');
    mocks.chooseDirectory.mockResolvedValue({ canceled: false, filePaths: [output] });
    await invoke('webrad:deploy:choose-directory', event, opened.rootPath);
    await invoke('webrad:deploy:run', event, { ...saveRequest(opened), requestId: 'first' });
    webContents.send.mockClear();
    mocks.compileProject.mockResolvedValue({
      success: false,
      files: {},
      diagnostics: [{ category: 'error', source: 'typescript', message: 'Invalid code' }],
    });
    expect(
      await invoke('webrad:deploy:run', event, { ...saveRequest(opened), requestId: 'broken' }),
    ).toMatchObject({ success: false, diagnostics: [{ message: 'Invalid code' }] });
    expect(await fs.readFile(path.join(output, 'index.html'), 'utf8')).toBe('<html>app</html>');
    expect(webContents.send).toHaveBeenCalledTimes(1);
    expect(webContents.send).toHaveBeenCalledWith(
      'webrad:deploy:progress',
      expect.objectContaining({ phase: 'compiling' }),
    );
  });
});

describe('last project IPC', () => {
  it('restores through the trusted main frame and grants access to the validated project', async () => {
    const restored = session('Portal');
    mocks.restore.mockResolvedValue(restored);
    mocks.saveProjectFiles.mockResolvedValue(restored);
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));

    await expect(invoke('webrad:project:restore')).resolves.toBe(restored);
    await expect(invoke('webrad:project:save', event, saveRequest(restored))).resolves.toBe(
      restored,
    );
    expect(mocks.remember).toHaveBeenCalledWith(restored.projectFilePath);
    expect(mocks.chooseDirectory).not.toHaveBeenCalled();
  });

  it('cannot grant filesystem access when the saved project cannot be restored', async () => {
    const unavailable = session('Removed');
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));

    await expect(invoke('webrad:project:restore')).resolves.toBeNull();
    await expect(invoke('webrad:project:save', event, saveRequest(unavailable))).rejects.toThrow(
      'outside an opened project',
    );
    expect(mocks.saveProjectFiles).not.toHaveBeenCalled();
  });

  it('rejects any renderer input instead of accepting a project path', async () => {
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));

    await expect(
      invoke('webrad:project:restore', event, '/arbitrary/project.wrproj'),
    ).rejects.toThrow('does not accept renderer input');
    await expect(invoke('webrad:project:restore', event, undefined, '/arbitrary')).rejects.toThrow(
      'does not accept renderer input',
    );
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('rejects changed renderer URLs and child frames before reading application state', async () => {
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));
    const childEvent = { sender: webContents, senderFrame: { url: rendererUrl } };

    await expect(invoke('webrad:project:restore', childEvent)).rejects.toThrow('IDE main frame');
    const originalUrl = mainFrame.url;
    mainFrame.url = 'https://untrusted.example/';
    try {
      await expect(invoke('webrad:project:restore')).rejects.toThrow('trusted WebRAD renderer URL');
    } finally {
      mainFrame.url = originalUrl;
    }
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('leaves restore and persistence disabled when no userData path is supplied for smoke runs', async () => {
    await register();

    await expect(invoke('webrad:project:restore')).resolves.toBeNull();
    expect(mocks.statePaths).toEqual([]);
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('remembers successful create, open, save, and save-as operations', async () => {
    const created = session('Created');
    const opened = session('Opened');
    const copied = session('Copied');
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [path.join(os.tmpdir(), 'webrad-ipc-absent-parent')],
    });
    mocks.createProjectFiles.mockResolvedValue(created);
    mocks.loadProjectFiles.mockResolvedValue(opened);
    mocks.saveProjectFiles.mockResolvedValue(opened);
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));

    await invoke('webrad:project:create', event, { name: created.project.name });
    await invoke('webrad:project:open');
    await invoke('webrad:project:save', event, saveRequest(opened));
    mocks.saveProjectFiles.mockResolvedValue(copied);
    await invoke('webrad:project:save-as', event, {
      project: copied.project,
      userSources: copied.userSources,
    });

    expect(mocks.remember.mock.calls).toEqual([
      [created.projectFilePath],
      [opened.projectFilePath],
      [opened.projectFilePath],
      [copied.projectFilePath],
    ]);
  });

  it('preserves the previous project when an open is canceled or fails validation', async () => {
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));
    await expect(invoke('webrad:project:open')).resolves.toBeNull();
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: ['/invalid/project.wrproj'],
    });
    mocks.loadProjectFiles.mockRejectedValue(new Error('Invalid project'));

    await expect(invoke('webrad:project:open')).rejects.toThrow('Invalid project');
    expect(mocks.remember).not.toHaveBeenCalled();
  });

  it('does not let a delayed save of an older session replace the most recently opened project', async () => {
    const previous = session('Previous');
    const latest = session('Latest');
    mocks.restore.mockResolvedValue(previous);
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [latest.projectFilePath],
    });
    mocks.loadProjectFiles.mockResolvedValue(latest);
    let finishSave!: (value: ProjectSession) => void;
    mocks.saveProjectFiles.mockImplementation(
      () =>
        new Promise<ProjectSession>((resolve) => {
          finishSave = resolve;
        }),
    );
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));
    await invoke('webrad:project:restore');
    const saving = invoke('webrad:project:save', event, saveRequest(previous));

    await invoke('webrad:project:open');
    finishSave(previous);
    await saving;

    expect(mocks.remember.mock.calls).toEqual([[latest.projectFilePath]]);
  });
});

describe('project selection ordering', () => {
  it('does not grant or activate a restore that finishes after a manual project open', async () => {
    const previous = session('Previous');
    const latest = session('Latest');
    let finishRestore!: (value: ProjectSession) => void;
    mocks.restore.mockImplementation(
      () =>
        new Promise<ProjectSession>((resolve) => {
          finishRestore = resolve;
        }),
    );
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [latest.projectFilePath],
    });
    mocks.loadProjectFiles.mockResolvedValue(latest);
    mocks.saveProjectFiles.mockResolvedValue(latest);
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));
    const restoring = invoke('webrad:project:restore');

    await invoke('webrad:project:open');
    finishRestore(previous);
    await expect(restoring).resolves.toBeNull();
    await expect(invoke('webrad:project:save', event, saveRequest(previous))).rejects.toThrow(
      'outside an opened project',
    );
    await expect(invoke('webrad:project:save', event, saveRequest(latest))).resolves.toBe(latest);

    expect(mocks.remember.mock.calls).toEqual([[latest.projectFilePath], [latest.projectFilePath]]);
  });

  it('keeps the later manual selection when an earlier open finishes last', async () => {
    const previous = session('Previous');
    const latest = session('Latest');
    let finishFirstOpen!: (value: ProjectSession) => void;
    mocks.loadProjectFiles
      .mockImplementationOnce(
        () =>
          new Promise<ProjectSession>((resolve) => {
            finishFirstOpen = resolve;
          }),
      )
      .mockResolvedValueOnce(latest);
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [latest.projectFilePath],
    });
    await register(path.join(os.tmpdir(), 'webrad-ipc-preferences'));
    const firstOpening = invoke('webrad:project:open');
    await vi.waitFor(() => expect(mocks.loadProjectFiles).toHaveBeenCalledTimes(1));

    await expect(invoke('webrad:project:open')).resolves.toBe(latest);
    finishFirstOpen(previous);
    await expect(firstOpening).resolves.toBeNull();

    expect(mocks.remember.mock.calls).toEqual([[latest.projectFilePath]]);
  });
});

describe('external link IPC', () => {
  it('opens only the approved websites in the default browser', async () => {
    await register();
    await invoke('webrad:links:open', event, 'atentor');
    await invoke('webrad:links:open', event, 'restgo');
    await invoke('webrad:links:open', event, 'webrad');
    await invoke('webrad:links:open', event, 'issues');
    expect(mocks.openExternal.mock.calls).toEqual([
      ['https://atentor.com'],
      ['https://restgo.atentor.com'],
      ['https://webrad.atentor.com'],
      ['https://github.com/Atentor/WebRad/issues'],
    ]);
  });
  it('rejects arbitrary URLs, invalid targets, extra arguments, and untrusted senders', async () => {
    await register();
    for (const target of ['https://other.example', 'file:///secret', null, {}, 'unknown']) {
      await expect(invoke('webrad:links:open', event, target)).rejects.toThrow();
    }
    await expect(invoke('webrad:links:open')).rejects.toThrow('exactly one target');
    await expect(invoke('webrad:links:open', event, 'atentor', 'extra')).rejects.toThrow(
      'exactly one target',
    );
    await expect(
      invoke(
        'webrad:links:open',
        { sender: webContents, senderFrame: { url: rendererUrl } },
        'atentor',
      ),
    ).rejects.toThrow('IDE main frame');
    const originalUrl = mainFrame.url;
    mainFrame.url = 'https://untrusted.example/';
    try {
      await expect(invoke('webrad:links:open', event, 'webrad')).rejects.toThrow(
        'trusted WebRAD renderer URL',
      );
    } finally {
      mainFrame.url = originalUrl;
    }
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
  it('propagates browser launch failures', async () => {
    await register();
    mocks.openExternal.mockRejectedValueOnce(new Error('Browser unavailable'));
    await expect(invoke('webrad:links:open', event, 'atentor')).rejects.toThrow(
      'Browser unavailable',
    );
  });
});

describe('project asset import IPC', () => {
  it('requires a trusted opened project and reads only the native picker selection', async () => {
    const project = session('AssetImport');
    mocks.loadProjectFiles.mockResolvedValue(project);
    await register();
    await expect(invoke('webrad:project:import-asset', event, project.rootPath)).rejects.toThrow(
      'outside an opened project',
    );
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [project.projectFilePath],
    });
    await invoke('webrad:project:open');
    const asset = { id: 'asset', fileName: 'logo.png', mediaType: 'image/png', base64: 'AP8B' };
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [path.join(os.tmpdir(), 'logo.png')],
    });
    mocks.readAsset.mockResolvedValue(asset);
    expect(await invoke('webrad:project:import-asset', event, project.rootPath)).toEqual(asset);
    expect(mocks.readAsset).toHaveBeenCalledWith(path.join(os.tmpdir(), 'logo.png'));
    await expect(
      invoke('webrad:project:import-asset', event, project.rootPath, 'arbitrary-path'),
    ).rejects.toThrow('one project root');
    const childFrame = { ...event, senderFrame: { url: rendererUrl } };
    await expect(
      invoke('webrad:project:import-asset', childFrame, project.rootPath),
    ).rejects.toThrow('main frame');
  });

  it('returns null on cancellation without reading or writing a file', async () => {
    mocks.loadProjectFiles.mockResolvedValue(session('AssetCancel'));
    await register();
    mocks.chooseDirectory.mockResolvedValue({
      canceled: false,
      filePaths: [session('AssetCancel').projectFilePath],
    });
    const project = (await invoke('webrad:project:open')) as ProjectSession;
    mocks.chooseDirectory.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await invoke('webrad:project:import-asset', event, project.rootPath)).toBeNull();
    expect(mocks.readAsset).not.toHaveBeenCalled();
    expect(mocks.saveProjectFiles).not.toHaveBeenCalled();
  });
});

describe('debugger IPC authorization', () => {
  it('requires an opened root before compilation and rejects renderer-supplied CDP targets', async () => {
    await register();
    const opened = session('DebugSecurity');
    const request = { ...saveRequest(opened), breakpoints: [], pauseOnExceptions: 'none' };
    await expect(invoke('webrad:debug:start', event, request)).rejects.toThrow(
      'outside an opened project',
    );
    for (const extra of [
      { targetUrl: 'file:///secret' },
      { method: 'Runtime.evaluate' },
      { debug: true },
    ]) {
      await expect(invoke('webrad:debug:start', event, { ...request, ...extra })).rejects.toThrow();
    }
    expect(mocks.saveProjectFiles).not.toHaveBeenCalled();
  });

  it('rejects child frames for every debugger operation and rejects extra arguments', async () => {
    await register();
    const child = { sender: webContents, senderFrame: { url: rendererUrl } };
    for (const operation of [
      'start',
      'state',
      'command',
      'breakpoints',
      'exceptions',
      'evaluate',
      'properties',
    ]) {
      await expect(invoke(`webrad:debug:${operation}`, child, {})).rejects.toThrow(
        'IDE main frame',
      );
      await expect(invoke(`webrad:debug:${operation}`, event, {}, 'extra')).rejects.toThrow();
    }
  });

  it('rejects absolute/traversal breakpoint paths and raw CDP capabilities', async () => {
    await register();
    for (const breakpointPath of ['../private.ts', 'C:\\secret.ts', '/private.ts']) {
      await expect(
        invoke('webrad:debug:breakpoints', event, [
          { path: breakpointPath, line: 1, enabled: true },
        ]),
      ).rejects.toThrow('project relative');
    }
    await expect(
      invoke('webrad:debug:evaluate', event, {
        sessionId: 'raw',
        frameId: 'raw-frame',
        expression: '1',
      }),
    ).rejects.toThrow();
    await expect(
      invoke('webrad:debug:properties', event, { sessionId: 'raw', objectId: 'raw-object' }),
    ).rejects.toThrow();
    await expect(invoke('webrad:debug:command', event, 'Runtime.evaluate')).rejects.toThrow();
    expect(mocks.saveProjectFiles).not.toHaveBeenCalled();
  });
});
