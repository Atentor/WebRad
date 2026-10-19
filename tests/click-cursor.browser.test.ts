import { createServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';
import { WEBRAD_COMPONENT_CSS } from '@webrad/runtime';
import { withChromium } from './chromium';

const browserPath = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browserPath !== undefined)(
  'shows the hand cursor for saved clicks in Designer projections and compiled Preview',
  async () => {
    const initial = createProject('ClickCursor');
    let page = initial.pages[0]!;
    const types = ['WebPanel', 'WebLabel', 'WebImage', 'WebButton', 'WebCheckBox', 'WebToggle'];
    for (const [index, type] of types.entries()) {
      const id = `click-${index}`;
      page = addComponent(
        page,
        defaultComponentRegistry.createComponent(type, {
          id,
          name: `Control${index}`,
          parentId: page.rootComponentId,
          x: 10,
          y: 10 + index * 60,
        }),
        page.rootComponentId,
      );
      page = bindComponentEvent(page, id, 'OnClick', 'clicked');
    }
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebLabel', {
        id: 'passive',
        name: 'Passive',
        parentId: page.rootComponentId,
        x: 300,
        y: 10,
      }),
      page.rootComponentId,
    );
    const project = updatePage(initial, page.id, { components: page.components });
    const result = await compileProjectToMemory(project, {
      userSources: {
        [`pages/${page.name}.ts`]: `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  public clicked(): void { document.body.dataset.clicked = String(Number(document.body.dataset.clicked ?? 0) + 1); }
}`,
      },
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    const designer = page.components
      .filter((node) => node.parentId !== null)
      .map((node) => renderToStaticMarkup(createElement(ComponentView, { node, designTime: true })))
      .join('');
    const server = createServer((request, response) => {
      const route = request.url?.slice(1) ?? '';
      response.setHeader(
        'Content-Type',
        route.endsWith('.js')
          ? 'text/javascript'
          : route.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      );
      response.end(
        route === 'designer'
          ? `<style>${WEBRAD_COMPONENT_CSS}</style>${designer}`
          : ((route === '' ? result.previewHtml : result.files[route]) ?? ''),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing cursor server');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      for (const mode of ['designer', ''] as const) {
        await withChromium(browserPath!, `${origin}/${mode}`, async (send) => {
          await expect
            .poll(async () => {
              const ready = await send('Runtime.evaluate', {
                expression: `document.querySelector('[${mode === 'designer' ? 'data-component-id' : 'data-webrad-id'}="passive"]') !== null`,
                returnByValue: true,
              });
              return (ready.result as { value: boolean }).value;
            })
            .toBe(true);
          const evaluated = await send('Runtime.evaluate', {
            expression: `(() => {
              const attr = ${JSON.stringify(mode === 'designer' ? 'data-component-id' : 'data-webrad-id')};
              const cursors = ${JSON.stringify(types)}.map((_, index) => {
                const element = document.querySelector('[' + attr + '="click-' + index + '"]');
                const cursor = getComputedStyle(element).cursor;
                element.dispatchEvent(new Event('click', { bubbles: true }));
                element.setAttribute('aria-disabled', 'true');
                if ('disabled' in element) element.disabled = true;
                const disabled = getComputedStyle(element).cursor;
                return { cursor, disabled };
              });
              return { cursors, passive: getComputedStyle(document.querySelector('[' + attr + '="passive"]')).cursor, clicks: Number(document.body.dataset.clicked) };
            })()`,
            returnByValue: true,
          });
          expect(evaluated.exceptionDetails).toBeUndefined();
          const value = (
            evaluated.result as {
              value: {
                cursors: { cursor: string; disabled: string }[];
                passive: string;
                clicks: number;
              };
            }
          ).value;
          expect(value.cursors.map((entry) => entry.cursor)).toEqual(types.map(() => 'pointer'));
          expect(value.cursors.every((entry) => entry.disabled !== 'pointer')).toBe(true);
          expect(value.passive).not.toBe('pointer');
          if (mode === '') expect(value.clicks).toBe(types.length);
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  60_000,
);
