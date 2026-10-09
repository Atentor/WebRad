import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import { comboBoxBinding, comboBoxProject, comboBoxUserSources } from './fixtures/combo-box';
import { withChromium } from './chromium';

const browserPath = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browserPath !== undefined)(
  'configures a ComboBox in Chromium and executes its compiled F9 Preview with a real HTTP API',
  async () => {
    let previewHtml = '';
    let dialogScript = '';
    const ideCss = (
      await Promise.all(
        ['theme.css', 'layout.css'].map((file) =>
          fs.readFile(path.resolve('apps/ide/renderer/src', file), 'utf8'),
        ),
      )
    ).join('\n');
    let requestCount = 0;
    const server = createServer((request, response) => {
      if (request.url === '/customers') {
        requestCount++;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            customers:
              requestCount === 1
                ? [
                    { id: 1, name: 'Ana' },
                    { id: 2, name: 'Bruno' },
                  ]
                : [
                    { id: 2, name: 'Bruno updated' },
                    { id: 1, name: 'Ana updated' },
                  ],
          }),
        );
        return;
      }
      response.writeHead(200, {
        'Content-Type':
          request.url === '/dialog.js'
            ? 'text/javascript'
            : request.url === '/ide.css'
              ? 'text/css'
              : 'text/html',
      });
      response.end(
        request.url === '/preview'
          ? previewHtml
          : request.url === '/dialog.js'
            ? dialogScript
            : request.url === '/ide.css'
              ? ideCss
              : '<!doctype html><html><head><link rel="stylesheet" href="/ide.css"></head><body><div id="root" style="height:0"></div><iframe style="width:100%;height:350px;border:0" title="Compiled F9 Preview" src="/preview"></iframe><script src="/dialog.js"></script></body></html>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing API server port.');
    const url = `http://127.0.0.1:${String(address.port)}`;
    try {
      const project = comboBoxProject(url);
      const page = project.pages[0];
      if (page === undefined) throw new Error('Missing fixture page.');
      const compiled = await compileProjectToMemory(project, {
        userSources: comboBoxUserSources(page.name),
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      previewHtml = compiled.previewHtml ?? '';
      const dialogBundle = await build({
        stdin: {
          contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ComboBoxConfigurationDialog } from './apps/ide/renderer/src/components/ComboBoxConfigurationDialog';
        const page = ${JSON.stringify(page)};
        const component = page.components.find(item => item.type === 'WebComboBox');
        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(ComboBoxConfigurationDialog, {
          component: { ...component, props: { ...component.props, comboBoxConfig: null } },
          availableComponents: page.components,
          onClose: () => root.unmount(),
          onSave: configuration => { document.body.dataset.binding = JSON.stringify(configuration); root.unmount(); }
        }));`,
          resolveDir: process.cwd(),
          loader: 'tsx',
        },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
      });
      dialogScript = dialogBundle.outputFiles[0]?.text ?? '';
      await withChromium(browserPath!, url, async (send) => {
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          if (result.exceptionDetails !== undefined)
            throw new Error(JSON.stringify(result.exceptionDetails));
          return (result.result as { value?: unknown } | undefined)?.value;
        };
        await expect
          .poll(
            async () =>
              evaluate(
                `Boolean(document.querySelector('[aria-label="ComboBox API Client"]')) && document.querySelector('iframe').contentDocument.querySelector('select')?.options.length === 2`,
              ),
            { timeout: 15_000 },
          )
          .toBe(true);
        await evaluate(`(() => {
        const change = (label, value) => { const select = document.querySelector('[aria-label="' + label + '"]'); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
        change('ComboBox API Client', 'customers-api');
      })()`);
        await expect
          .poll(async () =>
            evaluate(
              `document.querySelector('[aria-label="ComboBox display field"]').options.length`,
            ),
          )
          .toBe(4);
        await evaluate(`(() => {
        for (const [label, value] of [['ComboBox display field', '/name'], ['ComboBox key field', '/id']]) {
          const select = document.querySelector('[aria-label="' + label + '"]'); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`);
        await expect
          .poll(async () => evaluate(`document.querySelector('button[type="submit"]').disabled`))
          .toBe(false);
        if (process.env.WEBRAD_COMBOBOX_SCREENSHOT) {
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            path.resolve(process.env.WEBRAD_COMBOBOX_SCREENSHOT).replace(/\.png$/u, '.dialog.png'),
            Buffer.from(String(screenshot.data), 'base64'),
          );
        }
        await evaluate(`document.querySelector('button[type="submit"]').click()`);
        const saved = await evaluate('document.body.dataset.binding');
        expect(JSON.parse(String(saved))).toEqual(comboBoxBinding);
        expect(
          await evaluate(`(() => {
          const frame = document.querySelector('iframe');
          const combo = frame.contentDocument.querySelector('select');
          const bounds = combo.getBoundingClientRect();
          return frame.getBoundingClientRect().top === 0 && bounds.width > 0 && bounds.height > 0 && !combo.closest('[hidden]');
        })()`),
        ).toBe(true);
        expect(
          await evaluate(
            `(() => { const combo = document.querySelector('iframe').contentDocument.querySelector('select'); return { value: combo.value, labels: [...combo.options].map(option => option.text) }; })()`,
          ),
        ).toEqual({ value: '2', labels: ['Ana', 'Bruno'] });
        await evaluate(`(() => {
        const frame = document.querySelector('iframe'); const select = frame.contentDocument.querySelector('select');
        select.value = '1'; select.dispatchEvent(new frame.contentWindow.Event('change', { bubbles: true }));
        frame.contentDocument.querySelector('[data-webrad-id="reload-button"]').click();
      })()`);
        await expect
          .poll(async () =>
            evaluate(
              `document.querySelector('iframe').contentDocument.querySelector('select').options[1]?.text`,
            ),
          )
          .toBe('Ana updated');
        expect(
          await evaluate(
            `(() => { const doc = document.querySelector('iframe').contentDocument; const combo = doc.querySelector('select'); return { value: combo.value, selectedIndex: combo.selectedIndex, selectedKey: doc.querySelector('[data-webrad-id="selected-label"]').textContent }; })()`,
          ),
        ).toEqual({ value: '1', selectedIndex: 1, selectedKey: '1' });
        expect(requestCount).toBe(2);
        if (process.env.WEBRAD_COMBOBOX_SCREENSHOT) {
          await evaluate(
            'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
          );
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            path.resolve(process.env.WEBRAD_COMBOBOX_SCREENSHOT),
            Buffer.from(String(screenshot.data), 'base64'),
          );
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
