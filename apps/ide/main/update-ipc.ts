import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { UpdateService } from './update-service';

export function registerUpdateIpc(
  service: UpdateService,
  requireTrustedSender: (event: IpcMainInvokeEvent) => BrowserWindow,
): void {
  const owners = new Map<number, BrowserWindow>();
  for (const [name, action] of [
    ['state', () => service.getState()],
    ['check', service.check],
    ['download', service.download],
    ['install', service.install],
  ] as const) {
    ipcMain.handle(`webrad:updates:${name}`, (event, ...input: unknown[]) => {
      const window = requireTrustedSender(event);
      if (input.length !== 0) throw new Error('Update operations do not accept renderer input.');
      if (!owners.has(window.webContents.id)) {
        const id = window.webContents.id;
        owners.set(id, window);
        window.once('closed', () => owners.delete(id));
      }
      return action();
    });
  }
  service.subscribe((state) => {
    for (const window of owners.values()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send('webrad:updates:state', state);
    }
  });
}
