import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { generateRuntimeTypings } from '../src/runtime-typings.js';

const compilerOptions: ts.CompilerOptions = {
  allowSyntheticDefaultImports: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
};

function runtimeModuleExports(typings: string): readonly string[] {
  const source = ts.createSourceFile(
    'webrad-runtime.d.ts',
    typings,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const runtimeModule = source.statements.find(
    (statement): statement is ts.ModuleDeclaration =>
      ts.isModuleDeclaration(statement) &&
      ts.isStringLiteral(statement.name) &&
      statement.name.text === '@webrad/runtime',
  );
  const moduleBody = runtimeModule?.body;
  if (moduleBody === undefined || !ts.isModuleBlock(moduleBody)) return [];

  const names = new Set<string>();
  for (const statement of moduleBody.statements) {
    if (
      ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      if (statement.name !== undefined) names.add(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return [...names].sort();
}

function publicRuntimeExports(): readonly string[] {
  const runtimeIndex = fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url));
  const program = ts.createProgram([runtimeIndex], compilerOptions);
  const source = program.getSourceFile(runtimeIndex);
  if (source === undefined) return [];
  const symbol = program.getTypeChecker().getSymbolAtLocation(source);
  if (symbol === undefined) return [];
  return program
    .getTypeChecker()
    .getExportsOfModule(symbol)
    .map((item) => item.name)
    .sort();
}

interface MarkedSource {
  readonly text: string;
  readonly positions: ReadonlyMap<string, number>;
}

function extractMarkers(source: string): MarkedSource {
  const positions = new Map<string, number>();
  let text = '';
  let remaining = source;
  while (true) {
    const markerStart = remaining.indexOf('/*@');
    if (markerStart < 0) break;
    const markerEnd = remaining.indexOf('*/', markerStart);
    if (markerEnd < 0) throw new Error('Unterminated editor test marker.');
    text += remaining.slice(0, markerStart);
    positions.set(remaining.slice(markerStart + 3, markerEnd), text.length);
    remaining = remaining.slice(markerEnd + 2);
  }
  return { text: text + remaining, positions };
}

function createLanguageService(source: string): {
  readonly fileName: string;
  readonly service: ts.LanguageService;
} {
  const typingsFileName = fileURLToPath(new URL('./webrad-runtime.virtual.d.ts', import.meta.url));
  const sourceFileName = fileURLToPath(new URL('./editor-contract.virtual.ts', import.meta.url));
  const canonicalFileName = (fileName: string): string =>
    fileName.replaceAll('\\', '/').toLocaleLowerCase();
  const files = new Map<string, string>([
    [canonicalFileName(typingsFileName), generateRuntimeTypings()],
    [canonicalFileName(sourceFileName), source],
  ]);
  const host: ts.LanguageServiceHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: (fileName) => files.has(canonicalFileName(fileName)) || ts.sys.fileExists(fileName),
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => fileURLToPath(new URL('.', import.meta.url)),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories: ts.sys.getDirectories,
    getScriptFileNames: () => [typingsFileName, sourceFileName],
    getScriptSnapshot: (fileName) => {
      const contents = files.get(canonicalFileName(fileName)) ?? ts.sys.readFile(fileName);
      return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
    },
    getScriptVersion: () => '1',
    readDirectory: ts.sys.readDirectory,
    readFile: (fileName) => files.get(canonicalFileName(fileName)) ?? ts.sys.readFile(fileName),
  };
  return { fileName: sourceFileName, service: ts.createLanguageService(host) };
}

function completionNames(
  languageService: ts.LanguageService,
  fileName: string,
  position: number,
): readonly string[] {
  return (
    languageService
      .getCompletionsAtPosition(fileName, position, {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
      })
      ?.entries.map((entry) => entry.name) ?? []
  );
}

describe('Monaco runtime typings', () => {
  it('stays in parity with every public runtime export', () => {
    expect(runtimeModuleExports(generateRuntimeTypings())).toEqual(publicRuntimeExports());
  });

  it('offers component, form, API client, and collection completions', () => {
    const marked = extractMarkers(`import {
  WebApiClient,
  WebButton,
  WebComboBox,
  WebForm,
} from '@webrad/runtime';

class EditorForm extends WebForm {
  configure(button: WebButton, combo: WebComboBox, api: WebApiClient): void {
    button./*@button*/caption;
    combo./*@combo*/items;
    api./*@api*/request;
    this./*@form*/show;
  }
}
`);
    const { fileName, service } = createLanguageService(marked.text);
    const completions = (marker: string): readonly string[] => {
      const position = marked.positions.get(marker);
      if (position === undefined) throw new Error(`Missing editor test marker "${marker}".`);
      return completionNames(service, fileName, position);
    };

    expect(completions('button')).toEqual(
      expect.arrayContaining(['bindEvent', 'caption', 'click', 'element', 'enabled', 'onClick']),
    );
    expect(completions('combo')).toEqual(
      expect.arrayContaining(['items', 'onChange', 'selectedIndex', 'value']),
    );
    expect(completions('api')).toEqual(
      expect.arrayContaining(['delete', 'get', 'patch', 'post', 'put', 'request']),
    );
    expect(completions('form')).toEqual(
      expect.arrayContaining(['bindGeneratedEvent', 'close', 'requireComponentElement', 'show']),
    );
  });

  it('accepts the supported authoring contract and reports invalid assignments', () => {
    const validSource = `import {
  WebApiClient,
  WebApiError,
  WebButton,
  WebComboBox,
  WebForm,
  type WebSelectItem,
} from '@webrad/runtime';

class EditorForm extends WebForm {
  configure(button: WebButton, combo: WebComboBox, api: WebApiClient): void {
    button.caption = 'Save';
    button.onClick = async (sender, event) => {
      sender.enabled = false;
      event.preventDefault();
    };
    combo.items = ['One', { value: 'two', label: 'Two' }];
    const items: readonly WebSelectItem[] = combo.items;
    void items;
    this.bindGeneratedEvent(button, 'OnClick', 'SaveClick');
    void api.get<{ readonly id: number }>('/items', { query: { page: 1 } });
  }
}

declare const response: Response;
const error = new WebApiError('Conflict', 409, 'Conflict', '/items', {}, response);
Message(error.message);
`;
    const valid = createLanguageService(validSource);
    expect(valid.service.getSemanticDiagnostics(valid.fileName)).toEqual([]);

    const invalid =
      createLanguageService(`import { WebApiClient, WebButton } from '@webrad/runtime';
declare const button: WebButton;
declare const api: WebApiClient;
button.caption = 42;
void api.get<number>(42);
`);
    expect(
      invalid.service.getSemanticDiagnostics(invalid.fileName).map(({ code }) => code),
    ).toEqual(expect.arrayContaining([2322, 2345]));
  });
});
