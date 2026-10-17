import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'keeps Monaco editor services available after lazy TypeScript activation and remount',
  async () => {
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
          import * as monaco from 'monaco-editor/editor';
          import { getTypeScriptWorker } from 'monaco-editor/languages/features/typescript/register';
          import { configureMonaco } from './apps/ide/renderer/src/monaco-setup.ts';
          const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
          window.runLazyServiceCase = async () => {
            configureMonaco();
            const host = document.getElementById('root');
            // Initialize standalone services before TypeScript's dynamic tsMode import.
            const initial = monaco.editor.create(host, { value: '', language: 'plaintext' });

            const source = 'export const message: string = "Hello";';
            const languageReady = new Promise((resolve) =>
              monaco.languages.onLanguage('typescript', resolve),
            );
            const model = monaco.editor.createModel(source, 'typescript');
            initial.setModel(model);
            await languageReady;
            let remounted;
            try {
              const workerFactory = await getTypeScriptWorker();
              initial.dispose();
              remounted = monaco.editor.create(host, { model });
              // The public accessor instantiates this contribution immediately, without a timer.
              const contribution = remounted.getContribution('editor.contrib.dropIntoEditorController');
              remounted.render(true);
              await frame();
              await frame();
              return {
                workerFactory: typeof workerFactory,
                source: remounted.getValue(),
                contributionAvailable: contribution !== null,
              };
            } finally {
              remounted?.dispose();
              model.dispose();
            }
          };
        `,
      },
      bundle: true,
      splitting: true,
      write: false,
      outdir: 'out/monaco-lazy-services-regression',
      format: 'esm',
      platform: 'browser',
      loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
    });
    const typeScriptWorkerBundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: "import 'monaco-editor/languages/features/typescript/ts.worker.js';",
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
    });
    // Keep the real late import; folding it into the entrypoint hides this regression.
    expect(bundle.outputFiles.some((file) => path.basename(file.path).startsWith('tsMode-'))).toBe(
      true,
    );
    const routes = new Map(
      bundle.outputFiles.map((file) => [
        `/${path.basename(file.path)}`,
        [file.path.endsWith('.css') ? 'text/css' : 'text/javascript', file.text] as const,
      ]),
    );
    routes.set('/typescript-worker.js', [
      'text/javascript',
      typeScriptWorkerBundle.outputFiles[0]!.text,
    ]);
    const server = createServer((request, response) => {
      const route = routes.get(request.url ?? '');
      if (route) {
        response.writeHead(200, { 'Content-Type': route[0] });
        response.end(route[1]);
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<!doctype html><link rel="stylesheet" href="/stdin.css">
        <style>#root{width:900px;height:500px}</style><div id="root"></div>
        <script>
          window.monacoErrors = [];
          globalThis.MonacoEnvironment = { getWorker: () => new Worker('/typescript-worker.js', { type: 'module' }) };
          const originalError = console.error.bind(console);
          console.error = (...values) => {
            window.monacoErrors.push(values.map(value => String(value?.stack || value)).join(' '));
            originalError(...values);
          };
          addEventListener('error', event => window.monacoErrors.push(String(event.error?.stack || event.message)));
          addEventListener('unhandledrejection', event => window.monacoErrors.push(String(event.reason?.stack || event.reason)));
        </script><script type="module" src="/stdin.js"></script>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing Monaco test port.');
    try {
      await withChromium(browser!, `http://127.0.0.1:${address.port}`, async (send) => {
        const evaluate = async <T>(expression: string): Promise<T> => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          expect(result.exceptionDetails, JSON.stringify(result.exceptionDetails)).toBeUndefined();
          return (result.result as { value: T }).value;
        };
        await expect
          .poll(() => evaluate<boolean>('typeof window.runLazyServiceCase === "function"'), {
            timeout: 15_000,
          })
          .toBe(true);
        const result = await evaluate<{
          workerFactory: string;
          source: string;
          contributionAvailable: boolean;
        }>('window.runLazyServiceCase()');
        const errors = await evaluate<string[]>('window.monacoErrors');
        expect(errors).toEqual([]);
        expect(result).toEqual({
          workerFactory: 'function',
          source: 'export const message: string = "Hello";',
          contributionAvailable: true,
        });
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  60_000,
);
