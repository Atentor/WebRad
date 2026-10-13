import type { ProjectAsset } from '@webrad/project-model';
import type { ExternalLinkTarget } from '../shared/external-links';
import type {
  DebugEvent,
  DebugStartResponse,
  DebugState,
  DebugEvaluation,
  DebugVariable,
} from '../shared/debugger-contracts';
import { contextBridge, ipcRenderer } from 'electron';
import type {
  RestGoAdminCatalog,
  RestGoAdminEndpoint,
  RestGoAdminPublication,
  RestGoAdminStatus,
} from '../shared/restgo-admin';
import type {
  BuildRequest,
  BuildResponse,
  CompileStylesRequest,
  CompileStylesResponse,
  CreateProjectRequest,
  DeployProgress,
  DeployRequest,
  DeployResponse,
  IdeCommand,
  ProjectSession,
  ReadFileRequest,
  SaveProjectRequest,
  WebRadBridge,
  WriteFileRequest,
} from '../shared/contracts';

const bridge: WebRadBridge = {
  debugger: {
    start: (request) =>
      ipcRenderer.invoke('webrad:debug:start', request) as Promise<DebugStartResponse>,
    command: (action) => ipcRenderer.invoke('webrad:debug:command', action) as Promise<DebugState>,
    getState: () => ipcRenderer.invoke('webrad:debug:state') as Promise<DebugState>,
    setBreakpoints: (breakpoints) =>
      ipcRenderer.invoke('webrad:debug:breakpoints', breakpoints) as Promise<DebugState>,
    setPauseOnExceptions: (mode) =>
      ipcRenderer.invoke('webrad:debug:exceptions', mode) as Promise<void>,
    evaluate: (request) =>
      ipcRenderer.invoke('webrad:debug:evaluate', request) as Promise<DebugEvaluation>,
    properties: (request) =>
      ipcRenderer.invoke('webrad:debug:properties', request) as Promise<readonly DebugVariable[]>,
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: DebugEvent): void =>
        listener(event);
      ipcRenderer.on('webrad:debug:event', handler);
      return () => ipcRenderer.removeListener('webrad:debug:event', handler);
    },
  },
  restgoAdmin: {
    status: (request) =>
      ipcRenderer.invoke('webrad:restgo-admin:status', request) as Promise<RestGoAdminStatus>,
    connect: (request) =>
      ipcRenderer.invoke('webrad:restgo-admin:connect', request) as Promise<RestGoAdminStatus>,
    disconnect: (request) =>
      ipcRenderer.invoke('webrad:restgo-admin:disconnect', request) as Promise<void>,
    catalog: (request) =>
      ipcRenderer.invoke('webrad:restgo-admin:catalog', request) as Promise<RestGoAdminCatalog>,
    getEndpoint: (request) =>
      ipcRenderer.invoke(
        'webrad:restgo-admin:get-endpoint',
        request,
      ) as Promise<RestGoAdminEndpoint>,
    saveEndpoint: (request) =>
      ipcRenderer.invoke(
        'webrad:restgo-admin:save-endpoint',
        request,
      ) as Promise<RestGoAdminEndpoint>,
    setEndpointActive: (request) =>
      ipcRenderer.invoke('webrad:restgo-admin:set-endpoint-active', request) as Promise<void>,
    savePublication: (request) =>
      ipcRenderer.invoke(
        'webrad:restgo-admin:save-publication',
        request,
      ) as Promise<RestGoAdminPublication>,
    setPublicationActive: (request) =>
      ipcRenderer.invoke('webrad:restgo-admin:set-publication-active', request) as Promise<void>,
  },
  links: {
    open: (target: ExternalLinkTarget) =>
      ipcRenderer.invoke('webrad:links:open', target) as Promise<void>,
  },
  project: {
    importAsset: (rootPath: string) =>
      ipcRenderer.invoke('webrad:project:import-asset', rootPath) as Promise<ProjectAsset | null>,
    create: (request: CreateProjectRequest) =>
      ipcRenderer.invoke('webrad:project:create', request) as Promise<ProjectSession | null>,
    open: () => ipcRenderer.invoke('webrad:project:open') as Promise<ProjectSession | null>,
    restore: () => ipcRenderer.invoke('webrad:project:restore') as Promise<ProjectSession | null>,
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
  deploy: {
    chooseDirectory: (rootPath: string) =>
      ipcRenderer.invoke('webrad:deploy:choose-directory', rootPath) as Promise<string | null>,
    run: (request: DeployRequest) =>
      ipcRenderer.invoke('webrad:deploy:run', request) as Promise<DeployResponse>,
    subscribe: (listener: (progress: DeployProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: DeployProgress): void =>
        listener(progress);
      ipcRenderer.on('webrad:deploy:progress', handler);
      return () => ipcRenderer.removeListener('webrad:deploy:progress', handler);
    },
  },
  styles: {
    compile: (request: CompileStylesRequest) =>
      ipcRenderer.invoke('webrad:styles:compile', request) as Promise<CompileStylesResponse>,
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
