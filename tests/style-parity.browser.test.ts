import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { compileProjectToMemory, compileTailwindStyles } from '@webrad/compiler';
import {
  addComponent,
  addComponentStyle,
  createComponentStyle,
  createProject,
  setComponentStyle,
  updatePage,
} from '@webrad/project-model';
import { DesignerSurface } from '../apps/ide/renderer/src/components/DesignerSurface';

const browserPath = process.env.WEBRAD_BROWSER_PATH;
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

function attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

// Opt in with WEBRAD_BROWSER_PATH pointing to a Chromium/Chrome/Edge executable.
// jsdom does not implement the CSS layer cascade used by the Designer and Preview.
it.runIf(browserPath !== undefined)(
  'matches real Designer and compiled Preview styles across themes, viewports and zoom',
  async () => {
    let project = createProject('StyleParity', { pageWidth: 1280, pageHeight: 400 });
    let page = project.pages[0];
    if (page === undefined) throw new Error('Missing page.');
    for (const [index, type] of [
      'WebButton',
      'WebButton',
      'WebEdit',
      'WebLabel',
      'WebButton',
    ].entries()) {
      page = addComponent(
        page,
        defaultComponentRegistry.createComponent(type, {
          id: `control-${String(index)}`,
          name: `Control${String(index)}`,
          parentId: page.rootComponentId,
          x: 24,
          y: 24 + index * 64,
          props: {
            ...(type === 'WebButton' ? { caption: 'Button text', enabled: index !== 4 } : {}),
            margin: 8 + index,
            marginTop: 1 + index,
            marginRight: 12 + index,
            marginBottom: 3 + index,
            marginLeft: 4 + index,
          },
        }),
        page.rootComponentId,
      );
    }
    const explicitStyle = createComponentStyle('Explicit typography', 'WebButton', {
      states: {
        base: { fontSize: { value: 22, unit: 'px' }, lineHeight: { value: 28, unit: 'px' } },
      },
    });
    project = addComponentStyle(project, explicitStyle);
    const panelStyle = createComponentStyle('Inherited typography', 'WebPanel', {
      states: {
        base: {
          fontSize: { value: 20, unit: 'px' },
          lineHeight: { value: 30, unit: 'px' },
          fontFamily: 'serif',
        },
      },
    });
    project = addComponentStyle(project, panelStyle);
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebPanel', {
        id: 'panel',
        name: 'Panel',
        parentId: page.rootComponentId,
        x: 200,
        y: 24,
      }),
      page.rootComponentId,
    );
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebButton', {
        id: 'control-5',
        name: 'Control5',
        parentId: 'panel',
        x: 8,
        y: 8,
        props: { caption: 'Inherited text', margin: 6 },
      }),
      'panel',
    );
    page = {
      ...page,
      components: page.components.map((node) =>
        node.id === page?.rootComponentId
          ? {
              ...node,
              layout: {
                ...node.layout,
                container: { ...node.layout.container, mode: 'row', gap: 7 },
              },
            }
          : node,
      ),
    };
    project = updatePage(project, page.id, page);
    project = setComponentStyle(project, page.id, 'control-1', null);
    project = setComponentStyle(project, page.id, 'control-4', explicitStyle.id);
    project = setComponentStyle(project, page.id, 'panel', panelStyle.id);
    project = setComponentStyle(project, page.id, 'control-5', null);
    page = project.pages[0];
    if (page === undefined) throw new Error('Missing styled page.');
    const compiled = await compileProjectToMemory(project, { userSources: {} });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    if (compiled.previewHtml === undefined) throw new Error('Missing compiled Preview.');
    const css = await compileTailwindStyles(project.styles);
    const chromeCss = (
      await Promise.all(
        ['theme.css', 'layout.css', 'designer-chrome.css'].map((file) =>
          fs.readFile(path.join(repositoryRoot, 'apps/ide/renderer/src', file), 'utf8'),
        ),
      )
    ).join('\n');
    const noop = (): void => {};
    const fixtures: string[] = [];
    for (const theme of ['dark', 'light']) {
      for (const [viewportName, width] of [
        ['desktop', 1280],
        ['tablet', 768],
        ['mobile', 390],
      ] as const) {
        for (const zoom of [75, 100]) {
          const designer = renderToStaticMarkup(
            createElement(DesignerSurface, {
              page,
              styles: project.styles,
              settings: { ...project.settings, showGrid: false },
              viewportName,
              showToolbar: false,
              compiledStylesCss: css,
              selectedIds: [],
              selectedPaletteType: null,
              zoom,
              onSelect: noop,
              onAddComponent: noop,
              onMoveComponents: noop,
              onResizeComponent: noop,
              onDeleteSelection: noop,
              onCopy: noop,
              onPaste: noop,
              onUndo: noop,
              onRedo: noop,
              onBringToFront: noop,
              onSendToBack: noop,
              onZoomChange: noop,
            }),
          );
          fixtures.push(`<section data-case="${theme}/${viewportName}/${String(zoom)}" data-theme="${theme}" data-zoom="${String(zoom)}">
            ${designer}<iframe title="Compiled Preview" width="${String(width)}" height="400"
              srcdoc="${attribute(compiled.previewHtml)}"></iframe></section>`);
        }
      }
    }
    const html = `<!doctype html><html><head><style>${chromeCss}</style></head>
      <body><button id="ide-button">IDE control</button>${fixtures.join('\n')}</body></html>`;
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing server port.');
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-style-browser-'));
    const child = spawn(
      browserPath as string,
      [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    let socket: WebSocket | undefined;
    try {
      const deadline = Date.now() + 20_000;
      let port = '';
      while (!port && Date.now() < deadline) {
        port =
          (
            await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '')
          ).split('\n')[0] ?? '';
        if (!port) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!port) throw new Error('Browser did not start its debugging endpoint.');
      const targets = (await (
        await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5_000) })
      ).json()) as {
        webSocketDebuggerUrl: string;
        type: string;
      }[];
      const target = targets.find((entry) => entry.type === 'page');
      if (target === undefined) throw new Error('Missing browser page.');
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Browser WebSocket connection timed out.')),
          5_000,
        );
        socket?.addEventListener(
          'open',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        socket?.addEventListener(
          'error',
          (event) => {
            clearTimeout(timeout);
            reject(event);
          },
          { once: true },
        );
      });
      let sequence = 0;
      const pending = new Map<
        number,
        { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
      >();
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message: string };
        };
        if (message.id === undefined) return;
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request?.reject(new Error(message.error.message));
        else request?.resolve(message.result ?? {});
      });
      const send = (
        method: string,
        params: Record<string, unknown> = {},
      ): Promise<Record<string, unknown>> => {
        const id = ++sequence;
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`Browser command timed out: ${method}`));
          }, 10_000);
          pending.set(id, {
            resolve: (result) => {
              clearTimeout(timeout);
              resolve(result);
            },
            reject: (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          });
          socket?.send(JSON.stringify({ id, method, params }));
        });
      };
      await send('Page.navigate', { url: `http://127.0.0.1:${String(address.port)}/` });
      let loaded = false;
      while (!loaded && Date.now() < deadline) {
        const readiness = await send('Runtime.evaluate', {
          expression: `document.querySelectorAll('iframe').length === 12 && [...document.querySelectorAll('iframe')].every(frame => frame.contentDocument?.querySelector('[data-webrad-id="control-0"]'))`,
          returnByValue: true,
        });
        loaded = (readiness.result as { value?: boolean } | undefined)?.value === true;
        if (!loaded) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(loaded).toBe(true);
      const comparison = await send('Runtime.evaluate', {
        expression: `(() => {
          const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textRendering', 'webkitFontSmoothing', 'color', 'backgroundColor', 'backgroundImage', 'borderRadius', 'borderWidth', 'padding', 'gap'];
          const failures = [];
          const sizes = [];
          for (const fixture of document.querySelectorAll('[data-case]')) {
            const frame = fixture.querySelector('iframe');
            const designerFirst = fixture.querySelector('[data-component-id="control-0"]');
            const designerSecond = fixture.querySelector('[data-component-id="control-1"]');
            const runtimeFirst = frame.contentDocument.querySelector('[data-webrad-id="control-0"]');
            const runtimeSecond = frame.contentDocument.querySelector('[data-webrad-id="control-1"]');
            const designerGap = (designerSecond.getBoundingClientRect().left - designerFirst.getBoundingClientRect().right) / (fixture.dataset.zoom / 100);
            const runtimeGap = runtimeSecond.getBoundingClientRect().left - runtimeFirst.getBoundingClientRect().right;
            if (Math.abs(runtimeGap - 24) > 0.1 || Math.abs(designerGap - runtimeGap) > 0.1) failures.push({ case: fixture.dataset.case, designerGap, runtimeGap });
            for (let index = 0; index < 6; index++) {
              const id = 'control-' + index;
              const designer = fixture.querySelector('.wr-component[data-component-id="' + id + '"]');
              const runtime = frame.contentDocument.querySelector('[data-webrad-id="' + id + '"]');
              const left = getComputedStyle(designer);
              const right = frame.contentWindow.getComputedStyle(runtime);
              const host = designer.parentElement;
              for (const property of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
                if (getComputedStyle(host)[property] !== right[property]) failures.push({ case: fixture.dataset.case, id, property, designer: getComputedStyle(host)[property], preview: right[property] });
              }
              for (const property of properties) {
                if (left[property] !== right[property]) failures.push({ case: fixture.dataset.case, id, property, designer: left[property], preview: right[property] });
              }
              sizes.push([fixture.dataset.case, id, left.fontSize]);
              if (left.fontSize !== (index === 4 ? '22px' : index === 5 ? '20px' : '16px')) failures.push({ id, unexpectedFontSize: left.fontSize });
              const text = designer.querySelector('[data-webrad-text-content]');
              const runtimeText = runtime.querySelector('[data-webrad-text-content]');
              if (text && runtimeText && getComputedStyle(text).fontSize !== frame.contentWindow.getComputedStyle(runtimeText).fontSize) failures.push({ id, text: 'caption font mismatch' });
            }
          }
          return { failures, sizes, ideFontSize: getComputedStyle(document.querySelector('#ide-button')).fontSize };
        })()`,
        returnByValue: true,
      });
      const evidence = (
        comparison.result as {
          value: { failures: unknown[]; sizes: unknown[]; ideFontSize: string };
        }
      ).value;
      expect(evidence.failures, JSON.stringify(evidence.failures, null, 2)).toEqual([]);
      expect(evidence.sizes).toHaveLength(72);
      expect(evidence.ideFontSize).toBe('12px');
      await send('Browser.close');
    } finally {
      socket?.close();
      child.kill();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  },
  120_000,
);
