import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { RestGoAdminCredentials } from './restgo-admin-credentials';
import { RestGoAdminService } from './restgo-admin';
import { RestGoDevelopmentService } from './restgo-development';

/** Shares the existing trusted main-frame check; Preview can never invoke these operations. */
export function registerRestGoAdminIpc(
  requireTrustedSender: (event: IpcMainInvokeEvent) => BrowserWindow,
  userDataPath?: string,
): void {
  const credentials = new RestGoAdminCredentials(userDataPath);
  const service = new RestGoAdminService(credentials);
  const developmentCredentials = new RestGoAdminCredentials(
    userDataPath,
    'restgo-development-credentials',
  );
  const development = new RestGoDevelopmentService(developmentCredentials);
  const trackedOwners = new Set<number>();

  function handle<Request, Response>(
    channel: string,
    action: (ownerId: number, request: Request) => Promise<Response>,
  ): void {
    ipcMain.handle(channel, (event, ...input: unknown[]) => {
      const window = requireTrustedSender(event);
      if (input.length !== 1)
        throw new Error('RestGo administration requires exactly one request.');
      const ownerId = window.webContents.id;
      if (!trackedOwners.has(ownerId)) {
        trackedOwners.add(ownerId);
        window.once('closed', () => {
          credentials.release(ownerId);
          developmentCredentials.release(ownerId);
          trackedOwners.delete(ownerId);
        });
      }
      // Every action parses the full input with a strict schema before using it.
      return action(ownerId, input[0] as Request);
    });
  }

  handle('webrad:restgo-admin:status', service.status.bind(service));
  handle('webrad:restgo-development:status', development.status.bind(development));
  handle('webrad:restgo-development:login', development.login.bind(development));
  handle('webrad:restgo-development:logout', development.logout.bind(development));
  handle('webrad:restgo-development:token', development.token.bind(development));
  handle('webrad:restgo-admin:connect', service.connect.bind(service));
  handle('webrad:restgo-admin:disconnect', service.disconnect.bind(service));
  handle('webrad:restgo-admin:catalog', service.catalog.bind(service));
  handle('webrad:restgo-admin:get-endpoint', service.getEndpoint.bind(service));
  handle('webrad:restgo-admin:save-endpoint', service.saveEndpoint.bind(service));
  handle('webrad:restgo-admin:set-endpoint-active', service.setEndpointActive.bind(service));
  handle('webrad:restgo-admin:save-publication', service.savePublication.bind(service));
  handle('webrad:restgo-admin:set-publication-active', service.setPublicationActive.bind(service));
}
