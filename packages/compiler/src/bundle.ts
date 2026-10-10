import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { build as esbuildBuild, Loader, OnLoadResult, Plugin } from 'esbuild';

import { fromEsbuildMessage } from './diagnostics.js';
import runtimeSourcesJson from './runtime-sources.json';
import restGoSourcesJson from './restgo-sources.json';
import type { CompileDiagnostic } from './types.js';

const RUNTIME_NAMESPACE = 'webrad-runtime';
const RESTGO_NAMESPACE = 'webrad-restgo';
const runtimeSources: Readonly<Record<string, string>> = runtimeSourcesJson;
const restGoSources: Readonly<Record<string, string>> = restGoSourcesJson;
type EsbuildApi = { build: typeof esbuildBuild };

export interface BundleOptions {
  readonly sources: ReadonlyMap<string, string>;
  readonly entryPath: string;
  readonly outputDirectory: string;
  readonly minify: boolean;
  readonly sourcemap: boolean;
}

export interface BundleResult {
  readonly files: Readonly<Record<string, string>>;
  readonly diagnostics: readonly CompileDiagnostic[];
}

function loaderFor(fileName: string): Loader {
  if (fileName.endsWith('.tsx')) return 'tsx';
  if (fileName.endsWith('.jsx')) return 'jsx';
  if (fileName.endsWith('.css')) return 'css';
  if (fileName.endsWith('.json')) return 'json';
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) return 'js';
  return 'ts';
}

function sourceCandidatePaths(importer: string, specifier: string): readonly string[] {
  const resolved = path.resolve(path.dirname(importer), specifier);
  const extension = path.extname(resolved);
  if (extension === '.js' || extension === '.jsx' || extension === '.mjs') {
    const withoutExtension = resolved.slice(0, -extension.length);
    return [`${withoutExtension}.ts`, `${withoutExtension}.tsx`, resolved];
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css'].includes(extension)) {
    return [resolved];
  }
  return [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    path.join(resolved, 'index.ts'),
    path.join(resolved, 'index.tsx'),
  ];
}

function runtimeCandidatePaths(importer: string, specifier: string): readonly string[] {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  const extension = path.posix.extname(resolved);
  if (extension === '.js' || extension === '.mjs') {
    return [`${resolved.slice(0, -extension.length)}.ts`, resolved];
  }
  if (extension) return [resolved];
  return [resolved, `${resolved}.ts`, path.posix.join(resolved, 'index.ts')];
}

function virtualPlugin(options: BundleOptions): Plugin {
  return {
    name: 'webrad-virtual-project',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@webrad\/runtime$/ }, () => ({
        namespace: RUNTIME_NAMESPACE,
        path: 'index.ts',
      }));
      buildContext.onResolve({ filter: /^@webrad\/restgo-sdk$/ }, () => ({
        namespace: RESTGO_NAMESPACE,
        path: 'index.ts',
      }));
      buildContext.onResolve({ filter: /.*/, namespace: RUNTIME_NAMESPACE }, (args) => {
        if (!args.path.startsWith('.')) return undefined;
        const candidate = runtimeCandidatePaths(args.importer, args.path).find(
          (fileName) => runtimeSources[fileName] !== undefined,
        );
        return candidate === undefined
          ? undefined
          : { path: candidate, namespace: RUNTIME_NAMESPACE };
      });
      buildContext.onResolve({ filter: /.*/, namespace: RESTGO_NAMESPACE }, (args) => {
        if (!args.path.startsWith('.')) return undefined;
        const candidate = runtimeCandidatePaths(args.importer, args.path).find(
          (fileName) => restGoSources[fileName] !== undefined,
        );
        return candidate === undefined
          ? undefined
          : { path: candidate, namespace: RESTGO_NAMESPACE };
      });
      buildContext.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return { path: options.entryPath, namespace: 'webrad' };
        if (args.namespace !== 'webrad' || !args.path.startsWith('.')) return undefined;
        const candidate = sourceCandidatePaths(args.importer, args.path).find((fileName) =>
          options.sources.has(fileName),
        );
        return candidate === undefined ? undefined : { path: candidate, namespace: 'webrad' };
      });
      buildContext.onLoad({ filter: /.*/, namespace: 'webrad' }, (args): OnLoadResult => {
        const contents = options.sources.get(args.path);
        if (contents === undefined)
          return { errors: [{ text: `Unknown generated source: ${args.path}` }] };
        return { contents, loader: loaderFor(args.path), resolveDir: path.dirname(args.path) };
      });
      buildContext.onLoad({ filter: /.*/, namespace: RUNTIME_NAMESPACE }, (args): OnLoadResult => {
        const contents = runtimeSources[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `Unknown embedded runtime source: ${args.path}` }] };
        }
        return { contents, loader: loaderFor(args.path), resolveDir: '/' };
      });
      buildContext.onLoad({ filter: /.*/, namespace: RESTGO_NAMESPACE }, (args): OnLoadResult => {
        const contents = restGoSources[args.path];
        if (contents === undefined) {
          return { errors: [{ text: `Unknown embedded RestGO source: ${args.path}` }] };
        }
        return { contents, loader: loaderFor(args.path), resolveDir: '/' };
      });
    },
  };
}

function relativeOutputPath(outputDirectory: string, fileName: string): string {
  return path.relative(outputDirectory, fileName).replaceAll('\\', '/');
}

export async function bundleSources(options: BundleOptions): Promise<BundleResult> {
  const modulePath = process.env.WEBRAD_ESBUILD_MODULE_PATH;
  const moduleSpecifier = modulePath ? pathToFileURL(modulePath).href : 'esbuild';
  const loaded = (await import(/* @vite-ignore */ moduleSpecifier)) as EsbuildApi & {
    default?: EsbuildApi;
  };
  const esbuild = typeof loaded.build === 'function' ? loaded : loaded.default;
  if (!esbuild) throw new Error('Unable to load the esbuild JavaScript API.');
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    assetNames: '[name]-[hash]',
    bundle: true,
    entryNames: 'app',
    entryPoints: ['webrad-entry'],
    format: 'iife',
    legalComments: 'none',
    loader: {
      '.gif': 'dataurl',
      '.jpeg': 'dataurl',
      '.jpg': 'dataurl',
      '.png': 'dataurl',
      '.svg': 'dataurl',
      '.webp': 'dataurl',
    },
    logLevel: 'silent',
    minify: options.minify,
    outdir: path.join(options.outputDirectory, 'assets'),
    platform: 'browser',
    plugins: [virtualPlugin(options)],
    sourcemap: options.sourcemap ? 'external' : false,
    // The Preview embeds this exact bundle; escape HTML delimiters before mapping it.
    supported: { 'inline-script': true },
    target: ['es2022'],
    treeShaking: true,
    write: false,
  });
  const files = Object.fromEntries(
    (result.outputFiles ?? []).map((file) => [
      relativeOutputPath(options.outputDirectory, file.path),
      file.text,
    ]),
  );
  return {
    files,
    diagnostics: result.warnings.map((warning) => fromEsbuildMessage(warning, 'warning')),
  };
}
