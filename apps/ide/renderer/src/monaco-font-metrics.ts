import * as monacoApi from 'monaco-editor/editor';

interface FontLoadingSource {
  readonly ready: Promise<unknown>;
  addEventListener(type: 'loadingdone' | 'loadingerror', listener: () => void): void;
  removeEventListener(type: 'loadingdone' | 'loadingerror', listener: () => void): void;
}

/** Keep cached glyph widths in sync when a bundled font replaces its fallback. */
export function observeMonacoFontMetrics(
  editor: Pick<monacoApi.editor.IStandaloneCodeEditor, 'layout'>,
  fonts: FontLoadingSource | undefined = document.fonts,
): monacoApi.IDisposable {
  let disposed = false;
  const refresh = (): void => {
    if (disposed) return;
    monacoApi.editor.remeasureFonts();
    editor.layout();
  };

  if (fonts !== undefined) {
    fonts.addEventListener('loadingdone', refresh);
    fonts.addEventListener('loadingerror', refresh);
    void fonts.ready.then(refresh, refresh);
  }

  return {
    dispose(): void {
      disposed = true;
      fonts?.removeEventListener('loadingdone', refresh);
      fonts?.removeEventListener('loadingerror', refresh);
    },
  };
}
