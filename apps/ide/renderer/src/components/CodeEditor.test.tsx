// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface MockEditorProps {
  readonly beforeMount?: (monaco: unknown) => void;
}

const mocks = vi.hoisted(() => {
  const addExtraLib = vi.fn(() => ({ dispose: vi.fn() }));
  const setCompilerOptions = vi.fn();
  const setDiagnosticsOptions = vi.fn();
  return {
    addExtraLib,
    editorProps: undefined as MockEditorProps | undefined,
    loaderConfig: vi.fn(),
    setCompilerOptions,
    setDiagnosticsOptions,
    typescriptContribution: {
      JsxEmit: { ReactJSX: 4 },
      ModuleKind: { ESNext: 99 },
      ModuleResolutionKind: { NodeJs: 2 },
      ScriptTarget: { ESNext: 99 },
      typescriptDefaults: {
        addExtraLib,
        setCompilerOptions,
        setDiagnosticsOptions,
      },
    },
  };
});

vi.mock('@monaco-editor/react', () => ({
  default: (props: MockEditorProps) => {
    mocks.editorProps = props;
    return <div data-testid="monaco-editor-mock" />;
  },
  loader: { config: mocks.loaderConfig },
}));

vi.mock('monaco-editor/editor', () => ({
  editor: {},
  KeyCode: { KeyS: 49 },
  KeyMod: { CtrlCmd: 2048 },
  languages: {},
}));

vi.mock('monaco-editor/languages/features/typescript/register', () => mocks.typescriptContribution);

vi.mock('monaco-editor/editor/editor.worker.js?worker', () => ({
  default: class MockEditorWorker {},
}));

vi.mock('monaco-editor/languages/features/typescript/ts.worker.js?worker', () => ({
  default: class MockTypeScriptWorker {},
}));

import { CodeEditor } from './CodeEditor';

afterEach(() => cleanup());

describe('CodeEditor Monaco configuration', () => {
  it('uses the TypeScript contribution API with the Monaco 0.56 namespace shape', () => {
    render(
      <CodeEditor
        extraLibraries={{ 'file:///webrad/runtime.d.ts': 'declare const WebRAD: unknown;' }}
        onChange={vi.fn()}
        onCursorChange={vi.fn()}
        onSave={vi.fn()}
        path="file:///forms/FrmMain.ts"
        theme="dark"
        value="export {};"
      />,
    );

    const configuredMonaco = mocks.loaderConfig.mock.calls[0]?.[0] as unknown;
    expect(configuredMonaco).not.toHaveProperty('languages.typescript');
    expect(mocks.editorProps?.beforeMount).toBeTypeOf('function');
    expect(() => mocks.editorProps?.beforeMount?.(configuredMonaco)).not.toThrow();

    expect(mocks.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowNonTsExtensions: true,
        jsx: 4,
        module: 99,
        moduleResolution: 2,
        noEmit: true,
        strict: true,
        target: 99,
      }),
    );
    expect(mocks.setDiagnosticsOptions).toHaveBeenCalledWith({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    expect(mocks.addExtraLib).toHaveBeenCalledWith(
      'declare const WebRAD: unknown;',
      'file:///webrad/runtime.d.ts',
    );
  });
});
