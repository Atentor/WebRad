import type { editor, IDisposable } from 'monaco-editor/editor';

/** Measure the visible container and initial lines before restoring an offscreen viewport. */
export function restoreMonacoViewState(
  target: Pick<
    editor.IStandaloneCodeEditor,
    'getDomNode' | 'layout' | 'render' | 'restoreViewState'
  >,
  state: editor.ICodeEditorViewState,
): IDisposable {
  let disposed = false;
  const restore = (): void => {
    target.layout();
    target.render(true);
    target.restoreViewState(state);
  };

  restore();
  void document.fonts?.ready.then(() => {
    if (disposed) return;
    requestAnimationFrame(() => {
      if (disposed || target.getDomNode() === null) return;
      restore();
    });
  });
  // A navigation, user edit, document switch or unmount supersedes the saved viewport.
  return {
    dispose: () => {
      disposed = true;
    },
  };
}
