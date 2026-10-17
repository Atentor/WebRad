import { createServer } from 'node:http';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView } from '@webrad/components';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { findDefaultComponentStyle } from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime';
import { withChromium } from './chromium';
import {
  dataGridToggleProject,
  dataGridToggleRows,
  dataGridToggleSources,
} from './fixtures/data-grid-toggle';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'matches Toggle cell styling in Designer and compiled Preview and preserves readonly grid interaction',
  async () => {
    let preview = '';
    let designer = '';
    const server = createServer((request, response) => {
      if (request.url === '/customers') {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ customers: dataGridToggleRows }));
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end(request.url === '/preview' ? preview : designer);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing grid test port');
    const url = `http://127.0.0.1:${address.port}`;
    try {
      const project = dataGridToggleProject(url);
      const compiled = await compileProjectToMemory(project, {
        userSources: dataGridToggleSources,
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      preview = compiled.previewHtml!;
      const grid = project.pages[0]!.components.find((n) => n.id === 'grid')!;
      const style = findDefaultComponentStyle(project.styles, 'WebDataGrid')!;
      const css = await compileGeneratedAppStyles(
        project.styles,
        project.settings.scrollbar,
        project.settings.colorPalette,
      );
      const markup = renderToStaticMarkup(
        <ComponentView
          node={grid}
          designTime
          styleClassName={resolveComponentStyleClassName(style)}
        />,
      );
      designer = `<!doctype html><style>${css}</style><div style="width:600px;height:200px;margin:20px">${markup}</div><iframe src="/preview" style="width:900px;height:360px;border:0"></iframe>`;
      await withChromium(process.env.WEBRAD_BROWSER_PATH!, url, async (send) => {
        const expressions = [
          'document.querySelector("[data-component-id=grid]")',
          'document.querySelector("iframe").contentDocument.querySelector("[data-webrad-id=grid]")',
        ];
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', { expression, returnByValue: true });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return (result.result as { value?: unknown })?.value;
        };
        await expect
          .poll(() => evaluate(`${expressions[1]}?.querySelectorAll('[role=switch]').length`), {
            timeout: 15_000,
          })
          .toBe(6);
        const read = (expression: string) =>
          evaluate(`(() => {
          const grid = ${expression};
          return [...grid.querySelectorAll('.wr-data-grid-body-row')].slice(0,2).map(row => {
            const e = row.querySelector('[role=switch]'), w = e.ownerDocument.defaultView, s = w.getComputedStyle(e),
              track = w.getComputedStyle(e.querySelector('.wr-toggle-track')), thumb = w.getComputedStyle(e.querySelector('.wr-toggle-thumb')), box = e.getBoundingClientRect();
            return { width: box.width, height: box.height, radius: s.borderRadius, pointer: s.pointerEvents,
              checked: e.getAttribute('aria-checked'), text: e.textContent, background: s.backgroundImage, track: track.backgroundColor, thumb: thumb.backgroundColor };
          });
        })()`);
        const initial = await Promise.all(expressions.map(read));
        expect(initial[0]).toEqual(initial[1]);
        expect(initial[0]).toMatchObject([
          {
            width: 48,
            height: 24,
            radius: '6px',
            pointer: 'none',
            checked: 'true',
            text: '',
            track: 'rgb(37, 99, 235)',
            thumb: 'rgb(255, 255, 255)',
          },
          { checked: 'false', text: '', track: 'rgba(0, 0, 0, 0)' },
        ]);
        // Pointer-events route a real mouse click on the readonly switch into the cell.
        const point = (await evaluate(`(() => {
          const frame = document.querySelector('iframe').getBoundingClientRect(), toggle = ${expressions[1]}.querySelector('[role=switch]').getBoundingClientRect();
          return { x: frame.x + toggle.x + 10, y: frame.y + toggle.y + 10 };
        })()`)) as { x: number; y: number };
        await send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          button: 'left',
          clickCount: 1,
          ...point,
        });
        await send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          button: 'left',
          clickCount: 1,
          ...point,
        });
        expect(await evaluate(`${expressions[1]}.closest('.wr-webpage').dataset.clicked`)).toBe(
          '{"row":0,"kind":"toggle","value":true}',
        );
        expect(
          await evaluate(
            `${expressions[1]}.querySelector('[role=switch]').getAttribute('aria-checked')`,
          ),
        ).toBe('true');
        for (const expression of expressions)
          await evaluate(
            `${expression}.ownerDocument.documentElement.style.setProperty('--wr-palette-aurora-blue', '#123456')`,
          );
        await new Promise((resolve) => setTimeout(resolve, 240));
        const linked = await Promise.all(expressions.map(read));
        expect(linked[0]).toEqual(linked[1]);
        expect(linked[0]).toMatchObject([{ track: 'rgb(18, 52, 86)' }, {}]);
        expect(await evaluate(`${expressions[1]}.textContent.includes('Ignored caption')`)).toBe(
          false,
        );
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60_000,
);
