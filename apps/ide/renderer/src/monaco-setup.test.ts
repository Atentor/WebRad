// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const registrations: Array<{
    content: string;
    path: string | undefined;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const addExtraLib = vi.fn((content: string, path?: string) => {
    const dispose = vi.fn();
    registrations.push({ content, path, dispose });
    return { dispose };
  });
  const getCompletionsAtPosition = vi.fn();
  const typeScriptWorkerFactory = vi.fn(async () => ({ getCompletionsAtPosition }));
  const getTypeScriptWorker = vi.fn(async () => typeScriptWorkerFactory);
  return {
    addExtraLib,
    defineTheme: vi.fn(),
    getCompletionsAtPosition,
    getTypeScriptWorker,
    registrations,
    setCompilerOptions: vi.fn(),
    setDiagnosticsOptions: vi.fn(),
    setEagerModelSync: vi.fn(),
    setInlayHintsOptions: vi.fn(),
    setModeConfiguration: vi.fn(),
    canonicalResource: (resource: string): string => {
      const windowsFileUri = /^file:\/\/\/([A-Za-z]):(\/.*)$/.exec(resource);
      if (windowsFileUri === null) return resource;
      return `file:///${windowsFileUri[1]?.toLocaleLowerCase()}%3A${windowsFileUri[2]}`;
    },
  };
});

vi.mock('monaco-editor/editor', () => ({
  editor: { defineTheme: mocks.defineTheme },
  Uri: {
    parse: (resource: string) => ({ toString: () => mocks.canonicalResource(resource) }),
  },
}));

vi.mock('monaco-editor/features/bracketMatching/register', () => ({}));
vi.mock('monaco-editor/features/clipboard/register', () => ({}));
vi.mock('monaco-editor/features/codeAction/register', () => ({}));
vi.mock('monaco-editor/features/codeEditor/register', () => ({}));
vi.mock('monaco-editor/features/codelens/register', () => ({}));
vi.mock('monaco-editor/features/codicon/register', () => ({}));
vi.mock('monaco-editor/features/comment/register', () => ({}));
vi.mock('monaco-editor/features/contextmenu/register', () => ({}));
vi.mock('monaco-editor/features/documentSymbols/register', () => ({}));
vi.mock('monaco-editor/features/find/register', () => ({}));
vi.mock('monaco-editor/features/folding/register', () => ({}));
vi.mock('monaco-editor/features/format/register', () => ({}));
vi.mock('monaco-editor/features/gotoError/register', () => ({}));
vi.mock('monaco-editor/features/gotoLine/register', () => ({}));
vi.mock('monaco-editor/features/gotoSymbol/register', () => ({}));
vi.mock('monaco-editor/features/hover/register', () => ({}));
vi.mock('monaco-editor/features/indentation/register', () => ({}));
vi.mock('monaco-editor/features/inlineCompletions/register', () => ({}));
vi.mock('monaco-editor/features/linesOperations/register', () => ({}));
vi.mock('monaco-editor/features/links/register', () => ({}));
vi.mock('monaco-editor/features/multicursor/register', () => ({}));
vi.mock('monaco-editor/features/parameterHints/register', () => ({}));
vi.mock('monaco-editor/features/referenceSearch/register', () => ({}));
vi.mock('monaco-editor/features/rename/register', () => ({}));
vi.mock('monaco-editor/features/snippet/register', () => ({}));
vi.mock('monaco-editor/features/stickyScroll/register', () => ({}));
vi.mock('monaco-editor/features/suggest/register', () => ({}));
vi.mock('monaco-editor/features/tokenization/register', () => ({}));
vi.mock('monaco-editor/features/unicodeHighlighter/register', () => ({}));
vi.mock('monaco-editor/features/wordHighlighter/register', () => ({}));
vi.mock('monaco-editor/languages/definitions/typescript/register', () => ({}));

vi.mock('monaco-editor/languages/features/typescript/register', () => ({
  getTypeScriptWorker: mocks.getTypeScriptWorker,
  JsxEmit: { ReactJSX: 4 },
  ModuleKind: { ESNext: 99 },
  ModuleResolutionKind: { NodeJs: 2 },
  ScriptTarget: { ESNext: 99 },
  typescriptDefaults: {
    addExtraLib: mocks.addExtraLib,
    setCompilerOptions: mocks.setCompilerOptions,
    setDiagnosticsOptions: mocks.setDiagnosticsOptions,
    setEagerModelSync: mocks.setEagerModelSync,
    setInlayHintsOptions: mocks.setInlayHintsOptions,
    setModeConfiguration: mocks.setModeConfiguration,
  },
}));

import {
  configureMonaco,
  isTypeScriptThisExpressionPosition,
  resetMonacoSetupForTests,
  synchronizeMonacoExtraLibraries,
  WEBRAD_MONACO_DARK_THEME,
  WEBRAD_MONACO_LIGHT_THEME,
  webradMonacoTheme,
} from './monaco-setup';

beforeEach(() => {
  resetMonacoSetupForTests();
  mocks.registrations.length = 0;
  vi.clearAllMocks();
});

describe('Monaco setup', () => {
  it('configures professional themes and the complete TypeScript language service once', () => {
    configureMonaco();
    configureMonaco();

    expect(webradMonacoTheme('dark')).toBe(WEBRAD_MONACO_DARK_THEME);
    expect(webradMonacoTheme('light')).toBe(WEBRAD_MONACO_LIGHT_THEME);
    expect(mocks.defineTheme).toHaveBeenCalledTimes(2);
    expect(mocks.defineTheme).toHaveBeenNthCalledWith(
      1,
      WEBRAD_MONACO_DARK_THEME,
      expect.objectContaining({
        base: 'vs-dark',
        inherit: true,
        colors: expect.objectContaining({
          'editor.background': '#1E1E1E',
          'editorError.foreground': '#FF6B78',
        }),
      }),
    );
    expect(mocks.defineTheme).toHaveBeenNthCalledWith(
      2,
      WEBRAD_MONACO_LIGHT_THEME,
      expect.objectContaining({ base: 'vs', inherit: true }),
    );
    expect(mocks.setCompilerOptions).toHaveBeenCalledOnce();
    expect(mocks.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowNonTsExtensions: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        jsx: 4,
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
        module: 99,
        moduleResolution: 100,
        noEmit: true,
        noImplicitOverride: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: true,
        strict: true,
        target: 9,
        useUnknownInCatchVariables: true,
        verbatimModuleSyntax: true,
      }),
    );
    expect(mocks.setDiagnosticsOptions).toHaveBeenCalledWith({
      noSemanticValidation: false,
      noSuggestionDiagnostics: false,
      noSyntaxValidation: false,
      onlyVisible: false,
    });
    expect(mocks.setModeConfiguration).toHaveBeenCalledWith({
      codeActions: true,
      completionItems: true,
      definitions: true,
      diagnostics: true,
      documentHighlights: true,
      documentRangeFormattingEdits: true,
      documentSymbols: true,
      hovers: true,
      inlayHints: false,
      onTypeFormattingEdits: true,
      references: true,
      rename: true,
      signatureHelp: true,
    });
    expect(mocks.setEagerModelSync).toHaveBeenCalledWith(true);
    expect(mocks.setInlayHintsOptions).toHaveBeenCalledWith({
      includeInlayEnumMemberValueHints: false,
      includeInlayFunctionLikeReturnTypeHints: false,
      includeInlayFunctionParameterTypeHints: false,
      includeInlayParameterNameHints: 'none',
      includeInlayParameterNameHintsWhenArgumentMatchesName: false,
      includeInlayPropertyDeclarationTypeHints: false,
      includeInlayVariableTypeHints: false,
    });
  });

  it('updates changed libraries and disposes registrations absent from the next snapshot', () => {
    synchronizeMonacoExtraLibraries({
      'file:///pages/First.generated.d.ts': 'declare const first: 1;',
      'file:///runtime.d.ts': 'declare const runtime: 1;',
    });
    const firstRegistration = mocks.registrations[0];
    const runtimeRegistration = mocks.registrations[1];

    synchronizeMonacoExtraLibraries({
      'file:///pages/First.generated.d.ts': 'declare const first: 1;',
      'file:///pages/Second.generated.d.ts': 'declare const second: 2;',
    });

    expect(firstRegistration?.dispose).not.toHaveBeenCalled();
    expect(runtimeRegistration?.dispose).toHaveBeenCalledOnce();
    expect(mocks.addExtraLib).toHaveBeenCalledTimes(3);

    synchronizeMonacoExtraLibraries({
      'file:///pages/First.generated.d.ts': 'declare const first: 2;',
      'file:///pages/Second.generated.d.ts': 'declare const second: 2;',
    });

    expect(firstRegistration?.dispose).toHaveBeenCalledOnce();
    expect(mocks.addExtraLib).toHaveBeenCalledTimes(4);

    synchronizeMonacoExtraLibraries({});
    expect(mocks.registrations[2]?.dispose).toHaveBeenCalledOnce();
    expect(mocks.registrations[3]?.dispose).toHaveBeenCalledOnce();
  });

  it('registers extra libraries with the same canonical Windows URI used by Monaco models', () => {
    synchronizeMonacoExtraLibraries({
      'file:///C:/Projects/Demo/pages/PageMain.generated.d.ts': 'export declare class Generated {}',
    });

    expect(mocks.addExtraLib).toHaveBeenCalledWith(
      'export declare class Generated {}',
      'file:///c%3A/Projects/Demo/pages/PageMain.generated.d.ts',
    );
  });

  it('uses the TypeScript worker to accept only positions where this is an expression', async () => {
    mocks.getCompletionsAtPosition.mockResolvedValueOnce({
      defaultCommitCharacters: ['.', ',', ';'],
      entries: [{ kind: 'keyword', name: 'this' }],
      isMemberCompletion: false,
    });
    await expect(
      isTypeScriptThisExpressionPosition('file:///C:/Projects/Demo/pages/PageMain.ts', 42),
    ).resolves.toBe(true);
    expect(mocks.getTypeScriptWorker).toHaveBeenCalledOnce();
    expect(mocks.getCompletionsAtPosition).toHaveBeenCalledWith(
      'file:///c%3A/Projects/Demo/pages/PageMain.ts',
      42,
    );

    mocks.getCompletionsAtPosition.mockResolvedValueOnce({
      defaultCommitCharacters: [],
      entries: [{ kind: 'keyword', name: 'this' }],
      isMemberCompletion: false,
    });
    await expect(
      isTypeScriptThisExpressionPosition('file:///C:/Projects/Demo/pages/PageMain.ts', 84),
    ).resolves.toBe(false);
    expect(mocks.getTypeScriptWorker).toHaveBeenCalledOnce();
  });
});
