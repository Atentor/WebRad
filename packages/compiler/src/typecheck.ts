import path from 'node:path';
import { createHash } from 'node:crypto';

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
import {
  browserPackageError,
  createPackageBoundary,
  isNodeBuiltin,
  isWithinDirectory,
} from './package-resolution.js';
import type { CompileDiagnostic, CompileProjectPhase } from './types.js';

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

function semanticCompletionPhase(affected: ts.SourceFile | ts.Program): CompileProjectPhase {
  if (!('fileName' in affected)) return 'typecheck-semantic-program-completed';
  const fileName = affected.fileName.replaceAll('\\', '/');
  if (fileName.includes('/__runtime/')) return 'typecheck-semantic-runtime-completed';
  if (fileName.includes('/__restgo/')) return 'typecheck-semantic-sdk-completed';
  if (fileName.includes('/node_modules/')) return 'typecheck-semantic-package-completed';
  if (fileName.endsWith('.generated.ts')) return 'typecheck-semantic-generated-completed';
  if (fileName.endsWith('.d.ts')) return 'typecheck-semantic-declaration-completed';
  return 'typecheck-semantic-authored-completed';
}

// Retain only the latest builder. TypeScript invalidates changed files and their
// dependents; component-reference analysis is still recomputed for every scope.
let previousTypecheck:
  | { readonly environment: string; readonly builder: ts.SemanticDiagnosticsBuilderProgram }
  | undefined;

export function typecheckSources(
  sources: ReadonlyMap<string, string>,
  componentScopes: ReadonlyMap<string, ComponentReferenceScope> = new Map(),
  packageRoot?: string,
  onProgress?: (phase: CompileProjectPhase) => void,
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
    customConditions: ['browser'],
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
    // Applications run in a browser. Do not discover the IDE/runner's installed
    // @types packages (Node, test globals, etc.) through ancestor directories.
    // Explicit imports and project declarations still participate in checking.
    types: [],
    useUnknownInCatchVariables: true,
    verbatimModuleSyntax: true,
  };
  const rootNames = [...scriptRootNames(sources)];
  const packageBoundary = createPackageBoundary(packageRoot);
  // Embedded aliases are an implementation detail of shipped WebRAD sources.
  // An installed package must resolve its own transitive vendor declarations.
  const installedPackageOptions: ts.CompilerOptions = {
    ...compilerOptions,
    paths: Object.fromEntries(
      Object.entries(compilerOptions.paths ?? {}).filter(
        ([specifier]) =>
          !['pdf-lib', '@pdf-lib/standard-fonts', 'shaka-player/dist/shaka-player.ui.js'].includes(
            specifier,
          ),
      ),
    ),
  };
  const environment = JSON.stringify([
    process.cwd(),
    packageBoundary.root ?? null,
    process.env.WEBRAD_TYPESCRIPT_LIB_PATH ?? null,
    compilerOptions,
  ]);
  // Adding/removing a page, Menu or reusable changes roots, not the parser
  // environment. Let the builder reconcile the new graph while the host reuses
  // exact-content SourceFiles; discarding the program here reparses the runtime
  // and browser libraries on the first F9 after every structural project edit.
  let oldBuilder =
    previousTypecheck?.environment === environment ? previousTypecheck.builder : undefined;
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
  const defaultGetDirectories = host.getDirectories?.bind(host);
  const libraryDirectory =
    typeScriptLibLocation ?? path.dirname(ts.getDefaultLibFilePath(compilerOptions));
  const diskPathAllowed = (fileName: string): boolean =>
    isWithinDirectory(libraryDirectory, fileName) ||
    packageBoundary.contains(fileName) ||
    (packageBoundary.root !== undefined &&
      canonicalPath(fileName) === canonicalPath(path.join(packageBoundary.root, 'package.json')));
  host.fileExists = (fileName) =>
    virtualSources.has(canonicalPath(fileName)) ||
    (diskPathAllowed(fileName) && defaultFileExists(fileName));
  host.readFile = (fileName) =>
    virtualSources.get(canonicalPath(fileName)) ??
    (diskPathAllowed(fileName) ? defaultReadFile(fileName) : undefined);
  host.directoryExists = (directoryName) =>
    virtualDirectories.has(canonicalPath(directoryName)) ||
    ((diskPathAllowed(directoryName) ||
      (packageBoundary.root !== undefined &&
        canonicalPath(directoryName) === canonicalPath(packageBoundary.root))) &&
      (defaultDirectoryExists?.(directoryName) ?? false));
  host.getDirectories = (directoryName) =>
    diskPathAllowed(directoryName) ? (defaultGetDirectories?.(directoryName) ?? []) : [];
  host.realpath = (fileName) =>
    virtualSources.has(canonicalPath(fileName)) || virtualDirectories.has(canonicalPath(fileName))
      ? path.resolve(fileName)
      : (defaultRealpath?.(fileName) ?? fileName);
  host.resolveModuleNameLiterals = (moduleLiterals, containingFile) =>
    moduleLiterals.map((literal) => {
      if (isNodeBuiltin(literal.text)) return { resolvedModule: undefined };
      const isVirtual = virtualSources.has(canonicalPath(containingFile));
      const packageImport = !literal.text.startsWith('.') && !path.isAbsolute(literal.text);
      // Virtual authored files live beside the compiler, not beside their saved
      // project. Only package resolution uses the authorized project directory.
      const resolutionFile =
        isVirtual && packageImport && packageBoundary.root !== undefined
          ? path.join(packageBoundary.root, '__webrad_project__.ts')
          : containingFile;
      return ts.resolveModuleName(
        literal.text,
        resolutionFile,
        packageBoundary.contains(containingFile) ? installedPackageOptions : compilerOptions,
        host,
      );
    });
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
    const previous = oldBuilder?.getSourceFile(fileName);
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
    return Object.assign(ts.createSourceFile(fileName, content, languageVersionOrOptions, true), {
      // The builder requires versions for every virtual and disk source, including
      // installed declarations and browser libraries. Hash the bytes read now.
      version: createHash('sha256').update(content).digest('hex'),
    });
  };

  let builder: ts.SemanticDiagnosticsBuilderProgram;
  onProgress?.('typecheck-program');
  try {
    builder = ts.createSemanticDiagnosticsBuilderProgram(
      rootNames,
      compilerOptions,
      host,
      oldBuilder,
    );
  } finally {
    // Program retains its host, whose getSourceFile closure captures oldBuilder.
    // Release that capture after construction or every build retains its predecessor.
    oldBuilder = undefined;
  }
  const program = builder.getProgram();
  onProgress?.('typecheck-diagnostics');
  // Match getPreEmitDiagnostics for this noEmit program while reporting the
  // individual stages. Keep the same sorting and deduplication as TypeScript.
  onProgress?.('typecheck-diagnostics-options');
  const optionDiagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
  ];
  onProgress?.('typecheck-diagnostics-syntactic');
  const syntacticDiagnostics = program.getSyntacticDiagnostics();
  onProgress?.('typecheck-diagnostics-global');
  const globalDiagnostics = program.getGlobalDiagnostics();
  onProgress?.('typecheck-diagnostics-semantic');
  if (onProgress !== undefined) {
    // Drain exactly the affected files TypeScript would process itself. Report
    // only slow completed categories; never expose project file names or source.
    for (;;) {
      const started = performance.now();
      const affected = builder.getSemanticDiagnosticsOfNextAffectedFile();
      if (affected === undefined) break;
      if (performance.now() - started >= 250) {
        onProgress(semanticCompletionPhase(affected.affected));
        onProgress('typecheck-diagnostics-semantic');
      }
    }
  }
  let diagnostics = [
    ...ts.sortAndDeduplicateDiagnostics([
      ...optionDiagnostics,
      ...syntacticDiagnostics,
      ...globalDiagnostics,
      // No file argument: process every affected file, then collect diagnostics
      // for the complete program, including unchanged files that still have errors.
      ...builder.getSemanticDiagnostics(),
    ]),
  ];
  const bundleSources = new Map(sources);
  const sourceEdits = new Map<string, readonly ComponentReferenceEdit[]>();
  onProgress?.('typecheck-component-references');
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
  previousTypecheck = { environment, builder };
  return {
    diagnostics: diagnostics.map((diagnostic) => {
      const converted = fromTypeScriptDiagnostic(diagnostic);
      if (
        (diagnostic.code === 2307 || diagnostic.code === 7016 || diagnostic.code === 2591) &&
        diagnostic.file !== undefined &&
        diagnostic.start !== undefined
      ) {
        const span = diagnostic.file.text.slice(
          diagnostic.start,
          diagnostic.start + (diagnostic.length ?? 0),
        );
        const quoted = span.startsWith("'") || span.startsWith('"');
        if (diagnostic.code === 2591 && !quoted) {
          return {
            ...converted,
            message: `The Node.js global "${span}" is unavailable in browser applications. Use browser APIs; Preview, Web/PWA and Tauri do not expose Node.js globals.`,
          };
        }
        const specifier = quoted ? span.slice(1, -1) : span;
        if (isNodeBuiltin(specifier))
          return { ...converted, message: browserPackageError(specifier) };
        if (!specifier.startsWith('.') && !specifier.startsWith('@webrad/')) {
          return {
            ...converted,
            ...(diagnostic.code === 7016 ? { category: 'warning' as const } : {}),
            message:
              diagnostic.code === 7016
                ? `${converted.message} Install this package's declarations (for example its @types package) through Project > Packages for full IntelliSense.`
                : `${converted.message} Open Project > Packages to install or restore this project's dependencies.`,
          };
        }
      }
      return converted;
    }),
    sources: bundleSources,
    sourceEdits,
  };
}
