import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  NpmPackageNameSchema,
  NpmPackageVersionSchema,
  ProjectPackagesSchema,
  parseProject,
  type WebRadProject,
} from '@webrad/project-model';
import { z } from 'zod';
import type {
  InstalledPackage,
  PackageOperationRequest,
  PackageOperationResult,
  PackageProgress,
  PackageStatus,
} from '../shared/package-contracts';
import { assertOwnedPackageManifest } from './package-manifest';
import { loadProjectFiles, resolveInsideProjectSecure, saveProjectFiles } from './project-files';
import { detectNpmToolchain, executeNpm, redactPackageLog } from './package-toolchain';
import { latestPackageVersion } from './package-registry';
import { invalidatePackageTypes } from './package-types';

/** npm may replace directories, so reject pre-existing links before it can follow one. */
export async function assertSafePackageTree(rootPath: string, signal?: AbortSignal): Promise<void> {
  const root = await fs.realpath(rootPath);
  const modules = path.join(root, 'node_modules');
  const queue = [modules];
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    signal?.throwIfAborted();
    const current = queue[index];
    if (current === undefined) continue;
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    if (++visited > 200_000)
      throw new Error(
        'The existing node_modules tree is too large to inspect safely. Move it aside and restore dependencies.',
      );
    if (stat.isSymbolicLink()) {
      const real = await fs.realpath(current);
      const relative = path.relative(modules, real);
      if (
        current === modules ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error(
          'node_modules contains a link outside the project dependencies. Remove the link before installing or restoring packages.',
        );
    } else if (stat.isDirectory()) {
      for (const entry of await fs.readdir(current)) queue.push(path.join(current, entry));
    }
  }
}

export async function loadPackagesProject(
  rootPath: string,
  projectId: string,
): Promise<WebRadProject> {
  if (!path.isAbsolute(rootPath)) throw new Error('An absolute opened project folder is required.');
  const files = await fs.readdir(rootPath);
  for (const file of files.filter((candidate) => candidate.endsWith('.wrproj'))) {
    const session = await loadProjectFiles(await resolveInsideProjectSecure(rootPath, file));
    if (session.project.id === projectId) return session.project;
  }
  throw new Error('Packages must belong to the active opened WebRAD project.');
}

export async function packageStatus(
  rootPath: string,
  project: WebRadProject,
  checkUpdates = true,
): Promise<PackageStatus> {
  const dependencies: InstalledPackage[] = [];
  for (const [name, requested] of Object.entries(project.packages?.dependencies ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    let installedVersion: string | null = null;
    let description: string | undefined;
    try {
      const manifestPath = await resolveInsideProjectSecure(
        rootPath,
        `node_modules/${name}/package.json`,
      );
      const manifest = z
        .object({ name: z.string(), version: z.string(), description: z.string().optional() })
        .parse(JSON.parse(await fs.readFile(manifestPath, 'utf8')) as unknown);
      if (manifest.name !== name)
        throw new Error(`Installed package ${name} has an unexpected manifest.`);
      installedVersion = manifest.version;
      description = manifest.description;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    dependencies.push({ name, requested, installedVersion, description });
  }
  if (checkUpdates && dependencies.length > 0) {
    const signal = AbortSignal.timeout(8_000);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, dependencies.length) }, async () => {
        while (next < dependencies.length && !signal.aborted) {
          const index = next++;
          const dependency = dependencies[index];
          if (dependency !== undefined) {
            const latestVersion = await latestPackageVersion(dependency.name, signal);
            if (latestVersion !== undefined) dependencies[index] = { ...dependency, latestVersion };
          }
        }
      }),
    );
  }
  const { available, nodeVersion, npmVersion, message } = await detectNpmToolchain();
  return {
    dependencies,
    toolchain: { available, nodeVersion, npmVersion, message },
    revision: createHash('sha256')
      .update(
        JSON.stringify([
          project.packages ?? null,
          dependencies.map((pkg) => [pkg.name, pkg.installedVersion]),
        ]),
      )
      .digest('hex'),
  };
}

export function npmOperationArguments(
  request: Pick<PackageOperationRequest, 'action' | 'name' | 'version'>,
  rootPath: string,
  hasLockfile: boolean,
): string[] {
  const flags = [
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--global=false',
    '--bin-links=false',
    '--workspaces=false',
    '--package-lock=true',
    '--registry=https://registry.npmjs.org',
    '--prefix',
    rootPath,
  ];
  if (request.action === 'restore') return [hasLockfile ? 'ci' : 'install', ...flags];
  const name = NpmPackageNameSchema.parse(request.name);
  if (request.action === 'remove') return ['uninstall', name, ...flags];
  const version = NpmPackageVersionSchema.parse(request.version ?? 'latest');
  return ['install', `${name}@${version}`, '--save-exact', ...flags];
}

export async function runPackageOperation(
  request: PackageOperationRequest,
  signal: AbortSignal,
  progress: (event: PackageProgress) => void,
): Promise<PackageOperationResult> {
  // Resolve the opened root once; a later change to an ancestor link cannot retarget npm.
  request = { ...request, rootPath: await fs.realpath(request.rootPath) };
  signal.throwIfAborted();
  let project = parseProject(request.project);
  const existing = await loadPackagesProject(request.rootPath, project.id);
  if (JSON.stringify(existing.packages ?? null) !== JSON.stringify(project.packages ?? null))
    throw new Error(
      'The package manifest changed. Refresh the project before starting another package operation.',
    );
  if (
    request.action !== 'install' &&
    request.action !== 'restore' &&
    project.packages?.dependencies[request.name ?? ''] === undefined
  )
    throw new Error('Only direct installed project dependencies can be updated or removed.');
  const toolchain = await detectNpmToolchain(true);
  if (!toolchain.available) throw new Error(toolchain.message);
  signal.throwIfAborted();
  await assertSafePackageTree(request.rootPath, signal);
  signal.throwIfAborted();
  const originalPackages = project.packages;
  const originalProject = project;
  project = parseProject({
    ...project,
    packages: originalPackages ?? { version: 1, dependencies: {}, lockfile: null },
  });
  progress({
    requestId: request.requestId,
    phase: 'preparing',
    message:
      'Saving the project and preparing its isolated package manifest. NPM lifecycle scripts are disabled.',
  });
  await saveProjectFiles({ ...request, project });
  const packagePath = await resolveInsideProjectSecure(request.rootPath, 'package.json');
  const lockPath = await resolveInsideProjectSecure(request.rootPath, 'package-lock.json');
  assertOwnedPackageManifest(await fs.readFile(packagePath, 'utf8'), project.id);
  const originalManifest = await fs.readFile(packagePath, 'utf8');
  const originalLock = originalPackages?.lockfile ?? null;
  let logTail = '';
  try {
    if (originalLock === null) await fs.rm(lockPath, { force: true });
    const result = await executeNpm(
      toolchain,
      npmOperationArguments(request, request.rootPath, originalLock !== null),
      request.rootPath,
      signal,
      (stream, raw) => {
        const message = redactPackageLog(raw);
        logTail = `${logTail}${message}`.slice(-12_000);
        progress({ requestId: request.requestId, phase: 'running', stream, message });
      },
    );
    signal.throwIfAborted();
    if (result.code !== 0)
      throw new Error(
        `NPM exited with code ${String(result.code)}${result.signal === null ? '' : ` (${result.signal})`}.\n${logTail}`,
      );
    const manifest = z
      .object({ dependencies: z.record(NpmPackageNameSchema, NpmPackageVersionSchema).optional() })
      .parse(JSON.parse(await fs.readFile(packagePath, 'utf8')) as unknown);
    const packages = ProjectPackagesSchema.parse({
      version: 1,
      dependencies: manifest.dependencies ?? {},
      lockfile: await fs.readFile(lockPath, 'utf8'),
    });
    const updated = parseProject({ ...project, packages });
    const state = await packageStatus(request.rootPath, updated, false);
    if (
      request.action !== 'remove' &&
      state.dependencies.some((dependency) => dependency.installedVersion === null)
    )
      throw new Error(
        'NPM exited successfully but a direct package is still missing. Restore dependencies and inspect the operation log.',
      );
    if (request.action === 'remove' && packages.dependencies[request.name ?? ''] !== undefined)
      throw new Error('NPM exited successfully but did not remove the requested dependency.');
    signal.throwIfAborted();
    await saveProjectFiles({ ...request, project: updated });
    invalidatePackageTypes(request.rootPath);
    progress({
      requestId: request.requestId,
      phase: 'complete',
      message: 'Package operation completed and the manifest and lockfile were saved.',
    });
    return { success: true, project: updated, state };
  } catch (error) {
    await fs.writeFile(packagePath, originalManifest, 'utf8');
    if (originalLock === null) await fs.rm(lockPath, { force: true });
    else await fs.writeFile(lockPath, originalLock, 'utf8');
    await saveProjectFiles({ ...request, project: originalProject });
    invalidatePackageTypes(request.rootPath);
    const cancelled = signal.aborted;
    const message = cancelled
      ? 'Package operation cancelled. The manifest was preserved; restore dependencies before the next build if installation was interrupted.'
      : redactPackageLog(error instanceof Error ? error.message : String(error));
    progress({ requestId: request.requestId, phase: 'complete', message });
    return {
      success: false,
      cancelled,
      error: message,
      project: originalProject,
      state: await packageStatus(request.rootPath, originalProject, false),
    };
  }
}
