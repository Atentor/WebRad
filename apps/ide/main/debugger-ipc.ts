import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { ProjectAsset } from '@webrad/project-model';
import type { BuildResponse } from '../shared/contracts';
import type {
  DebugBreakpoint,
  DebugEvent,
  DebugStartRequest,
  DebugStartResponse,
  DebugState,
} from '../shared/debugger-contracts';
import { publishPreviewHtml, revokePreview } from './preview-server';
import { DebugSession } from './debugger-session';
import { applicationWindowIconPath } from './application-icon';
import { createDebugPausePresenter } from './debugger-presentation';
import { installReportPreviewWindows } from './report-preview-windows';
import { DebugSourceMap, portableDebugPath } from './debugger-source-map';

const pathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => {
    const normalized = portableDebugPath(value);
    return (
      !normalized.startsWith('/') &&
      !normalized.includes(':') &&
      !normalized.split('/').includes('..')
    );
  }, 'Debugger paths must be project relative.');
const breakpointSchema = z
  .object({
    path: pathSchema,
    line: z.number().int().min(1).max(10000000),
    column: z.number().int().min(1).max(10000000).optional(),
    enabled: z.boolean(),
    condition: z.string().max(10000).optional(),
  })
  .strict();
const breakpointsSchema = z.array(breakpointSchema).max(1000);
const exceptionModeSchema = z.enum(['none', 'uncaught', 'all']);
const startSchema = z
  .object({
    rootPath: z.string().min(1),
    project: z.unknown(),
    userSources: z.record(z.string(), z.string()),
    outputDirectory: z.string().min(1).optional(),
    breakpoints: breakpointsSchema,
    pauseOnExceptions: exceptionModeSchema,
  })
  .strict();
const evaluateSchema = z
  .object({
    sessionId: z.uuid(),
    frameId: z.uuid(),
    expression: z.string().min(1).max(10000),
    throwOnSideEffect: z.boolean().optional(),
  })
  .strict();
const propertiesSchema = z.object({ sessionId: z.uuid(), objectId: z.uuid() }).strict();
const actionSchema = z.enum([
  'pause',
  'resume',
  'stepOver',
  'stepInto',
  'stepOut',
  'stop',
  'restart',
]);

export interface DebugCompilation {
  readonly build: BuildResponse;
  readonly sourceMap?: string;
  readonly scriptUrl?: string;
  readonly previewHtml?: string;
  readonly assets?: readonly ProjectAsset[];
}

interface DebugOwner {
  readonly owner: BrowserWindow;
  readonly presentPause: (state: DebugState) => void;
  request: DebugStartRequest;
  compilation?: DebugCompilation;
  initializing: boolean;
  session?: DebugSession;
  preview?: BrowserWindow;
  previewOwnerId?: number;
  messageHandler?: (event: Electron.Event, method: string, parameters: unknown) => void;
  detachHandler?: (event: Electron.Event, reason: string) => void;
  canceled: boolean;
}

const owners = new Map<number, DebugOwner>();
const stoppedStates = new Map<number, DebugState>();
const idleState: DebugState = { sessionId: null, status: 'idle', frames: [], breakpoints: [] };

function sendEvent(owner: DebugOwner, event: DebugEvent): void {
  if (!owner.owner.isDestroyed() && !owner.owner.webContents.isDestroyed()) {
    if (event.type === 'state') owner.presentPause(event.state);
    owner.owner.webContents.send('webrad:debug:event', event);
  }
}

export function getDebugState(ownerId: number): DebugState {
  const owner = owners.get(ownerId);
  return (
    owner?.session?.getState() ??
    (owner === undefined
      ? (stoppedStates.get(ownerId) ?? idleState)
      : {
          ...idleState,
          status: 'starting',
          breakpoints: owner.request.breakpoints.map((entry) => ({ ...entry, verified: false })),
        })
  );
}

/** Main-process smoke hook; never exposed through IPC or the preload bridge. */
export function getDebugPreviewWindow(ownerId: number): BrowserWindow | undefined {
  return owners.get(ownerId)?.preview;
}

/** Called on build, project release/switch, and IDE shutdown as well as Stop. */
export function stopDebuggerForOwner(ownerId: number, message?: string, error = false): DebugState {
  const owner = owners.get(ownerId);
  if (owner === undefined) return stoppedStates.get(ownerId) ?? idleState;
  owners.delete(ownerId);
  owner.canceled = true;
  owner.session?.stopped(message, error);
  const state = owner.session?.getState() ?? {
    ...idleState,
    status: error ? ('error' as const) : ('stopped' as const),
    message,
  };
  stoppedStates.set(ownerId, state);
  if (owner.session === undefined) sendEvent(owner, { type: 'state', state });
  if (owner.previewOwnerId !== undefined) revokePreview(owner.previewOwnerId);
  if (owner.preview !== undefined && !owner.preview.isDestroyed()) {
    const debuggerApi = owner.preview.webContents.debugger;
    if (owner.messageHandler !== undefined)
      debuggerApi.removeListener('message', owner.messageHandler);
    if (owner.detachHandler !== undefined)
      debuggerApi.removeListener('detach', owner.detachHandler);
    if (debuggerApi.isAttached()) debuggerApi.detach();
    owner.preview.destroy();
  }
  return state;
}

export function forgetDebuggerOwner(ownerId: number): void {
  stopDebuggerForOwner(ownerId);
  stoppedStates.delete(ownerId);
}

export interface RegisterDebuggerIpcOptions {
  readonly requireTrustedSender: (event: IpcMainInvokeEvent) => BrowserWindow;
  readonly requireGrantedRoot: (event: IpcMainInvokeEvent, rootPath: string) => void;
  readonly compile: (
    event: IpcMainInvokeEvent,
    request: DebugStartRequest,
  ) => Promise<DebugCompilation>;
}

function ensureCurrent(ownerId: number, owner: DebugOwner): void {
  if (owners.get(ownerId) !== owner || owner.canceled)
    throw new Error('Debug startup was canceled.');
}

async function startDebug(
  event: IpcMainInvokeEvent,
  request: DebugStartRequest,
  options: RegisterDebuggerIpcOptions,
  compilation?: DebugCompilation,
): Promise<DebugStartResponse> {
  const window = options.requireTrustedSender(event);
  options.requireGrantedRoot(event, request.rootPath);
  const sourcePaths = new Set(Object.keys(request.userSources).map(portableDebugPath));
  if (request.breakpoints.some((entry) => !sourcePaths.has(portableDebugPath(entry.path))))
    throw new Error('Breakpoint source is outside the compiled project.');
  const ownerId = window.webContents.id;
  stopDebuggerForOwner(ownerId);
  const owner: DebugOwner = {
    owner: window,
    presentPause: createDebugPausePresenter(window),
    request,
    canceled: false,
    initializing: true,
  };
  owners.set(ownerId, owner);
  stoppedStates.delete(ownerId);
  sendEvent(owner, { type: 'state', state: getDebugState(ownerId) });
  try {
    const result = compilation ?? (await options.compile(event, request));
    owner.compilation = result;
    ensureCurrent(ownerId, owner);
    options.requireGrantedRoot(event, request.rootPath);
    if (
      !result.build.success ||
      result.previewHtml === undefined ||
      result.sourceMap === undefined ||
      result.scriptUrl === undefined
    ) {
      const state = stopDebuggerForOwner(ownerId, 'Debug compilation failed.', true);
      return { build: result.build, state };
    }
    const preview = new BrowserWindow({
      icon: applicationWindowIconPath(),
      title: `${request.project.name} — Debug Preview`,
      width: 1100,
      height: 760,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        partition: `webrad-debug-${ownerId}-${Date.now()}`,
      },
    });
    owner.preview = preview;
    owner.previewOwnerId = preview.webContents.id;
    // Electron may defer protocol command replies until the target has navigated once.
    // Establish a blank document before attaching, then arm breakpoints before user code loads.
    await preview.loadURL('about:blank');
    ensureCurrent(ownerId, owner);
    const previewUrl = await publishPreviewHtml(
      preview.webContents.id,
      result.previewHtml,
      result.assets,
    );
    ensureCurrent(ownerId, owner);
    preview.removeMenu();
    installReportPreviewWindows(preview.webContents);
    preview.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    preview.webContents.session.setPermissionCheckHandler(() => false);
    preview.webContents.session.setDevicePermissionHandler(() => false);
    preview.webContents.on('will-navigate', (navigation, url) => {
      if (url !== previewUrl) navigation.preventDefault();
    });
    preview.webContents.on('will-redirect', (navigation) => navigation.preventDefault());
    preview.on('closed', () => {
      if (owners.get(ownerId) === owner) stopDebuggerForOwner(ownerId, 'Debug Preview was closed.');
    });
    preview.webContents.on('render-process-gone', (_event, details) => {
      if (owners.get(ownerId) === owner)
        stopDebuggerForOwner(ownerId, `Debug Preview exited: ${details.reason}.`, true);
    });
    const debuggerApi = preview.webContents.debugger;
    const sourceMap = new DebugSourceMap(result.sourceMap, Object.keys(request.userSources));
    const session = new DebugSession(
      { send: (method, parameters) => debuggerApi.sendCommand(method, parameters) },
      sourceMap,
      result.scriptUrl,
      (debugEvent) => sendEvent(owner, debugEvent),
    );
    owner.session = session;
    owner.messageHandler = (_event, method, parameters) => {
      void session.onMessage(method, parameters).catch((error: unknown) => {
        if (owners.get(ownerId) === owner)
          stopDebuggerForOwner(
            ownerId,
            error instanceof Error ? error.message : 'Debug protocol failed.',
            true,
          );
      });
    };
    owner.detachHandler = (_event, reason) => {
      if (owners.get(ownerId) === owner)
        stopDebuggerForOwner(ownerId, `Debugger detached: ${reason}.`, true);
    };
    debuggerApi.on('message', owner.messageHandler);
    debuggerApi.on('detach', owner.detachHandler);
    debuggerApi.attach('1.3');
    await session.initialize(request.breakpoints, request.pauseOnExceptions);
    let installed = request;
    while (installed !== owner.request) {
      ensureCurrent(ownerId, owner);
      installed = owner.request;
      await session.setBreakpoints(installed.breakpoints);
      await session.setPauseOnExceptions(installed.pauseOnExceptions);
    }
    owner.initializing = false;
    ensureCurrent(ownerId, owner);
    // loadURL waits for execution. A startup breakpoint must never block the IDE's start IPC.
    void preview.loadURL(previewUrl).catch((error: unknown) => {
      if (owners.get(ownerId) === owner)
        stopDebuggerForOwner(
          ownerId,
          error instanceof Error ? error.message : 'Unable to open Debug Preview.',
          true,
        );
    });
    return { build: { ...result.build, previewUrl }, state: session.getState() };
  } catch (error) {
    if (owners.get(ownerId) === owner)
      stopDebuggerForOwner(
        ownerId,
        error instanceof Error ? error.message : 'Unable to start debugger.',
        true,
      );
    else if (owner.previewOwnerId !== undefined) revokePreview(owner.previewOwnerId);
    throw error;
  }
}

export function registerDebuggerIpc(options: RegisterDebuggerIpcOptions): void {
  const trusted = (event: IpcMainInvokeEvent): number =>
    options.requireTrustedSender(event).webContents.id;
  const current = (ownerId: number): DebugSession => {
    const session = owners.get(ownerId)?.session;
    if (session === undefined) throw new Error('No active debug session.');
    return session;
  };
  const singleInput = (input: unknown[]): unknown => {
    if (input.length !== 1) throw new Error('Debug IPC requires exactly one argument.');
    return input[0];
  };
  ipcMain.handle('webrad:debug:start', async (event, ...input: unknown[]) => {
    trusted(event);
    const parsed = startSchema.parse(singleInput(input));
    // The project parser runs inside the compilation handler after root authorization.
    return startDebug(event, parsed as DebugStartRequest, options);
  });
  ipcMain.handle('webrad:debug:state', (event, ...input: unknown[]) => {
    const id = trusted(event);
    if (input.length > 0) throw new Error('Debug state does not accept arguments.');
    return getDebugState(id);
  });
  ipcMain.handle('webrad:debug:command', async (event, ...input: unknown[]) => {
    const id = trusted(event);
    const action = actionSchema.parse(singleInput(input));
    if (action === 'stop') return stopDebuggerForOwner(id);
    if (action === 'restart') {
      const owner = owners.get(id);
      if (owner === undefined) throw new Error('No debug session to restart.');
      return (await startDebug(event, owner.request, options, owner.compilation)).state;
    }
    return current(id).command(action);
  });
  ipcMain.handle('webrad:debug:breakpoints', async (event, ...input: unknown[]) => {
    const id = trusted(event);
    const breakpoints = breakpointsSchema.parse(singleInput(input)) as readonly DebugBreakpoint[];
    const owner = owners.get(id);
    if (owner === undefined) return getDebugState(id);
    const sourcePaths = new Set(Object.keys(owner.request.userSources).map(portableDebugPath));
    if (breakpoints.some((entry) => !sourcePaths.has(portableDebugPath(entry.path))))
      throw new Error('Breakpoint source is outside the compiled project.');
    owner.request = { ...owner.request, breakpoints };
    if (owner.initializing) return getDebugState(id);
    const session = current(id);
    return session.setBreakpoints(breakpoints);
  });
  ipcMain.handle('webrad:debug:exceptions', async (event, ...input: unknown[]) => {
    const id = trusted(event);
    const mode = exceptionModeSchema.parse(singleInput(input));
    const owner = owners.get(id);
    if (owner === undefined) return;
    owner.request = { ...owner.request, pauseOnExceptions: mode };
    if (owner.initializing) return;
    await current(id).setPauseOnExceptions(mode);
  });
  ipcMain.handle('webrad:debug:evaluate', (event, ...input: unknown[]) => {
    const id = trusted(event);
    const request = evaluateSchema.parse(singleInput(input));
    return current(id).evaluate(
      request.sessionId,
      request.frameId,
      request.expression,
      request.throwOnSideEffect,
    );
  });
  ipcMain.handle('webrad:debug:properties', (event, ...input: unknown[]) => {
    const id = trusted(event);
    const request = propertiesSchema.parse(singleInput(input));
    return current(id).properties(request.sessionId, request.objectId);
  });
}
