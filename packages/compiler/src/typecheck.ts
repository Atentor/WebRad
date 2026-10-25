import path from 'node:path';

import ts from 'typescript';
import {
  analyzeComponentReferences,
  appendComponentReferenceDeclarations,
  applyComponentReferenceEdits,
  instanceInitializationDiagnostics,
  isInstanceInitializationDiagnostic,
  type ComponentReferenceEdit,
  type ComponentReferenceScope,
} from '@webrad/language';

import { fromTypeScriptDiagnostic } from './diagnostics.js';
import { RESTGO_ENTRY_PATH, RUNTIME_ENTRY_PATH } from './source-graph.js';
import type { CompileDiagnostic } from './types.js';

function canonicalPath(fileName: string): string {
  const resolved = path.resolve(fileName);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

function scriptRootNames(sources: ReadonlyMap<string, string>): readonly string[] {
  return [...sources.keys()].filter(
    (fileName) =>
      fileName.endsWith('.ts') || fileName.endsWith('.tsx') || fileName.endsWith('.d.ts'),
  );
}

// Retain only the latest program. Reuse syntax trees, never diagnostic results.
let previousTypecheck: { readonly environment: string; readonly program: ts.Program } | undefined;

export function typecheckSources(
  sources: ReadonlyMap<string, string>,
  componentScopes: ReadonlyMap<string, ComponentReferenceScope> = new Map(),
): {
  readonly diagnostics: readonly CompileDiagnostic[];
  readonly sources: ReadonlyMap<string, string>;
  readonly sourceEdits: ReadonlyMap<string, readonly ComponentReferenceEdit[]>;
} {
  const compilerOptions: ts.CompilerOptions = {
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noImplicitOverride: true,
    noUncheckedIndexedAccess: true,
    ignoreDeprecations: '6.0',
    paths: {
      '@webrad/runtime': [RUNTIME_ENTRY_PATH],
      '@webrad/runtime/theme': [path.join(path.dirname(RUNTIME_ENTRY_PATH), 'theme.ts')],
      '@webrad/restgo-sdk': [RESTGO_ENTRY_PATH],
      'shaka-player/dist/shaka-player.ui.js': [
        path.resolve(path.dirname(RUNTIME_ENTRY_PATH), '../__vendor/shaka/shaka-player.ui.d.ts'),
      ],
      'pdf-lib': [path.resolve(path.dirname(RUNTIME_ENTRY_PATH), '../__vendor/pdf-lib/index.d.ts')],
      '@pdf-lib/standard-fonts': [
        path.resolve(path.dirname(RUNTIME_ENTRY_PATH), '../__vendor/pdf-standard-fonts/index.d.ts'),
      ],
    },
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    useUnknownInCatchVariables: true,
    verbatimModuleSyntax: true,
  };
  const rootNames = [...scriptRootNames(sources)];
  const environment = JSON.stringify([
    process.cwd(),
    process.env.WEBRAD_TYPESCRIPT_LIB_PATH ?? null,
    compilerOptions,
    rootNames,
  ]);
  let oldProgram =
    previousTypecheck?.environment === environment ? previousTypecheck.program : undefined;
  previousTypecheck = undefined;
  const host = ts.createCompilerHost(compilerOptions, true);
  const typeScriptLibLocation = process.env.WEBRAD_TYPESCRIPT_LIB_PATH;
  if (typeScriptLibLocation) {
    host.getDefaultLibLocation = () => typeScriptLibLocation;
    host.getDefaultLibFileName = (options) =>
      path.join(typeScriptLibLocation, ts.getDefaultLibFileName(options));
  }
  const virtualSources = new Map(
    [...sources].map(([fileName, contents]) => {
      const scope = componentScopes.get(fileName);
      return [
        canonicalPath(fileName),
        scope === undefined
          ? contents
          : appendComponentReferenceDeclarations(ts, fileName, contents, scope),
      ];
    }),
  );
  const virtualDirectories = new Set<string>();
  for (const fileName of sources.keys()) {
    let directory = path.dirname(path.resolve(fileName));
    while (!virtualDirectories.has(canonicalPath(directory))) {
      virtualDirectories.add(canonicalPath(directory));
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  const defaultDirectoryExists = host.directoryExists?.bind(host);
  const defaultRealpath = host.realpath?.bind(host);
  host.fileExists = (fileName) =>
    virtualSources.has(canonicalPath(fileName)) || defaultFileExists(fileName);
  host.readFile = (fileName) =>
    virtualSources.get(canonicalPath(fileName)) ?? defaultReadFile(fileName);
  host.directoryExists = (directoryName) =>
    virtualDirectories.has(canonicalPath(directoryName)) ||
    (defaultDirectoryExists?.(directoryName) ?? false);
  host.realpath = (fileName) =>
    virtualSources.has(canonicalPath(fileName)) || virtualDirectories.has(canonicalPath(fileName))
      ? path.resolve(fileName)
      : (defaultRealpath?.(fileName) ?? fileName);
  // Resolve imports against the current filesystem/virtual graph on every build,
  // including a previously missing module that has since been created.
  host.hasInvalidatedResolutions = () => true;
  host.getSourceFile = (
    fileName,
    languageVersionOrOptions,
    _onError,
    shouldCreateNewSourceFile,
  ) => {
    const content = host.readFile(fileName);
    if (content === undefined) return undefined;
    const previous = oldProgram?.getSourceFile(fileName);
    const parseOptions =
      typeof languageVersionOrOptions === 'number'
        ? { languageVersion: languageVersionOrOptions, impliedNodeFormat: undefined }
        : languageVersionOrOptions;
    if (
      !shouldCreateNewSourceFile &&
      previous?.text === content &&
      previous.languageVersion === parseOptions.languageVersion &&
      previous.impliedNodeFormat === parseOptions.impliedNodeFormat
    )
      return previous;
    return ts.createSourceFile(fileName, content, languageVersionOrOptions, true);
  };

  let program: ts.Program;
  try {
    program = ts.createProgram({ rootNames, options: compilerOptions, host, oldProgram });
  } finally {
    // Program retains its host, whose getSourceFile closure captures oldProgram.
    // Release that capture after construction or every build retains its predecessor.
    oldProgram = undefined;
  }
  let diagnostics = [...ts.getPreEmitDiagnostics(program)];
  const bundleSources = new Map(sources);
  const sourceEdits = new Map<string, readonly ComponentReferenceEdit[]>();
  for (const [fileName, scope] of componentScopes) {
    const sourceFile = program.getSourceFile(fileName);
    const authored = sources.get(fileName);
    if (sourceFile === undefined || authored === undefined) continue;
    const analysis = analyzeComponentReferences(
      ts,
      sourceFile,
      program.getTypeChecker(),
      authored.length,
      scope,
    );
    const own = diagnostics.filter((diagnostic) => diagnostic.file === sourceFile);
    const initialization = instanceInitializationDiagnostics(
      ts,
      program,
      sourceFile,
      analysis.edits,
      own,
    );
    if (initialization !== undefined) {
      diagnostics = diagnostics.filter(
        (diagnostic) =>
          diagnostic.file !== sourceFile || !isInstanceInitializationDiagnostic(diagnostic),
      );
      diagnostics.push(...initialization);
    }
    diagnostics.push(...analysis.diagnostics);
    bundleSources.set(fileName, applyComponentReferenceEdits(authored, analysis.edits));
    if (analysis.edits.length > 0) sourceEdits.set(fileName, analysis.edits);
  }
  previousTypecheck = { environment, program };
  return {
    diagnostics: diagnostics.map(fromTypeScriptDiagnostic),
    sources: bundleSources,
    sourceEdits,
  };
}
