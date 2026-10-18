import Editor, { loader } from '@monaco-editor/react';
import * as monacoApi from 'monaco-editor/editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import tsWorker from '../typescript.worker?worker';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import { observeMonacoFontMetrics } from '../monaco-font-metrics';
import { synchronizeMonacoModel } from '../monaco-model-sync';
import { restoreMonacoViewState } from '../monaco-view-state';
import { createDebugHoverProvider, type DebugHoverContext } from '../debugger-hover';
import type { IdeCommand } from '../../../shared/contracts';
import type {
  DebugBreakpoint,
  DebugLocation,
  ResolvedDebugBreakpoint,
} from '../../../shared/debugger-contracts';
import '../debugger.css';
import type { EditorProblem } from '../editor-problems';
import {
  pageComponentCompletionSymbols,
  type PageComponentSymbol,
} from '../page-component-completions';
import { canonicalMonacoResource as canonicalResource } from '../monaco-resource';
import {
  configureMonaco,
  isTypeScriptThisExpressionPosition,
  synchronizeMonacoExtraLibraries,
  webradMonacoTheme,
} from '../monaco-setup';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
  },
};

loader.config({ monaco: monacoApi });

export interface EditorCursorStatus {
  readonly line: number;
  readonly column: number;
  readonly selectionLength: number;
}

export interface EditorNavigationTarget {
  readonly resource: string;
  readonly line: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly requestId: number;
}

interface CodeEditorProps {
  readonly path: string;
  readonly value: string;
  readonly theme: 'dark' | 'light';
  readonly breadcrumb: readonly string[];
  readonly extraLibraries: Readonly<Record<string, string>>;
  readonly projectSources: Readonly<Record<string, string>>;
  readonly pageComponents: readonly PageComponentSymbol[];
  readonly buildProblems: readonly EditorProblem[];
  readonly navigateTo?: EditorNavigationTarget | null;
  readonly sourcePath?: string;
  readonly debugBreakpoints?: readonly ResolvedDebugBreakpoint[];
  readonly debugLocation?: DebugLocation | null;
  readonly debugging?: boolean;
  readonly debugHoverContext?: DebugHoverContext | null;
  readonly onToggleBreakpoint?: (path: string, line: number) => void;
  readonly onBreakpointsMoved?: (breakpoints: readonly DebugBreakpoint[]) => void;
  readonly onSourceChange: (resource: string, value: string) => void;
  readonly onMarkersChange: (markers: readonly monacoApi.editor.IMarker[]) => void;
  readonly onCursorChange: (status: EditorCursorStatus) => void;
  readonly onSave: () => void;
}

const EDITOR_COMMAND_ACTIONS = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.copy': 'editor.action.clipboardCopyAction',
  'edit.cut': 'editor.action.clipboardCutAction',
  'edit.paste': 'editor.action.clipboardPasteAction',
  'edit.delete': 'deleteRight',
} as const satisfies Partial<Record<IdeCommand, string>>;

function isEditorEditCommand(command: unknown): command is keyof typeof EDITOR_COMMAND_ACTIONS {
  return typeof command === 'string' && Object.hasOwn(EDITOR_COMMAND_ACTIONS, command);
}

const BUILD_MARKER_OWNER = 'webrad-build';
const managedModelUris = new Set<string>();
const buildMarkerUris = new Set<string>();
const modelViewStates = new Map<string, monacoApi.editor.ICodeEditorViewState>();
let appliedNavigationRequest: { readonly resource: string; readonly requestId: number } | null =
  null;

interface ModelSubscription {
  readonly model: monacoApi.editor.ITextModel;
  readonly disposable: monacoApi.IDisposable;
  content: string;
}

function markerSeverity(category: EditorProblem['category']): monacoApi.MarkerSeverity {
  if (category === 'error') return monacoApi.MarkerSeverity.Error;
  if (category === 'warning') return monacoApi.MarkerSeverity.Warning;
  return monacoApi.MarkerSeverity.Info;
}

function disposeManagedModel(resource: string): void {
  const model = monacoApi.editor.getModel(monacoApi.Uri.parse(resource));
  if (model !== null && !model.isDisposed()) model.dispose();
  managedModelUris.delete(resource);
  modelViewStates.delete(resource);
}

function rememberViewState(editor: monacoApi.editor.IStandaloneCodeEditor): void {
  const model = editor.getModel();
  if (model === null || model.isDisposed() || !managedModelUris.has(model.uri.toString())) return;
  const state = editor.saveViewState();
  if (state !== null) modelViewStates.set(model.uri.toString(), state);
}

function clearBuildMarkers(): void {
  for (const resource of buildMarkerUris) {
    const model = monacoApi.editor.getModel(monacoApi.Uri.parse(resource));
    if (model !== null && !model.isDisposed()) {
      monacoApi.editor.setModelMarkers(model, BUILD_MARKER_OWNER, []);
    }
  }
  buildMarkerUris.clear();
}

/** Releases models only when the project itself changes or closes, never on a view switch. */
// The workbench owns this lifecycle boundary alongside the editor component.
// eslint-disable-next-line react-refresh/only-export-components
export function releaseMonacoWorkspace(): void {
  clearBuildMarkers();
  for (const resource of [...managedModelUris]) disposeManagedModel(resource);
  modelViewStates.clear();
  appliedNavigationRequest = null;
  synchronizeMonacoExtraLibraries({});
}

function synchronizeBuildMarkers(problems: readonly EditorProblem[]): void {
  const markersByResource = new Map<string, monacoApi.editor.IMarkerData[]>();
  for (const problem of problems) {
    if (problem.resource === undefined || problem.range === undefined) continue;
    const resource = canonicalResource(problem.resource);
    const model = monacoApi.editor.getModel(monacoApi.Uri.parse(resource));
    if (model === null || model.isDisposed()) continue;
    const markers = markersByResource.get(resource) ?? [];
    markers.push({
      code: problem.code === undefined ? undefined : String(problem.code),
      endColumn: problem.range.endColumn,
      endLineNumber: problem.range.endLineNumber,
      message: problem.message,
      severity: markerSeverity(problem.category),
      source: problem.source,
      startColumn: problem.range.startColumn,
      startLineNumber: problem.range.startLineNumber,
    });
    markersByResource.set(resource, markers);
  }

  for (const resource of buildMarkerUris) {
    if (markersByResource.has(resource)) continue;
    const model = monacoApi.editor.getModel(monacoApi.Uri.parse(resource));
    if (model !== null && !model.isDisposed()) {
      monacoApi.editor.setModelMarkers(model, BUILD_MARKER_OWNER, []);
    }
  }
  buildMarkerUris.clear();
  for (const [resource, markers] of markersByResource) {
    const model = monacoApi.editor.getModel(monacoApi.Uri.parse(resource));
    if (model === null || model.isDisposed()) continue;
    monacoApi.editor.setModelMarkers(model, BUILD_MARKER_OWNER, markers);
    buildMarkerUris.add(resource);
  }
}

function editorOptions(label: string): monacoApi.editor.IStandaloneEditorConstructionOptions {
  return {
    acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: 'smart',
    accessibilitySupport: 'auto',
    ariaLabel: `TypeScript editor — ${label}`,
    autoClosingBrackets: 'always',
    autoClosingComments: 'always',
    autoClosingDelete: 'always',
    autoClosingOvertype: 'always',
    autoClosingQuotes: 'always',
    autoDetectHighContrast: true,
    autoIndent: 'full',
    automaticLayout: true,
    bracketPairColorization: {
      enabled: true,
      independentColorPoolPerBracketType: true,
    },
    codeLens: true,
    colorDecorators: true,
    contextmenu: true,
    cursorBlinking: 'blink',
    cursorSmoothCaretAnimation: 'off',
    detectIndentation: false,
    dragAndDrop: true,
    emptySelectionClipboard: true,
    find: {
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'multiline',
      seedSearchStringFromSelection: 'selection',
    },
    fixedOverflowWidgets: true,
    folding: true,
    foldingHighlight: true,
    foldingImportsByDefault: true,
    foldingStrategy: 'auto',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: '300',
    fontLigatures: false,
    fontVariations: false,
    fontSize: 13,
    formatOnPaste: true,
    formatOnType: true,
    glyphMargin: true,
    guides: {
      bracketPairs: false,
      bracketPairsHorizontal: false,
      highlightActiveBracketPair: false,
      highlightActiveIndentation: false,
      indentation: false,
    },
    hover: { above: false, delay: 300, enabled: 'on', sticky: true },
    inlayHints: { enabled: 'off' },
    inlineSuggest: { enabled: true, showToolbar: 'onHover' },
    insertSpaces: true,
    lightbulb: { enabled: monacoApi.editor.ShowLightbulbIconMode.On },
    lineDecorationsWidth: 12,
    lineHeight: 20,
    letterSpacing: 0,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    links: true,
    matchBrackets: 'always',
    minimap: {
      enabled: true,
      maxColumn: 100,
      renderCharacters: false,
      showSlider: 'mouseover',
      size: 'proportional',
    },
    mouseWheelZoom: true,
    occurrencesHighlight: 'multiFile',
    overviewRulerBorder: false,
    padding: { bottom: 8, top: 8 },
    parameterHints: { cycle: true, enabled: true },
    quickSuggestions: { comments: 'off', other: 'on', strings: 'on' },
    quickSuggestionsDelay: 100,
    renderFinalNewline: 'on',
    renderLineHighlight: 'all',
    renderValidationDecorations: 'on',
    renderWhitespace: 'selection',
    rulers: [100],
    screenReaderAnnounceInlineSuggestion: true,
    scrollBeyondLastLine: false,
    selectionHighlight: true,
    'semanticHighlighting.enabled': true,
    showDeprecated: true,
    showFoldingControls: 'mouseover',
    showUnused: true,
    smoothScrolling: false,
    snippetSuggestions: 'inline',
    stickyScroll: {
      defaultModel: 'outlineModel',
      enabled: true,
      maxLineCount: 5,
      scrollWithEditor: true,
    },
    suggest: {
      insertMode: 'replace',
      localityBonus: true,
      preview: true,
      previewMode: 'subwordSmart',
      showInlineDetails: true,
      showStatusBar: true,
    },
    suggestOnTriggerCharacters: true,
    suggestSelection: 'recentlyUsedByPrefix',
    tabCompletion: 'on',
    tabSize: 2,
    unicodeHighlight: {
      ambiguousCharacters: true,
      invisibleCharacters: true,
      nonBasicASCII: false,
    },
    wordBasedSuggestions: 'matchingDocuments',
    wordWrap: 'off',
  };
}

export function CodeEditor({
  path,
  value,
  theme,
  breadcrumb,
  extraLibraries,
  projectSources,
  pageComponents,
  buildProblems,
  navigateTo,
  sourcePath,
  debugBreakpoints = [],
  debugLocation,
  debugging = false,
  debugHoverContext,
  onToggleBreakpoint,
  onBreakpointsMoved,
  onSourceChange,
  onMarkersChange,
  onCursorChange,
  onSave,
}: CodeEditorProps): ReactElement {
  const editorRef = useRef<monacoApi.editor.IStandaloneCodeEditor | null>(null);
  const viewRestorationRef = useRef<monacoApi.IDisposable | null>(null);
  const hoverContextRef = useRef<DebugHoverContext | null>(null);
  const editorDisposablesRef = useRef<monacoApi.IDisposable[]>([]);
  const modelDisposablesRef = useRef(new Map<string, ModelSubscription>());
  const synchronizingModelsRef = useRef(new Set<string>());
  const projectSourceUrisRef = useRef(new Set<string>());
  const projectSourceResourcesRef = useRef(new Map<string, string>());
  const completionResourceRef = useRef(canonicalResource(path));
  const projectSourcesRef = useRef(projectSources);
  const extraLibrariesRef = useRef(extraLibraries);
  const buildProblemsRef = useRef(buildProblems);
  const completionSessionRef = useRef(0);
  const switchingModelRef = useRef(false);
  const pageComponentsRef = useRef(pageComponents);
  const onSourceChangeRef = useRef(onSourceChange);
  const onMarkersChangeRef = useRef(onMarkersChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onSaveRef = useRef(onSave);
  const navigateToRef = useRef<EditorNavigationTarget | null | undefined>(navigateTo);
  const debugRef = useRef({
    sourcePath: sourcePath ?? path,
    debugBreakpoints,
    debugLocation,
    onToggleBreakpoint,
    onBreakpointsMoved,
  });
  const debugDecorationsRef = useRef(
    new Map<
      string,
      {
        readonly model: monacoApi.editor.ITextModel;
        readonly path: string;
        ids: string[];
        breakpoints: { readonly id: string; readonly breakpoint: DebugBreakpoint }[];
      }
    >(),
  );

  useLayoutEffect(() => {
    const nextHover = debugHoverContext?.path === (sourcePath ?? path) ? debugHoverContext : null;
    if (hoverContextRef.current !== nextHover) {
      hoverContextRef.current = nextHover;
      editorRef.current?.trigger('debugger', 'editor.action.hideHover', undefined);
    }
    debugRef.current = {
      sourcePath: sourcePath ?? path,
      debugBreakpoints,
      debugLocation,
      onToggleBreakpoint,
      onBreakpointsMoved,
    };
  }, [
    sourcePath,
    path,
    debugBreakpoints,
    debugLocation,
    debugHoverContext,
    onToggleBreakpoint,
    onBreakpointsMoved,
  ]);

  const synchronizeDebuggerDecorations = useCallback((): void => {
    const activeModel = editorRef.current?.getModel();
    if (activeModel !== undefined && activeModel !== null && !activeModel.isDisposed()) {
      const resource = activeModel.uri.toString();
      if (!debugDecorationsRef.current.has(resource)) {
        debugDecorationsRef.current.set(resource, {
          model: activeModel,
          path: debugRef.current.sourcePath,
          ids: [],
          breakpoints: [],
        });
      }
    }
    for (const [resource, entry] of debugDecorationsRef.current) {
      if (entry.model.isDisposed()) {
        debugDecorationsRef.current.delete(resource);
        continue;
      }
      const breakpoints = debugRef.current.debugBreakpoints.filter(
        (breakpoint) => breakpoint.path === entry.path,
      );
      const decorations: monacoApi.editor.IModelDeltaDecoration[] = breakpoints.map(
        (breakpoint) => ({
          range: new monacoApi.Range(
            breakpoint.actualLine ?? breakpoint.line,
            1,
            breakpoint.actualLine ?? breakpoint.line,
            1,
          ),
          options: {
            glyphMarginClassName: `wr-debug-breakpoint${!breakpoint.enabled ? ' wr-debug-breakpoint-disabled' : !breakpoint.verified ? ' wr-debug-breakpoint-pending' : ''}${breakpoint.condition ? ' wr-debug-breakpoint-conditional' : ''}`,
            glyphMarginHoverMessage: {
              value: `${breakpoint.enabled ? 'Breakpoint' : 'Disabled breakpoint'}${breakpoint.condition ? `: ${breakpoint.condition}` : ''}${breakpoint.message ? ` — ${breakpoint.message}` : !breakpoint.verified ? ' — waiting for executable code' : ''}\n\nClick to remove. Ctrl+F9 to toggle.`,
            },
            stickiness: monacoApi.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        }),
      );
      const location = debugRef.current.debugLocation;
      if (location?.path === entry.path)
        decorations.push({
          range: new monacoApi.Range(location.line, 1, location.line, 1),
          options: {
            isWholeLine: true,
            className: 'wr-debug-execution-line',
            glyphMarginClassName: 'wr-debug-execution-arrow',
            glyphMarginHoverMessage: { value: 'Execution paused here' },
          },
        });
      if (entry.ids.length === 0 && decorations.length === 0) continue;
      entry.ids = entry.model.deltaDecorations(entry.ids, decorations);
      entry.breakpoints = breakpoints.flatMap((breakpoint, index) => {
        const id = entry.ids[index];
        return id === undefined ? [] : [{ id, breakpoint }];
      });
    }
  }, []);

  useLayoutEffect(() => {
    onSourceChangeRef.current = onSourceChange;
    onMarkersChangeRef.current = onMarkersChange;
    onCursorChangeRef.current = onCursorChange;
    onSaveRef.current = onSave;
  }, [onCursorChange, onMarkersChange, onSave, onSourceChange]);

  useLayoutEffect(() => {
    navigateToRef.current = navigateTo;
  }, [navigateTo]);

  useLayoutEffect(() => {
    completionResourceRef.current = canonicalResource(path);
    pageComponentsRef.current = pageComponents;
  }, [pageComponents, path]);

  useLayoutEffect(() => {
    projectSourcesRef.current = projectSources;
    extraLibrariesRef.current = extraLibraries;
    buildProblemsRef.current = buildProblems;
  }, [buildProblems, extraLibraries, projectSources]);

  const publishMarkers = useCallback((): void => {
    const markers = [...projectSourceUrisRef.current].flatMap((resource) =>
      monacoApi.editor
        .getModelMarkers({ resource: monacoApi.Uri.parse(resource) })
        .filter((marker) => marker.owner !== BUILD_MARKER_OWNER),
    );
    onMarkersChangeRef.current(markers);
  }, []);

  const synchronizeProjectModels = useCallback((): void => {
    const canonicalSources = new Map(
      Object.entries(projectSourcesRef.current).map(([resource, content]) => [
        canonicalResource(resource),
        { content, externalResource: resource },
      ]),
    );
    const nextResources = new Set(canonicalSources.keys());
    projectSourceUrisRef.current = nextResources;
    projectSourceResourcesRef.current = new Map(
      [...canonicalSources].map(([resource, source]) => [resource, source.externalResource]),
    );

    for (const resource of [...managedModelUris]) {
      if (nextResources.has(resource)) continue;
      modelDisposablesRef.current.get(resource)?.disposable.dispose();
      modelDisposablesRef.current.delete(resource);
      disposeManagedModel(resource);
    }

    for (const [resource, source] of canonicalSources) {
      const { content } = source;
      const uri = monacoApi.Uri.parse(resource);
      let model = monacoApi.editor.getModel(uri);
      const current = modelDisposablesRef.current.get(resource);
      if (model === null) {
        model = monacoApi.editor.createModel(content, 'typescript', uri);
      } else {
        if (model.getLanguageId() !== 'typescript') {
          monacoApi.editor.setModelLanguage(model, 'typescript');
        }
        if (current?.model !== model || current.content !== content) {
          synchronizingModelsRef.current.add(resource);
          try {
            synchronizeMonacoModel(model, model.getValue(), content, editorRef.current);
          } finally {
            synchronizingModelsRef.current.delete(resource);
          }
        }
      }
      managedModelUris.add(resource);
      if (current?.model !== model) {
        current?.disposable.dispose();
        const subscription: ModelSubscription = {
          model,
          content,
          disposable: model.onDidChangeContent(() => {
            if (synchronizingModelsRef.current.has(resource)) return;
            const decorationEntry = debugDecorationsRef.current.get(resource);
            if (
              decorationEntry !== undefined &&
              debugRef.current.onBreakpointsMoved !== undefined
            ) {
              const moved = new Map(
                decorationEntry.breakpoints.map(({ id, breakpoint }) => [
                  breakpoint,
                  model.getDecorationRange(id)?.startLineNumber ?? breakpoint.line,
                ]),
              );
              if ([...moved].some(([breakpoint, line]) => breakpoint.line !== line)) {
                debugRef.current.onBreakpointsMoved(
                  debugRef.current.debugBreakpoints.map((breakpoint) => {
                    const line = moved.get(breakpoint);
                    return {
                      path: breakpoint.path,
                      line: line ?? breakpoint.line,
                      column: breakpoint.column,
                      enabled: breakpoint.enabled,
                      condition: breakpoint.condition,
                    };
                  }),
                );
              }
            }
            subscription.content = model.getValue();
            onSourceChangeRef.current(
              projectSourceResourcesRef.current.get(resource) ?? resource,
              subscription.content,
            );
          }),
        };
        modelDisposablesRef.current.set(resource, subscription);
      } else {
        current.content = content;
      }
    }
  }, []);

  const publishCursor = useCallback((editor: monacoApi.editor.IStandaloneCodeEditor): void => {
    const position = editor.getPosition();
    if (position === null) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    onCursorChangeRef.current({
      line: position.lineNumber,
      column: position.column,
      selectionLength:
        selection === null || model === null ? 0 : model.getValueLengthInRange(selection),
    });
  }, []);

  const applyNavigation = useCallback(
    (
      editor: monacoApi.editor.IStandaloneCodeEditor,
      target: EditorNavigationTarget | null | undefined,
    ): boolean => {
      if (target === null || target === undefined) return false;
      const model = editor.getModel();
      if (model === null || model.uri.toString() !== canonicalResource(target.resource))
        return false;
      const resource = model.uri.toString();
      if (
        appliedNavigationRequest?.requestId === target.requestId &&
        appliedNavigationRequest.resource === resource
      )
        return false;

      viewRestorationRef.current?.dispose();
      viewRestorationRef.current = null;
      const range = model.validateRange(
        new monacoApi.Range(
          target.line,
          target.column ?? 1,
          target.endLine ?? target.line,
          target.endColumn ?? target.column ?? 1,
        ),
      );
      editor.setSelection(range);
      editor.revealRangeInCenter(range);
      editor.focus();
      appliedNavigationRequest = { resource, requestId: target.requestId };
      return true;
    },
    [],
  );

  const activateProjectModel = useCallback(
    (editor: monacoApi.editor.IStandaloneCodeEditor, restoreCurrent = false): void => {
      const resource = completionResourceRef.current;
      const model = monacoApi.editor.getModel(monacoApi.Uri.parse(resource));
      if (model === null || model.isDisposed()) return;
      if (editor.getModel() === model && !restoreCurrent) return;
      viewRestorationRef.current?.dispose();
      viewRestorationRef.current = null;
      if (editor.getModel() !== model) {
        rememberViewState(editor);
        switchingModelRef.current = true;
        try {
          editor.setModel(model);
        } finally {
          switchingModelRef.current = false;
        }
      }
      const state = modelViewStates.get(resource);
      if (state !== undefined) viewRestorationRef.current = restoreMonacoViewState(editor, state);
      const navigated = applyNavigation(editor, navigateToRef.current);
      publishCursor(editor);
      if (!navigated) editor.focus();
    },
    [applyNavigation, publishCursor],
  );

  const beforeMount = (): void => {
    configureMonaco();
    synchronizeMonacoExtraLibraries(extraLibrariesRef.current);
    synchronizeProjectModels();
  };

  const onMount = (editor: monacoApi.editor.IStandaloneCodeEditor): void => {
    editorRef.current = editor;
    const completionSession = ++completionSessionRef.current;
    for (const disposable of editorDisposablesRef.current) disposable.dispose();
    editorDisposablesRef.current = [
      observeMonacoFontMetrics(editor),
      monacoApi.languages.registerHoverProvider(
        'typescript',
        createDebugHoverProvider(
          () => hoverContextRef.current,
          () => editorRef.current?.getModel(),
        ),
      ),
      monacoApi.languages.registerCompletionItemProvider('typescript', {
        provideCompletionItems: async (model, position, _context, token) => {
          if (token.isCancellationRequested || model.isDisposed()) return { suggestions: [] };
          const version = model.getVersionId();
          const pageComponentSnapshot = pageComponentsRef.current;
          const word = model.getWordUntilPosition(position);
          const requestedResource = canonicalResource(model.uri.toString());
          const wordPrefix = word.word.toLowerCase();
          if (
            requestedResource !== completionResourceRef.current ||
            !pageComponentSnapshot.some((component) =>
              component.name.toLowerCase().startsWith(wordPrefix),
            )
          ) {
            return { suggestions: [] };
          }
          const supportsThisExpression = await isTypeScriptThisExpressionPosition(
            requestedResource,
            model.getOffsetAt(position),
          );
          if (
            token.isCancellationRequested ||
            model.isDisposed() ||
            model.getVersionId() !== version ||
            completionSessionRef.current !== completionSession ||
            pageComponentsRef.current !== pageComponentSnapshot ||
            completionResourceRef.current !== requestedResource
          )
            return { suggestions: [] };
          const matchingComponents = pageComponentSnapshot.filter((component) =>
            component.name.toLowerCase().startsWith(wordPrefix),
          );
          const components = pageComponentCompletionSymbols(matchingComponents, {
            activeResource: completionResourceRef.current,
            requestedResource,
            supportsThisExpression,
          });
          return {
            suggestions: components.map((component) => ({
              commitCharacters: ['.'],
              detail: `${component.type} - WebRAD component`,
              filterText: component.name,
              insertText: component.name,
              kind: monacoApi.languages.CompletionItemKind.Field,
              label: component.name,
              sortText: `0000_${component.name}`,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endLineNumber: position.lineNumber,
                endColumn: word.endColumn,
              },
            })),
          };
        },
      }),
      editor.onDidChangeCursorSelection(() => {
        viewRestorationRef.current?.dispose();
        viewRestorationRef.current = null;
        publishCursor(editor);
      }),
      editor.onDidChangeModel(() => {
        viewRestorationRef.current?.dispose();
        viewRestorationRef.current = null;
        synchronizeDebuggerDecorations();
        if (!switchingModelRef.current) applyNavigation(editor, navigateToRef.current);
        publishCursor(editor);
        publishMarkers();
      }),
      editor.onMouseDown((event) => {
        if (
          event.target.type !== monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          event.target.position === null ||
          !event.event.leftButton
        )
          return;
        const clickedLine = event.target.position.lineNumber;
        const existing = debugRef.current.debugBreakpoints.find(
          (breakpoint) =>
            breakpoint.path === debugRef.current.sourcePath &&
            (breakpoint.actualLine ?? breakpoint.line) === clickedLine,
        );
        debugRef.current.onToggleBreakpoint?.(
          debugRef.current.sourcePath,
          existing?.line ?? clickedLine,
        );
      }),
      monacoApi.editor.onDidChangeMarkers((resources) => {
        if (resources.some((resource) => projectSourceUrisRef.current.has(resource.toString()))) {
          publishMarkers();
        }
      }),
      editor.addAction({
        id: 'webrad.toggle-breakpoint',
        label: 'Toggle Breakpoint',
        keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.F9],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2,
        run: () => {
          const position = editor.getPosition();
          if (position !== null) {
            const existing = debugRef.current.debugBreakpoints.find(
              (breakpoint) =>
                breakpoint.path === debugRef.current.sourcePath &&
                (breakpoint.actualLine ?? breakpoint.line) === position.lineNumber,
            );
            debugRef.current.onToggleBreakpoint?.(
              debugRef.current.sourcePath,
              existing?.line ?? position.lineNumber,
            );
          }
        },
      }),
      editor.addAction({
        id: 'webrad.save-project',
        label: 'Save Project',
        keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        run: () => onSaveRef.current(),
      }),
    ];
    synchronizeProjectModels();
    synchronizeMonacoExtraLibraries(extraLibrariesRef.current);
    synchronizeBuildMarkers(buildProblemsRef.current);
    activateProjectModel(editor, true);
    synchronizeDebuggerDecorations();
    publishMarkers();
  };

  useEffect(() => {
    synchronizeDebuggerDecorations();
  }, [debugBreakpoints, debugLocation, path, sourcePath, synchronizeDebuggerDecorations]);

  useEffect(() => {
    synchronizeProjectModels();
    const editor = editorRef.current;
    if (editor !== null) activateProjectModel(editor);
    publishMarkers();
  }, [activateProjectModel, path, projectSources, publishMarkers, synchronizeProjectModels]);

  useEffect(() => {
    synchronizeMonacoExtraLibraries(extraLibraries);
  }, [extraLibraries]);

  useEffect(() => {
    synchronizeBuildMarkers(buildProblems);
  }, [buildProblems]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null || !applyNavigation(editor, navigateTo)) return;
    publishCursor(editor);
  }, [applyNavigation, navigateTo, path, publishCursor]);

  useEffect(() => {
    const applyEditorCommand = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const command: unknown = event.detail;
      if (!isEditorEditCommand(command)) return;
      const editor = editorRef.current;
      if (editor === null) return;
      editor.focus();
      editor.trigger('webrad', EDITOR_COMMAND_ACTIONS[command], null);
    };
    window.addEventListener('webrad:editor-command', applyEditorCommand);
    return () => window.removeEventListener('webrad:editor-command', applyEditorCommand);
  }, []);

  useEffect(() => {
    const openFind = (): void => {
      void editorRef.current?.getAction('actions.find')?.run();
    };
    window.addEventListener('webrad:find', openFind);
    return () => window.removeEventListener('webrad:find', openFind);
  }, []);

  useEffect(
    () => () => {
      viewRestorationRef.current?.dispose();
      viewRestorationRef.current = null;
      const editor = editorRef.current;
      if (editor !== null) rememberViewState(editor);
      completionSessionRef.current += 1;
      for (const disposable of editorDisposablesRef.current) disposable.dispose();
      editorDisposablesRef.current = [];
      for (const subscription of modelDisposablesRef.current.values()) {
        subscription.disposable.dispose();
      }
      modelDisposablesRef.current.clear();
      for (const entry of debugDecorationsRef.current.values()) {
        if (!entry.model.isDisposed() && entry.ids.length > 0)
          entry.model.deltaDecorations(entry.ids, []);
      }
      debugDecorationsRef.current.clear();
      projectSourceResourcesRef.current.clear();
      editorRef.current = null;
    },
    [],
  );

  const label = breadcrumb.at(-1) ?? 'source';
  const options = useMemo(
    () => ({
      ...editorOptions(label),
      readOnly: debugging,
      readOnlyMessage: { value: 'Stop debugging to edit the source.' },
    }),
    [debugging, label],
  );
  return (
    <section className="wr-code-workspace" aria-label={`${label} code workspace`}>
      <div className="wr-code-breadcrumb">
        <nav aria-label="Source path">
          {breadcrumb.map((segment, index) => (
            <span key={`${segment}-${String(index)}`}>
              {index > 0 && <span aria-hidden="true">›</span>}
              {segment}
            </span>
          ))}
        </nav>
        <span className="wr-code-shortcuts" aria-label="Editor shortcuts">
          <kbd>Ctrl+Space</kbd> IntelliSense
          <kbd>F8</kbd> Next problem
          <kbd>Ctrl+F9</kbd> Breakpoint
          <kbd>Shift+Alt+F</kbd> Format
        </span>
      </div>
      <div className="wr-monaco-host">
        <Editor
          beforeMount={beforeMount}
          defaultLanguage="typescript"
          height="100%"
          keepCurrentModel
          language="typescript"
          loading={<div className="wr-monaco-loading">Starting TypeScript IntelliSense…</div>}
          onMount={onMount}
          onValidate={publishMarkers}
          options={options}
          defaultPath={path}
          saveViewState={false}
          theme={webradMonacoTheme(theme)}
          defaultValue={value}
        />
      </div>
    </section>
  );
}
