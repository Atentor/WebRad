import type { WebContents } from 'electron';
/** Smoke assertions must not hide an uncaught renderer error behind later success markers. */
export function trackSmokeRendererHealth(contents: WebContents): () => void {
  let failure: Error | undefined;
  contents.on('console-message', (details) => {
    if (details.message.startsWith('Uncaught ')) {
      failure ??= new Error(
        'Uncaught renderer error at ' +
          details.sourceId +
          ':' +
          String(details.lineNumber) +
          ': ' +
          details.message,
      );
    }
  });
  contents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit')
      failure ??= new Error(
        'Renderer process terminated: ' +
          details.reason +
          ' (exit ' +
          String(details.exitCode) +
          ').',
      );
  });
  return () => {
    if (failure !== undefined) throw failure;
  };
}
