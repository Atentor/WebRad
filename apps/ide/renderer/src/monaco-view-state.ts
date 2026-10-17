import type { editor } from 'monaco-editor/editor';

/** Measure the initial lines before a saved viewport can hide their horizontal overflow. */
export function restoreMonacoViewState(
  target: Pick<editor.IStandaloneCodeEditor, 'render' | 'restoreViewState'>,
  state: editor.ICodeEditorViewState,
): void {
  target.render(true);
  target.restoreViewState(state);
}
