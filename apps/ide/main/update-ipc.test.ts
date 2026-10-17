import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { UpdateService } from './update-service';
import { registerUpdateIpc } from './update-ipc';

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) =>
      handlers.set(name, callback),
  },
}));

describe('update IPC', () => {
  it('requires the trusted IDE frame, rejects all payloads and sends state only to subscribed owners', async () => {
    const service = new UpdateService({
      currentVersion: '0.1.11',
      readManifest: async () => {
        throw new Error('offline');
      },
      selectBackend: vi.fn(),
      canInstall: () => true,
    });
    const send = vi.fn();
    const owner = {
      once: vi.fn(),
      isDestroyed: () => false,
      webContents: { id: 1, isDestroyed: () => false, send },
    } as unknown as BrowserWindow;
    const event = {} as IpcMainInvokeEvent;
    const trusted = vi.fn(() => owner);
    registerUpdateIpc(service, trusted);
    const invoke = (channel: string, ...args: unknown[]) =>
      handlers.get(`webrad:updates:${channel}`)!(event, ...args);
    expect(() => invoke('download', { url: 'https://evil.example' })).toThrow('do not accept');
    expect(send).not.toHaveBeenCalled();
    await invoke('state');
    await invoke('check');
    expect(send).toHaveBeenCalledWith(
      'webrad:updates:state',
      expect.objectContaining({ status: 'error', message: 'offline' }),
    );
    trusted.mockImplementation(() => {
      throw new Error('untrusted main frame');
    });
    for (const name of ['state', 'check', 'download', 'install'])
      expect(() => invoke(name)).toThrow('untrusted main frame');
  });
});
