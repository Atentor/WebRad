import { realpathSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const browserUnavailableModules = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

export function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:') || browserUnavailableModules.has(specifier);
}

export function browserPackageError(specifier: string): string {
  return `The Node.js module "${specifier}" is unavailable in browser applications. Choose a browser-compatible package; Preview, Web/PWA and Tauri do not expose Node.js APIs.`;
}

export function isWithinDirectory(directory: string, fileName: string): boolean {
  const relative = path.relative(directory, path.resolve(fileName));
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

/** Check real paths as well as lexical paths so package symlinks cannot escape the project. */
export function createPackageBoundary(packageRoot: string | undefined): {
  readonly root: string | undefined;
  readonly contains: (fileName: string) => boolean;
} {
  if (packageRoot === undefined) return { root: undefined, contains: () => false };
  if (!path.isAbsolute(packageRoot) || packageRoot.includes('\0')) {
    throw new Error('The project packageRoot must be an absolute directory.');
  }
  const root = path.resolve(packageRoot);
  const modules = path.join(root, 'node_modules');
  let realModules: string;
  try {
    realModules = realpathSync(modules);
    if (!isWithinDirectory(realpathSync(root), realModules)) {
      return { root, contains: () => false };
    }
  } catch {
    return { root, contains: () => false };
  }
  return {
    root,
    contains(fileName) {
      // TypeScript and esbuild may return the canonical path after resolving a
      // project opened through a junction. Accept both representations while
      // still checking the actual target against the owned dependency tree.
      if (!isWithinDirectory(modules, fileName) && !isWithinDirectory(realModules, fileName))
        return false;
      try {
        return isWithinDirectory(realModules, realpathSync(fileName));
      } catch {
        return false;
      }
    },
  };
}
