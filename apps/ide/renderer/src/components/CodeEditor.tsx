import Editor, { loader } from '@monaco-editor/react';
import * as monacoApi from 'monaco-editor/editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import * as typescriptApi from 'monaco-editor/languages/features/typescript/register';
import tsWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker';
import { useEffect, useRef, type ReactElement } from 'react';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
  },
};

loader.config({ monaco: monacoApi });

interface CodeEditorProps {
  path: string;
  value: string;
  theme: 'dark' | 'light';
  extraLibraries: Readonly<Record<string, string>>;
  navigateTo?: { line: number; column?: number } | null;
  onChange: (value: string) => void;
  onCursorChange: (line: number, column: number) => void;
  onSave: () => void;
}

const libraryDisposables = new Map<string, monacoApi.IDisposable>();
const libraryContents = new Map<string, string>();

function synchronizeExtraLibraries(libraries: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(libraries)) {
    if (libraryContents.get(path) === content) continue;
    libraryDisposables.get(path)?.dispose();
    libraryDisposables.set(path, typescriptApi.typescriptDefaults.addExtraLib(content, path));
    libraryContents.set(path, content);
  }
}

export function CodeEditor({
  path,
  value,
  theme,
  extraLibraries,
  navigateTo,
  onChange,
  onCursorChange,
  onSave,
}: CodeEditorProps): ReactElement {
  const editorRef = useRef<monacoApi.editor.IStandaloneCodeEditor | null>(null);

  const beforeMount = (): void => {
    typescriptApi.typescriptDefaults.setCompilerOptions({
      target: typescriptApi.ScriptTarget.ESNext,
      module: typescriptApi.ModuleKind.ESNext,
      moduleResolution: typescriptApi.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: true,
      jsx: typescriptApi.JsxEmit.ReactJSX,
    });
    typescriptApi.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    synchronizeExtraLibraries(extraLibraries);
  };

  const onMount = (editor: monacoApi.editor.IStandaloneCodeEditor): void => {
    editorRef.current = editor;
    synchronizeExtraLibraries(extraLibraries);
    editor.onDidChangeCursorPosition(({ position }) =>
      onCursorChange(position.lineNumber, position.column),
    );
    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, onSave);
    editor.focus();
  };

  useEffect(() => {
    if (!navigateTo || !editorRef.current) return;
    editorRef.current.setPosition({
      lineNumber: navigateTo.line,
      column: navigateTo.column ?? 1,
    });
    editorRef.current.revealLineInCenter(navigateTo.line);
    editorRef.current.focus();
  }, [navigateTo]);

  useEffect(() => {
    synchronizeExtraLibraries(extraLibraries);
  }, [extraLibraries]);

  useEffect(() => {
    const openFind = (): void => {
      void editorRef.current?.getAction('actions.find')?.run();
    };
    window.addEventListener('webrad:find', openFind);
    return () => window.removeEventListener('webrad:find', openFind);
  }, []);

  return (
    <div className="wr-monaco-host">
      <Editor
        beforeMount={beforeMount}
        defaultLanguage="typescript"
        height="100%"
        keepCurrentModel
        language="typescript"
        onChange={(next) => onChange(next ?? '')}
        onMount={onMount}
        options={{
          automaticLayout: true,
          fontFamily: 'Cascadia Code, Consolas, monospace',
          fontSize: 13,
          minimap: { enabled: true },
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          tabSize: 2,
        }}
        path={path}
        saveViewState
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
      />
    </div>
  );
}
