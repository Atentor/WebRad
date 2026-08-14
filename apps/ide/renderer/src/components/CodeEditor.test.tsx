// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockEditorProps {
  readonly beforeMount?: (monaco: unknown) => void;
  readonly defaultLanguage?: string;
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
    readonly code?: string;
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
    const contentListeners = new Set<ContentListener>();
    const model = {
      uri: resource,
      dispose: vi.fn(() => {
        disposed = true;
        models.delete(resource.toString());
      }),
      fireUserChange(nextValue: string): void {
        value = nextValue;
        for (const listener of contentListeners) listener();
      },
      getLanguageId: vi.fn(() => languageId),
      getValue: vi.fn(() => value),
      getValueLengthInRange: vi.fn(() => 3),
      isDisposed: vi.fn(() => disposed),
      onDidChangeContent: vi.fn((listener: ContentListener) => {
        contentListeners.add(listener);
        return disposable(() => contentListeners.delete(listener));
      }),
      setLanguage(nextLanguage: string): void {
        languageId = nextLanguage;
      },
      setValue: vi.fn((nextValue: string) => {
        value = nextValue;
        for (const listener of contentListeners) listener();
      }),
    };
    return model;
  }

  const parseUri = vi.fn((value: string) => uri(value));
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

  const configureMonaco = vi.fn();
  const synchronizeMonacoExtraLibraries = vi.fn();
  const webradMonacoTheme = vi.fn((theme: 'dark' | 'light') => `webrad-${theme}`);

  const createEditor = (resource: string) => {
    const selectionListeners = new Set<() => void>();
    const modelListeners = new Set<() => void>();
    const actions = new Map<string, { readonly run: () => void }>();
    const findRun = vi.fn();
    const editor = {
      actions,
      addAction: vi.fn((action: { readonly id: string; readonly run: () => void }) => {
        actions.set(action.id, action);
        return disposable(() => actions.delete(action.id));
      }),
      findRun,
      focus: vi.fn(),
      getAction: vi.fn((id: string) => (id === 'actions.find' ? { run: findRun } : null)),
      getModel: vi.fn(() => models.get(resource) ?? null),
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
      revealRangeInCenter: vi.fn(),
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
    configureMonaco,
    createEditor,
    createModel,
    editorProps: undefined as MockEditorProps | undefined,
    getModel,
    getModelMarkers,
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
      this.editorProps = undefined;
    },
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
    ShowLightbulbIconMode: { On: 'on' },
    createModel: mocks.createModel,
    getModel: mocks.getModel,
    getModelMarkers: mocks.getModelMarkers,
    onDidChangeMarkers: mocks.onDidChangeMarkers,
    setModelLanguage: mocks.setModelLanguage,
    setModelMarkers: mocks.setModelMarkers,
  },
  KeyCode: { KeyS: 49 },
  KeyMod: { CtrlCmd: 2048 },
  MarkerSeverity: { Error: 8, Info: 2, Warning: 4 },
  Range: mocks.MockRange,
  Uri: { parse: mocks.parseUri },
}));

vi.mock('../monaco-setup', () => ({
  configureMonaco: mocks.configureMonaco,
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

const MAIN_RESOURCE = 'file:///C:/Projects/Demo/forms/FrmMain.ts';
const OTHER_RESOURCE = 'file:///C:/Projects/Demo/forms/FrmOther.ts';

function codeEditorProps(overrides: Partial<CodeEditorProps> = {}): CodeEditorProps {
  return {
    breadcrumb: ['Demo', 'Forms', 'FrmMain.ts'],
    buildProblems: [],
    extraLibraries: {
      'file:///node_modules/@webrad/runtime/index.d.ts': 'declare const Message: unknown;',
    },
    navigateTo: null,
    onCursorChange: vi.fn(),
    onMarkersChange: vi.fn(),
    onSave: vi.fn(),
    onSourceChange: vi.fn(),
    path: MAIN_RESOURCE,
    projectSources: {
      [MAIN_RESOURCE]: 'export class FrmMain {}',
      [OTHER_RESOURCE]: 'export class FrmOther {}',
    },
    theme: 'dark',
    value: 'export class FrmMain {}',
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
  it('configures the language service, persistent project models, theme, chrome, and editor options', () => {
    const props = codeEditorProps();
    const { container } = render(<CodeEditor {...props} />);

    expect(screen.getByLabelText('FrmMain.ts code workspace')).toBeTruthy();
    expect(screen.getByLabelText('Source path').textContent).toBe('Demo›Forms›FrmMain.ts');
    expect(screen.getByLabelText('Editor shortcuts').textContent).toContain(
      'Ctrl+Space IntelliSense',
    );
    expect(container.querySelector('.wr-monaco-loading')?.textContent).toContain(
      'Starting TypeScript IntelliSense',
    );

    expect(mocks.createModel).toHaveBeenCalledTimes(2);
    expect(mocks.models.get(MAIN_RESOURCE)?.getLanguageId()).toBe('typescript');
    expect(mocks.models.get(OTHER_RESOURCE)?.getValue()).toBe('export class FrmOther {}');

    expect(mocks.editorProps?.beforeMount).toBeTypeOf('function');
    mocks.editorProps?.beforeMount?.({});
    expect(mocks.configureMonaco).toHaveBeenCalledOnce();
    expect(mocks.synchronizeMonacoExtraLibraries).toHaveBeenCalledWith(props.extraLibraries);
    expect(mocks.editorProps).toMatchObject({
      defaultLanguage: 'typescript',
      keepCurrentModel: true,
      language: 'typescript',
      path: MAIN_RESOURCE,
      saveViewState: true,
      theme: 'webrad-dark',
    });
    expect(mocks.editorProps?.options).toMatchObject({
      bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
      formatOnPaste: true,
      formatOnType: true,
      glyphMargin: true,
      inlayHints: { enabled: 'onUnlessPressed', maximumLength: 80, padding: true },
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
    const mainModel = mocks.models.get(MAIN_RESOURCE);
    const otherModel = mocks.models.get(OTHER_RESOURCE);
    expect(mainModel).toBeDefined();
    expect(otherModel).toBeDefined();

    mainModel?.fireUserChange('export class FrmMain { answer = 42; }');
    expect(onSourceChange).toHaveBeenCalledWith(
      MAIN_RESOURCE,
      'export class FrmMain { answer = 42; }',
    );

    onSourceChange.mockClear();
    const nextProps = codeEditorProps({
      onSourceChange,
      projectSources: { [MAIN_RESOURCE]: 'export class FrmMain { answer = 43; }' },
      value: 'export class FrmMain { answer = 43; }',
    });
    rerender(<CodeEditor {...nextProps} />);

    expect(mainModel?.setValue).toHaveBeenCalledWith('export class FrmMain { answer = 43; }');
    expect(onSourceChange).not.toHaveBeenCalled();
    expect(otherModel?.dispose).toHaveBeenCalledOnce();
    expect(mocks.models.has(OTHER_RESOURCE)).toBe(false);

    mocks.editorProps?.onChange?.('export class FrmMain { answer = 44; }');
    expect(onSourceChange).toHaveBeenCalledWith(
      MAIN_RESOURCE,
      'export class FrmMain { answer = 44; }',
    );
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
    mocks.addRawMarker(MAIN_RESOURCE, {
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
    const editor = mocks.createEditor(MAIN_RESOURCE);

    mocks.editorProps?.onMount?.(editor);

    expect(mocks.setModelMarkers).toHaveBeenCalledWith(
      mocks.models.get(MAIN_RESOURCE),
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
      mocks.models.get(MAIN_RESOURCE),
      'webrad-build',
      [],
    );
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
});
