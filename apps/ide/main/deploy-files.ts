import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export const DEPLOY_MANIFEST = '.webrad-deploy.json';
const APPLICATION_DIRECTORIES = ['assets'] as const;
// Previously generated empty folders can be retired together with their owned files.
const RETIRED_APPLICATION_DIRECTORIES = ['pages', 'reusable', 'models', 'units'] as const;
const PROTECTED_PROJECT_DIRECTORIES = new Set([
  'pages',
  'reusable',
  'reusables',
  'models',
  'units',
  'assets',
  '.webrad',
  '.git',
  'node_modules',
]);
const deploymentSchema = z
  .object({
    formatVersion: z.literal(1),
    projectId: z.string().min(1),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();
type DeploymentManifest = z.infer<typeof deploymentSchema>;

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function contains(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Reject links anywhere along the destination, including its existing ancestors. */
async function rejectLinkedPath(target: string): Promise<void> {
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const segment of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const entry = await fs.lstat(current);
      if (entry.isSymbolicLink())
        throw new Error('Deploy folders cannot contain symbolic links or junctions.');
      if (!entry.isDirectory()) throw new Error('The deploy destination must be a folder.');
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
  }
}

/** Resolves a configured destination without granting renderer filesystem access. */
export async function resolveDeploymentDirectory(
  rootPath: string,
  configuredPath: string,
): Promise<string> {
  if (!configuredPath.trim() || configuredPath.includes('\0')) {
    throw new Error('Choose a deploy folder in Project Settings.');
  }
  const projectRoot = await fs.realpath(path.resolve(rootPath));
  const destination = path.resolve(projectRoot, configuredPath);
  const home = path.resolve(os.homedir());
  if (
    destination === path.parse(destination).root ||
    contains(destination, home) ||
    contains(destination, projectRoot)
  ) {
    throw new Error('Choose a dedicated deploy folder, outside the home and project root folders.');
  }
  if (contains(projectRoot, destination)) {
    const firstSegment = path.relative(projectRoot, destination).split(path.sep)[0]?.toLowerCase();
    if (firstSegment === undefined || PROTECTED_PROJECT_DIRECTORIES.has(firstSegment)) {
      throw new Error('Deploy cannot replace authored project files or internal project folders.');
    }
  }
  await rejectLinkedPath(destination);
  return destination;
}

function validateArtifactPath(relativePath: string): string {
  if (
    !relativePath ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    relativePath.includes(':') ||
    relativePath.startsWith('/') ||
    relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    relativePath === DEPLOY_MANIFEST
  )
    throw new Error(`Unsafe deploy artifact path: ${relativePath}`);
  return relativePath;
}

function digest(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function directoryPaths(files: readonly string[]): Set<string> {
  const directories = new Set<string>([
    ...APPLICATION_DIRECTORIES,
    ...RETIRED_APPLICATION_DIRECTORIES,
  ]);
  for (const file of files) {
    const segments = file.split('/');
    for (let count = 1; count < segments.length; count += 1)
      directories.add(segments.slice(0, count).join('/'));
  }
  return directories;
}

async function readDeploymentManifest(
  destination: string,
  projectId: string,
): Promise<DeploymentManifest | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(destination);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (entries.length === 0) return null;
  const markerPath = path.join(destination, DEPLOY_MANIFEST);
  let manifest: DeploymentManifest;
  try {
    if ((await fs.lstat(markerPath)).isSymbolicLink()) throw new Error('Linked deploy manifest.');
    manifest = deploymentSchema.parse(JSON.parse(await fs.readFile(markerPath, 'utf8')) as unknown);
  } catch {
    throw new Error(
      "The deploy folder contains existing files. Choose an empty folder or this project's previous deploy folder.",
    );
  }
  if (manifest.projectId !== projectId)
    throw new Error('The deploy folder belongs to another project.');
  const files = Object.keys(manifest.files).map(validateArtifactPath);
  const allowedDirectories = directoryPaths(files);
  const expectedFiles = new Set(files);
  const visit = async (relativeDirectory: string): Promise<void> => {
    const directory = path.join(destination, ...relativeDirectory.split('/').filter(Boolean));
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw new Error('Deploy output contains a symbolic link or junction.');
      if (entry.isDirectory()) {
        if (!allowedDirectories.has(relativePath))
          throw new Error(`Deploy output contains an unowned folder: ${relativePath}`);
        await visit(relativePath);
      } else if (entry.isFile()) {
        if (relativePath === DEPLOY_MANIFEST) continue;
        if (!expectedFiles.delete(relativePath))
          throw new Error(`Deploy output contains an unowned file: ${relativePath}`);
        if (
          digest(await fs.readFile(path.join(destination, ...relativePath.split('/')))) !==
          manifest.files[relativePath]
        ) {
          throw new Error(
            `Deploy output was modified outside WebRAD: ${relativePath}. Choose a new empty folder to preserve it.`,
          );
        }
      } else throw new Error(`Unsupported deploy output entry: ${relativePath}`);
    }
  };
  await visit('');
  // Missing generated files are safe to regenerate; unknown or modified files are never removed.
  return manifest;
}

export async function validateDeploymentDestination(
  destination: string,
  projectId: string,
): Promise<void> {
  await rejectLinkedPath(destination);
  await readDeploymentManifest(destination, projectId);
}

const deploymentQueues = new Map<string, Promise<void>>();

async function serializeDeployment<T>(
  destination: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = pathKey(destination);
  const previous = deploymentQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  deploymentQueues.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (deploymentQueues.get(key) === tail) deploymentQueues.delete(key);
  }
}

async function removeTemporaryDirectory(parent: string, temporaryPath: string): Promise<void> {
  const resolved = path.resolve(temporaryPath);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('.webrad-deploy-')) {
    throw new Error('Refusing to clean up an unsafe deploy temporary path.');
  }
  try {
    const entry = await fs.lstat(resolved);
    if (
      entry.isSymbolicLink() ||
      !entry.isDirectory() ||
      pathKey(await fs.realpath(resolved)) !== pathKey(resolved)
    ) {
      throw new Error('Refusing to clean up a linked deploy temporary folder.');
    }
    await fs.rm(resolved, { recursive: true, force: true });
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

export interface WriteDeploymentOptions {
  readonly projectRoot: string;
  readonly destination: string;
  readonly projectId: string;
  readonly files: Readonly<Record<string, string>>;
  readonly binaryFiles?: Readonly<Record<string, Uint8Array>>;
  readonly onFileWritten?: (completed: number, total: number, relativePath: string) => void;
}

export interface WriteDeploymentResult {
  readonly fileCount: number;
  readonly cleanupWarning?: string;
}

/** Stages the whole application and restores the previous folder if publication fails. */
export async function writeDeployment(
  options: WriteDeploymentOptions,
): Promise<WriteDeploymentResult> {
  const destination = await resolveDeploymentDirectory(options.projectRoot, options.destination);
  return serializeDeployment(destination, async () => {
    const artifacts = [
      ...Object.entries(options.files),
      ...Object.entries(options.binaryFiles ?? {}),
    ];
    const keys = new Set<string>();
    for (const [relativePath] of artifacts) {
      validateArtifactPath(relativePath);
      const key = pathKey(relativePath);
      if (keys.has(key)) throw new Error(`Duplicate deploy artifact: ${relativePath}`);
      keys.add(key);
    }
    for (const relativePath of keys) {
      const segments = relativePath.split('/');
      if (APPLICATION_DIRECTORIES.some((directory) => pathKey(directory) === relativePath))
        throw new Error(`Deploy artifact conflicts with a required folder: ${relativePath}`);
      for (let count = 1; count < segments.length; count += 1) {
        if (keys.has(segments.slice(0, count).join('/')))
          throw new Error(`Deploy artifact conflicts with a folder: ${relativePath}`);
      }
    }
    await validateDeploymentDestination(destination, options.projectId);
    const parent = path.dirname(destination);
    await fs.mkdir(parent, { recursive: true });
    await rejectLinkedPath(parent);
    const token = randomUUID();
    const stage = path.join(parent, `.webrad-deploy-stage-${token}`);
    const backup = path.join(parent, `.webrad-deploy-backup-${token}`);
    let previousMoved = false;
    let published = false;
    try {
      await fs.mkdir(stage, { mode: 0o700 });
      for (const directory of APPLICATION_DIRECTORIES) await fs.mkdir(path.join(stage, directory));
      const checksums: Record<string, string> = {};
      for (const [index, [relativePath, content]] of artifacts.entries()) {
        const filePath = path.join(stage, ...relativePath.split('/'));
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        checksums[relativePath] = digest(content);
        options.onFileWritten?.(index + 1, artifacts.length, relativePath);
      }
      const manifest: DeploymentManifest = {
        formatVersion: 1,
        projectId: options.projectId,
        files: checksums,
      };
      await fs.writeFile(
        path.join(stage, DEPLOY_MANIFEST),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
      );
      await resolveDeploymentDirectory(options.projectRoot, destination);
      await validateDeploymentDestination(destination, options.projectId);
      try {
        await fs.rename(destination, backup);
        previousMoved = true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      try {
        if (previousMoved) await validateDeploymentDestination(backup, options.projectId);
        await fs.rename(stage, destination);
        published = true;
      } catch (error) {
        if (previousMoved) {
          await fs.rename(backup, destination);
          previousMoved = false;
        }
        throw error;
      }
      if (previousMoved) {
        try {
          await validateDeploymentDestination(backup, options.projectId);
          await removeTemporaryDirectory(parent, backup);
        } catch {
          return {
            fileCount: artifacts.length,
            cleanupWarning: `Deployment succeeded, but the previous output backup could not be removed: ${backup}`,
          };
        }
      }
      return { fileCount: artifacts.length };
    } finally {
      if (!published) await removeTemporaryDirectory(parent, stage);
    }
  });
}
