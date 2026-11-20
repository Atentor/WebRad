import { CodexHistoryStore } from './codex-history';
import { CodexHistoryGroupSchema } from '../shared/codex-history';
import { app, type BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { readFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { parseProject } from '@webrad/project-model';
import {
  CodexGenerateSchema,
  CodexPreferencesSchema,
  CodexReviewSchema,
} from '../shared/codex-schema';
import type {
  CodexPreferences,
  CodexProgress,
  CodexProposal,
  CodexReviewRequest,
  CodexStatus,
} from '../shared/codex-contracts';
import { CodexConnection } from './codex-connection';
import { createCodexContext } from './codex-context';
import { codexExecutable } from './codex-executable';
import { reviewCodexProposal } from './codex-review';

interface Owner {
  readonly window: BrowserWindow;
  connection?: CodexConnection;
  executable?: string;
  connectionVersion: number;
  connecting?: Promise<CodexConnection | null>;
  active?: {
    readonly id: string;
    readonly controller: AbortController;
    readonly kind: 'generate' | 'review';
  };
  changingConnection?: boolean;
}
const owners = new Map<number, Owner>();
const defaults: CodexPreferences = {
  executablePath: null,
  model: 'gpt-6.1-terra',
  effort: 'medium',
};

function assertRequestSize(request: Pick<CodexReviewRequest, 'project'>): void {
  const size = JSON.stringify({
    ...request,
    project: {
      ...request.project,
      assets: request.project.assets?.map(({ id, fileName, mediaType }) => ({
        id,
        fileName,
        mediaType,
      })),
    },
  }).length;
  if (size > 12_000_000)
    throw new Error(
      'The project source snapshot is too large for one Codex request. Narrow the document or source content before trying again.',
    );
}

export function cancelCodexForOwner(id: number, dispose = false): void {
  const owner = owners.get(id);
  owner?.active?.controller.abort();
  if (owner?.active?.kind === 'generate') {
    owner.connectionVersion += 1;
    owner.connection?.dispose();
    owner.connection = undefined;
    owner.connecting = undefined;
  }
  if (dispose) {
    owner?.connection?.dispose();
    owners.delete(id);
  }
}

interface CodexIpcOptions {
  readonly requireTrustedSender: (event: IpcMainInvokeEvent) => BrowserWindow;
  readonly requireProject: (event: IpcMainInvokeEvent, rootPath: string, projectId: string) => void;
  readonly userDataPath?: string;
  readonly resolveExecutable?: typeof codexExecutable;
}

export function registerCodexIpc(options: CodexIpcOptions): void {
  const directory = (): string =>
    path.join(options.userDataPath ?? app.getPath('userData'), 'codex');
  const history = new CodexHistoryStore(directory());
  ipcMain.handle('webrad:codex:history-read', (event, ...input: unknown[]) => {
    options.requireTrustedSender(event);
    if (input.length) throw new Error('History read accepts no arguments.');
    return history.read();
  });
  ipcMain.handle('webrad:codex:history-save', (event, ...input: unknown[]) => {
    options.requireTrustedSender(event);
    if (input.length !== 2 || JSON.stringify(input).length > 32 * 1024 * 1024)
      throw new Error('Invalid history snapshot.');
    return history.save(
      z.string().min(1).max(8192).parse(input[0]),
      CodexHistoryGroupSchema.parse(input[1]),
    );
  });
  let preferenceWrites = Promise.resolve();
  const readPreferences = async (): Promise<CodexPreferences> => {
    await preferenceWrites;
    try {
      return CodexPreferencesSchema.parse(
        JSON.parse(await readFile(path.join(directory(), 'preferences.json'), 'utf8')) as unknown,
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') throw error;
      return defaults;
    }
  };
  const writePreferences = (preferences: CodexPreferences): Promise<void> => {
    const write = preferenceWrites.then(async () => {
      await mkdir(directory(), { recursive: true });
      const temporary = path.join(directory(), `preferences-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporary, path.join(directory(), 'preferences.json'));
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    });
    preferenceWrites = write.catch(() => undefined);
    return write;
  };
  const ownerFor = (event: IpcMainInvokeEvent): Owner => {
    const window = options.requireTrustedSender(event);
    const id = window.webContents.id;
    let owner = owners.get(id);
    if (!owner) {
      owner = { window, connectionVersion: 0 };
      owners.set(id, owner);
      window.webContents.once('destroyed', () => cancelCodexForOwner(id, true));
    }
    return owner;
  };
  const connectionFor = (
    owner: Owner,
    preferences: CodexPreferences,
  ): Promise<CodexConnection | null> => {
    if (owner.connecting) return owner.connecting;
    const version = owner.connectionVersion;
    const task = (async (): Promise<CodexConnection | null> => {
      const executable = await (options.resolveExecutable ?? codexExecutable)(
        preferences.executablePath,
      );
      if (owner.connectionVersion !== version)
        throw new Error('The Codex connection changed. Refresh to reconnect.');
      owner.active?.controller.signal.throwIfAborted();
      if (owner.window.isDestroyed()) throw new Error('The WebRAD window was closed.');
      if (!executable) return null;
      const existing = owner.connection;
      if (existing && owner.executable === executable) {
        await existing.start();
        if (owner.window.isDestroyed() || owner.connectionVersion !== version) {
          throw new Error('The Codex connection was canceled.');
        }
        owner.active?.controller.signal.throwIfAborted();
        return existing;
      }
      owner.connection?.dispose();
      const connection = new CodexConnection(executable, directory());
      owner.connection = connection;
      owner.executable = executable;
      connection.onAccountChanged(() => {
        if (!owner.window.isDestroyed() && !owner.window.webContents.isDestroyed()) {
          owner.window.webContents.send('webrad:codex:account-changed');
        }
      });
      connection.onUsageChanged(() => {
        if (!owner.window.isDestroyed() && !owner.window.webContents.isDestroyed())
          owner.window.webContents.send('webrad:codex:usage-changed');
      });
      await connection.start();
      if (
        owner.window.isDestroyed() ||
        owner.connectionVersion !== version ||
        owner.active?.controller.signal.aborted
      ) {
        connection.dispose();
        throw new Error('The Codex connection was canceled.');
      }
      return connection;
    })();
    owner.connecting = task;
    void task
      .finally(() => {
        if (owner.connecting === task) owner.connecting = undefined;
      })
      .catch(() => undefined);
    return task;
  };
  const status = async (owner: Owner): Promise<CodexStatus> => {
    const version = owner.connectionVersion;
    const preferences = await readPreferences();
    if (owner.connectionVersion !== version) return status(owner);
    try {
      const connection = await connectionFor(owner, preferences);
      if (!connection)
        return {
          available: false,
          executablePath: null,
          account: null,
          models: [],
          preferences,
          message: 'Install Codex CLI or select the Codex executable from your IDE extension.',
        };
      const account = await connection.account();
      if (owner.connectionVersion !== version || owner.connection !== connection)
        return status(owner);
      let modelError: string | undefined;
      const models = await connection.models().catch((error: unknown) => {
        if (account)
          modelError =
            error instanceof Error
              ? error.message
              : 'Could not read the Codex model catalog. Refresh to try again.';
        return [];
      });
      if (owner.connectionVersion !== version || owner.connection !== connection)
        return status(owner);
      return {
        available: true,
        executablePath: owner.executable ?? null,
        account,
        models,
        preferences,
        loginPending: connection.loginPending,
        ...(connection.loginError ? { message: connection.loginError } : {}),
        ...(account && models.length === 0
          ? {
              message:
                modelError ??
                'GPT-6.1 Terra and Sol are not in this Codex model catalog. Update Codex or check your account access.',
            }
          : {}),
      };
    } catch (error) {
      if (owner.connectionVersion !== version) return status(owner);
      return {
        available: false,
        executablePath: owner.executable ?? preferences.executablePath,
        account: null,
        models: [],
        preferences,
        message: error instanceof Error ? error.message : 'Could not connect to Codex.',
      };
    }
  };
  const noArguments = (input: readonly unknown[]): void => {
    if (input.length > 0) throw new Error('This Codex operation does not accept arguments.');
  };
  const argument = (input: readonly unknown[]): unknown => {
    if (input.length !== 1) throw new Error('Codex requires exactly one argument.');
    return input[0];
  };
  ipcMain.handle('webrad:codex:status', (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    noArguments(input);
    return status(owner);
  });
  ipcMain.handle('webrad:codex:usage', async (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    noArguments(input);
    if (owner.changingConnection || owner.connection?.loginPending)
      throw new Error('Complete the connection change before refreshing usage.');
    const version = owner.connectionVersion;
    const connection = await connectionFor(owner, await readPreferences());
    if (!connection) throw new Error('Connect Codex to view usage limits.');
    const usage = await connection.usage();
    if (version !== owner.connectionVersion || connection !== owner.connection)
      throw new Error('The Codex connection changed. Refresh usage.');
    return usage;
  });
  ipcMain.handle('webrad:codex:choose-executable', async (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    noArguments(input);
    if (owner.active || owner.changingConnection || owner.connection?.loginPending)
      throw new Error(
        'Finish or cancel the current Codex operation before changing its connection.',
      );
    owner.changingConnection = true;
    try {
      const selected = await dialog.showOpenDialog(owner.window, {
        title: 'Select Codex executable',
        properties: ['openFile'],
        ...(process.platform === 'win32'
          ? { filters: [{ name: 'Codex executable', extensions: ['exe'] }] }
          : {}),
      });
      const candidate = selected.filePaths[0];
      if (!selected.canceled && candidate) {
        const executablePath = await (options.resolveExecutable ?? codexExecutable)(candidate);
        await writePreferences({ ...(await readPreferences()), executablePath });
        owner.connectionVersion += 1;
        owner.connection?.dispose();
        owner.connection = undefined;
        owner.connecting = undefined;
      }
      return await status(owner);
    } finally {
      owner.changingConnection = false;
    }
  });
  ipcMain.handle('webrad:codex:preferences', async (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    const preferences = CodexPreferencesSchema.parse(argument(input));
    const version = owner.connectionVersion;
    const previous = await readPreferences();
    if (owner.connectionVersion !== version)
      throw new Error('The Codex connection changed. Refresh its settings before trying again.');
    if (preferences.executablePath !== previous.executablePath)
      throw new Error('Choose the Codex executable using the file picker.');
    if (owner.active || owner.changingConnection || owner.connection?.loginPending)
      throw new Error('Finish or cancel the current Codex operation before changing its settings.');
    owner.changingConnection = true;
    try {
      const connection = await connectionFor(owner, previous);
      if (!connection) throw new Error('Select a Codex installation before changing models.');
      const models = await connection.models();
      const model = models.find((item) => item.id === preferences.model);
      if (!model?.efforts.some((item) => item.id === preferences.effort)) {
        throw new Error(
          'The selected model or reasoning effort is no longer in the Codex catalog. Refresh the connection.',
        );
      }
      await writePreferences(preferences);
      return await status(owner);
    } finally {
      owner.changingConnection = false;
    }
  });
  ipcMain.handle('webrad:codex:login', async (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    noArguments(input);
    if (owner.active || owner.changingConnection || owner.connection?.loginPending)
      throw new Error('Finish or cancel the current Codex operation before signing in.');
    owner.changingConnection = true;
    try {
      const connection = await connectionFor(owner, await readPreferences());
      if (!connection) throw new Error('Install or select Codex before signing in.');
      const url = new URL(await connection.login());
      if (
        url.protocol !== 'https:' ||
        !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)
      ) {
        await connection.cancelLogin();
        throw new Error('Codex returned an unsupported sign-in address.');
      }
      if (!connection.loginPending) return;
      try {
        await shell.openExternal(url.href);
      } catch (error) {
        await connection.cancelLogin();
        throw error;
      }
    } finally {
      owner.changingConnection = false;
    }
  });
  ipcMain.handle('webrad:codex:cancel-login', async (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    noArguments(input);
    await owner.connection?.cancelLogin();
  });
  ipcMain.handle('webrad:codex:cancel', (event, ...input: unknown[]) => {
    const owner = ownerFor(event);
    const id = z.uuid().parse(argument(input));
    if (owner.active?.id === id) cancelCodexForOwner(owner.window.webContents.id);
  });
  ipcMain.handle(
    'webrad:codex:generate',
    async (event, ...input: unknown[]): Promise<CodexProposal> => {
      const owner = ownerFor(event);
      const request = CodexGenerateSchema.parse(argument(input));
      if (!path.isAbsolute(request.rootPath))
        throw new Error('Codex needs an opened project folder.');
      const project = parseProject(request.project);
      options.requireProject(event, request.rootPath, project.id);
      assertRequestSize({ ...request, project });
      if (owner.active || owner.changingConnection)
        throw new Error('A Codex operation is already in progress.');
      const active = {
        id: request.requestId,
        controller: new AbortController(),
        kind: 'generate' as const,
      };
      owner.active = active;
      const { signal } = active.controller;
      const progress = (phase: CodexProgress['phase'], message: string): void => {
        if (!owner.window.isDestroyed() && !owner.window.webContents.isDestroyed()) {
          owner.window.webContents.send('webrad:codex:progress', {
            requestId: request.requestId,
            phase,
            message,
          } satisfies CodexProgress);
        }
      };
      try {
        progress('connecting', 'Connecting to Codex…');
        const connection = await connectionFor(owner, await readPreferences());
        signal.throwIfAborted();
        if (!connection) throw new Error('Install or select Codex before creating a proposal.');
        if (connection.loginPending)
          throw new Error('Complete or cancel the ChatGPT sign-in before creating a proposal.');
        if (!(await connection.account())) {
          throw new Error('Sign in with your ChatGPT account to use Codex.');
        }
        const models = await connection.models();
        signal.throwIfAborted();
        const model = models.find((item) => item.id === request.model);
        if (!model || !model.efforts.some((effort) => effort.id === request.effort)) {
          throw new Error(
            'The selected model or reasoning level is unavailable. Refresh the Codex connection.',
          );
        }
        const context = createCodexContext({ ...request, project }, project);
        progress(
          'designing',
          `Designing with ${context.summary.documents} project documents and ${context.summary.sources} source files in context…`,
        );
        const plan = await connection.generate(
          context.prompt,
          request.model,
          request.effort,
          signal,
          (message) => {
            if (!signal.aborted) progress('designing', message);
          },
          {
            key: JSON.stringify([
              request.rootPath,
              project.id,
              request.conversationId ?? request.requestId,
            ]),
            data: context.data,
            request: request.prompt,
          },
        );
        signal.throwIfAborted();
        progress('checking', 'Reviewing the project model and TypeScript…');
        const proposal = await reviewCodexProposal({ ...request, project, plan }, signal);
        signal.throwIfAborted();
        options.requireProject(event, request.rootPath, project.id);
        return {
          ...proposal,
          contextSummary: context.summary,
        };
      } finally {
        if (owner.active === active) owner.active = undefined;
      }
    },
  );
  ipcMain.handle(
    'webrad:codex:review',
    async (event, ...input: unknown[]): Promise<CodexProposal> => {
      const owner = ownerFor(event);
      const request = CodexReviewSchema.parse(argument(input));
      if (!path.isAbsolute(request.rootPath))
        throw new Error('Codex review needs an opened project folder.');
      const project = parseProject(request.project);
      options.requireProject(event, request.rootPath, project.id);
      assertRequestSize({ ...request, project });
      if (owner.active || owner.changingConnection)
        throw new Error('Wait for the current Codex operation to finish.');
      const active = {
        id: request.requestId,
        controller: new AbortController(),
        kind: 'review' as const,
      };
      owner.active = active;
      try {
        const proposal = await reviewCodexProposal(
          { ...request, project },
          active.controller.signal,
        );
        active.controller.signal.throwIfAborted();
        options.requireProject(event, request.rootPath, project.id);
        return proposal;
      } finally {
        if (owner.active === active) owner.active = undefined;
      }
    },
  );
}
