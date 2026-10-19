// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockEditorProps {
  readonly beforeMount?: (monaco: unknown) => void;
  readonly defaultLanguage?: string;
  readonly defaultPath?: string;
  readonly defaultValue?: string;
  readonly keepCurrentModel?: boolean;
  readonly language?: string;
  readonly loading?: ReactNode;
  readonly onChange?: (value: string | undefined) => void;
  readonly onMount?: (editor: unknown) => void;
  readonly onValidate?: () => void;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly path?: string;
  readonly saveViewState?: boolean;
  readonly theme?: string;
}

const mocks = vi.hoisted(() => {
  interface MockUri {
    readonly value: string;
    toString(): string;
  }

  interface MockMarker {
    readonly owner: string;
    readonly resource: MockUri;
    readonly severity: number;
    readonly message: string;
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
    readonly source?: string;
    readonly code?: string | { readonly value: string; readonly target: MockUri };
    readonly modelVersionId?: number;
    readonly tags?: readonly number[];
    readonly origin?: string;
    readonly relatedInformation?: readonly {
      readonly resource: MockUri;
      readonly message: string;
      readonly startLineNumber: number;
      readonly startColumn: number;
      readonly endLineNumber: number;
      readonly endColumn: number;
    }[];
  }

  interface MockCompletionModel {
    readonly uri: MockUri;
    getOffsetAt(position: { readonly lineNumber: number; readonly column: number }): number;
    getVersionId(): number;
    isDisposed(): boolean;
    getWordUntilPosition(position: { readonly lineNumber: number; readonly column: number }): {
      readonly word: string;
      readonly startColumn: number;
      readonly endColumn: number;
    };
  }

  interface MockCompletionProvider {
    provideCompletionItems(
      model: MockCompletionModel,
      position: { readonly lineNumber: number; readonly column: number },
      context?: unknown,
      token?: { readonly isCancellationRequested: boolean },
    ): Promise<{
      readonly suggestions: readonly {
        readonly label: string;
        readonly kind: string;
        readonly insertText: string;
        readonly sortText: string;
        readonly commitCharacters: readonly string[];
        readonly range: {
          readonly startLineNumber: number;
          readonly startColumn: number;
          readonly endLineNumber: number;
          readonly endColumn: number;
        };
      }[];
    }>;
  }

  type ContentListener = () => void;
  type MarkerListener = (resources: readonly MockUri[]) => void;

  class MockRange {
    public constructor(
      public readonly startLineNumber: number,
      public readonly startColumn: number,
      public readonly endLineNumber: number,
      public readonly endColumn: number,
    ) {}
  }

  const models = new Map<string, ReturnType<typeof createModelImplementation>>();
  const markers = new Map<string, MockMarker[]>();
  const markerListeners = new Set<MarkerListener>();
  const completion = { provider: undefined as MockCompletionProvider | undefined };

  function canonicalResource(value: string): string {
    const windowsFileUri = /^file:\/\/\/([A-Za-z]):(\/.*)$/.exec(value);
    if (windowsFileUri === null) return value;
    return `file:///${windowsFileUri[1]?.toLocaleLowerCase()}%3A${windowsFileUri[2]}`;
  }

  function uri(value: string): MockUri {
    return { value, toString: () => value };
  }

  function disposable(remove?: () => void): { readonly dispose: ReturnType<typeof vi.fn> } {
    return { dispose: vi.fn(() => remove?.()) };
  }

  function createModelImplementation(content: string, language: string, resource: MockUri) {
    let value = content;
    let languageId = language;
    let disposed = false;
    let version = 1;
    let eol = content.includes('\r\n') ? '\r\n' : '\n';
    const undoHistory: string[] = [];
    const redoHistory: string[] = [];
    const contentListeners = new Set<ContentListener>();
    const decorations = new Map<
      string,
      { readonly range: MockRange; readonly options: Readonly<Record<string, unknown>> }
    >();
    let decorationId = 0;
    const model = {
      uri: resource,
      decorations,
      deltaDecorations: vi.fn(
        (
          oldIds: readonly string[],
          next: readonly {
            readonly range: MockRange;
            readonly options: Readonly<Record<string, unknown>>;
          }[],
        ) => {
          for (const id of oldIds) decorations.delete(id);
          return next.map((decoration) => {
            const id = `decoration-${String(++decorationId)}`;
            decorations.set(id, decoration);
            return id;
          });
        },
      ),
      getDecorationRange: vi.fn((id: string) => decorations.get(id)?.range ?? null),
      dispose: vi.fn(() => {
        disposed = true;
        models.delete(resource.toString());
      }),
      fireUserChange(nextValue: string): void {
        undoHistory.push(value);
        redoHistory.length = 0;
        value = nextValue;
        version += 1;
        for (const listener of contentListeners) listener();
      },
      getLanguageId: vi.fn(() => languageId),
      getEOL: vi.fn(() => eol),
      getOffsetAt(position: { readonly lineNumber: number; readonly column: number }): number {
        const lines = value.split('\n');
        return (
          lines.slice(0, position.lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0) +
          position.column -
          1
        );
      },
      getPositionAt(offset: number): { readonly lineNumber: number; readonly column: number } {
        const lines = value.slice(0, offset).split('\n');
        return { lineNumber: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
      },
      getVersionId: vi.fn(() => version),
      getValue: vi.fn(() => value),
      getValueLengthInRange: vi.fn(() => 3),
      isDisposed: vi.fn(() => disposed),
      onDidChangeContent: vi.fn((listener: ContentListener) => {
        contentListeners.add(listener);
        return disposable(() => contentListeners.delete(listener));
      }),
      pushEditOperations: vi.fn(
        (
          _cursor: unknown,
          edits: readonly { readonly range: MockRange; readonly text: string }[],
        ) => {
          undoHistory.push(value);
          redoHistory.length = 0;
          for (const edit of [...edits].reverse()) {
            const start = model.getOffsetAt({
              lineNumber: edit.range.startLineNumber,
              column: edit.range.startColumn,
            });
            const end = model.getOffsetAt({
              lineNumber: edit.range.endLineNumber,
              column: edit.range.endColumn,
            });
            value = value.slice(0, start) + edit.text + value.slice(end);
          }
          version += 1;
          for (const listener of contentListeners) listener();
          return null;
        },
      ),
      pushEOL: vi.fn((sequence: number) => {
        eol = sequence === 1 ? '\r\n' : '\n';
        value = value.split(/\r?\n/).join(eol);
        version += 1;
        for (const listener of contentListeners) listener();
      }),
      pushStackElement: vi.fn(),
      redo(): void {
        const next = redoHistory.pop();
        if (next === undefined) return;
        undoHistory.push(value);
        value = next;
        version += 1;
        for (const listener of contentListeners) listener();
      },
      setLanguage(nextLanguage: string): void {
        languageId = nextLanguage;
      },
      setValue: vi.fn((nextValue: string) => {
        undoHistory.length = 0;
        redoHistory.length = 0;
        value = nextValue;
        version += 1;
        for (const listener of contentListeners) listener();
      }),
      undo(): void {
        const previous = undoHistory.pop();
        if (previous === undefined) return;
        redoHistory.push(value);
        value = previous;
        version += 1;
        for (const listener of contentListeners) listener();
      },
      validateRange: vi.fn((range: MockRange) => range),
    };
    return model;
  }

  const parseUri = vi.fn((value: string) => uri(canonicalResource(value)));
  const createModel = vi.fn((content: string, language: string, resource: MockUri) => {
    const model = createModelImplementation(content, language, resource);
    models.set(resource.toString(), model);
    return model;
  });
  const getModel = vi.fn((resource: MockUri) => models.get(resource.toString()) ?? null);
  const setModelLanguage = vi.fn(
    (model: ReturnType<typeof createModelImplementation>, language: string) => {
      model.setLanguage(language);
    },
  );
  const getModelMarkers = vi.fn(
    ({ resource }: { readonly resource: MockUri }) => markers.get(resource.toString()) ?? [],
  );
  const setModelMarkers = vi.fn(
    (
      model: ReturnType<typeof createModelImplementation>,
      owner: string,
      markerData: readonly Omit<MockMarker, 'owner' | 'resource'>[],
    ) => {
      const resource = model.uri.toString();
      const retained = (markers.get(resource) ?? []).filter((marker) => marker.owner !== owner);
      markers.set(resource, [
        ...retained,
        ...markerData.map((marker) => ({ ...marker, owner, resource: model.uri })),
      ]);
      for (const listener of markerListeners) listener([model.uri]);
    },
  );
  const onDidChangeMarkers = vi.fn((listener: MarkerListener) => {
    markerListeners.add(listener);
    return disposable(() => markerListeners.delete(listener));
  });
  const registerCompletionItemProvider = vi.fn(
    (_language: string, provider: MockCompletionProvider) => {
      const registeredProvider: MockCompletionProvider = {
        provideCompletionItems: (
          model,
          position,
          context = {},
          token = { isCancellationRequested: false },
        ) => provider.provideCompletionItems(model, position, context, token),
      };
      completion.provider = registeredProvider;
      return disposable(() => {
        if (completion.provider === registeredProvider) completion.provider = undefined;
      });
    },
  );

  const configureMonaco = vi.fn();
  const isTypeScriptThisExpressionPosition = vi.fn().mockResolvedValue(true);
  const synchronizeMonacoExtraLibraries = vi.fn();
  const webradMonacoTheme = vi.fn((theme: 'dark' | 'light') => `webrad-${theme}`);

  const createEditor = (resource: string) => {
    let currentModel = models.get(resource) ?? null;
    const selectionListeners = new Set<() => void>();
    const modelListeners = new Set<() => void>();
    const mouseListeners = new Set<
      (event: {
        readonly target: {
          readonly type: number;
          readonly position: { readonly lineNumber: number } | null;
        };
        readonly event: { readonly leftButton: boolean };
      }) => void
    >();
    const actions = new Map<string, { readonly run: () => void }>();
    const findRun = vi.fn();
    const editor = {
      actions,
      addAction: vi.fn((action: { readonly id: string; readonly run: () => void }) => {
        actions.set(action.id, action);
        return disposable(() => actions.delete(action.id));
      }),
      findRun,
      fireMouseDown(type: number, line: number, leftButton = true): void {
        for (const listener of mouseListeners)
          listener({ target: { type, position: { lineNumber: line } }, event: { leftButton } });
      },
      onMouseDown: vi.fn(
        (
          listener: (event: {
            readonly target: {
              readonly type: number;
              readonly position: { readonly lineNumber: number } | null;
            };
            readonly event: { readonly leftButton: boolean };
          }) => void,
        ) => {
          mouseListeners.add(listener);
          return disposable(() => mouseListeners.delete(listener));
        },
      ),
      executeEdits: vi.fn(
        (
          _source: string,
          edits: readonly { readonly range: MockRange; readonly text: string }[],
        ) => {
          currentModel?.pushEditOperations(null, edits);
          return true;
        },
      ),
      focus: vi.fn(),
      getDomNode: vi.fn(() => document.createElement('div')),
      getAction: vi.fn((id: string) => (id === 'actions.find' ? { run: findRun } : null)),
      getModel: vi.fn(() => currentModel),
      getPosition: vi.fn(() => ({ lineNumber: 3, column: 5 })),
      getSelection: vi.fn(() => new MockRange(3, 2, 3, 5)),
      onDidChangeCursorSelection: vi.fn((listener: () => void) => {
        selectionListeners.add(listener);
        return disposable(() => selectionListeners.delete(listener));
      }),
      onDidChangeModel: vi.fn((listener: () => void) => {
        modelListeners.add(listener);
        return disposable(() => modelListeners.delete(listener));
      }),
      layout: vi.fn(),
      render: vi.fn(),
      revealRangeInCenter: vi.fn(),
      restoreViewState: vi.fn(),
      saveViewState: vi.fn(() => ({
        cursorState: [],
        viewState: { scrollTop: 100, scrollLeft: 0 },
        contributionsState: {},
      })),
      setModel: vi.fn((model: typeof currentModel) => {
        currentModel = model;
        for (const listener of modelListeners) listener();
      }),
      trigger: vi.fn((_source: string, action: string) => {
        if (action === 'undo') currentModel?.undo();
        if (action === 'redo') currentModel?.redo();
      }),
      setSelection: vi.fn(),
    };
    return editor;
  };

  return {
    MockRange,
    addRawMarker(resource: string, marker: Omit<MockMarker, 'resource'>): void {
      markers.set(resource, [
        ...(markers.get(resource) ?? []),
        { ...marker, resource: uri(resource) },
      ]);
    },
    completion,
    configureMonaco,
    createEditor,
    createModel,
    editorProps: undefined as MockEditorProps | undefined,
    getModel,
    getModelMarkers,
    isTypeScriptThisExpressionPosition,
    loaderConfig: vi.fn(),
    markerListeners,
    markers,
    models,
    onDidChangeMarkers,
    parseUri,
    reset(): void {
      models.clear();
      markers.clear();
      markerListeners.clear();
      completion.provider = undefined;
      this.editorProps = undefined;
    },
    registerCompletionItemProvider,
    setModelLanguage,
    setModelMarkers,
    synchronizeMonacoExtraLibraries,
    webradMonacoTheme,
  };
});

vi.mock('@monaco-editor/react', () => ({
  default: (props: MockEditorProps) => {
    mocks.editorProps = props;
    return (
      <div data-testid="monaco-editor-mock">
        <div data-testid="monaco-loading-slot">{props.loading}</div>
      </div>
    );
  },
  loader: { config: mocks.loaderConfig },
}));

vi.mock('monaco-editor/editor', () => ({
  editor: {
    remeasureFonts: vi.fn(),
    TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 },
    MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 },
    ShowLightbulbIconMode: { On: 'on' },
    createModel: mocks.createModel,
    getModel: mocks.getModel,
    getModelMarkers: mocks.getModelMarkers,
    onDidChangeMarkers: mocks.onDidChangeMarkers,
    setModelLanguage: mocks.setModelLanguage,
    setModelMarkers: mocks.setModelMarkers,
  },
  KeyCode: { KeyS: 49, F9: 67 },
  KeyMod: { CtrlCmd: 2048 },
  languages: {
    registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
    CompletionItemKind: { Field: 'field' },
    registerCompletionItemProvider: mocks.registerCompletionItemProvider,
  },
  MarkerSeverity: { Error: 8, Info: 2, Warning: 4 },
  Range: mocks.MockRange,
  Uri: { parse: mocks.parseUri },
}));

vi.mock('../monaco-setup', () => ({
  configureMonaco: mocks.configureMonaco,
  isTypeScriptThisExpressionPosition: mocks.isTypeScriptThisExpressionPosition,
  synchronizeMonacoExtraLibraries: mocks.synchronizeMonacoExtraLibraries,
  webradMonacoTheme: mocks.webradMonacoTheme,
}));

vi.mock('monaco-editor/editor/editor.worker.js?worker', () => ({
  default: class MockEditorWorker {},
}));

vi.mock('monaco-editor/languages/features/typescript/ts.worker.js?worker', () => ({
  default: class MockTypeScriptWorker {},
}));

import type { EditorProblem } from '../editor-problems';
import { CodeEditor, releaseMonacoWorkspace } from './CodeEditor';

type CodeEditorProps = Parameters<typeof CodeEditor>[0];

const MAIN_RESOURCE = 'file:///C:/Projects/Demo/pages/PageMain.ts';
const OTHER_RESOURCE = 'file:///C:/Projects/Demo/pages/PageOther.ts';
const CANONICAL_MAIN_RESOURCE = 'file:///c%3A/Projects/Demo/pages/PageMain.ts';
const CANONICAL_OTHER_RESOURCE = 'file:///c%3A/Projects/Demo/pages/PageOther.ts';

function codeEditorProps(overrides: Partial<CodeEditorProps> = {}): CodeEditorProps {
  return {
    breadcrumb: ['Demo', 'Pages', 'PageMain.ts'],
    buildProblems: [],
    extraLibraries: {
      'file:///node_modules/@webrad/runtime/index.d.ts': 'declare const Message: unknown;',
    },
    pageComponents: [
      { name: 'Button1', type: 'WebButton' },
      { name: 'ApiClient1', type: 'WebApiClient' },
    ],
    navigateTo: null,
    onCursorChange: vi.fn(),
    onMarkersChange: vi.fn(),
    onSave: vi.fn(),
    onSourceChange: vi.fn(),
    path: MAIN_RESOURCE,
    projectSources: {
      [MAIN_RESOURCE]: 'export class PageMain {}',
      [OTHER_RESOURCE]: 'export class PageOther {}',
    },
    theme: 'dark',
    value: 'export class PageMain {}',
    ...overrides,
  };
}

function buildProblem(overrides: Partial<EditorProblem> = {}): EditorProblem {
  return {
    id: 'build-error',
    category: 'error',
    code: 2322,
    message: "Type 'number' is not assignable to type 'string'.",
    origins: ['build'],
    owners: [],
    range: {
      startLineNumber: 2,
      startColumn: 7,
      endLineNumber: 2,
      endColumn: 12,
    },
    resource: MAIN_RESOURCE,
    source: 'typescript',
    ...overrides,
  };
}

beforeEach(() => {
  releaseMonacoWorkspace();
  mocks.reset();
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('CodeEditor professional Monaco workspace', () => {
  it('renders verified, pending, disabled and execution decorations without changing source and toggles via gutter and native action', () => {
    const onToggleBreakpoint = vi.fn();
    const props = codeEditorProps({
      sourcePath: 'pages/PageMain.ts',
      debugging: true,
      onToggleBreakpoint,
      debugLocation: { path: 'pages/PageMain.ts', line: 3, column: 5 },
      debugBreakpoints: [
        { path: 'pages/PageMain.ts', line: 2, enabled: true, verified: true },
        {
          path: 'pages/PageMain.ts',
          line: 4,
          enabled: true,
          verified: false,
          condition: 'counter > 2',
        },
        { path: 'pages/PageMain.ts', line: 6, enabled: false, verified: false },
      ],
    });
    const { rerender, unmount } = render(<CodeEditor {...props} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    const model = mocks.models.get(CANONICAL_MAIN_RESOURCE);
    expect(mocks.editorProps?.options?.readOnly).toBe(true);
    expect(
      [...(model?.decorations.values() ?? [])].map((entry) => entry.options.glyphMarginClassName),
    ).toEqual([
      'wr-debug-breakpoint',
      'wr-debug-breakpoint wr-debug-breakpoint-pending wr-debug-breakpoint-conditional',
      'wr-debug-breakpoint wr-debug-breakpoint-disabled',
      'wr-debug-execution-arrow',
    ]);
    editor.fireMouseDown(2, 8);
    expect(onToggleBreakpoint).toHaveBeenLastCalledWith('pages/PageMain.ts', 8);
    editor.fireMouseDown(3, 9);
    editor.fireMouseDown(2, 9, false);
    expect(onToggleBreakpoint).toHaveBeenCalledTimes(1);
    editor.actions.get('webrad.toggle-breakpoint')?.run();
    expect(onToggleBreakpoint).toHaveBeenLastCalledWith('pages/PageMain.ts', 3);
    rerender(
      <CodeEditor
        {...props}
        path={OTHER_RESOURCE}
        sourcePath="pages/PageOther.ts"
        debugLocation={{ path: 'pages/PageOther.ts', line: 2, column: 1 }}
      />,
    );
    expect([...(model?.decorations.values() ?? [])]).toHaveLength(3);
    expect(
      [...(mocks.models.get(CANONICAL_OTHER_RESOURCE)?.decorations.values() ?? [])][0]?.options
        .glyphMarginClassName,
    ).toBe('wr-debug-execution-arrow');
    expect(props.onSourceChange).not.toHaveBeenCalled();
    unmount();
    expect(model?.decorations.size).toBe(0);
  });

  it('tracks breakpoint movement after edits and retains breakpoints in other sources', () => {
    const onBreakpointsMoved = vi.fn();
    const sourceBreakpoint = { path: 'pages/PageMain.ts', line: 2, enabled: true, verified: false };
    const otherBreakpoint = { path: 'pages/PageOther.ts', line: 4, enabled: true, verified: false };
    render(
      <CodeEditor
        {...codeEditorProps({
          sourcePath: sourceBreakpoint.path,
          debugBreakpoints: [sourceBreakpoint, otherBreakpoint],
          onBreakpointsMoved,
        })}
      />,
    );
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    const model = mocks.models.get(CANONICAL_MAIN_RESOURCE);
    const [id, decoration] = [...(model?.decorations ?? [])][0] ?? [];
    expect(id).toBeTruthy();
    if (id === undefined || decoration === undefined)
      throw new Error('Missing breakpoint decoration');
    model?.decorations.set(id, { ...decoration, range: new mocks.MockRange(3, 1, 3, 1) });
    model?.fireUserChange('\nexport class PageMain {}');
    expect(onBreakpointsMoved).toHaveBeenCalledWith([
      {
        path: sourceBreakpoint.path,
        line: 3,
        column: undefined,
        condition: undefined,
        enabled: true,
      },
      {
        path: otherBreakpoint.path,
        line: 4,
        column: undefined,
        condition: undefined,
        enabled: true,
      },
    ]);
  });

  it('configures the language service, persistent project models, theme, chrome, and editor options', () => {
    const props = codeEditorProps();
    const { container } = render(<CodeEditor {...props} />);

    expect(screen.getByLabelText('PageMain.ts code workspace')).toBeTruthy();
    expect(screen.getByLabelText('Source path').textContent).toBe('Demo›Pages›PageMain.ts');
    expect(screen.getByLabelText('Editor shortcuts').textContent).toContain(
      'Ctrl+Space IntelliSense',
    );
    expect(container.querySelector('.wr-monaco-loading')?.textContent).toContain(
      'Starting TypeScript IntelliSense',
    );

    expect(mocks.createModel).toHaveBeenCalledTimes(2);
    expect(mocks.models.get(CANONICAL_MAIN_RESOURCE)?.getLanguageId()).toBe('typescript');
    expect(mocks.models.get(CANONICAL_OTHER_RESOURCE)?.getValue()).toBe(
      'export class PageOther {}',
    );

    expect(mocks.editorProps?.beforeMount).toBeTypeOf('function');
    mocks.editorProps?.beforeMount?.({});
    expect(mocks.configureMonaco).toHaveBeenCalledOnce();
    expect(mocks.synchronizeMonacoExtraLibraries).toHaveBeenCalledWith(props.extraLibraries);
    expect(mocks.editorProps).toMatchObject({
      defaultLanguage: 'typescript',
      defaultValue: props.value,
      keepCurrentModel: true,
      language: 'typescript',
      defaultPath: MAIN_RESOURCE,
      saveViewState: false,
      theme: 'webrad-dark',
    });
    expect(mocks.editorProps?.options).toMatchObject({
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'off',
      fontLigatures: false,
      fontVariations: false,
      letterSpacing: 0,
      smoothScrolling: false,
      fontWeight: '300',
      formatOnPaste: true,
      formatOnType: true,
      glyphMargin: true,
      inlayHints: { enabled: 'off' },
      quickSuggestions: { comments: 'off', other: 'on', strings: 'on' },
      renderValidationDecorations: 'on',
      'semanticHighlighting.enabled': true,
      stickyScroll: { enabled: true, maxLineCount: 5 },
      suggestOnTriggerCharacters: true,
      tabCompletion: 'on',
    });
  });

  it('projects user edits, accepts authoritative source updates, and removes stale models', () => {
    const onSourceChange = vi.fn();
    const initialProps = codeEditorProps({ onSourceChange });
    const { rerender } = render(<CodeEditor {...initialProps} />);
    const mainModel = mocks.models.get(CANONICAL_MAIN_RESOURCE);
    const otherModel = mocks.models.get(CANONICAL_OTHER_RESOURCE);
    expect(mainModel).toBeDefined();
    expect(otherModel).toBeDefined();

    mainModel?.fireUserChange('export class PageMain { answer = 42; }');
    expect(onSourceChange).toHaveBeenCalledWith(
      MAIN_RESOURCE,
      'export class PageMain { answer = 42; }',
    );

    onSourceChange.mockClear();
    const nextProps = codeEditorProps({
      onSourceChange,
      projectSources: { [MAIN_RESOURCE]: 'export class PageMain { answer = 43; }' },
      value: 'export class PageMain { answer = 43; }',
    });
    rerender(<CodeEditor {...nextProps} />);

    expect(mainModel?.getValue()).toBe('export class PageMain { answer = 43; }');
    expect(mainModel?.setValue).not.toHaveBeenCalled();
    expect(mainModel?.pushEditOperations).toHaveBeenCalledWith(
      null,
      [expect.objectContaining({ text: '3' })],
      expect.any(Function),
    );
    expect(onSourceChange).not.toHaveBeenCalled();
    expect(otherModel?.dispose).toHaveBeenCalledOnce();
    expect(mocks.models.has(CANONICAL_OTHER_RESOURCE)).toBe(false);

    expect(mocks.editorProps?.onChange).toBeUndefined();
  });

  it('adds Delphi-style bare component Names without replacing native member completions', async () => {
    render(<CodeEditor {...codeEditorProps()} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);

    expect(mocks.registerCompletionItemProvider).toHaveBeenCalledWith(
      'typescript',
      expect.objectContaining({ provideCompletionItems: expect.any(Function) }),
    );
    const provider = mocks.completion.provider;
    expect(provider).toBeDefined();
    if (provider === undefined) throw new Error('The page component provider was not registered.');

    const bare = await provider.provideCompletionItems(
      {
        uri: { value: CANONICAL_MAIN_RESOURCE, toString: () => CANONICAL_MAIN_RESOURCE },
        getOffsetAt: () => 120,
        getVersionId: () => 1,
        isDisposed: () => false,
        getWordUntilPosition: () => ({ word: 'Butt', startColumn: 5, endColumn: 9 }),
      },
      { lineNumber: 7, column: 9 },
    );
    expect(bare.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Button1',
          kind: 'field',
          insertText: 'Button1',
          sortText: '0000_Button1',
          commitCharacters: ['.'],
          range: {
            startLineNumber: 7,
            startColumn: 5,
            endLineNumber: 7,
            endColumn: 9,
          },
        }),
      ]),
    );
    expect(mocks.isTypeScriptThisExpressionPosition).toHaveBeenCalledWith(
      CANONICAL_MAIN_RESOURCE,
      120,
    );

    mocks.isTypeScriptThisExpressionPosition.mockResolvedValueOnce(false);
    const afterThis = await provider.provideCompletionItems(
      {
        uri: { value: CANONICAL_MAIN_RESOURCE, toString: () => CANONICAL_MAIN_RESOURCE },
        getOffsetAt: () => 130,
        getVersionId: () => 1,
        isDisposed: () => false,
        getWordUntilPosition: () => ({ word: 'Butt', startColumn: 6, endColumn: 10 }),
      },
      { lineNumber: 1, column: 10 },
    );
    expect(afterThis.suggestions).toEqual([]);

    const otherResource = await provider.provideCompletionItems(
      {
        uri: { value: CANONICAL_OTHER_RESOURCE, toString: () => CANONICAL_OTHER_RESOURCE },
        getOffsetAt: () => 10,
        getVersionId: () => 1,
        isDisposed: () => false,
        getWordUntilPosition: () => ({ word: 'Butt', startColumn: 1, endColumn: 5 }),
      },
      { lineNumber: 1, column: 5 },
    );
    expect(otherResource.suggestions).toEqual([]);
  });

  it('preserves typed edits in undo history when the Project Model inserts or changes source', () => {
    const onSourceChange = vi.fn();
    const props = codeEditorProps({ onSourceChange });
    const { rerender } = render(<CodeEditor {...props} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    const model = mocks.models.get(CANONICAL_MAIN_RESOURCE);
    const typedSource = 'export class PageMain { answer = 42; }';
    const projectedSource = 'export class PageMain { answer = 43; }';
    model?.fireUserChange(typedSource);
    onSourceChange.mockClear();

    rerender(
      <CodeEditor
        {...props}
        projectSources={{ ...props.projectSources, [MAIN_RESOURCE]: projectedSource }}
        value={projectedSource}
      />,
    );

    expect(editor.executeEdits).toHaveBeenCalledWith('webrad.project-model', [
      expect.objectContaining({ text: '3' }),
    ]);
    expect(model?.setValue).not.toHaveBeenCalled();
    expect(onSourceChange).not.toHaveBeenCalled();
    window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: 'edit.undo' }));
    expect(model?.getValue()).toBe(typedSource);
    expect(onSourceChange).toHaveBeenLastCalledWith(MAIN_RESOURCE, typedSource);
    window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: 'edit.undo' }));
    expect(model?.getValue()).toBe(props.value);
    window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: 'edit.redo' }));
    expect(model?.getValue()).toBe(typedSource);
  });

  it('does not read every source buffer again when React acknowledges a typed edit', () => {
    const props = codeEditorProps();
    const { rerender } = render(<CodeEditor {...props} />);
    const model = mocks.models.get(CANONICAL_MAIN_RESOURCE);
    const otherModel = mocks.models.get(CANONICAL_OTHER_RESOURCE);
    const source = 'export class PageMain { answer = 42; }';
    model?.fireUserChange(source);
    model?.getValue.mockClear();
    otherModel?.getValue.mockClear();

    rerender(
      <CodeEditor
        {...props}
        value={source}
        projectSources={{ ...props.projectSources, [MAIN_RESOURCE]: source }}
      />,
    );

    expect(model?.getValue).not.toHaveBeenCalled();
    expect(otherModel?.getValue).not.toHaveBeenCalled();
    expect(model?.pushEditOperations).not.toHaveBeenCalled();
  });

  it('uses the current workspace snapshot when Monaco initializes after a source change', () => {
    const props = codeEditorProps();
    const { rerender } = render(<CodeEditor {...props} />);
    const beforeMount = mocks.editorProps?.beforeMount;
    const onMount = mocks.editorProps?.onMount;
    const source = 'export class PageMain { answer = 42; }';
    const nextLibraries = { 'file:///runtime.d.ts': 'declare const current: 42;' };
    const nextProblem = buildProblem({ message: 'Current build result' });
    const onSourceChange = vi.fn();

    rerender(
      <CodeEditor
        {...props}
        extraLibraries={nextLibraries}
        buildProblems={[nextProblem]}
        onSourceChange={onSourceChange}
        value={source}
        projectSources={{ [MAIN_RESOURCE]: source }}
      />,
    );
    beforeMount?.({});
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    onMount?.(editor);

    expect(mocks.models.get(CANONICAL_MAIN_RESOURCE)?.getValue()).toBe(source);
    expect(mocks.models.has(CANONICAL_OTHER_RESOURCE)).toBe(false);
    expect(mocks.synchronizeMonacoExtraLibraries).toHaveBeenLastCalledWith(nextLibraries);
    expect(mocks.setModelMarkers).toHaveBeenLastCalledWith(
      mocks.models.get(CANONICAL_MAIN_RESOURCE),
      'webrad-build',
      [expect.objectContaining({ message: 'Current build result' })],
    );
    mocks.models.get(CANONICAL_MAIN_RESOURCE)?.fireUserChange(`${source}\n`);
    expect(onSourceChange).toHaveBeenLastCalledWith(MAIN_RESOURCE, `${source}\n`);
    expect(props.onSourceChange).not.toHaveBeenCalled();
  });

  it('owns cursor, scroll, and folding restoration across documents and Code/Designer switches', () => {
    const props = codeEditorProps();
    const { rerender, unmount } = render(<CodeEditor {...props} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    const state = {
      cursorState: [],
      viewState: { scrollTop: 340, scrollLeft: 20 },
      contributionsState: { folding: [3] },
    };
    editor.saveViewState.mockReturnValue(state);

    rerender(
      <CodeEditor
        {...props}
        path={OTHER_RESOURCE}
        value={props.projectSources[OTHER_RESOURCE] ?? ''}
      />,
    );
    expect(editor.setModel).toHaveBeenLastCalledWith(mocks.models.get(CANONICAL_OTHER_RESOURCE));
    rerender(<CodeEditor {...props} />);
    expect(editor.restoreViewState).toHaveBeenLastCalledWith(state);
    unmount();

    render(<CodeEditor {...props} />);
    const remounted = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(remounted);
    expect(remounted.restoreViewState).toHaveBeenCalledWith(state);

    expect(remounted.layout).toHaveBeenCalledWith();
    expect(remounted.layout.mock.invocationCallOrder[0]).toBeLessThan(
      remounted.render.mock.invocationCallOrder[0] ?? 0,
    );
    expect(remounted.render).toHaveBeenCalledWith(true);
    expect(remounted.render.mock.invocationCallOrder[0]).toBeLessThan(
      remounted.restoreViewState.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.editorProps?.saveViewState).toBe(false);
  });

  it('restores a document before applying navigation and does not replay it after a view switch', () => {
    const props = codeEditorProps();
    const { rerender, unmount } = render(<CodeEditor {...props} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    rerender(<CodeEditor {...props} path={OTHER_RESOURCE} />);
    rerender(<CodeEditor {...props} />);
    const navigateTo = { resource: OTHER_RESOURCE, line: 5, column: 4, requestId: 9 };
    rerender(<CodeEditor {...props} navigateTo={navigateTo} />);
    expect(editor.setSelection).not.toHaveBeenCalled();
    editor.restoreViewState.mockClear();
    rerender(<CodeEditor {...props} path={OTHER_RESOURCE} navigateTo={navigateTo} />);
    expect(editor.setSelection).toHaveBeenCalledOnce();
    expect(editor.restoreViewState.mock.invocationCallOrder[0]).toBeLessThan(
      editor.setSelection.mock.invocationCallOrder[0] ?? 0,
    );
    unmount();

    render(<CodeEditor {...props} path={OTHER_RESOURCE} navigateTo={navigateTo} />);
    const remounted = mocks.createEditor(CANONICAL_OTHER_RESOURCE);
    mocks.editorProps?.onMount?.(remounted);
    expect(remounted.restoreViewState).toHaveBeenCalledOnce();
    expect(remounted.setSelection).not.toHaveBeenCalled();
  });

  it.each(['mount', 'after mount', 'after frame queued'] as const)(
    'keeps event navigation after delayed font restoration when requested %s',
    async (timing) => {
      const props = codeEditorProps();
      const first = render(<CodeEditor {...props} />);
      mocks.editorProps?.onMount?.(mocks.createEditor(CANONICAL_MAIN_RESOURCE));
      first.unmount();

      let resolveFonts!: () => void;
      const ready = new Promise<void>((resolve) => {
        resolveFonts = resolve;
      });
      const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: Object.assign(new EventTarget(), { ready }),
      });
      const frames: FrameRequestCallback[] = [];
      const requestFrame = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      try {
        const navigateTo = { resource: MAIN_RESOURCE, line: 5, column: 5, requestId: 10 };
        const { rerender } = render(
          <CodeEditor {...props} navigateTo={timing === 'mount' ? navigateTo : null} />,
        );
        const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
        mocks.editorProps?.onMount?.(editor);
        if (timing === 'after frame queued') {
          await act(async () => {
            resolveFonts();
            await ready;
          });
          expect(frames).toHaveLength(1);
        }
        if (timing !== 'mount') rerender(<CodeEditor {...props} navigateTo={navigateTo} />);
        expect(editor.setSelection).toHaveBeenLastCalledWith(new mocks.MockRange(5, 5, 5, 5));
        expect(editor.restoreViewState).toHaveBeenCalledOnce();

        await act(async () => {
          resolveFonts();
          await ready;
        });
        act(() => {
          for (const frame of frames) frame(0);
        });
        // A second restore here would overwrite the event body with the saved cursor/viewport.
        expect(editor.restoreViewState).toHaveBeenCalledOnce();
        expect(editor.revealRangeInCenter).toHaveBeenCalledOnce();
      } finally {
        cleanup();
        requestFrame.mockRestore();
        if (previousFonts === undefined) Reflect.deleteProperty(document, 'fonts');
        else Object.defineProperty(document, 'fonts', previousFonts);
      }
    },
  );

  it('clears saved editor state when closing the workspace and reconnects recreated models', () => {
    const props = codeEditorProps();
    const { rerender, unmount } = render(<CodeEditor {...props} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    rerender(<CodeEditor {...props} path={OTHER_RESOURCE} />);
    releaseMonacoWorkspace();
    rerender(<CodeEditor {...props} projectSources={{ ...props.projectSources }} />);
    const recreated = mocks.models.get(CANONICAL_MAIN_RESOURCE);
    recreated?.fireUserChange('export class PageMain { recreated = true; }');
    expect(props.onSourceChange).toHaveBeenLastCalledWith(
      MAIN_RESOURCE,
      'export class PageMain { recreated = true; }',
    );
    expect(editor.restoreViewState).not.toHaveBeenCalled();
    unmount();
    releaseMonacoWorkspace();

    render(<CodeEditor {...props} />);
    const reopened = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(reopened);
    expect(reopened.restoreViewState).not.toHaveBeenCalled();
  });

  it.each(['document change', 'typing', 'cancellation', 'disposal', 'unmount'] as const)(
    'discards a pending object completion after %s',
    async (change) => {
      const props = codeEditorProps();
      const { rerender, unmount } = render(<CodeEditor {...props} />);
      const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
      mocks.editorProps?.onMount?.(editor);
      const provider = mocks.completion.provider;
      if (provider === undefined) throw new Error('Missing object completion provider.');
      let resolve!: (value: boolean) => void;
      mocks.isTypeScriptThisExpressionPosition.mockReturnValueOnce(
        new Promise<boolean>((resolvePromise) => {
          resolve = resolvePromise;
        }),
      );
      let version = 1;
      let disposed = false;
      const token = { isCancellationRequested: false };
      const pending = provider.provideCompletionItems(
        {
          uri: { value: CANONICAL_MAIN_RESOURCE, toString: () => CANONICAL_MAIN_RESOURCE },
          getOffsetAt: () => 120,
          getVersionId: () => version,
          isDisposed: () => disposed,
          getWordUntilPosition: () => ({ word: 'Butt', startColumn: 5, endColumn: 9 }),
        },
        { lineNumber: 7, column: 9 },
        {},
        token,
      );
      if (change === 'document change')
        rerender(
          <CodeEditor
            {...props}
            path={OTHER_RESOURCE}
            pageComponents={[{ name: 'ButtonOther', type: 'WebButton' }]}
          />,
        );
      if (change === 'typing') version += 1;
      if (change === 'cancellation') token.isCancellationRequested = true;
      if (change === 'disposal') disposed = true;
      if (change === 'unmount') unmount();
      resolve(true);

      await expect(pending).resolves.toEqual({ suggestions: [] });
    },
  );

  it('applies a pending navigation when Monaco mounts after switching to Code', () => {
    const navigation = {
      column: 5,
      endColumn: 5,
      endLine: 8,
      line: 8,
      requestId: 1,
      resource: MAIN_RESOURCE,
    };
    render(<CodeEditor {...codeEditorProps({ navigateTo: navigation })} />);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);

    mocks.editorProps?.onMount?.(editor);

    expect(editor.setSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        startLineNumber: 8,
        startColumn: 5,
        endLineNumber: 8,
        endColumn: 5,
      }),
    );
    expect(editor.revealRangeInCenter).toHaveBeenCalledOnce();
    expect(editor.focus).toHaveBeenCalledOnce();
  });

  it('publishes live markers, applies build markers, navigates, saves, and opens Find', () => {
    const onCursorChange = vi.fn();
    const onMarkersChange = vi.fn();
    const onSave = vi.fn();
    const initialProps = codeEditorProps({
      buildProblems: [buildProblem()],
      onCursorChange,
      onMarkersChange,
      onSave,
    });
    const { rerender } = render(<CodeEditor {...initialProps} />);
    mocks.addRawMarker(CANONICAL_MAIN_RESOURCE, {
      code: '6133',
      endColumn: 8,
      endLineNumber: 1,
      message: "'unused' is declared but its value is never read.",
      owner: 'typescript',
      severity: 4,
      source: 'ts',
      startColumn: 1,
      startLineNumber: 1,
    });
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);

    mocks.editorProps?.onMount?.(editor);

    expect(mocks.setModelMarkers).toHaveBeenCalledWith(
      mocks.models.get(CANONICAL_MAIN_RESOURCE),
      'webrad-build',
      [
        expect.objectContaining({
          code: '2322',
          message: "Type 'number' is not assignable to type 'string'.",
          severity: 8,
          startLineNumber: 2,
          startColumn: 7,
        }),
      ],
    );
    expect(onMarkersChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ owner: 'typescript', severity: 4 }),
    ]);
    expect(onCursorChange).toHaveBeenCalledWith({ line: 3, column: 5, selectionLength: 3 });

    editor.actions.get('webrad.save-project')?.run();
    expect(onSave).toHaveBeenCalledOnce();

    const navigation = {
      column: 4,
      endColumn: 9,
      endLine: 5,
      line: 5,
      requestId: 1,
      resource: MAIN_RESOURCE,
    };
    rerender(<CodeEditor {...codeEditorProps({ ...initialProps, navigateTo: navigation })} />);
    expect(editor.setSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        startLineNumber: 5,
        startColumn: 4,
        endLineNumber: 5,
        endColumn: 9,
      }),
    );
    expect(editor.revealRangeInCenter).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event('webrad:find'));
    expect(editor.findRun).toHaveBeenCalledOnce();

    mocks.editorProps?.onValidate?.();
    expect(onMarkersChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ owner: 'typescript' }),
    ]);

    rerender(<CodeEditor {...codeEditorProps({ ...initialProps, buildProblems: [] })} />);
    expect(mocks.setModelMarkers).toHaveBeenLastCalledWith(
      mocks.models.get(CANONICAL_MAIN_RESOURCE),
      'webrad-build',
      [],
    );
  });

  it('publishes initial and changed diagnostics while keeping source acknowledgements silent', () => {
    const props = codeEditorProps();
    const { rerender, unmount } = render(<CodeEditor {...props} />);
    expect(props.onMarkersChange).toHaveBeenCalledExactlyOnceWith([]);
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    const source = props.value + '// typed';
    act(() => mocks.models.get(CANONICAL_MAIN_RESOURCE)?.fireUserChange(source));
    rerender(
      <CodeEditor
        {...props}
        value={source}
        projectSources={{ ...props.projectSources, [MAIN_RESOURCE]: source }}
      />,
    );
    mocks.editorProps?.onValidate?.();
    expect(props.onMarkersChange).toHaveBeenCalledOnce();
    unmount();
    render(<CodeEditor {...props} />);
    expect(props.onMarkersChange).toHaveBeenCalledTimes(2);
    expect(props.onMarkersChange).toHaveBeenLastCalledWith([]);
  });

  it('waits for native diagnostic events during source acknowledgements and clears removed resources', () => {
    const props = codeEditorProps();
    const { rerender } = render(<CodeEditor {...props} />);
    mocks.editorProps?.onMount?.(mocks.createEditor(CANONICAL_MAIN_RESOURCE));
    const resource = mocks.parseUri(CANONICAL_OTHER_RESOURCE);
    const marker = {
      owner: 'typescript',
      severity: 8,
      message: 'Deferred native diagnostic',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      modelVersionId: 2,
      resource,
    };
    // Monaco may update its marker store before delivering the corresponding event.
    mocks.markers.set(CANONICAL_OTHER_RESOURCE, [marker]);
    const source = props.value + '// typed';
    act(() => mocks.models.get(CANONICAL_MAIN_RESOURCE)?.fireUserChange(source));
    rerender(
      <CodeEditor
        {...props}
        value={source}
        projectSources={{ ...props.projectSources, [MAIN_RESOURCE]: source }}
      />,
    );
    expect(props.onMarkersChange).toHaveBeenCalledExactlyOnceWith([]);
    act(() => {
      for (const listener of mocks.markerListeners) listener([resource]);
    });
    expect(props.onMarkersChange).toHaveBeenLastCalledWith([marker]);
    expect(props.onMarkersChange).toHaveBeenCalledTimes(2);

    rerender(<CodeEditor {...props} value={source} projectSources={{ [MAIN_RESOURCE]: source }} />);
    expect(props.onMarkersChange).toHaveBeenLastCalledWith([]);
    expect(props.onMarkersChange).toHaveBeenCalledTimes(3);
  });

  it('preserves complete diagnostic metadata and publishes every meaningful change and clear', () => {
    const props = codeEditorProps();
    render(<CodeEditor {...props} />);
    mocks.editorProps?.onMount?.(mocks.createEditor(CANONICAL_MAIN_RESOURCE));
    const uri = (value: string) => ({ value, toString: () => value });
    let marker = {
      owner: 'typescript',
      resource: uri(CANONICAL_MAIN_RESOURCE),
      severity: 8,
      message: 'Diagnostic',
      source: 'ts',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      code: { value: '2322', target: uri('https://example.test/2322') },
      modelVersionId: 1,
      tags: [1],
      origin: 'worker',
      relatedInformation: [
        {
          resource: uri(CANONICAL_OTHER_RESOURCE),
          message: 'Related',
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 2,
          endColumn: 3,
        },
      ],
    };
    const publish = () => {
      mocks.markers.set(CANONICAL_MAIN_RESOURCE, [marker]);
      for (const listener of mocks.markerListeners) listener([uri(CANONICAL_MAIN_RESOURCE)]);
    };
    act(publish);
    expect(props.onMarkersChange).toHaveBeenLastCalledWith([marker]);
    vi.mocked(props.onMarkersChange).mockClear();
    marker = {
      ...marker,
      resource: uri(CANONICAL_MAIN_RESOURCE),
      code: { ...marker.code, target: uri('https://example.test/2322') },
      relatedInformation: marker.relatedInformation.map((related) => ({
        ...related,
        resource: uri(CANONICAL_OTHER_RESOURCE),
      })),
    };
    act(publish);
    expect(props.onMarkersChange).not.toHaveBeenCalled();

    const changes = [
      { owner: 'another-worker' },
      { resource: uri(CANONICAL_OTHER_RESOURCE) },
      { severity: 4 },
      { message: 'Changed' },
      { source: 'other' },
      { startLineNumber: 3 },
      { startColumn: 4 },
      { endLineNumber: 5 },
      { endColumn: 6 },
      { code: { value: '2552', target: uri('https://example.test/2322') } },
      { code: { value: '2552', target: uri('https://example.test/2552') } },
      { modelVersionId: 2 },
      { tags: [2] },
      { origin: 'new-worker' },
      { relatedInformation: [{ ...marker.relatedInformation[0]!, message: 'Changed related' }] },
      { relatedInformation: [{ ...marker.relatedInformation[0]!, resource: uri(MAIN_RESOURCE) }] },
      { relatedInformation: [{ ...marker.relatedInformation[0]!, startLineNumber: 9 }] },
    ];
    for (const change of changes) {
      marker = { ...marker, ...change };
      act(publish);
      expect(props.onMarkersChange).toHaveBeenLastCalledWith([marker]);
    }
    expect(props.onMarkersChange).toHaveBeenCalledTimes(changes.length);
    act(() => {
      mocks.markers.clear();
      for (const listener of mocks.markerListeners) listener([uri(CANONICAL_MAIN_RESOURCE)]);
    });
    expect(props.onMarkersChange).toHaveBeenCalledTimes(changes.length + 1);
    expect(props.onMarkersChange).toHaveBeenLastCalledWith([]);
  });

  it('releases all project-owned models and extra libraries on workspace close', () => {
    render(<CodeEditor {...codeEditorProps()} />);
    const models = [...mocks.models.values()];

    releaseMonacoWorkspace();

    expect(models).toHaveLength(2);
    expect(models.every((model) => model.dispose.mock.calls.length === 1)).toBe(true);
    expect(mocks.models.size).toBe(0);
    expect(mocks.synchronizeMonacoExtraLibraries).toHaveBeenLastCalledWith({});
  });

  it('routes toolbar edit commands to the mounted editor and removes its listener on unmount', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <>
        <CodeEditor {...codeEditorProps()} />
        <button type="button">Toolbar control</button>
      </>,
    );
    const editor = mocks.createEditor(CANONICAL_MAIN_RESOURCE);
    mocks.editorProps?.onMount?.(editor);
    editor.focus.mockClear();
    screen.getByRole('button', { name: 'Toolbar control' }).focus();

    const commands = [
      ['edit.undo', 'undo'],
      ['edit.redo', 'redo'],
      ['edit.copy', 'editor.action.clipboardCopyAction'],
      ['edit.cut', 'editor.action.clipboardCutAction'],
      ['edit.paste', 'editor.action.clipboardPasteAction'],
      ['edit.delete', 'deleteRight'],
    ] as const;
    for (const [command, action] of commands) {
      window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: command }));
      expect(editor.trigger).toHaveBeenLastCalledWith('webrad', action, null);
      expect(editor.focus.mock.invocationCallOrder.at(-1)).toBeLessThan(
        editor.trigger.mock.invocationCallOrder.at(-1) ?? 0,
      );
    }
    expect(editor.focus).toHaveBeenCalledTimes(commands.length);
    expect(editor.trigger).toHaveBeenCalledTimes(commands.length);

    for (const detail of [
      'file.save',
      '__proto__',
      'unknown',
      42,
      null,
      { command: 'edit.undo' },
    ]) {
      window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail }));
    }
    window.dispatchEvent(new Event('webrad:editor-command'));
    expect(editor.trigger).toHaveBeenCalledTimes(commands.length);
    const listener = addListener.mock.calls.find(([type]) => type === 'webrad:editor-command')?.[1];
    expect(listener).toBeTypeOf('function');
    unmount();
    expect(removeListener).toHaveBeenCalledWith('webrad:editor-command', listener);
    window.dispatchEvent(new CustomEvent('webrad:editor-command', { detail: 'edit.undo' }));
    expect(editor.trigger).toHaveBeenCalledTimes(commands.length);
    addListener.mockRestore();
    removeListener.mockRestore();
  });
});
