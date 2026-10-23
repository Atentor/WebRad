import { createServer } from 'node:http';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'preserves a real Monaco viewport after a hidden editor becomes visible',
  async () => {
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
          import * as monaco from 'monaco-editor/editor/editor.api.js';
          import '@fontsource/jetbrains-mono/300.css';
          import { observeMonacoFontMetrics } from './apps/ide/renderer/src/monaco-font-metrics.ts';
          import { restoreMonacoViewState } from './apps/ide/renderer/src/monaco-view-state.ts';
          const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
          const source = [
            "import { PageMainGenerated } from './PageMain.generated';",
            'export class PageMain extends PageMainGenerated {',
            '  public async BTNMostrarClick(): Promise<void> {',
            "    Message('Ol\\u00E1 Ada');", '  }', '}', ''
          ].join('\\n');
          const snapshot = editor => {
            const dom = editor.getDomNode();
            const bounds = dom.getBoundingClientRect();
            return {
              position: editor.getPosition(),
              scrollTop: editor.getScrollTop(),
              scrollHeight: editor.getScrollHeight(),
              scrollWidth: editor.getScrollWidth(),
              contentWidth: editor.getLayoutInfo().contentWidth,
              caretTop: dom.querySelector('.cursors-layer > .cursor').getBoundingClientRect().top - bounds.top,
              firstLine: [...dom.querySelectorAll('.view-lines .view-line')].sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
                .find(line => line.getBoundingClientRect().top >= bounds.top)?.textContent,
            };
          };
          window.runRestoreCase = async (width, wideLine) => {
            const host = document.getElementById('root');
            host.style.width = width + 'px';
            const model = monaco.editor.createModel(source, 'typescript');
            const options = {
              model, automaticLayout: true,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: '300',
              fontLigatures: false, fontVariations: false,
              lineHeight: 20, padding: { top: 8, bottom: 20 },
              glyphMargin: true, lineNumbersMinChars: 3, lineDecorationsWidth: 12,
              minimap: { enabled: true, maxColumn: 100, renderCharacters: false,
                showSlider: 'mouseover', size: 'proportional' },
              scrollBeyondLastLine: false, smoothScrolling: false,
              scrollbar: { ignoreHorizontalScrollbarInContentHeight: true },
            };
            let editor = monaco.editor.create(host, options);
            let fontObserver = observeMonacoFontMetrics(editor);
            try {
              editor.focus();
              await document.fonts.ready;
              monaco.editor.remeasureFonts();
              editor.render(true);
              await frame(); await frame();
              // Native caret checks can leave a cached wide line after restoring its text.
              // The recreated editor computes a fresh width; neither state may move vertically.
              if (wideLine) {
                const line = model.getLineContent(4);
                editor.executeEdits('wide-line', [{ range: new monaco.Range(4, 1, 4, model.getLineMaxColumn(4)),
                  text: line + 'W'.repeat(160) }]);
                editor.render(true);
                await frame(); await frame();
                editor.executeEdits('restore-line', [{ range: new monaco.Range(4, 1, 4, model.getLineMaxColumn(4)), text: line }]);
              }
              editor.executeEdits('fixture', [{ range: new monaco.Range(7, 1, 7, 1),
                text: '\\n' + Array.from({ length: 40 }, (_, index) => '// workspaceSmoke_' + index).join('\\n') }]);
              editor.setPosition({ lineNumber: 47, column: model.getLineMaxColumn(47) });
              editor.revealPosition(editor.getPosition());
              editor.render(true);
              await frame(); await frame();
              editor.setPosition({ lineNumber: 39, column: 6 });
              editor.render(true);
              await frame(); await frame();
              const before = snapshot(editor);
              const state = editor.saveViewState();
              fontObserver.dispose();
              editor.dispose();
              host.replaceChildren();
              // The React Monaco wrapper constructs its editor hidden, then reveals it before onMount.
              host.style.display = 'none';
              editor = monaco.editor.create(host, options);
              host.style.display = '';
              fontObserver = observeMonacoFontMetrics(editor);
              restoreMonacoViewState(editor, state);
              editor.focus();
              const immediate = snapshot(editor);
              await frame(); await frame();
              return { before, immediate, after: snapshot(editor) };
            } finally { fontObserver.dispose(); editor.dispose(); model.dispose(); host.style.display = ''; }
          };
        `,
      },
      bundle: true,
      write: false,
      outdir: 'out/monaco-view-state-regression',
      format: 'iife',
      platform: 'browser',
      loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
    });
    const routes: Record<string, readonly [string, string]> = {
      '/app.js': [
        'text/javascript',
        bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text,
      ],
      '/app.css': ['text/css', bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text],
    };
    const server = createServer((request, response) => {
      const [type, body] = routes[request.url ?? ''] ?? [
        'text/html',
        '<!doctype html><link rel="stylesheet" href="/app.css"><style>body{margin:0}#root{height:638px}</style><div id="root"></div><script src="/app.js"></script>',
      ];
      response.writeHead(200, { 'Content-Type': type });
      response.end(body);
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
          .poll(() => evaluate<boolean>('typeof window.runRestoreCase === "function"'), {
            timeout: 15_000,
          })
          .toBe(true);
        for (const { width, wideLine } of [500, 628, 900, 948].flatMap((width) =>
          [false, true].map((wideLine) => ({ width, wideLine })),
        )) {
          interface Viewport {
            readonly position: { readonly lineNumber: number; readonly column: number };
            readonly scrollTop: number;
            readonly scrollWidth: number;
            readonly scrollHeight: number;
            readonly contentWidth: number;
            readonly caretTop: number;
            readonly firstLine: string;
          }
          const { before, immediate, after } = await evaluate<{
            before: Viewport;
            immediate: Viewport;
            after: Viewport;
          }>(`window.runRestoreCase(${width}, ${wideLine})`);
          expect(before.position).toEqual({ lineNumber: 39, column: 6 });
          expect(before.scrollTop).toBeGreaterThan(0);
          expect(before.scrollWidth > before.contentWidth).toBe(wideLine || width < 900);
          expect(immediate.firstLine).toBe(before.firstLine);
          expect(Math.abs(immediate.caretTop - before.caretTop)).toBeLessThanOrEqual(1.5);
          expect(after.position).toEqual(before.position);
          expect(after.scrollTop).toBe(before.scrollTop);
          expect(after.scrollHeight).toBe(before.scrollHeight);
          if (!wideLine) expect(after.scrollWidth).toBe(before.scrollWidth);
          expect(after.firstLine).toBe(before.firstLine);
          expect(Math.abs(after.caretTop - before.caretTop)).toBeLessThanOrEqual(1.5);
        }
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  60_000,
);
