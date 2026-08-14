import Editor, { loader } from '@monaco-editor/react';
import * as monacoApi from 'monaco-editor/editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import tsWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker';
import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import type { EditorProblem } from '../editor-problems';
import {
  configureMonaco,
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
  readonly buildProblems: readonly EditorProblem[];
  readonly navigateTo?: EditorNavigationTarget | null;
  readonly onSourceChange: (resource: string, value: string) => void;
  readonly onMarkersChange: (markers: readonly monacoApi.editor.IMarker[]) => void;
  readonly onCursorChange: (status: EditorCursorStatus) => void;
  readonly onSave: () => void;
}

const BUILD_MARKER_OWNER = 'webrad-build';
const managedModelUris = new Set<string>();
const buildMarkerUris = new Set<string>();

function canonicalResource(resource: string): string {
  return monacoApi.Uri.parse(resource).toString();
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
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
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
    fontFamily:
      "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', monospace",
    fontLigatures: true,
    fontSize: 13,
    formatOnPaste: true,
    formatOnType: true,
    glyphMargin: true,
    guides: {
      bracketPairs: 'active',
      bracketPairsHorizontal: 'active',
      highlightActiveBracketPair: true,
      highlightActiveIndentation: 'always',
      indentation: true,
    },
    hover: { above: false, delay: 300, enabled: 'on', sticky: true },
    inlayHints: { enabled: 'onUnlessPressed', maximumLength: 80, padding: true },
    inlineSuggest: { enabled: true, showToolbar: 'onHover' },
    insertSpaces: true,
    lightbulb: { enabled: monacoApi.editor.ShowLightbulbIconMode.On },
    lineDecorationsWidth: 12,
    lineHeight: 20,
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
    smoothScrolling: true,
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
  buildProblems,
  navigateTo,
  onSourceChange,
  onMarkersChange,
  onCursorChange,
  onSave,
}: CodeEditorProps): ReactElement {
  const editorRef = useRef<monacoApi.editor.IStandaloneCodeEditor | null>(null);
  const editorDisposablesRef = useRef<monacoApi.IDisposable[]>([]);
  const modelDisposablesRef = useRef(new Map<string, monacoApi.IDisposable>());
  const synchronizingModelsRef = useRef(new Set<string>());
  const projectSourceUrisRef = useRef(new Set<string>());
  const onSourceChangeRef = useRef(onSourceChange);
  const onMarkersChangeRef = useRef(onMarkersChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSourceChangeRef.current = onSourceChange;
    onMarkersChangeRef.current = onMarkersChange;
    onCursorChangeRef.current = onCursorChange;
    onSaveRef.current = onSave;
  }, [onCursorChange, onMarkersChange, onSave, onSourceChange]);

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
      Object.entries(projectSources).map(([resource, content]) => [
        canonicalResource(resource),
        content,
      ]),
    );
    const nextResources = new Set(canonicalSources.keys());
    projectSourceUrisRef.current = nextResources;

    for (const resource of [...managedModelUris]) {
      if (nextResources.has(resource)) continue;
      modelDisposablesRef.current.get(resource)?.dispose();
      modelDisposablesRef.current.delete(resource);
      disposeManagedModel(resource);
    }

    for (const [resource, content] of canonicalSources) {
      const uri = monacoApi.Uri.parse(resource);
      let model = monacoApi.editor.getModel(uri);
      if (model === null) {
        model = monacoApi.editor.createModel(content, 'typescript', uri);
      } else {
        if (model.getLanguageId() !== 'typescript') {
          monacoApi.editor.setModelLanguage(model, 'typescript');
        }
        if (model.getValue() !== content) {
          synchronizingModelsRef.current.add(resource);
          try {
            model.setValue(content);
          } finally {
            synchronizingModelsRef.current.delete(resource);
          }
        }
      }
      managedModelUris.add(resource);
      if (!modelDisposablesRef.current.has(resource)) {
        modelDisposablesRef.current.set(
          resource,
          model.onDidChangeContent(() => {
            if (synchronizingModelsRef.current.has(resource)) return;
            onSourceChangeRef.current(resource, model.getValue());
          }),
        );
      }
    }
  }, [projectSources]);

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

  const beforeMount = (): void => {
    configureMonaco();
    synchronizeMonacoExtraLibraries(extraLibraries);
    synchronizeProjectModels();
  };

  const onMount = (editor: monacoApi.editor.IStandaloneCodeEditor): void => {
    editorRef.current = editor;
    for (const disposable of editorDisposablesRef.current) disposable.dispose();
    editorDisposablesRef.current = [
      editor.onDidChangeCursorSelection(() => publishCursor(editor)),
      editor.onDidChangeModel(() => {
        publishCursor(editor);
        publishMarkers();
      }),
      monacoApi.editor.onDidChangeMarkers((resources) => {
        if (resources.some((resource) => projectSourceUrisRef.current.has(resource.toString()))) {
          publishMarkers();
        }
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
    synchronizeMonacoExtraLibraries(extraLibraries);
    synchronizeBuildMarkers(buildProblems);
    publishCursor(editor);
    publishMarkers();
    editor.focus();
  };

  useEffect(() => {
    synchronizeProjectModels();
    publishMarkers();
  }, [publishMarkers, synchronizeProjectModels]);

  useEffect(() => {
    synchronizeMonacoExtraLibraries(extraLibraries);
  }, [extraLibraries]);

  useEffect(() => {
    synchronizeBuildMarkers(buildProblems);
  }, [buildProblems]);

  useEffect(() => {
    const editor = editorRef.current;
    if (navigateTo === null || navigateTo === undefined || editor === null) return;
    const model = editor.getModel();
    if (model === null || model.uri.toString() !== canonicalResource(navigateTo.resource)) return;
    const range = new monacoApi.Range(
      navigateTo.line,
      navigateTo.column ?? 1,
      navigateTo.endLine ?? navigateTo.line,
      navigateTo.endColumn ?? navigateTo.column ?? 1,
    );
    editor.setSelection(range);
    editor.revealRangeInCenter(range);
    editor.focus();
  }, [navigateTo, path]);

  useEffect(() => {
    const openFind = (): void => {
      void editorRef.current?.getAction('actions.find')?.run();
    };
    window.addEventListener('webrad:find', openFind);
    return () => window.removeEventListener('webrad:find', openFind);
  }, []);

  useEffect(
    () => () => {
      for (const disposable of editorDisposablesRef.current) disposable.dispose();
      editorDisposablesRef.current = [];
      for (const disposable of modelDisposablesRef.current.values()) disposable.dispose();
      modelDisposablesRef.current.clear();
      editorRef.current = null;
    },
    [],
  );

  const label = breadcrumb.at(-1) ?? 'source';
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
          onChange={(next) => onSourceChangeRef.current(canonicalResource(path), next ?? '')}
          onMount={onMount}
          onValidate={publishMarkers}
          options={editorOptions(label)}
          path={path}
          saveViewState
          theme={webradMonacoTheme(theme)}
          value={value}
        />
      </div>
    </section>
  );
}
