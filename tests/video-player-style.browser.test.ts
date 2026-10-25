import { createServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView } from '@webrad/components';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import {
  addComponent,
  applyDefaultComponentStyle,
  createProject,
  findDefaultComponentStyle,
  updatePage,
} from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime/visual';
import { withChromium } from './chromium';
const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined)(
  'renders linked Aurora video styling and interaction states equally in Designer and compiled Preview',
  async () => {
    let project = createProject('AuroraVideo');
    let page = project.pages[0]!;
    const style = findDefaultComponentStyle(project.styles, 'WebVideoPlayer')!;
    const player = applyDefaultComponentStyle(
      defaultComponentRegistry.createComponent('WebVideoPlayer', {
        id: 'video',
        name: 'VideoPlayer1',
        parentId: page.rootComponentId,
        x: 20,
        y: 20,
      }),
      project.styles,
    );
    page = addComponent(page, player, page.rootComponentId);
    project = updatePage(project, page.id, page);
    const compiled = await compileProjectToMemory(project, {
      userSources: {
        'pages/index.ts': `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {}`,
      },
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.themes,
    );
    const designer = renderToStaticMarkup(
      createElement(ComponentView, {
        node: player,
        designTime: true,
        styleClassName: resolveComponentStyleClassName(style),
      }),
    );
    const server = createServer((request, response) => {
      const preview = request.url === '/index.html';
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        preview
          ? compiled.previewHtml!
          : `<!doctype html><html><head><style>${css}</style></head><body>
<div style="width:480px;height:270px">${designer}</div>
<iframe title="Preview" src="/index.html" style="width:600px;height:400px;border:0"></iframe>
</body></html>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing style test port.');
    try {
      await withChromium(browser!, `http://127.0.0.1:${address.port}/`, async (send) => {
        const elements = [
          'document.querySelector("[data-component-id=video]")',
          'document.querySelector("iframe").contentDocument.querySelector("[data-webrad-id=video]")',
        ];
        await expect
          .poll(
            async () => {
              const result = await send('Runtime.evaluate', {
                expression: `Boolean(${elements[1]})`,
                returnByValue: true,
              });
              return (
                result.result as {
                  value?: boolean;
                }
              )?.value;
            },
            { timeout: 20000 },
          )
          .toBe(true);
        await send('DOM.enable');
        await send('CSS.enable');
        await send('DOM.getDocument', { depth: -1, pierce: true });
        const paints: Record<string, unknown>[][] = [];
        for (const expression of elements) {
          const object = await send('Runtime.evaluate', { expression });
          const node = await send('DOM.requestNode', {
            objectId: (
              object.result as {
                objectId: string;
              }
            ).objectId,
          });
          const read = async (): Promise<Record<string, unknown>> => {
            const result = await send('Runtime.evaluate', {
              expression: `(() => {
const element = ${expression};
const css = getComputedStyle(element);
return Object.fromEntries(['backgroundImage', 'color', 'borderRadius', 'borderTopWidth',
  'fontFamily', 'objectFit', 'objectPosition', 'boxShadow', 'opacity'].map(key => [key, css[key]]));
})()`,
              returnByValue: true,
            });
            return (
              result.result as {
                value: Record<string, unknown>;
              }
            ).value;
          };
          const base = await read();
          await send('CSS.forcePseudoState', {
            nodeId: node.nodeId,
            forcedPseudoClasses: ['hover'],
          });
          await new Promise((resolve) => setTimeout(resolve, 250));
          const hover = await read();
          await send('CSS.forcePseudoState', {
            nodeId: node.nodeId,
            forcedPseudoClasses: ['focus-within'],
          });
          await new Promise((resolve) => setTimeout(resolve, 250));
          const focus = await read();
          await send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] });
          await send('Runtime.evaluate', {
            expression: `${expression}.setAttribute('aria-disabled', 'true')`,
          });
          await new Promise((resolve) => setTimeout(resolve, 250));
          const disabled = await read();
          await send('Runtime.evaluate', {
            expression: `${expression}.ownerDocument.documentElement.style.setProperty('--wr-palette-aurora-ink', '#123456')`,
          });
          const linked = await read();
          expect(base.borderRadius).toBe('6px');
          expect(base.borderTopWidth).toBe('1px');
          expect(base.objectFit).toBe('contain');
          expect(hover.boxShadow).not.toBe(base.boxShadow);
          expect(focus.boxShadow).not.toBe(hover.boxShadow);
          expect(disabled.opacity).toBe('0.6');
          expect(disabled.boxShadow).not.toBe(base.boxShadow);
          expect(
            String(disabled.boxShadow)
              .split('), ')
              .every((shadow) => shadow.endsWith('0px 0px 0px 0px')),
          ).toBe(true);
          expect(linked.backgroundImage).toContain('rgb(18, 52, 86)');
          expect(linked.backgroundImage).not.toBe(base.backgroundImage);
          paints.push([base, hover, focus, disabled, linked]);
        }
        expect(paints[0]).toEqual(paints[1]);
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60000,
);
