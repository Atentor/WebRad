import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView, SharedComponentStyles } from '@webrad/components';
import { compileProjectToMemory, compileTailwindStyles } from '@webrad/compiler';
import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';
import { resolveComponentStyleClassName } from '@webrad/runtime/visual';
import { withChromium } from './chromium';
import { fontProject } from './fixtures/fonts';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'loads real fonts with accents, bold and italic in Designer, compiled Preview and static export without external font access',
  async () => {
    const project = fontProject();
    const compiled = await compileProjectToMemory(project, { userSources: {}, minify: true });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const designerCss = await compileTailwindStyles(project.styles);
    const nodes = project.pages[0]!.components.filter((node) => node.type === 'WebLabel');
    const markup = renderToStaticMarkup(
      <>
        <SharedComponentStyles />
        {nodes.map((node) => (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: node.bounds.x,
              top: node.bounds.y,
              width: node.bounds.width,
              height: node.bounds.height,
            }}
          >
            <ComponentView
              node={node}
              designTime
              styleClassName={resolveComponentStyleClassName(
                project.styles.find((style) => style.id === node.styleId),
              )}
            />
          </div>
        ))}
      </>,
    );
    const server = createServer((request, response) => {
      // Only embedded font binaries are permitted, including in Preview/export frames.
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src data:; img-src 'self' data:; connect-src 'none'",
      );
      if (request.url?.startsWith('/export/')) {
        const file = request.url.slice('/export/'.length);
        const content = compiled.files[file];
        response.setHeader(
          'Content-Type',
          file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.js')
              ? 'application/javascript'
              : 'text/html',
        );
        response.writeHead(content === undefined ? 404 : 200);
        response.end(content ?? 'Missing artifact');
      } else {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          request.url === '/preview'
            ? compiled.previewHtml
            : `<!doctype html><html><head><style>${designerCss}
          body { margin:0;display:flex;font-family:sans-serif;background:white;color:#111827 }
          section { position:relative;flex:none;width:620px;height:820px } iframe { width:620px;height:820px;border:0 }
          header { position:relative;padding:8px;font-size:20px }
          </style></head><body><section><header>Designer</header><div id="designer" style="position:relative">${markup}</div></section><section><header>Preview</header><iframe id="preview" src="/preview"></iframe></section><section><header>Export</header><iframe id="export" src="/export/index.html"></iframe></section></body></html>`,
        );
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Missing server port.');
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          const evaluate = async (expression: string): Promise<unknown> => {
            const response = await send('Runtime.evaluate', {
              expression,
              awaitPromise: true,
              returnByValue: true,
            });
            if (response.exceptionDetails)
              throw new Error(JSON.stringify(response.exceptionDetails));
            return (response.result as { value?: unknown }).value;
          };
          await expect
            .poll(
              () =>
                evaluate(
                  `['preview','export'].every(id => document.getElementById(id)?.contentDocument?.querySelectorAll('[data-webrad-id]').length >= 25)`,
                ),
              { timeout: 20_000 },
            )
            .toBe(true);
          const families = JSON.stringify(WEBRAD_FONT_FAMILIES);
          const results = await evaluate(`(async () => {
          const results = [];
          for (const surface of ['designer', 'preview', 'export']) {
            const doc = surface === 'designer' ? document : document.getElementById(surface).contentDocument;
            for (const font of ${families}) {
              for (const variant of ['regular', 'bold', 'italic']) {
                const id = font.id + '-' + variant;
                const element = doc.querySelector('[' + (surface === 'designer' ? 'data-component-id' : 'data-webrad-id') + '="' + id + '"]');
                if (!element) throw new Error('Missing ' + surface + '/' + id);
                const style = doc.defaultView.getComputedStyle(element);
                const faces = await doc.fonts.load(style.fontStyle + ' ' + style.fontWeight + ' 16px "' + font.label + '"', 'Ação, café, João Āă');
                results.push({ surface, id, family:style.fontFamily, weight:style.fontWeight, style:style.fontStyle,
                  loaded:faces.length, allLoaded:faces.every(face => face.status === 'loaded'),
                  matching:faces.every(face => face.family.replace(/['"]/g, '') === font.label),
                  fontNetworkRequests:performance.getEntriesByType('resource').filter(entry => /^https?:/.test(entry.name) && /\\.woff2?($|\\?)/.test(entry.name)).length });
              }
            }
            await doc.fonts.ready;
          }
          return results;
        })()`);
          expect(Array.isArray(results)).toBe(true);
          const samples = results as {
            surface: string;
            id: string;
            family: string;
            weight: string;
            style: string;
            loaded: number;
            allLoaded: boolean;
            matching: boolean;
            fontNetworkRequests: number;
          }[];
          expect(samples).toHaveLength(72);
          for (const font of WEBRAD_FONT_FAMILIES) {
            for (const variant of ['regular', 'bold', 'italic']) {
              const matching = samples.filter((sample) => sample.id === `${font.id}-${variant}`);
              expect(matching).toHaveLength(3);
              for (const sample of matching) {
                expect(sample.family.replaceAll(/['"]/gu, '')).toBe(
                  `${font.label}, ${font.fallback}`,
                );
                expect(sample).toMatchObject({
                  weight: variant === 'bold' ? '700' : '400',
                  style: variant === 'italic' ? 'italic' : 'normal',
                  allLoaded: true,
                  matching: true,
                  fontNetworkRequests: 0,
                });
                // The sample exercises both the Latin and Latin Extended subsets.
                expect(sample.loaded).toBeGreaterThanOrEqual(2);
              }
            }
          }
          await fs.mkdir('out/fonts-review', { recursive: true });
          await fs.writeFile('out/fonts-review/results.json', JSON.stringify(samples, null, 2));
          await send('Emulation.setDeviceMetricsOverride', {
            width: 1860,
            height: 820,
            deviceScaleFactor: 1,
            mobile: false,
          });
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            'out/fonts-review/designer-preview-export.png',
            Buffer.from(screenshot.data as string, 'base64'),
          );
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  90_000,
);
