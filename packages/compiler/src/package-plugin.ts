import path from 'node:path';

import type { Plugin } from 'esbuild';

import { browserPackageError, createPackageBoundary, isNodeBuiltin } from './package-resolution.js';

/** Delegate package semantics to esbuild, then enforce the authorized filesystem boundary. */
export function projectPackagesPlugin(packageRoot: string | undefined): Plugin {
  const boundary = createPackageBoundary(packageRoot);
  const resolving = {};
  return {
    name: 'webrad-project-packages',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === resolving || args.kind === 'entry-point') return undefined;
        if (args.namespace !== 'webrad' && args.namespace !== 'file') return undefined;
        if (
          (args.kind === 'url-token' || args.kind === 'import-rule') &&
          /^(?:data:|https?:|#)/.test(args.path)
        )
          return undefined;
        if (args.namespace === 'webrad' && args.path.startsWith('.')) return undefined;
        if (args.namespace === 'webrad' && isNodeBuiltin(args.path))
          return { errors: [{ text: browserPackageError(args.path) }] };
        if (boundary.root === undefined) {
          return {
            errors: [
              {
                text: `Package "${args.path}" is not available. Save the project and use Project > Packages to install or restore its dependencies.`,
              },
            ],
          };
        }
        const resolved = await build.resolve(args.path, {
          kind: args.kind,
          importer: args.namespace === 'file' ? args.importer : '',
          namespace: 'file',
          resolveDir: args.namespace === 'file' ? args.resolveDir : boundary.root,
          pluginData: resolving,
        });
        if (resolved.errors.length > 0) {
          if (isNodeBuiltin(args.path))
            return { errors: [{ text: browserPackageError(args.path) }] };
          return {
            errors: resolved.errors.map((error) => ({
              ...error,
              text: `${error.text} Use Project > Packages to install or restore this project's dependencies.`,
            })),
            warnings: resolved.warnings,
          };
        }
        // Browser aliases set to false resolve to an empty module in esbuild.
        // build.resolve does not expose its internal disabled-file flag. Let
        // the native resolver apply that flag in the original import context.
        if (resolved.namespace === '' && !resolved.external) return undefined;
        if (resolved.namespace === 'file' && !boundary.contains(resolved.path)) {
          return {
            errors: [
              {
                text: `Package import "${args.path}" resolves outside this project's node_modules. Install or restore the package through Project > Packages.`,
              },
            ],
          };
        }
        if (resolved.external) {
          return {
            errors: [
              {
                text: `External package import "${args.path}" cannot be left unresolved in a browser application.`,
              },
            ],
          };
        }
        return {
          path: resolved.path,
          namespace: resolved.namespace,
          suffix: resolved.suffix,
          sideEffects: resolved.sideEffects,
          warnings: resolved.warnings,
        };
      });
      build.onLoad({ filter: /.*/, namespace: 'file' }, (args) =>
        boundary.contains(args.path)
          ? undefined
          : {
              errors: [
                {
                  text: `Package file "${path.basename(args.path)}" is outside the authorized project dependencies.`,
                },
              ],
            },
      );
    },
  };
}
