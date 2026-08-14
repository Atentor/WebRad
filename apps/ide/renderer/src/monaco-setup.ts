import * as monacoApi from 'monaco-editor/editor';
// Monaco's aggregate `features/register.all` entrypoint pulls every editor contribution into
// the renderer (including diff, GPU, color-picker, quick-access, and mobile-only features). That
// exceeds the production renderer's 4 GB build budget. These public granular entrypoints retain
// the complete code-editing experience while keeping unrelated contributions out of the bundle.
import 'monaco-editor/features/bracketMatching/register';
import 'monaco-editor/features/clipboard/register';
import 'monaco-editor/features/codeAction/register';
import 'monaco-editor/features/codeEditor/register';
import 'monaco-editor/features/codelens/register';
import 'monaco-editor/features/codicon/register';
import 'monaco-editor/features/comment/register';
import 'monaco-editor/features/contextmenu/register';
import 'monaco-editor/features/documentSymbols/register';
import 'monaco-editor/features/find/register';
import 'monaco-editor/features/folding/register';
import 'monaco-editor/features/format/register';
import 'monaco-editor/features/gotoError/register';
import 'monaco-editor/features/gotoLine/register';
import 'monaco-editor/features/gotoSymbol/register';
import 'monaco-editor/features/hover/register';
import 'monaco-editor/features/indentation/register';
import 'monaco-editor/features/inlayHints/register';
// Monaco 0.56's inline-completions contribution owns the classic suggest controller/widget too.
// `features/suggest/register` alone only registers the inline suggestion source.
import 'monaco-editor/features/inlineCompletions/register';
import 'monaco-editor/features/linesOperations/register';
import 'monaco-editor/features/links/register';
import 'monaco-editor/features/multicursor/register';
import 'monaco-editor/features/parameterHints/register';
import 'monaco-editor/features/referenceSearch/register';
import 'monaco-editor/features/rename/register';
import 'monaco-editor/features/snippet/register';
import 'monaco-editor/features/stickyScroll/register';
import 'monaco-editor/features/suggest/register';
import 'monaco-editor/features/tokenization/register';
import 'monaco-editor/features/unicodeHighlighter/register';
import 'monaco-editor/features/wordHighlighter/register';
import 'monaco-editor/languages/definitions/typescript/register';
import * as typescriptApi from 'monaco-editor/languages/features/typescript/register';
import { canonicalMonacoResource } from './monaco-resource';

export const WEBRAD_MONACO_DARK_THEME = 'webrad-dark';
export const WEBRAD_MONACO_LIGHT_THEME = 'webrad-light';

export type WebRadMonacoTheme = typeof WEBRAD_MONACO_DARK_THEME | typeof WEBRAD_MONACO_LIGHT_THEME;

interface ExtraLibraryRegistration {
  readonly content: string;
  readonly disposable: monacoApi.IDisposable;
}

const extraLibraryRegistrations = new Map<string, ExtraLibraryRegistration>();
let configured = false;

// Monaco 0.56 embeds TypeScript 5.9, but its public compatibility enums stop at ES2020/NodeJs.
// These are the stable TypeScript enum values for ScriptTarget.ES2022 and
// ModuleResolutionKind.Bundler, respectively.
const SCRIPT_TARGET_ES2022 = 9 as typescriptApi.ScriptTarget;
const MODULE_RESOLUTION_BUNDLER = 100 as typescriptApi.ModuleResolutionKind;

const COMPLETE_MODE_CONFIGURATION: typescriptApi.ModeConfiguration = {
  codeActions: true,
  completionItems: true,
  definitions: true,
  diagnostics: true,
  documentHighlights: true,
  documentRangeFormattingEdits: true,
  documentSymbols: true,
  hovers: true,
  inlayHints: true,
  onTypeFormattingEdits: true,
  references: true,
  rename: true,
  signatureHelp: true,
};

const DARK_THEME: monacoApi.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C586C0' },
    { token: 'type.identifier', foreground: '4EC9B0' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'regexp', foreground: 'D16969' },
    { token: 'delimiter', foreground: 'D4D4D4' },
  ],
  colors: {
    'editor.background': '#171A21',
    'editor.foreground': '#E3E8F0',
    'editor.findMatchBackground': '#F0BD5666',
    'editor.findMatchHighlightBackground': '#F0BD5633',
    'editor.focusedStackFrameHighlightBackground': '#66D19E24',
    'editor.inactiveSelectionBackground': '#2A78C533',
    'editor.lineHighlightBackground': '#FFFFFF0A',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#2A78C566',
    'editor.stackFrameHighlightBackground': '#F0BD5624',
    'editor.wordHighlightBackground': '#49A6FF24',
    'editor.wordHighlightStrongBackground': '#49A6FF3D',
    'editorBracketHighlight.foreground1': '#49A6FF',
    'editorBracketHighlight.foreground2': '#C586C0',
    'editorBracketHighlight.foreground3': '#66D19E',
    'editorBracketHighlight.foreground4': '#F0BD56',
    'editorBracketHighlight.foreground5': '#CE9178',
    'editorBracketHighlight.foreground6': '#4EC9B0',
    'editorBracketHighlight.unexpectedBracket.foreground': '#FF6B78',
    'editorCursor.foreground': '#49A6FF',
    'editorError.foreground': '#FF6B78',
    'editorGutter.background': '#171A21',
    'editorHint.foreground': '#66D19E',
    'editorHoverWidget.background': '#20242D',
    'editorHoverWidget.border': '#4A5362',
    'editorIndentGuide.activeBackground1': '#49A6FF80',
    'editorIndentGuide.background1': '#343B4870',
    'editorInfo.foreground': '#49A6FF',
    'editorLineNumber.activeForeground': '#DCE4EF',
    'editorLineNumber.foreground': '#687386',
    'editorLink.activeForeground': '#70BAFF',
    'editorMarkerNavigation.background': '#20242D',
    'editorOverviewRuler.border': '#00000000',
    'editorSuggestWidget.background': '#20242D',
    'editorSuggestWidget.border': '#4A5362',
    'editorSuggestWidget.focusHighlightForeground': '#FFFFFF',
    'editorSuggestWidget.foreground': '#E3E8F0',
    'editorSuggestWidget.highlightForeground': '#70BAFF',
    'editorSuggestWidget.selectedBackground': '#2A78C5',
    'editorWarning.foreground': '#F0BD56',
    'editorWhitespace.foreground': '#4A536280',
    'editorWidget.background': '#20242D',
    'editorWidget.border': '#4A5362',
    focusBorder: '#49A6FF',
    'minimap.background': '#171A21',
    'scrollbarSlider.activeBackground': '#929CAB66',
    'scrollbarSlider.background': '#929CAB33',
    'scrollbarSlider.hoverBackground': '#929CAB52',
  },
};

const LIGHT_THEME: monacoApi.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'AF00DB' },
    { token: 'type.identifier', foreground: '267F99' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'regexp', foreground: '811F3F' },
    { token: 'delimiter', foreground: '383A42' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#202936',
    'editor.findMatchBackground': '#F0BD5680',
    'editor.findMatchHighlightBackground': '#F0BD5645',
    'editor.focusedStackFrameHighlightBackground': '#18865624',
    'editor.inactiveSelectionBackground': '#1479D326',
    'editor.lineHighlightBackground': '#1479D30A',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#1479D34D',
    'editor.stackFrameHighlightBackground': '#A66A0024',
    'editor.wordHighlightBackground': '#1479D31F',
    'editor.wordHighlightStrongBackground': '#1479D338',
    'editorBracketHighlight.foreground1': '#1479D3',
    'editorBracketHighlight.foreground2': '#AF00DB',
    'editorBracketHighlight.foreground3': '#188656',
    'editorBracketHighlight.foreground4': '#A66A00',
    'editorBracketHighlight.foreground5': '#A31515',
    'editorBracketHighlight.foreground6': '#267F99',
    'editorBracketHighlight.unexpectedBracket.foreground': '#C93748',
    'editorCursor.foreground': '#1479D3',
    'editorError.foreground': '#C93748',
    'editorGutter.background': '#FFFFFF',
    'editorHint.foreground': '#188656',
    'editorHoverWidget.background': '#F9FAFC',
    'editorHoverWidget.border': '#9DA9B8',
    'editorIndentGuide.activeBackground1': '#1479D380',
    'editorIndentGuide.background1': '#CBD2DCB3',
    'editorInfo.foreground': '#1479D3',
    'editorLineNumber.activeForeground': '#202936',
    'editorLineNumber.foreground': '#8290A3',
    'editorLink.activeForeground': '#005FB8',
    'editorMarkerNavigation.background': '#F9FAFC',
    'editorOverviewRuler.border': '#00000000',
    'editorSuggestWidget.background': '#F9FAFC',
    'editorSuggestWidget.border': '#9DA9B8',
    'editorSuggestWidget.focusHighlightForeground': '#FFFFFF',
    'editorSuggestWidget.foreground': '#202936',
    'editorSuggestWidget.highlightForeground': '#005FB8',
    'editorSuggestWidget.selectedBackground': '#1479D3',
    'editorWarning.foreground': '#A66A00',
    'editorWhitespace.foreground': '#9DA9B880',
    'editorWidget.background': '#F9FAFC',
    'editorWidget.border': '#9DA9B8',
    focusBorder: '#1479D3',
    'minimap.background': '#FFFFFF',
    'scrollbarSlider.activeBackground': '#65718466',
    'scrollbarSlider.background': '#65718433',
    'scrollbarSlider.hoverBackground': '#65718452',
  },
};

export function webradMonacoTheme(theme: 'dark' | 'light'): WebRadMonacoTheme {
  return theme === 'dark' ? WEBRAD_MONACO_DARK_THEME : WEBRAD_MONACO_LIGHT_THEME;
}

export function configureMonaco(): void {
  if (configured) return;

  monacoApi.editor.defineTheme(WEBRAD_MONACO_DARK_THEME, DARK_THEME);
  monacoApi.editor.defineTheme(WEBRAD_MONACO_LIGHT_THEME, LIGHT_THEME);

  typescriptApi.typescriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    jsx: typescriptApi.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: typescriptApi.ModuleKind.ESNext,
    moduleResolution: MODULE_RESOLUTION_BUNDLER,
    noEmit: true,
    noImplicitOverride: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    strict: true,
    target: SCRIPT_TARGET_ES2022,
    useUnknownInCatchVariables: true,
    verbatimModuleSyntax: true,
  });
  typescriptApi.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSuggestionDiagnostics: false,
    noSyntaxValidation: false,
    onlyVisible: false,
  });
  typescriptApi.typescriptDefaults.setModeConfiguration(COMPLETE_MODE_CONFIGURATION);
  typescriptApi.typescriptDefaults.setEagerModelSync(true);
  typescriptApi.typescriptDefaults.setInlayHintsOptions({
    includeInlayEnumMemberValueHints: true,
    includeInlayFunctionLikeReturnTypeHints: true,
    includeInlayFunctionParameterTypeHints: true,
    includeInlayParameterNameHints: 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName: false,
    includeInlayPropertyDeclarationTypeHints: true,
    includeInlayVariableTypeHints: true,
  });

  configured = true;
}

export function synchronizeMonacoExtraLibraries(libraries: Readonly<Record<string, string>>): void {
  configureMonaco();
  const canonicalLibraries = new Map(
    Object.entries(libraries).map(([path, content]) => [canonicalMonacoResource(path), content]),
  );
  const nextPaths = new Set(canonicalLibraries.keys());

  for (const [path, registration] of extraLibraryRegistrations) {
    if (nextPaths.has(path)) continue;
    registration.disposable.dispose();
    extraLibraryRegistrations.delete(path);
  }

  for (const [path, content] of canonicalLibraries) {
    const current = extraLibraryRegistrations.get(path);
    if (current?.content === content) continue;
    current?.disposable.dispose();
    extraLibraryRegistrations.delete(path);
    extraLibraryRegistrations.set(path, {
      content,
      disposable: typescriptApi.typescriptDefaults.addExtraLib(content, path),
    });
  }
}

/** Clears module-owned state so unit tests remain isolated. Not for application lifecycle use. */
export function resetMonacoSetupForTests(): void {
  for (const registration of extraLibraryRegistrations.values()) {
    registration.disposable.dispose();
  }
  extraLibraryRegistrations.clear();
  configured = false;
}
