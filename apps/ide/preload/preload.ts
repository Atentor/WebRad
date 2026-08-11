import { contextBridge, ipcRenderer } from 'electron';
import type {
  BuildRequest,
  BuildResponse,
  CreateProjectRequest,
  IdeCommand,
  ProjectSession,
  ReadFileRequest,
  SaveProjectRequest,
  WebRadBridge,
  WriteFileRequest,
} from '../shared/contracts';

const bridge: WebRadBridge = {
  project: {
    create: (request: CreateProjectRequest) =>
      ipcRenderer.invoke('webrad:project:create', request) as Promise<ProjectSession | null>,
    open: () => ipcRenderer.invoke('webrad:project:open') as Promise<ProjectSession | null>,
    save: (request: SaveProjectRequest) =>
      ipcRenderer.invoke('webrad:project:save', request) as Promise<ProjectSession>,
    saveAs: (request: Omit<SaveProjectRequest, 'rootPath'>) =>
      ipcRenderer.invoke('webrad:project:save-as', request) as Promise<ProjectSession | null>,
    release: (rootPath: string) =>
      ipcRenderer.invoke('webrad:project:release', rootPath) as Promise<void>,
  },
  files: {
    read: (request: ReadFileRequest) =>
      ipcRenderer.invoke('webrad:files:read', request) as Promise<string>,
    write: (request: WriteFileRequest) =>
      ipcRenderer.invoke('webrad:files:write', request) as Promise<void>,
  },
  build: {
    run: (request: BuildRequest) =>
      ipcRenderer.invoke('webrad:build:run', request) as Promise<BuildResponse>,
  },
  commands: {
    subscribe: (listener: (command: IdeCommand) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, command: IdeCommand): void =>
        listener(command);
      ipcRenderer.on('webrad:menu-command', handler);
      return () => ipcRenderer.removeListener('webrad:menu-command', handler);
    },
  },
  lifecycle: {
    setDirty: (dirty: boolean) => ipcRenderer.send('webrad:lifecycle:set-dirty', dirty),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('webrad', bridge);
