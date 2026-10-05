import os from 'node:os';
import path from 'node:path';
import { createProject } from '@webrad/project-model';
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSession, SaveProjectRequest } from '../shared/contracts';
import type * as ProjectFiles from './project-files';

const mocks = vi.hoisted(() => ({
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
    await invoke('webrad:links:open', event, 'webrad');
    expect(mocks.openExternal.mock.calls).toEqual([
      ['https://atentor.com'],
      ['https://webrad.atentor.com'],
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
