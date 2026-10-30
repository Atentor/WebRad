import { createServer } from 'node:http';
import { build } from 'esbuild';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { ensureEventHandler } from '@webrad/language';
import { monacoHandlerInputReadyExpression } from '../apps/ide/main/monaco-smoke-input';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'types into the generated handler with real Monaco EditContext and textarea input',
  async () => {
    const handler = ensureEventHandler('export class PageMain {}', {
      className: 'PageMain',
      componentName: 'PageMain',
      componentType: 'WebPage',
      eventName: 'OnUnauthenticated',
      handlerName: 'PageMainUnauthenticated',
    });
    const ready = monacoHandlerInputReadyExpression(handler.methodName);
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
        import * as monaco from 'monaco-editor/editor/editor.api.js';
        let editor;
        window.prepare = enabled => {
          editor?.getModel()?.dispose(); editor?.dispose();
          document.getElementById('root').replaceChildren();
          editor = monaco.editor.create(document.getElementById('root'), {
            value: ${JSON.stringify(handler.sourceText)}, language: 'plaintext',
            editContext: enabled, minimap: { enabled: false },
          });
          editor.onDidChangeCursorPosition(event => editor.getDomNode()
            .setAttribute('data-cursor-position', 'Line ' + event.position.lineNumber + ', column ' + event.position.column));
          editor.setPosition({ lineNumber: 1, column: 1 });
          document.getElementById('outside').focus();
        };
        window.navigate = () => {
          editor.setPosition({ lineNumber: ${handler.cursor.line}, column: ${handler.cursor.column} });
          editor.revealPositionInCenter(editor.getPosition()); editor.render(true);
        };
        window.focusEditor = () => editor.focus();
        window.source = () => editor.getValue();
      `,
      },
      bundle: true,
      write: false,
      outdir: 'out',
      loader: { '.ttf': 'dataurl' },
    });
    const server = createServer((request, response) => {
      const extension =
        request.url === '/app.js' ? '.js' : request.url === '/app.css' ? '.css' : null;
      const file =
        extension === null
          ? undefined
          : bundle.outputFiles.find((entry) => entry.path.endsWith(extension));
      response.setHeader(
        'Content-Type',
        extension === '.js' ? 'text/javascript' : extension === '.css' ? 'text/css' : 'text/html',
      );
      response.end(
        file?.text ??
          '<!doctype html><link rel="stylesheet" href="/app.css"><button id="outside">Outside</button><div id="root" style="height:500px"></div><span class="wr-status-position"></span><script src="/app.js"></script>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing test port.');
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
          .poll(() => evaluate('typeof window.prepare'), { timeout: 15_000 })
          .toBe('function');
        for (const enabled of [true, false]) {
          await evaluate(`window.prepare(${enabled})`);
          expect(await evaluate(ready)).toBe(false);
          await evaluate('window.navigate()');
          expect(await evaluate(ready)).toBe(false);
          await evaluate('window.focusEditor()');
          await expect.poll(() => evaluate(ready)).toBe(true);
          expect(await evaluate('document.activeElement.className')).toContain(
            enabled ? 'native-edit-context' : 'inputarea',
          );
          // This is native browser text input, not an editor.executeEdits shortcut.
          await send('Input.insertText', { text: 'return;' });
          const source = await evaluate<string>('window.source()');
          const file = ts.createSourceFile('PageMain.ts', source, ts.ScriptTarget.Latest, true);
          const declaration = file.statements.find(ts.isClassDeclaration);
          const method = declaration?.members.find(ts.isMethodDeclaration);
          expect(method?.name.getText(file)).toBe(handler.methodName);
          expect(method?.body?.statements.map((statement) => statement.kind)).toEqual([
            ts.SyntaxKind.ReturnStatement,
          ]);
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
