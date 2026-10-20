import { createServer } from 'node:http';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'consumes real Enter with selected, unchanged and unselected suggestions or parameter hints',
  async () => {
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `
          import * as monaco from 'monaco-editor/editor';
          import 'monaco-editor/features/inlineCompletions/register';
          import 'monaco-editor/features/parameterHints/register';
          import 'monaco-editor/features/snippet/register';
          import { registerMonacoContextEnter } from './apps/ide/renderer/src/monaco-context-enter.ts';
          monaco.languages.register({ id: 'enter-test' });
          monaco.languages.registerCompletionItemProvider('enter-test', {
            provideCompletionItems(model, position) {
              const word = model.getWordUntilPosition(position);
              return { suggestions: [{ label: 'value', insertText: 'value',
                kind: monaco.languages.CompletionItemKind.Property,
                range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) }] };
            },
          });
          monaco.languages.registerSignatureHelpProvider('enter-test', {
            signatureHelpTriggerCharacters: ['('],
            provideSignatureHelp() {
              return { value: { activeSignature: 0, activeParameter: 0,
                signatures: [{ label: 'call(value: string)', parameters: [{ label: 'value: string' }] }] }, dispose() {} };
            },
          });
          const editor = monaco.editor.create(document.getElementById('root'), {
            language: 'enter-test', value: '', automaticLayout: true,
            acceptSuggestionOnEnter: 'on', quickSuggestions: true, quickSuggestionsDelay: 0,
            wordBasedSuggestions: 'off', minimap: { enabled: false },
          });
          const bindings = registerMonacoContextEnter(editor);
          window.prepare = (value, selectionMode = 'always') => {
            editor.trigger('test', 'hideSuggestWidget');
            editor.trigger('test', 'closeParameterHints');
            editor.setValue(value);
            editor.setPosition({ lineNumber: 1, column: value.length + 1 });
            editor.updateOptions({ suggest: { selectionMode } });
            editor.focus();
          };
          window.hints = () => editor.trigger('test', 'editor.action.triggerParameterHints');
          window.snapshot = () => ({ value: editor.getValue(), position: editor.getPosition(),
            suggestions: !!document.querySelector('.suggest-widget.visible'),
            selected: !!document.querySelector('.suggest-widget.visible .monaco-list-row.focused'),
            hints: !!document.querySelector('.parameter-hints-widget.visible') });
          window.removeBindings = () => bindings.dispose();
        `,
        loader: 'ts',
      },
      bundle: true,
      write: false,
      outdir: 'out',
      entryNames: 'app',
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
        request.url === '/app.js'
          ? 'text/javascript'
          : request.url === '/app.css'
            ? 'text/css'
            : 'text/html',
      );
      response.end(
        file?.text ??
          '<!doctype html><link rel="stylesheet" href="/app.css"><div id="root" style="height:600px"></div><script>window.addEventListener("error", event => { window.startupError = event.error?.stack ?? event.message; });</script><script src="/app.js"></script>',
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
        const enter = async (): Promise<void> => {
          await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            text: '\r',
          });
          await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          });
        };
        await expect
          .poll(() => evaluate<string>('window.startupError ?? typeof window.prepare'), {
            timeout: 15_000,
          })
          .toBe('function');
        for (const [source, selection] of [
          ['va', 'always'],
          ['value', 'always'],
          ['va', 'never'],
        ]) {
          await evaluate(`window.prepare('', ${JSON.stringify(selection)})`);
          await send('Input.insertText', { text: source });
          await expect.poll(() => evaluate<boolean>('window.snapshot().suggestions')).toBe(true);
          expect(await evaluate<boolean>('window.snapshot().selected')).toBe(
            selection === 'always',
          );
          await enter();
          await expect.poll(() => evaluate<boolean>('window.snapshot().suggestions')).toBe(false);
          expect(await evaluate('window.snapshot().value')).toBe(
            selection === 'never' ? 'va' : 'value',
          );
          expect(await evaluate('window.snapshot().position.lineNumber')).toBe(1);
        }
        await evaluate("window.prepare('call('); window.hints()");
        await expect.poll(() => evaluate<boolean>('window.snapshot().hints')).toBe(true);
        await enter();
        await expect.poll(() => evaluate<boolean>('window.snapshot().hints')).toBe(false);
        expect(await evaluate('window.snapshot().value')).toBe('call(');
        expect(await evaluate('window.snapshot().position.lineNumber')).toBe(1);

        // Once all contexts are closed, ordinary Enter must still insert a line.
        await evaluate("window.prepare('plain')");
        await enter();
        expect(await evaluate<string>('window.snapshot().value')).toMatch(/^plain\r?\n$/);
        expect(await evaluate('window.snapshot().position.lineNumber')).toBe(2);

        // Removing the scoped registrations restores Monaco's native no-selection behavior.
        await evaluate("window.removeBindings(); window.prepare('', 'never')");
        await send('Input.insertText', { text: 'va' });
        await expect.poll(() => evaluate<boolean>('window.snapshot().suggestions')).toBe(true);
        await enter();
        expect(await evaluate<string>('window.snapshot().value')).toMatch(/^va\r?\n$/);
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  60_000,
);
