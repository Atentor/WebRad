import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { WebRadProject } from '@webrad/project-model';
import type { PackageTypesSnapshot } from '../shared/package-contracts';

const cache = new Map<string, PackageTypesSnapshot>();
function packageRootPath(rootPath: string): string {
  try {
    return realpathSync(rootPath);
  } catch {
    return path.resolve(rootPath);
  }
}

export function invalidatePackageTypes(rootPath: string): void {
  const root = packageRootPath(rootPath);
  for (const key of cache.keys()) if (key.startsWith(`${root}\0`)) cache.delete(key);
}

/** Resolve only reachable declarations through TypeScript itself; never load package JS. */
export function readPackageTypes(
  rootPath: string,
  project: WebRadProject,
  imports: readonly string[],
): PackageTypesSnapshot {
  const root = packageRootPath(rootPath);
  const modules = path.join(root, 'node_modules');
  let installedStamp = '';
  try {
    installedStamp = String(statSync(path.join(modules, '.package-lock.json')).mtimeMs);
  } catch {
    /* Missing dependencies remain diagnostics. */
  }
  const revision = createHash('sha256')
    .update(JSON.stringify(project.packages ?? null))
    .update(installedStamp)
    .digest('hex');
  const seeds = [...new Set(imports)].sort();
  const key = `${root}\0${revision}\0${JSON.stringify(seeds)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const files: Record<string, string> = {};
  const warnings: string[] = [];
  const visited = new Set<string>();
  let bytes = 0;
  const permitted = (file: string): boolean => {
    const target = path.resolve(file);
    const relative = path.relative(modules, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
    try {
      const actual = realpathSync(target);
      const actualRelative = path.relative(modules, actual);
      return !actualRelative.startsWith('..') && !path.isAbsolute(actualRelative);
    } catch {
      return false;
    }
  };
  const capture = (file: string): string | undefined => {
    if (!permitted(file)) return undefined;
    if (!file.endsWith('.json') && !/\.d\.(?:ts|mts|cts)$/.test(file)) return undefined;
    const uri = `file:///node_modules/${path.relative(modules, file).replaceAll('\\', '/')}`;
    const captured = files[uri];
    if (captured !== undefined) return captured;
    const limitMessage =
      'Package declarations exceed the editor limit (20 MB / 3000 files). Import smaller package subpaths.';
    if (bytes + statSync(file).size > 20_000_000 || Object.keys(files).length >= 3000)
      throw new Error(limitMessage);
    const content = readFileSync(file, 'utf8');
    const contentBytes = Buffer.byteLength(content);
    // Recheck after reading: a file may grow or malformed UTF-8 may expand on decoding.
    if (bytes + contentBytes > 20_000_000) throw new Error(limitMessage);
    files[uri] = content;
    bytes += contentBytes;
    return content;
  };
  const host: ts.ModuleResolutionHost = {
    fileExists: (file) => permitted(file) && existsSync(file),
    readFile: capture,
    directoryExists: (directory) => {
      if (path.resolve(directory) === root) return true;
      return permitted(directory) && statSync(directory).isDirectory();
    },
    realpath: (file) => (permitted(file) ? realpathSync(file) : file),
    getCurrentDirectory: () => root,
  };
  const options: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    types: [],
    customConditions: ['browser'],
    allowSyntheticDefaultImports: true,
  };
  const resolutionCache = ts.createModuleResolutionCache(root, (file) => file, options);
  // Package names remain discoverable without loading every installed declaration tree.
  for (const name of Object.keys(project.packages?.dependencies ?? {}))
    capture(path.join(modules, name, 'package.json'));
  const queue: string[] = [];
  const resolve = (name: string, containingFile: string): void => {
    const result = ts.resolveModuleName(
      name,
      containingFile,
      options,
      host,
      resolutionCache,
    ).resolvedModule;
    if (result !== undefined && /\.d\.(?:ts|mts|cts)$/.test(result.resolvedFileName))
      queue.push(result.resolvedFileName);
    else if (!name.startsWith('.') && containingFile === path.join(root, '__webrad_packages__.ts'))
      warnings.push(
        `No TypeScript declarations found for ${name}. Install its @types package when available; strict TypeScript reports untyped JavaScript imports.`,
      );
  };
  for (const name of seeds) resolve(name, path.join(root, '__webrad_packages__.ts'));
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    const content = capture(file);
    if (content === undefined) continue;
    const info = ts.preProcessFile(content, true, true);
    for (const imported of info.importedFiles) resolve(imported.fileName, file);
    for (const reference of info.referencedFiles)
      queue.push(path.resolve(path.dirname(file), reference.fileName));
    for (const reference of info.typeReferenceDirectives) {
      const resolved = ts.resolveTypeReferenceDirective(
        reference.fileName,
        file,
        options,
        host,
      ).resolvedTypeReferenceDirective;
      if (resolved?.resolvedFileName !== undefined) queue.push(resolved.resolvedFileName);
    }
  }
  const result = { revision, files, warnings };
  cache.set(key, result);
  while (cache.size > 4) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return result;
}
