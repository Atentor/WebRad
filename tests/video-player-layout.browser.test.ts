import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
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
const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined)(
  'keeps video ratios in real Designer and compiled Preview at responsive widths',
  async () => {
    let project = createProject('VideoRatios', { pageWidth: 960, pageHeight: 7000 });
    // Neutral container padding makes both hosts expose the same content width.
    project = {
      ...project,
      styles: project.styles.map((style) =>
        style.componentType === 'WebPanel'
          ? {
              ...style,
              states: {
                ...style.states,
                base: {
                  ...style.states.base,
                  paddingTop: { value: 0, unit: 'px' },
                  paddingRight: { value: 0, unit: 'px' },
                  paddingBottom: { value: 0, unit: 'px' },
                  paddingLeft: { value: 0, unit: 'px' },
                },
              },
            }
          : style,
      ),
    };
    let page = project.pages[0]!;
    for (const [index, mode] of (
      ['fixed', 'align-to-parent', 'row', 'column'] as const
    ).entries()) {
      const panel = defaultComponentRegistry.createComponent('WebPanel', {
        id: mode,
        name: `Panel${index}`,
        parentId: page.rootComponentId,
        x: 10,
        y: index * 1700,
        height: 1600,
      });
      page = addComponent(
        page,
        {
          ...panel,
          styleId: project.styles.find((style) => style.componentType === 'WebPanel')!.id,
          layout: {
            ...panel.layout,
            item: { ...panel.layout.item, width: 'stretch', right: 10 },
            container: { ...panel.layout.container, mode, alignItems: 'stretch' },
          },
        },
        page.rootComponentId,
      );
      for (const [offset, aspectRatio] of ['16:9', '9:16', 'none'].entries()) {
        const player = defaultComponentRegistry.createComponent('WebVideoPlayer', {
          id: `${mode}${offset}`,
          name: `Video${index}${offset}`,
          parentId: mode,
          x: 5,
          y: offset * 400,
          height: 123,
          props: { aspectRatio },
        });
        page = addComponent(
          page,
          {
            ...player,
            styleId: project.styles.find((style) => style.componentType === 'WebVideoPlayer')!.id,
            layout: {
              ...player.layout,
              item: {
                ...player.layout.item,
                width: 'stretch',
                shrink: false,
                right: 5,
                left: 5,
                top: offset * 400,
              },
            },
          },
          mode,
        );
      }
    }
    for (const [offset, name] of ['Portrait', 'Landscape', 'Free'].entries()) {
      page = addComponent(
        page,
        defaultComponentRegistry.createComponent('WebButton', {
          id: name,
          name: `${name}Button`,
          parentId: page.rootComponentId,
          x: offset * 100,
          y: 6800,
        }),
        page.rootComponentId,
      );
      page = bindComponentEvent(page, name, 'OnClick', name);
    }
    project = deserializeProject(serializeProject(updatePage(project, page.id, page)));
    const compiled = await compileProjectToMemory(project, {
      userSources: {
        'pages/index.ts': `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {
  public Portrait(): void { Video02.aspectRatio = '9:16'; }
  public Landscape(): void { this.Video02.aspectRatio = '16:9'; }
  public Free(): void { Video02.aspectRatio = 'none'; }
}`,
      },
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const bundle = await build({
      entryPoints: [
        fileURLToPath(new URL('./fixtures/video-player-layout-browser.tsx', import.meta.url)),
      ],
      bundle: true,
      write: false,
      outdir: 'bundle',
      platform: 'browser',
      format: 'esm',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const projectCss = await compileTailwindStyles(project.styles);
    const routes: Record<string, [string, string]> = {
      '/app.js': [
        'text/javascript',
        bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text,
      ],
      '/app.css': ['text/css', bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text],
      '/project.css': ['text/css', projectCss],
      '/project': ['application/json', JSON.stringify(project)],
      '/index.html': ['text/html', compiled.previewHtml!],
    };
    const server = createServer((request, response) => {
      const [type, body] = routes[request.url ?? ''] ?? [
        'text/html',
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"><style>body{margin:0}#root{width:1000px;height:7000px}iframe{border:0;width:960px;height:7000px}</style></head><body><div id="root"></div><iframe title="Preview" src="/index.html"></iframe><script type="module" src="/app.js"></script></body></html>',
      ];
      response.writeHead(200, { 'Content-Type': type });
      response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing browser test port.');
    try {
      await withChromium(browser!, `http://127.0.0.1:${address.port}/`, async (send) => {
        let evidence:
          | {
              passed: boolean;
              cases: number;
              error?: string;
            }
          | undefined;
        await expect
          .poll(
            async () => {
              const result = await send('Runtime.evaluate', {
                expression: 'document.body.dataset.evidence',
                returnByValue: true,
              });
              const value = (
                result.result as {
                  value?: string;
                }
              )?.value;
              if (value) evidence = JSON.parse(value) as typeof evidence;
              return evidence !== undefined;
            },
            { timeout: 20000 },
          )
          .toBe(true);
        expect(evidence?.passed, evidence?.error).toBe(true);
        expect(evidence?.cases).toBe(39);
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60000,
);
