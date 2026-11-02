import path from 'node:path';
import { realpathSync } from 'node:fs';
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { NpmPackageNameSchema, NpmPackageVersionSchema, parseProject } from '@webrad/project-model';
import { loadPackagesProject, packageStatus, runPackageOperation } from './package-service';
import { readPackageTypes } from './package-types';
import { searchNpmRegistry } from './package-registry';
import type { PackageOperationRequest } from '../shared/package-contracts';

const requestIdSchema = z.string().min(1).max(128);
const projectSchema = z
  .object({
    rootPath: z.string().min(1).refine(path.isAbsolute),
    projectId: z.string().min(1).max(256),
  })
  .strict();
const operationSchema = z
  .object({
    rootPath: z.string().min(1).refine(path.isAbsolute),
    project: z.unknown(),
    userSources: z.record(z.string(), z.string()),
    requestId: requestIdSchema,
    action: z.enum(['install', 'update', 'remove', 'restore']),
    name: NpmPackageNameSchema.optional(),
    version: NpmPackageVersionSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.action !== 'restore' && request.name === undefined)
      context.addIssue({ code: 'custom', path: ['name'], message: 'A package name is required.' });
    if (
      request.action === 'restore' &&
      (request.name !== undefined || request.version !== undefined)
    )
      context.addIssue({
        code: 'custom',
        message: 'Restore does not accept a package name or version.',
      });
    if (request.action === 'remove' && request.version !== undefined)
      context.addIssue({ code: 'custom', message: 'Remove does not accept a version.' });
  });
const searchSchema = z
  .object({
    requestId: requestIdSchema,
    query: z.string().trim().min(1).max(300),
    offset: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();
const typesSchema = projectSchema
  .extend({ imports: z.array(z.string().min(1).max(512)).max(1000) })
  .strict();
interface ActiveRequest {
  readonly requestId: string;
  readonly controller: AbortController;
  readonly kind: 'operation' | 'search';
}
const active = new Map<number, Map<string, ActiveRequest>>();
const rootLocks = new Set<string>();
function packageRootKey(rootPath: string): string {
  const real = realpathSync(rootPath);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}
export function isPackageRootBusy(rootPath: string): boolean {
  if (rootLocks.size === 0) return false;
  try {
    return rootLocks.has(packageRootKey(rootPath));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}
export function isPackageOperationRunning(owner: number): boolean {
  return [...(active.get(owner)?.values() ?? [])].some((request) => request.kind === 'operation');
}
export function cancelPackagesForOwner(owner: number): void {
  for (const request of active.get(owner)?.values() ?? []) request.controller.abort();
}
function onlyArgument(input: readonly unknown[]): unknown {
  if (input.length !== 1) throw new Error('Packages IPC requires exactly one argument.');
  return input[0];
}
export interface PackagesIpcOptions {
  readonly requireTrustedSender: (event: IpcMainInvokeEvent) => BrowserWindow;
  readonly requireProject: (event: IpcMainInvokeEvent, rootPath: string, projectId: string) => void;
  readonly beforeOperation: (event: IpcMainInvokeEvent, rootPath: string) => void;
}
export function registerPackagesIpc(options: PackagesIpcOptions): void {
  const start = (
    owner: number,
    requestId: string,
    kind: ActiveRequest['kind'],
  ): AbortController => {
    const requests = active.get(owner) ?? new Map<string, ActiveRequest>();
    if (requests.has(requestId)) throw new Error('This package request is already running.');
    if (kind === 'operation' && isPackageOperationRunning(owner))
      throw new Error('Wait for the current package operation to finish.');
    if (requests.size >= 5)
      throw new Error('Too many package requests are active. Cancel the current search first.');
    const controller = new AbortController();
    requests.set(requestId, { requestId, controller, kind });
    active.set(owner, requests);
    return controller;
  };
  const finish = (owner: number, requestId: string): void => {
    const requests = active.get(owner);
    requests?.delete(requestId);
    if (requests?.size === 0) active.delete(owner);
  };
  ipcMain.handle('webrad:packages:status', async (event, ...input: unknown[]) => {
    options.requireTrustedSender(event);
    const request = projectSchema.parse(onlyArgument(input));
    options.requireProject(event, request.rootPath, request.projectId);
    return packageStatus(
      request.rootPath,
      await loadPackagesProject(request.rootPath, request.projectId),
    );
  });
  ipcMain.handle('webrad:packages:types', async (event, ...input: unknown[]) => {
    options.requireTrustedSender(event);
    const request = typesSchema.parse(onlyArgument(input));
    options.requireProject(event, request.rootPath, request.projectId);
    const project = await loadPackagesProject(request.rootPath, request.projectId);
    options.requireProject(event, request.rootPath, request.projectId);
    return readPackageTypes(request.rootPath, project, request.imports);
  });
  ipcMain.handle('webrad:packages:run', async (event, ...input: unknown[]) => {
    const window = options.requireTrustedSender(event);
    const parsed = operationSchema.parse(onlyArgument(input));
    const request: PackageOperationRequest = { ...parsed, project: parseProject(parsed.project) };
    options.requireProject(event, request.rootPath, request.project.id);
    options.beforeOperation(event, request.rootPath);
    const key = packageRootKey(request.rootPath);
    if (rootLocks.has(key)) throw new Error("Another window is changing this project's packages.");
    const owner = window.webContents.id;
    const controller = start(owner, request.requestId, 'operation');
    rootLocks.add(key);
    try {
      return await runPackageOperation(request, controller.signal, (progress) => {
        if (!window.isDestroyed() && !window.webContents.isDestroyed())
          window.webContents.send('webrad:packages:progress', progress);
      });
    } finally {
      rootLocks.delete(key);
      finish(owner, request.requestId);
    }
  });
  ipcMain.handle('webrad:packages:search', async (event, ...input: unknown[]) => {
    const window = options.requireTrustedSender(event);
    const request = searchSchema.parse(onlyArgument(input));
    const owner = window.webContents.id;
    const controller = start(owner, request.requestId, 'search');
    try {
      return await searchNpmRegistry(request, controller.signal);
    } finally {
      finish(owner, request.requestId);
    }
  });
  ipcMain.handle('webrad:packages:cancel', (event, ...input: unknown[]) => {
    const window = options.requireTrustedSender(event);
    active
      .get(window.webContents.id)
      ?.get(requestIdSchema.parse(onlyArgument(input)))
      ?.controller.abort();
  });
}
