import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { expect, it } from 'vitest';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'loads the complete IDE import graph and generates PDF through cold Vite development imports',
  async () => {
    const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-renderer-startup-'));
    if (!path.resolve(cacheDirectory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
      throw new Error('Invalid renderer startup cache directory.');
    const runtimeUrl = `/@fs/${path.resolve('node_modules/@webrad/runtime/src/index.ts').replaceAll('\\', '/')}`;
    const server = await createServer({
      configFile: path.resolve('vite.renderer.config.ts'),
      cacheDir: cacheDirectory,
      // Electron Forge preserves workspace symlinks when serving the renderer.
      resolve: { preserveSymlinks: true },
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      plugins: [
        {
          name: 'renderer-startup-test',
          configureServer(vite) {
            vite.middlewares.use('/__startup_test', async (_request, response) => {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                await vite.transformIndexHtml(
                  '/__startup_test',
                  `<!doctype html><html><head></head><body data-state="loading">
                <script type="module">
                  try {
                    const [{ App }, { WebReportBuilder }] = await Promise.all([
                      import('/src/App.tsx'), import(${JSON.stringify(runtimeUrl)})
                    ]);
                    const report = new WebReportBuilder();
                    try {
                      const result = await report.GeneratePDF();
                      const bytes = new Uint8Array(await result.blob.arrayBuffer());
                      document.body.textContent = JSON.stringify({
                        app: typeof App,
                        prefix: new TextDecoder().decode(bytes.subarray(0, 5)),
                        pages: result.pageCount,
                        size: bytes.length
                      });
                      document.body.dataset.state = 'ready';
                    } finally { report.dispose(); }
                  } catch (error) {
                    document.body.textContent = String(error.stack || error);
                    document.body.dataset.state = 'error';
                  }
                </script></body></html>`,
                ),
              );
            });
          },
        },
      ],
    });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (address === undefined || address === null || typeof address === 'string')
        throw new Error('Missing Vite development port.');
      await withChromium(
        browser!,
        `http://127.0.0.1:${address.port}/__startup_test`,
        async (send) => {
          const state = async (): Promise<{ state: string; text: string }> => {
            const result = await send('Runtime.evaluate', {
              expression:
                '({ state: document.body.dataset.state, text: document.body.textContent })',
              returnByValue: true,
            });
            expect(result.exceptionDetails).toBeUndefined();
            return (result.result as { value: { state: string; text: string } }).value;
          };
          await expect
            .poll(async () => (await state()).state, { timeout: 30_000 })
            .not.toBe('loading');
          const loaded = await state();
          expect(loaded.state, loaded.text).toBe('ready');
          expect(JSON.parse(loaded.text)).toMatchObject({
            app: 'function',
            prefix: '%PDF-',
            pages: 1,
          });
          expect((JSON.parse(loaded.text) as { size: number }).size).toBeGreaterThan(500);
        },
      );
    } finally {
      await server.close();
      await fs.rm(cacheDirectory, { recursive: true, force: true });
    }
  },
  60_000,
);
