import type { editor } from 'monaco-editor/editor';

/** Measure the visible container and initial lines before restoring an offscreen viewport. */
export function restoreMonacoViewState(
  target: Pick<editor.IStandaloneCodeEditor, 'layout' | 'render' | 'restoreViewState'>,
  state: editor.ICodeEditorViewState,
): void {
  target.layout();
  target.render(true);
  target.restoreViewState(state);
}
