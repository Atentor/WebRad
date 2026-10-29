import type { UpdateState } from '../shared/update-contracts';
import type { NativeBuildProgress, NativeBuildResponse } from '../shared/native-build-contracts';
import type { NativePrerequisiteReport } from '@webrad/native-build/contracts';
import type { RestGoDevelopmentStatus } from '../shared/restgo-development';
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
  nativeBuild: {
    inspect: (request) =>
      ipcRenderer.invoke(
        'webrad:native-build:inspect',
        request,
      ) as Promise<NativePrerequisiteReport>,
    chooseDirectory: (rootPath) =>
      ipcRenderer.invoke('webrad:native-build:choose-directory', rootPath) as Promise<
        string | null
      >,
    run: (request) =>
      ipcRenderer.invoke('webrad:native-build:run', request) as Promise<NativeBuildResponse>,
    exportCi: (request) =>
      ipcRenderer.invoke('webrad:native-build:export-ci', request) as Promise<NativeBuildResponse>,
    cancel: (requestId) =>
      ipcRenderer.invoke('webrad:native-build:cancel', requestId) as Promise<void>,
    openOutput: (request) =>
      ipcRenderer.invoke('webrad:native-build:open-output', request) as Promise<void>,
    copyArtifact: (request) =>
      ipcRenderer.invoke('webrad:native-build:copy-artifact', request) as Promise<void>,
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: NativeBuildProgress): void =>
        listener(progress);
      ipcRenderer.on('webrad:native-build:progress', handler);
      return () => ipcRenderer.removeListener('webrad:native-build:progress', handler);
    },
  },
  restgoDevelopment: {
    status: (request) =>
      ipcRenderer.invoke(
        'webrad:restgo-development:status',
        request,
      ) as Promise<RestGoDevelopmentStatus>,
    login: (request) =>
      ipcRenderer.invoke(
        'webrad:restgo-development:login',
        request,
      ) as Promise<RestGoDevelopmentStatus>,
    logout: (request) =>
      ipcRenderer.invoke('webrad:restgo-development:logout', request) as Promise<void>,
    token: (request) =>
      ipcRenderer.invoke('webrad:restgo-development:token', request) as Promise<string>,
  },
  updates: {
    getState: () => ipcRenderer.invoke('webrad:updates:state') as Promise<UpdateState>,
    check: () => ipcRenderer.invoke('webrad:updates:check') as Promise<UpdateState>,
    download: () => ipcRenderer.invoke('webrad:updates:download') as Promise<UpdateState>,
    install: () => ipcRenderer.invoke('webrad:updates:install') as Promise<UpdateState>,
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void =>
        listener(state);
      ipcRenderer.on('webrad:updates:state', handler);
      return () => ipcRenderer.removeListener('webrad:updates:state', handler);
    },
  },
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
    setPendingChanges: (pending: boolean) =>
      ipcRenderer.send('webrad:lifecycle:set-pending-changes', pending),
    setPreviewMode: (active) =>
      ipcRenderer.invoke('webrad:lifecycle:set-preview-mode', active) as Promise<void>,
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('webrad', bridge);
