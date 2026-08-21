import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assembleProject,
  createProject,
  deserializePage,
  deserializeProjectManifest,
  parseProject,
  projectToManifest,
  serializePage,
  serializeProjectManifest,
  type PageModel,
  type ProjectManifest,
  type WebRadProject,
} from '@webrad/project-model';
import { createUserPageSource, generatePageSource } from '@webrad/language';
import type { ProjectSession, SaveProjectRequest } from '../shared/contracts';

const PROJECT_EXTENSION = '.wrproj';

function normalizeRoot(rootPath: string): string {
  if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
    throw new Error('A project root path is required.');
  }
  const resolved = path.resolve(rootPath);
  if (!path.isAbsolute(resolved)) throw new Error('The project root must be an absolute path.');
  return resolved;
}

export function resolveInsideProject(rootPath: string, relativePath: string): string {
  const root = normalizeRoot(rootPath);
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes('\0')
  ) {
    throw new Error('A safe relative project path is required.');
  }
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('The requested path is outside the opened project.');
  }
  return target;
}

function isInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveInsideProjectSecure(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const root = normalizeRoot(rootPath);
  const lexicalTarget = resolveInsideProject(root, relativePath);
  const realRoot = await fs.realpath(root);
  const segments = path.relative(root, lexicalTarget).split(path.sep).filter(Boolean);
  let current = realRoot;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) continue;
    const candidate = path.join(current, segment);
    try {
      current = await fs.realpath(candidate);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      current = path.join(current, ...segments.slice(index));
      break;
    }
    if (!isInside(realRoot, current)) {
      throw new Error('The requested path resolves outside the opened project.');
    }
  }

  if (!isInside(realRoot, current)) {
    throw new Error('The requested path resolves outside the opened project.');
  }
  return current;
}

async function writeUtf8(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, content, 'utf8');
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function descriptorPaths(manifest: ProjectManifest): readonly string[] {
  return manifest.pages.flatMap((descriptor) => [
    descriptor.pageFile,
    descriptor.generatedFile,
    descriptor.codeFile,
  ]);
}

function pathKey(filePath: string): string {
  const portable = filePath.replaceAll('\\', '/');
  return process.platform === 'win32' ? portable.toLowerCase() : portable;
}

const rootOperationQueues = new Map<string, Promise<void>>();

async function withRootOperation<T>(rootPath: string, operation: () => Promise<T>): Promise<T> {
  const normalizedRoot = normalizeRoot(rootPath);
  let operationRoot = normalizedRoot;
  try {
    operationRoot = await fs.realpath(normalizedRoot);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const key = pathKey(operationRoot);
  const previous = rootOperationQueues.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.then(() => current);
  rootOperationQueues.set(key, tail);

  await previous;
  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (rootOperationQueues.get(key) === tail) rootOperationQueues.delete(key);
  }
}

type ArtifactKind = 'page' | 'generated' | 'code';

interface OwnedArtifact {
  readonly projectId: string;
  readonly pageId: string;
  readonly kind: ArtifactKind;
  readonly relativePath: string;
}

interface ArtifactWrite extends OwnedArtifact {
  readonly content: string;
  readonly targetPath: string;
}

interface RollbackEntry {
  readonly targetPath: string;
  readonly previousContent: string | null;
}

interface PendingCleanup {
  readonly formatVersion: 1;
  readonly projectId: string;
  readonly retiredPaths: readonly string[];
}

const PENDING_CLEANUP_PATH = '.webrad/pending-cleanup.json';

function manifestArtifacts(manifest: ProjectManifest): readonly OwnedArtifact[] {
  return manifest.pages.flatMap((descriptor) => [
    {
      projectId: manifest.id,
      pageId: descriptor.id,
      kind: 'page' as const,
      relativePath: descriptor.pageFile,
    },
    {
      projectId: manifest.id,
      pageId: descriptor.id,
      kind: 'generated' as const,
      relativePath: descriptor.generatedFile,
    },
    {
      projectId: manifest.id,
      pageId: descriptor.id,
      kind: 'code' as const,
      relativePath: descriptor.codeFile,
    },
  ]);
}

function sameOwner(left: OwnedArtifact, right: OwnedArtifact): boolean {
  return (
    left.projectId === right.projectId && left.pageId === right.pageId && left.kind === right.kind
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function copyFileCreatingDirectory(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function restoreWrites(entries: readonly RollbackEntry[]): Promise<readonly unknown[]> {
  const errors: unknown[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.previousContent === null) {
        await fs.rm(entry.targetPath, { force: true });
      } else {
        await writeUtf8(entry.targetPath, entry.previousContent);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function sourcePathFor(page: PageModel): string {
  return `pages/${page.name}.ts`;
}

export function defaultUserSources(project: WebRadProject): Record<string, string> {
  return Object.fromEntries(
    project.pages.map((page) => [sourcePathFor(page), createUserPageSource(page)]),
  );
}

function validateCanonicalDescriptors(manifest: ProjectManifest): void {
  for (const descriptor of manifest.pages) {
    const basePath = `pages/${descriptor.name}`;
    const expected = {
      pageFile: `${basePath}.wrpage`,
      generatedFile: `${basePath}.generated.ts`,
      codeFile: `${basePath}.ts`,
    } as const;
    for (const key of ['pageFile', 'generatedFile', 'codeFile'] as const) {
      if (descriptor[key] !== expected[key]) {
        throw new Error(`Page descriptor ${descriptor.name}.${key} must be "${expected[key]}".`);
      }
    }
  }
}

function parsePendingCleanup(value: unknown): PendingCleanup {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid pending project cleanup journal.');
  }
  const formatVersion = Reflect.get(value, 'formatVersion');
  const projectId = Reflect.get(value, 'projectId');
  const retiredPaths = Reflect.get(value, 'retiredPaths');
  if (
    formatVersion !== 1 ||
    typeof projectId !== 'string' ||
    !Array.isArray(retiredPaths) ||
    !retiredPaths.every((entry) => typeof entry === 'string' && entry.length > 0)
  ) {
    throw new Error('Invalid pending project cleanup journal.');
  }
  return { formatVersion, projectId, retiredPaths };
}

async function readPendingCleanup(rootPath: string): Promise<PendingCleanup | null> {
  const journalPath = await resolveInsideProjectSecure(rootPath, PENDING_CLEANUP_PATH);
  try {
    return parsePendingCleanup(JSON.parse(await fs.readFile(journalPath, 'utf8')) as unknown);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writePendingCleanup(
  rootPath: string,
  projectId: string,
  retiredPaths: readonly string[],
): Promise<void> {
  if (retiredPaths.length === 0) return;
  let existingPaths: readonly string[] = [];
  try {
    const existing = await readPendingCleanup(rootPath);
    if (existing?.projectId === projectId) existingPaths = existing.retiredPaths;
  } catch {
    // Replace an unreadable internal journal with a validated one.
  }
  const journal: PendingCleanup = {
    formatVersion: 1,
    projectId,
    retiredPaths: [...new Set([...existingPaths, ...retiredPaths])],
  };
  await writeUtf8(
    await resolveInsideProjectSecure(rootPath, PENDING_CLEANUP_PATH),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
}

async function applyPendingCleanup(rootPath: string, manifest: ProjectManifest): Promise<void> {
  const journal = await readPendingCleanup(rootPath);
  if (journal === null) return;
  if (journal.projectId !== manifest.id) {
    throw new Error('Pending cleanup journal belongs to a different WebRAD project.');
  }
  const currentPaths = new Set(descriptorPaths(manifest).map(pathKey));
  for (const retiredPath of journal.retiredPaths) {
    if (currentPaths.has(pathKey(retiredPath))) continue;
    await fs.rm(await resolveInsideProjectSecure(rootPath, retiredPath), { force: true });
  }
  await fs.rm(await resolveInsideProjectSecure(rootPath, PENDING_CLEANUP_PATH), { force: true });
}

async function tryApplyPendingCleanup(rootPath: string, manifest: ProjectManifest): Promise<void> {
  try {
    await applyPendingCleanup(rootPath, manifest);
  } catch {
    // The manifest is already authoritative. A later open/save retries cleanup.
  }
}

async function archiveArtifacts(
  rootPath: string,
  artifacts: readonly OwnedArtifact[],
): Promise<void> {
  const existingArtifacts: { artifact: OwnedArtifact; sourcePath: string }[] = [];
  for (const artifact of artifacts) {
    const sourcePath = await resolveInsideProjectSecure(rootPath, artifact.relativePath);
    if (await exists(sourcePath)) existingArtifacts.push({ artifact, sourcePath });
  }
  if (existingArtifacts.length === 0) return;

  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const trashPrefix = `.webrad/trash/${timestamp}-${randomUUID()}`;
  for (const { artifact, sourcePath } of existingArtifacts) {
    const trashPath = await resolveInsideProjectSecure(
      rootPath,
      `${trashPrefix}/${artifact.relativePath}`,
    );
    await copyFileCreatingDirectory(sourcePath, trashPath);
  }
}

async function saveProjectFilesUnlocked(
  request: SaveProjectRequest,
  rootPath: string,
): Promise<ProjectSession> {
  const project = parseProject(request.project);
  const manifest = projectToManifest(project);
  const projectFilePath = await resolveInsideProjectSecure(
    rootPath,
    `${project.name}${PROJECT_EXTENSION}`,
  );
  let previousManifest: ProjectManifest | null = null;
  try {
    previousManifest = deserializeProjectManifest(await fs.readFile(projectFilePath, 'utf8'));
    validateManifestProjectName(previousManifest, projectFilePath);
    validateCanonicalDescriptors(previousManifest);
    if (previousManifest.id !== manifest.id) {
      throw new Error('The destination already contains a different WebRAD project.');
    }
    await tryApplyPendingCleanup(rootPath, previousManifest);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  const previousArtifacts = previousManifest ? manifestArtifacts(previousManifest) : [];
  const previousByPath = new Map(
    previousArtifacts.map((artifact) => [pathKey(artifact.relativePath), artifact]),
  );
  const currentArtifacts = manifestArtifacts(manifest);
  const currentByPath = new Map(
    currentArtifacts.map((artifact) => [pathKey(artifact.relativePath), artifact]),
  );

  for (const artifact of currentArtifacts) {
    const targetPath = await resolveInsideProjectSecure(rootPath, artifact.relativePath);
    if ((await exists(targetPath)) && !previousByPath.has(pathKey(artifact.relativePath))) {
      throw new Error(
        `Refusing to overwrite unowned project file "${artifact.relativePath}". Move or rename it first.`,
      );
    }
  }

  const artifactsToArchive = previousArtifacts.filter((artifact) => {
    const replacement = currentByPath.get(pathKey(artifact.relativePath));
    return replacement === undefined || !sameOwner(artifact, replacement);
  });
  await archiveArtifacts(rootPath, artifactsToArchive);

  const writes: ArtifactWrite[] = [];
  const resolvedUserSources: Record<string, string> = {};
  for (const page of project.pages) {
    const descriptor = manifest.pages.find((candidate) => candidate.id === page.id);
    if (!descriptor) throw new Error(`No manifest descriptor was generated for ${page.name}.`);
    writes.push({
      projectId: manifest.id,
      pageId: descriptor.id,
      kind: 'page',
      relativePath: descriptor.pageFile,
      targetPath: await resolveInsideProjectSecure(rootPath, descriptor.pageFile),
      content: serializePage(page),
    });
    writes.push({
      projectId: manifest.id,
      pageId: descriptor.id,
      kind: 'generated',
      relativePath: descriptor.generatedFile,
      targetPath: await resolveInsideProjectSecure(rootPath, descriptor.generatedFile),
      content: generatePageSource(page),
    });
    const sourceKey = descriptor.codeFile.replaceAll('\\', '/');
    const userFilePath = await resolveInsideProjectSecure(rootPath, descriptor.codeFile);
    let userSource = request.userSources[sourceKey];
    if (userSource === undefined) {
      const previousSource = previousArtifacts.find(
        (artifact) =>
          artifact.projectId === manifest.id &&
          artifact.pageId === descriptor.id &&
          artifact.kind === 'code',
      );
      if (previousSource !== undefined) {
        try {
          userSource = await fs.readFile(
            await resolveInsideProjectSecure(rootPath, previousSource.relativePath),
            'utf8',
          );
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
      }
    }
    userSource ??= createUserPageSource(page);
    resolvedUserSources[sourceKey] = userSource;
    writes.push({
      projectId: manifest.id,
      pageId: descriptor.id,
      kind: 'code',
      relativePath: descriptor.codeFile,
      targetPath: userFilePath,
      content: userSource,
    });
  }

  const rollbackEntries: RollbackEntry[] = [];
  const cleanupPaths = artifactsToArchive
    .filter((artifact) => !currentByPath.has(pathKey(artifact.relativePath)))
    .map((artifact) => artifact.relativePath);
  try {
    for (const write of writes) {
      rollbackEntries.push({
        targetPath: write.targetPath,
        previousContent: (await exists(write.targetPath))
          ? await fs.readFile(write.targetPath, 'utf8')
          : null,
      });
      await writeUtf8(write.targetPath, write.content);
    }
    await writePendingCleanup(rootPath, manifest.id, cleanupPaths);
    // The manifest is the commit point: all referenced files exist before it changes.
    await writeUtf8(projectFilePath, serializeProjectManifest(manifest));
  } catch (error) {
    const rollbackErrors = await restoreWrites(rollbackEntries);
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Project save failed and one or more files could not be restored.',
        { cause: error },
      );
    }
    throw error;
  }

  await tryApplyPendingCleanup(rootPath, manifest);

  return { rootPath, projectFilePath, project, userSources: resolvedUserSources };
}

export async function saveProjectFiles(request: SaveProjectRequest): Promise<ProjectSession> {
  const rootPath = normalizeRoot(request.rootPath);
  await fs.mkdir(rootPath, { recursive: true });
  return withRootOperation(rootPath, () => saveProjectFilesUnlocked(request, rootPath));
}

async function loadProjectFilesUnlocked(projectFilePath: string): Promise<ProjectSession> {
  const absoluteProjectFile = path.resolve(projectFilePath);
  const rootPath = path.dirname(absoluteProjectFile);
  const manifest = deserializeProjectManifest(await fs.readFile(absoluteProjectFile, 'utf8'));
  validateManifestProjectName(manifest, absoluteProjectFile);
  validateCanonicalDescriptors(manifest);
  await tryApplyPendingCleanup(rootPath, manifest);
  const pages: PageModel[] = [];
  const userSources: Record<string, string> = {};

  for (const descriptor of manifest.pages) {
    const pagePath = await resolveInsideProjectSecure(rootPath, descriptor.pageFile);
    const page = deserializePage(await fs.readFile(pagePath, 'utf8'));
    pages.push(page);
    const sourceKey = sourcePathFor(page);
    try {
      userSources[sourceKey] = await fs.readFile(
        await resolveInsideProjectSecure(rootPath, descriptor.codeFile),
        'utf8',
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }

  const project = assembleProject(manifest, pages);
  return { rootPath, projectFilePath: absoluteProjectFile, project, userSources };
}

export async function loadProjectFiles(projectFilePath: string): Promise<ProjectSession> {
  const absoluteProjectFile = path.resolve(projectFilePath);
  return withRootOperation(path.dirname(absoluteProjectFile), () =>
    loadProjectFilesUnlocked(absoluteProjectFile),
  );
}

export async function createProjectFiles(rootPath: string, name: string): Promise<ProjectSession> {
  const normalizedRoot = normalizeRoot(rootPath);
  await fs.mkdir(normalizedRoot, { recursive: true });
  return withRootOperation(normalizedRoot, async () => {
    const contents = await fs.readdir(normalizedRoot);
    if (contents.length > 0) {
      throw new Error(`The destination folder "${normalizedRoot}" is not empty.`);
    }
    const project = createProject(name);
    return saveProjectFilesUnlocked(
      {
        rootPath: normalizedRoot,
        project,
        userSources: defaultUserSources(project),
      },
      normalizedRoot,
    );
  });
}

export function validateManifestProjectName(manifest: ProjectManifest, filePath: string): void {
  const expected = `${manifest.name}${PROJECT_EXTENSION}`;
  if (pathKey(path.basename(filePath)) !== pathKey(expected)) {
    throw new Error(`Project manifest must be named ${manifest.name}${PROJECT_EXTENSION}.`);
  }
}
