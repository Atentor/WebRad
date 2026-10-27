import pdfSources from './pdf-lib-sources.generated.json';
import lucideSources from './lucide-sources.generated.json';
import webRadLicense from './license-sources.generated.json';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { build as esbuildBuild, Loader, OnLoadResult, Plugin } from 'esbuild';

import { fromEsbuildMessage } from './diagnostics.js';
import runtimeSourcesJson from './runtime-sources.json';
import restGoSourcesJson from './restgo-sources.json';
import shakaSources from './shaka-sources.generated.json';
import type { CompileDiagnostic, CompileProjectPhase } from './types.js';
import { selectRuntimeAdapters, selectRuntimeExports } from './runtime-selection.js';
import { projectFontLicenseFiles } from './fonts.js';

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
  readonly componentTypes?: ReadonlySet<string>;
  readonly onProgress?: (phase: CompileProjectPhase) => void;
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
  const selectedRuntimeEntry = selectRuntimeExports(
    options.sources,
    options.entryPath,
    runtimeSources,
    sourceCandidatePaths,
  );
  // Prepare the adapter AST before entering native esbuild RPC callbacks. The
  // selection phase must account for this synchronous work, not bundle-build.
  const renderSource = runtimeSources['render.ts'];
  const selectedRuntimeRender =
    renderSource !== undefined && options.componentTypes !== undefined
      ? selectRuntimeAdapters(renderSource, options.componentTypes)
      : renderSource;
  return {
    name: 'webrad-virtual-project',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^pdf-lib$/ }, () => ({
        path: 'pdf-lib.esm.min.js',
        namespace: 'webrad-pdf',
        sideEffects: false,
      }));
      buildContext.onLoad({ filter: /.*/, namespace: 'webrad-pdf' }, () => ({
        contents: pdfSources.javascript,
        loader: 'js',
      }));
      buildContext.onResolve(
        { filter: /^shaka-player\/dist\/(shaka-player\.ui\.js|controls\.css)$/ },
        (args) => ({
          path: args.path.endsWith('.css') ? 'controls.css' : 'shaka-player.ui.js',
          namespace: 'webrad-shaka',
          sideEffects: args.path.endsWith('.css'),
        }),
      );
      buildContext.onLoad({ filter: /.*/, namespace: 'webrad-shaka' }, (args) => ({
        contents: args.path.endsWith('.css')
          ? `@layer components {\n${shakaSources.css}\n}`
          : shakaSources.javascript,
        loader: args.path.endsWith('.css') ? 'css' : 'js',
      }));
      buildContext.onResolve({ filter: /^@webrad\/runtime$/ }, () => ({
        namespace: RUNTIME_NAMESPACE,
        path: 'index.ts',
        sideEffects: false,
      }));
      buildContext.onResolve({ filter: /^@webrad\/runtime\/theme$/ }, () => ({
        namespace: RUNTIME_NAMESPACE,
        path: 'theme.ts',
        sideEffects: false,
      }));
      buildContext.onResolve({ filter: /^@webrad\/restgo-sdk$/ }, () => ({
        namespace: RESTGO_NAMESPACE,
        path: 'index.ts',
        sideEffects: false,
      }));
      buildContext.onResolve({ filter: /.*/, namespace: RUNTIME_NAMESPACE }, (args) => {
        if (!args.path.startsWith('.')) return undefined;
        const candidate = runtimeCandidatePaths(args.importer, args.path).find(
          (fileName) => runtimeSources[fileName] !== undefined,
        );
        return candidate === undefined
          ? undefined
          : { path: candidate, namespace: RUNTIME_NAMESPACE, sideEffects: false };
      });
      buildContext.onResolve({ filter: /.*/, namespace: RESTGO_NAMESPACE }, (args) => {
        if (!args.path.startsWith('.')) return undefined;
        const candidate = runtimeCandidatePaths(args.importer, args.path).find(
          (fileName) => restGoSources[fileName] !== undefined,
        );
        return candidate === undefined
          ? undefined
          : { path: candidate, namespace: RESTGO_NAMESPACE, sideEffects: false };
      });
      buildContext.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point')
          return {
            path: options.entryPath,
            namespace: 'webrad',
          };
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
        return {
          contents:
            args.path === 'index.ts'
              ? selectedRuntimeEntry
              : args.path === 'render.ts' && selectedRuntimeRender !== undefined
                ? selectedRuntimeRender
                : contents,
          loader: loaderFor(args.path),
          resolveDir: '/',
        };
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
  options.onProgress?.('bundle-load');
  const modulePath = process.env.WEBRAD_ESBUILD_MODULE_PATH;
  const moduleSpecifier = modulePath ? pathToFileURL(modulePath).href : 'esbuild';
  const loaded = (await import(/* @vite-ignore */ moduleSpecifier)) as EsbuildApi & {
    default?: EsbuildApi;
  };
  const esbuild = typeof loaded.build === 'function' ? loaded : loaded.default;
  if (!esbuild) throw new Error('Unable to load the esbuild JavaScript API.');
  options.onProgress?.('bundle-selection');
  const projectPlugin = virtualPlugin(options);
  options.onProgress?.('bundle-build');
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    assetNames: '[name]-[hash]',
    bundle: true,
    entryNames: 'app',
    entryPoints: ['webrad-entry'],
    format: 'iife',
    metafile: true,
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
    plugins: [projectPlugin],
    sourcemap: options.sourcemap ? 'external' : false,
    // The Preview embeds this exact bundle; escape HTML delimiters before mapping it.
    supported: { 'inline-script': true },
    target: ['es2022'],
    treeShaking: true,
    write: false,
  });
  options.onProgress?.('bundle-output');
  const files = Object.fromEntries(
    (result.outputFiles ?? []).map((file) => [
      relativeOutputPath(options.outputDirectory, file.path),
      file.text,
    ]),
  );
  files['assets/licenses/WebRAD-MIT.txt'] = webRadLicense.webrad;
  for (const [fileName, contents] of options.sources) {
    if (fileName.endsWith('.css')) Object.assign(files, projectFontLicenseFiles(contents));
  }
  const usedInputs = new Set(
    Object.values(result.metafile?.outputs ?? {}).flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([input]) => input),
    ),
  );
  if (
    [...usedInputs].some(
      (input) =>
        input.endsWith('/lucide-icons.generated.ts') ||
        input.endsWith(':lucide-icons.generated.ts'),
    )
  ) {
    files['assets/licenses/Lucide.txt'] =
      `Lucide ${lucideSources.version}\n\n${lucideSources.license}`;
  }
  if ([...usedInputs].some((input) => input.startsWith('webrad-shaka:'))) {
    files['assets/licenses/Shaka-Player-Apache-2.0.txt'] =
      `Shaka Player ${shakaSources.version}\nCopyright 2016 Google LLC\n\n${shakaSources.license}`;
  }
  if ([...usedInputs].some((input) => input.startsWith('webrad-pdf:'))) {
    files['assets/licenses/pdf-lib-MIT.txt'] =
      'pdf-lib ' + pdfSources.version + '\n\n' + pdfSources.license;
    for (const [name, license] of Object.entries(pdfSources.dependencyLicenses))
      files['assets/licenses/pdf-lib/' + name] = license;
  }
  return {
    files,
    diagnostics: result.warnings.map((warning) => fromEsbuildMessage(warning, 'warning')),
  };
}
