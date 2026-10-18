import type { editor } from 'monaco-editor/editor';

/** Measure the visible container and initial lines before restoring an offscreen viewport. */
export function restoreMonacoViewState(
  target: Pick<
    editor.IStandaloneCodeEditor,
    'getDomNode' | 'layout' | 'render' | 'restoreViewState'
  >,
  state: editor.ICodeEditorViewState,
): void {
  const restore = (): void => {
    target.layout();
    target.render(true);
    target.restoreViewState(state);
  };

  restore();
  void document.fonts?.ready.then(() => {
    requestAnimationFrame(() => {
      if (target.getDomNode() === null) return;
      restore();
    });
  });
}
