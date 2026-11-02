import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { createProject } from '@webrad/project-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPackageOperationRunning, isPackageRootBusy, registerPackagesIpc } from './packages-ipc';

const { handlers, run, status, load } = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
  run: vi.fn(),
  status: vi.fn(),
  load: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      callback: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
    ) => handlers.set(channel, callback),
  },
}));
vi.mock('./package-service', () => ({
  runPackageOperation: run,
  packageStatus: status,
  loadPackagesProject: load,
}));
const roots: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('package IPC authorization and process ownership', () => {
  it('rejects untrusted callers, unauthorized projects, extra arguments and command injection', async () => {
    let trusted = true;
    const requireProject = vi.fn(() => {
      throw new Error('not the opened project');
    });
    registerPackagesIpc({
      requireTrustedSender: () => {
        if (!trusted) throw new Error('untrusted sender');
        return {} as BrowserWindow;
      },
      requireProject,
      beforeOperation: vi.fn(),
    });
    const event = {} as IpcMainInvokeEvent;
    const invoke = (name: string, ...args: unknown[]) =>
      handlers.get(`webrad:packages:${name}`)!(event, ...args);
    await expect(
      invoke('status', { rootPath: path.resolve('project'), projectId: 'other' }),
    ).rejects.toThrow('not the opened project');
    await expect(
      invoke('run', {
        rootPath: path.resolve('project'),
        project: createProject('Project'),
        userSources: {},
        requestId: 'unsafe',
        action: 'install',
        name: 'dayjs;whoami',
      }),
    ).rejects.toThrow();
    await expect(invoke('status', {}, {})).rejects.toThrow('exactly one');
    trusted = false;
    await expect(
      invoke('status', { rootPath: path.resolve('project'), projectId: 'id' }),
    ).rejects.toThrow('untrusted sender');
    expect(run).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('serializes a project across windows and lets only the owning window cancel its process', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-packages-ipc-'));
    roots.push(rootPath);
    const first = { sender: { id: 11 } } as IpcMainInvokeEvent;
    const second = { sender: { id: 12 } } as IpcMainInvokeEvent;
    registerPackagesIpc({
      requireTrustedSender: (event) =>
        ({
          isDestroyed: () => false,
          webContents: { id: event.sender.id, isDestroyed: () => false, send: vi.fn() },
        }) as unknown as BrowserWindow,
      requireProject: vi.fn(),
      beforeOperation: vi.fn(),
    });
    let signal!: AbortSignal;
    run.mockImplementation((_request: unknown, controllerSignal: AbortSignal) => {
      signal = controllerSignal;
      return new Promise((resolve) =>
        signal.addEventListener('abort', () => resolve({ success: false, cancelled: true }), {
          once: true,
        }),
      );
    });
    const request = {
      rootPath,
      project: createProject('Project'),
      userSources: {},
      action: 'install',
      name: 'dayjs',
      requestId: 'operation',
    };
    const pending = handlers.get('webrad:packages:run')!(first, request);
    expect(isPackageOperationRunning(11)).toBe(true);
    expect(isPackageRootBusy(rootPath)).toBe(true);
    await expect(
      handlers.get('webrad:packages:run')!(second, { ...request, requestId: 'other' }),
    ).rejects.toThrow('Another window');
    handlers.get('webrad:packages:cancel')!(second, 'operation');
    expect(signal.aborted).toBe(false);
    handlers.get('webrad:packages:cancel')!(first, 'operation');
    await expect(pending).resolves.toEqual({ success: false, cancelled: true });
    expect(isPackageOperationRunning(11)).toBe(false);
    expect(isPackageRootBusy(rootPath)).toBe(false);
  });
});
