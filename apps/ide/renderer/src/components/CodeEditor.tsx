import Editor, { loader, type Monaco, type OnMount } from '@monaco-editor/react';
import * as monacoApi from 'monaco-editor/editor/editor.api.js';
import 'monaco-editor/language/typescript/monaco.contribution.js';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
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

function synchronizeExtraLibraries(
  monaco: Monaco,
  libraries: Readonly<Record<string, string>>,
): void {
  for (const [path, content] of Object.entries(libraries)) {
    if (libraryContents.get(path) === content) continue;
    libraryDisposables.get(path)?.dispose();
    libraryDisposables.set(
      path,
      monaco.languages.typescript.typescriptDefaults.addExtraLib(content, path),
    );
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

  const beforeMount = (monaco: Monaco): void => {
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    });
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    synchronizeExtraLibraries(monaco, extraLibraries);
  };

  const onMount: OnMount = (editor, monaco): void => {
    editorRef.current = editor;
    synchronizeExtraLibraries(monaco, extraLibraries);
    editor.onDidChangeCursorPosition(({ position }) =>
      onCursorChange(position.lineNumber, position.column),
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave);
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
    synchronizeExtraLibraries(monacoApi, extraLibraries);
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
