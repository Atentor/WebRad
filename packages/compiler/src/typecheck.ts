import path from 'node:path';

import ts from 'typescript';
import {
  analyzeComponentReferences,
  appendComponentReferenceDeclarations,
  applyComponentReferenceEdits,
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
      '@webrad/restgo-sdk': [RESTGO_ENTRY_PATH],
    },
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    useUnknownInCatchVariables: true,
    verbatimModuleSyntax: true,
  };
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
  host.getSourceFile = (fileName, languageVersionOrOptions) => {
    const content = host.readFile(fileName);
    if (content === undefined) return undefined;
    return ts.createSourceFile(fileName, content, languageVersionOrOptions, true);
  };

  const program = ts.createProgram({
    rootNames: [...scriptRootNames(sources)],
    options: compilerOptions,
    host,
  });
  const diagnostics = [...ts.getPreEmitDiagnostics(program)];
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
    diagnostics.push(...analysis.diagnostics);
    bundleSources.set(fileName, applyComponentReferenceEdits(authored, analysis.edits));
    if (analysis.edits.length > 0) sourceEdits.set(fileName, analysis.edits);
  }
  return {
    diagnostics: diagnostics.map(fromTypeScriptDiagnostic),
    sources: bundleSources,
    sourceEdits,
  };
}
