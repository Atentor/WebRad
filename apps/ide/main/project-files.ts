import { createProjectFromTemplate, type ProjectTemplateId } from '@webrad/component-registry';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertValidProjectName,
  projectSourceFilePath,
  projectAssetPath,
  assembleProject,
  deserializePage,
  deserializeProjectManifest,
  parseProject,
  projectToManifest,
  serializePage,
  serializeProjectManifest,
  type PageModel,
  type ProjectManifest,
  type ReusableElementModel,
  type WebRadProject,
  type ProjectThemePresetId,
} from '@webrad/project-model';
import {
  createUserPageSource,
  createUserProjectSource,
  createUserReusableElementSource,
  renamePageUserSource,
  generatePageSource,
  generateReusableElementSource,
} from '@webrad/language';
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

/**
 * Resolves the root for a newly created project below a user-selected parent
 * directory. Validating the name first prevents it from changing the selected
 * directory through path separators or relative path segments.
 */
export function resolveNewProjectRoot(parentPath: string, projectName: string): string {
  assertValidProjectName(projectName);
  const parent = normalizeRoot(parentPath);
  const root = path.resolve(parent, projectName);
  if (path.dirname(root) !== parent) {
    throw new Error('The project name must resolve to a direct child of the selected folder.');
  }
  return root;
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

async function renameProjectFile(temporaryPath: string, filePath: string): Promise<void> {
  // Windows can temporarily deny replacement while a reader or scanner holds
  // a file. Keep the original intact and bound the whole backoff to 620ms.
  const delays = [20, 40, 80, 160, 320] as const;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temporaryPath, filePath);
      return;
    } catch (error) {
      const delay = delays[attempt];
      if (
        process.platform !== 'win32' ||
        !(error instanceof Error) ||
        !('code' in error) ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(String(error.code)) ||
        delay === undefined
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function writeUtf8(filePath: string, content: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, content, 'utf8');
    await renameProjectFile(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function descriptorPaths(manifest: ProjectManifest): readonly string[] {
  return [
    ...(manifest.sourceFiles ?? []).map(projectSourceFilePath),
    ...(manifest.assets ?? []).map(projectAssetPath),
    ...manifest.pages.flatMap((descriptor) => [
      descriptor.pageFile,
      descriptor.generatedFile,
      descriptor.codeFile,
    ]),
    ...manifest.reusableElements.flatMap((reusableElement) => [
      reusableGeneratedSourcePathFor(reusableElement),
      reusableSourcePathFor(reusableElement),
    ]),
  ];
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

type ArtifactKind =
  'source' | 'asset' | 'page' | 'generated' | 'code' | 'reusable-generated' | 'reusable-code';

interface OwnedArtifact {
  readonly projectId: string;
  readonly pageId: string;
  readonly kind: ArtifactKind;
  readonly relativePath: string;
}

interface ArtifactWrite extends OwnedArtifact {
  readonly content: string | Uint8Array;
  readonly targetPath: string;
}

interface RollbackEntry {
  readonly targetPath: string;
  readonly previousContent: Uint8Array | null;
}

interface PendingCleanup {
  readonly formatVersion: 1;
  readonly projectId: string;
  readonly retiredPaths: readonly string[];
}

const PENDING_CLEANUP_PATH = '.webrad/pending-cleanup.json';

function manifestArtifacts(manifest: ProjectManifest): readonly OwnedArtifact[] {
  return [
    ...(manifest.sourceFiles ?? []).map((file) => ({
      projectId: manifest.id,
      pageId: file.id,
      kind: 'source' as const,
      relativePath: projectSourceFilePath(file),
    })),
    ...(manifest.assets ?? []).map((asset) => ({
      projectId: manifest.id,
      pageId: asset.id,
      kind: 'asset' as const,
      relativePath: projectAssetPath(asset),
    })),
    ...manifest.pages.flatMap((descriptor) => [
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
    ]),
    ...manifest.reusableElements.flatMap((reusableElement) => [
      {
        projectId: manifest.id,
        pageId: reusableElement.id,
        kind: 'reusable-generated' as const,
        relativePath: reusableGeneratedSourcePathFor(reusableElement),
      },
      {
        projectId: manifest.id,
        pageId: reusableElement.id,
        kind: 'reusable-code' as const,
        relativePath: reusableSourcePathFor(reusableElement),
      },
    ]),
  ];
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

function reusableSourcePathFor(reusableElement: ReusableElementModel): string {
  return `reusables/${reusableElement.name}.ts`;
}

function reusableGeneratedSourcePathFor(reusableElement: ReusableElementModel): string {
  return `reusables/${reusableElement.name}.generated.ts`;
}

export function defaultUserSources(project: WebRadProject): Record<string, string> {
  return Object.fromEntries([
    ...(project.sourceFiles ?? []).map((file) => [
      projectSourceFilePath(file),
      createUserProjectSource(file),
    ]),
    ...project.pages.map((page) => [sourcePathFor(page), createUserPageSource(page)]),
    ...project.reusableElements.map((reusableElement) => [
      reusableSourcePathFor(reusableElement),
      createUserReusableElementSource(reusableElement),
    ]),
  ]);
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
    const originalPage = request.project.pages.find((candidate) => candidate.id === page.id);
    if (userSource === undefined && originalPage !== undefined && originalPage.name !== page.name) {
      const oldKey = sourcePathFor(originalPage);
      const originalSource = request.userSources[oldKey];
      if (originalSource !== undefined) {
        userSource = renamePageUserSource(
          originalSource,
          originalPage.name,
          page.name,
          oldKey,
        ).sourceText;
      }
    }
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
          const previousPage = previousManifest?.pages.find(
            (candidate) => candidate.id === page.id,
          );
          if (previousPage !== undefined && previousPage.name !== page.name) {
            userSource = renamePageUserSource(
              userSource,
              previousPage.name,
              page.name,
              previousSource.relativePath,
            ).sourceText;
          }
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

  for (const reusableElement of project.reusableElements) {
    const generatedPath = reusableGeneratedSourcePathFor(reusableElement);
    writes.push({
      projectId: manifest.id,
      pageId: reusableElement.id,
      kind: 'reusable-generated',
      relativePath: generatedPath,
      targetPath: await resolveInsideProjectSecure(rootPath, generatedPath),
      content: generateReusableElementSource(reusableElement),
    });
    const sourceKey = reusableSourcePathFor(reusableElement);
    let userSource = request.userSources[sourceKey];
    if (userSource === undefined) {
      const previousSource = previousArtifacts.find(
        (artifact) =>
          artifact.projectId === manifest.id &&
          artifact.pageId === reusableElement.id &&
          artifact.kind === 'reusable-code',
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
    userSource ??= createUserReusableElementSource(reusableElement);
    resolvedUserSources[sourceKey] = userSource;
    writes.push({
      projectId: manifest.id,
      pageId: reusableElement.id,
      kind: 'reusable-code',
      relativePath: sourceKey,
      targetPath: await resolveInsideProjectSecure(rootPath, sourceKey),
      content: userSource,
    });
  }

  for (const file of project.sourceFiles ?? []) {
    const sourceKey = projectSourceFilePath(file);
    let source = request.userSources[sourceKey];
    const targetPath = await resolveInsideProjectSecure(rootPath, sourceKey);
    if (source === undefined && (await exists(targetPath)))
      source = await fs.readFile(targetPath, 'utf8');
    source ??= createUserProjectSource(file);
    resolvedUserSources[sourceKey] = source;
    writes.push({
      projectId: manifest.id,
      pageId: file.id,
      kind: 'source',
      relativePath: sourceKey,
      targetPath,
      content: source,
    });
  }
  for (const asset of project.assets ?? []) {
    const relativePath = projectAssetPath(asset);
    writes.push({
      projectId: manifest.id,
      pageId: asset.id,
      kind: 'asset',
      relativePath,
      targetPath: await resolveInsideProjectSecure(rootPath, relativePath),
      content: Buffer.from(asset.base64, 'base64'),
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
          ? await fs.readFile(write.targetPath)
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

  for (const reusableElement of manifest.reusableElements) {
    const sourceKey = reusableSourcePathFor(reusableElement);
    try {
      userSources[sourceKey] = await fs.readFile(
        await resolveInsideProjectSecure(rootPath, sourceKey),
        'utf8',
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }

  for (const file of manifest.sourceFiles ?? []) {
    const sourceKey = projectSourceFilePath(file);
    userSources[sourceKey] = await fs.readFile(
      await resolveInsideProjectSecure(rootPath, sourceKey),
      'utf8',
    );
  }
  let project = assembleProject(manifest, pages);
  const previousEntry = pages.find((page) => page.id === project.entryPage);
  if (previousEntry !== undefined && previousEntry.name !== 'index') {
    const oldKey = sourcePathFor(previousEntry);
    const newKey = 'pages/index.ts';
    const source = userSources[oldKey];
    if (source !== undefined) {
      userSources[newKey] = renamePageUserSource(
        source,
        previousEntry.name,
        'index',
        oldKey,
      ).sourceText;
      delete userSources[oldKey];
    }
    if (project.debugger !== undefined) {
      project = {
        ...project,
        debugger: {
          ...project.debugger,
          breakpoints: project.debugger.breakpoints.map((breakpoint) =>
            breakpoint.path === oldKey ? { ...breakpoint, path: newKey } : breakpoint,
          ),
        },
      };
    }
  }
  return { rootPath, projectFilePath: absoluteProjectFile, project, userSources };
}

export async function loadProjectFiles(projectFilePath: string): Promise<ProjectSession> {
  const absoluteProjectFile = path.resolve(projectFilePath);
  return withRootOperation(path.dirname(absoluteProjectFile), () =>
    loadProjectFilesUnlocked(absoluteProjectFile),
  );
}

export async function createProjectFiles(
  rootPath: string,
  name: string,
  templateId: ProjectTemplateId = 'blank',
  themePresetId: ProjectThemePresetId = 'aurora',
): Promise<ProjectSession> {
  const normalizedRoot = normalizeRoot(rootPath);
  await fs.mkdir(normalizedRoot, { recursive: true });
  return withRootOperation(normalizedRoot, async () => {
    const contents = await fs.readdir(normalizedRoot);
    if (contents.length > 0) {
      throw new Error(`The destination folder "${normalizedRoot}" is not empty.`);
    }
    const { project, userSources } = createProjectFromTemplate(name, templateId, themePresetId);
    return saveProjectFilesUnlocked(
      {
        rootPath: normalizedRoot,
        project,
        userSources: { ...defaultUserSources(project), ...userSources },
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
