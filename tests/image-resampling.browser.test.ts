import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { compileProjectToMemory, compileTailwindStyles } from '@webrad/compiler';
import {
  addComponent,
  bindComponentEvent,
  createProject,
  deserializeProject,
  serializeProject,
  updatePage,
} from '@webrad/project-model';
import { withChromium } from './chromium';
const browserPath = process.env.WEBRAD_BROWSER_PATH;
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
it.runIf(browserPath !== undefined)(
  'resamples real Designer and compiled Preview images while preserving sharp edges and runtime APIs',
  async () => {
    const pixels = Buffer.alloc(256 * 256 * 4);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const index = (y * 256 + x) * 4;
        const color = x < 128 ? ((x + y) % 2) * 255 : y < 128 ? 0 : 255;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = color;
        pixels[index + 3] = 255;
      }
    }
    const pattern = await sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } })
      .png()
      .toBuffer();
    const red = await sharp({
      create: { width: 256, height: 256, channels: 4, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const rectangular = await sharp({
      create: { width: 300, height: 173, channels: 4, background: '#167acc' },
    })
      .png()
      .toBuffer();
    const remote = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(pattern);
    });
    await new Promise<void>((resolve) => remote.listen(0, '127.0.0.1', resolve));
    const remoteAddress = remote.address();
    if (remoteAddress === null || typeof remoteAddress === 'string')
      throw new Error('Missing remote port.');
    let project = createProject('ImageResampling', { pageWidth: 580, pageHeight: 430 });
    let page = project.pages[0]!;
    for (const [index, id] of [
      'image',
      'contain',
      'cover',
      'fill',
      'native',
      'vector',
      'animated',
      'remote',
      'none',
      'rectangular',
      'empty-image',
      'empty-user',
    ].entries()) {
      const node = defaultComponentRegistry.createComponent('WebImage', {
        id,
        name: id === 'image' ? 'Image1' : `Sample${String(index)}`,
        parentId: page.rootComponentId,
        x: 12 + (index % 4) * 130,
        y: 12 + Math.floor(index / 4) * 130,
        props: {
          src: id.startsWith('empty-')
            ? null
            : id === 'vector'
              ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"%3E%3Cpath d="M0 256L256 0" stroke="blue"/%3E%3C/svg%3E'
              : id === 'animated'
                ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                : id === 'remote'
                  ? `http://127.0.0.1:${String(remoteAddress.port)}/remote.png`
                  : id === 'rectangular'
                    ? '/rectangular.png'
                    : '/pattern.png',
          alt: id,
          placeholder: id === 'empty-user' ? 'user' : 'image',
          objectFit: ['contain', 'cover', 'fill', 'none'].includes(id) ? id : 'contain',
        },
      });
      page = addComponent(
        page,
        {
          ...node,
          bounds: {
            ...node.bounds,
            width: id === 'native' ? 258 : 66,
            height: id === 'native' ? 258 : ['contain', 'cover', 'fill'].includes(id) ? 50 : 66,
          },
        },
        page.rootComponentId,
      );
    }
    for (const [id, name, caption, handler, x] of [
      ['resize', 'ResizeButton', 'Resize', 'ResizeClick', 12],
      ['replace', 'ReplaceButton', 'Replace', 'ReplaceClick', 140],
    ] as const) {
      page = addComponent(
        page,
        defaultComponentRegistry.createComponent('WebButton', {
          id,
          name,
          parentId: page.rootComponentId,
          x,
          y: 370,
          props: { caption },
        }),
        page.rootComponentId,
      );
      page = bindComponentEvent(page, id, 'OnClick', handler);
    }
    project = updatePage(project, page.id, page);
    project = deserializeProject(serializeProject(project));
    expect(
      project.pages[0]!.components.find((node) => node.id === 'empty-user')?.props,
    ).toMatchObject({ src: null, placeholder: 'user' });
    const compiled = await compileProjectToMemory(project, {
      userSources: {
        'pages/index.ts': `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {
  public ResizeClick(): void { this.Image1.width = 130; Image1.height = 130; }
  public ReplaceClick(): void {
    this.Image1.src = '/red.png';
    this.Sample11.placeholder = 'image';
    Sample11.src = null;
  }
}`,
      },
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const bundle = await build({
      entryPoints: [path.join(repositoryRoot, 'tests/fixtures/image-resampling-browser.tsx')],
      bundle: true,
      write: false,
      outdir: 'bundle',
      platform: 'browser',
      format: 'esm',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const javascript = bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
    const css = bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text;
    const projectCss = await compileTailwindStyles(project.styles);
    const server = createServer((request, response) => {
      const route = request.url;
      const content =
        route === '/app.js'
          ? javascript
          : route === '/app.css'
            ? css
            : route === '/project.css'
              ? projectCss
              : route === '/project'
                ? JSON.stringify(project)
                : route === '/index.html'
                  ? compiled.previewHtml
                  : route === '/pattern.png'
                    ? pattern
                    : route === '/red.png'
                      ? red
                      : route === '/rectangular.png'
                        ? rectangular
                        : '<!doctype html><html><head><link rel="stylesheet" href="/app.css"><style>body{margin:0;display:flex;gap:16px;background:white}#root{width:600px;height:440px}iframe{border:0;width:600px;height:440px}</style></head><body><div id="root"></div><iframe title="Compiled Preview" src="/index.html"></iframe><script type="module" src="/app.js"></script></body></html>';
      response.writeHead(200, {
        'Content-Type': route?.endsWith('.js')
          ? 'text/javascript'
          : route?.endsWith('.css')
            ? 'text/css'
            : route?.endsWith('.png')
              ? 'image/png'
              : route === '/project'
                ? 'application/json'
                : 'text/html',
      });
      response.end(content);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing server port.');
    try {
      await withChromium(
        browserPath!,
        `http://127.0.0.1:${String(address.port)}/`,
        async (send) => {
          let encoded: string | undefined;
          const deadline = Date.now() + 20000;
          while (!encoded && Date.now() < deadline) {
            const result = await send('Runtime.evaluate', {
              expression: 'document.body.dataset.evidence',
              returnByValue: true,
            });
            encoded = (
              result.result as
                | {
                    value?: string;
                  }
                | undefined
            )?.value;
            if (!encoded) await new Promise((resolve) => setTimeout(resolve, 100));
          }
          if (process.env.WEBRAD_IMAGE_SCREENSHOT) {
            const screenshot = await send('Page.captureScreenshot', { format: 'png' });
            await fs.writeFile(
              process.env.WEBRAD_IMAGE_SCREENSHOT,
              Buffer.from(screenshot.data as string, 'base64'),
            );
          }
          expect(encoded, 'Browser did not finish image interactions.').toBeDefined();
          const evidence = JSON.parse(decodeURIComponent(encoded!)) as {
            passed: boolean;
            error?: string;
            cases: number;
          };
          expect(evidence.passed, evidence.error).toBe(true);
          expect(evidence.cases).toBe(12);
          await send('Emulation.setDeviceMetricsOverride', {
            width: 1280,
            height: 700,
            deviceScaleFactor: 2,
            mobile: false,
          });
          await new Promise((resolve) => setTimeout(resolve, 300));
          const density = await send('Runtime.evaluate', {
            expression: `(async () => {
              const dimensions = async image => {
                const svg = new DOMParser().parseFromString(await (await fetch(image.currentSrc)).text(), 'image/svg+xml');
                const bitmap = new Image(); bitmap.src = svg.querySelector('image').getAttribute('href'); await bitmap.decode();
                return [bitmap.naturalWidth, bitmap.naturalHeight];
              };
              return { cover: await dimensions(document.querySelector('[data-component-id="cover"]')),
                contain: await dimensions(document.querySelector('[data-component-id="contain"]')),
                rectangular: await dimensions(document.querySelector('[data-component-id="rectangular"]')),
                native: !document.querySelector('[data-component-id="image"]').hasAttribute('srcset') };
            })()`,
            awaitPromise: true,
            returnByValue: true,
          });
          expect(
            (
              density.result as {
                value?: unknown;
              }
            ).value,
          ).toEqual({
            cover: [128, 128],
            contain: [96, 96],
            rectangular: [128, 74],
            native: true,
          });
        },
      );
    } finally {
      for (const active of [server, remote]) {
        active.closeAllConnections();
        await new Promise<void>((resolve) => active.close(() => resolve()));
      }
    }
  },
  60000,
);
