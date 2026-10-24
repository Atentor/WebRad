import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { compileProjectToMemory, compileTailwindStyles } from '@webrad/compiler';
import { parseProject, parseComponentStyle } from '@webrad/project-model';
const browserPath = process.env.WEBRAD_BROWSER_PATH;
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
it.runIf(browserPath !== undefined)(
  'applies and persists palette choices with native Chromium popovers',
  async () => {
    const bundle = await build({
      entryPoints: [path.join(repositoryRoot, 'tests/fixtures/color-palette-browser.tsx')],
      outdir: 'bundle',
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const javascript = bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
    const css = bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text;
    let compiledHtml = '';
    const server = createServer((request, response) => {
      const route = request.url;
      if (route === '/compile-css') {
        void (async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
          const styles = (JSON.parse(Buffer.concat(chunks).toString()) as unknown[]).map((style) =>
            parseComponentStyle(style),
          );
          response.writeHead(200, { 'Content-Type': 'text/css' });
          response.end(await compileTailwindStyles(styles));
        })().catch((error: unknown) => {
          response.writeHead(500);
          response.end(String(error));
        });
        return;
      }
      if (route === '/index.html') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(compiledHtml);
        return;
      }
      response.writeHead(200, {
        'Content-Type':
          route === '/app.js' ? 'text/javascript' : route === '/app.css' ? 'text/css' : 'text/html',
      });
      response.end(
        route === '/app.js'
          ? javascript
          : route === '/app.css'
            ? css
            : '<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing browser server');
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-color-palette-'));
    if (!path.resolve(profile).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
      throw new Error('Unexpected browser profile path');
    const screenshot = process.env.WEBRAD_PALETTE_SCREENSHOT;
    try {
      const runBrowser = async (route: string, screenshotPath?: string): Promise<string> => {
        const child = spawn(
          browserPath!,
          [
            '--headless=new',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-gpu',
            `--user-data-dir=${profile}`,
            '--window-size=1440,1000',
            '--virtual-time-budget=8000',
            '--dump-dom',
            ...(screenshotPath === undefined ? [] : [`--screenshot=${screenshotPath}`]),
            `http://127.0.0.1:${address.port}${route}`,
          ],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        );
        let output = '';
        child.stdout!.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Color palette browser timed out'));
          }, 30000);
          child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once('exit', (code) => {
            clearTimeout(timeout);
            if (code === 0) resolve();
            else reject(new Error(`Browser exited ${code}`));
          });
        });
        return output;
      };
      const output = await runBrowser('/', screenshot);
      const encoded = /data-evidence="([^"]+)"/.exec(output)?.[1];
      expect(encoded, 'Browser did not finish palette interactions').toBeDefined();
      const evidence = JSON.parse(decodeURIComponent(encoded!)) as {
        passed: boolean;
        colors: number;
        error?: string;
        project: unknown;
      };
      expect(evidence.passed, evidence.error).toBe(true);
      expect(evidence.colors).toBe(10);
      const compiled = await compileProjectToMemory(parseProject(evidence.project), {
        userSources: {},
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      expect(compiled.files['assets/app.css']).toContain('--wr-palette-aurora-blue: #e11d48');
      compiledHtml = `${compiled.previewHtml}<script>setInterval(() => { const node = document.querySelector('[data-webrad-id="palette-label"]'); if (node) document.body.dataset.previewEvidence = getComputedStyle(node).color; }, 50);</script>`;
      const previewOutput = await runBrowser('/index.html');
      expect(/data-preview-evidence="([^"]+)"/.exec(previewOutput)?.[1]).toBe('rgb(225, 29, 72)');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
  60000,
);
