import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { expect, it, vi, afterEach } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView, ProjectAssetsContext } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import { createReusableElement, parseProject, serializeProject } from '@webrad/project-model';
import { type WebPanel, projectPanelBackground, runtimeComponentRegistry } from '@webrad/runtime';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import {
  panelBackgroundProject,
  panelBackgroundUserSources,
  panelAsset,
  panelImage,
} from './fixtures/panel-background';

afterEach(() => vi.unstubAllGlobals());

it('persists Panel configuration and projects imported assets without modifying authored paths', () => {
  const project = panelBackgroundProject();
  const panel = project.pages[0]!.components.find((node) => node.id === 'panel')!;
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  expect(
    defaultComponentRegistry.require('WebGroup').properties.map((property) => property.name),
  ).not.toContain('backgroundImage');
  const dom = new JSDOM(
    renderToStaticMarkup(
      <ProjectAssetsContext.Provider value={project.assets!}>
        <ComponentView node={panel} designTime styleClassName="custom-panel">
          <span>Child</span>
        </ComponentView>
      </ProjectAssetsContext.Provider>,
    ),
  );
  const element = dom.window.document.querySelector('section')!;
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  expect(element.style.getPropertyValue('--wr-panel-background-image')).toContain(
    `data:${panelAsset.mediaType};base64,${panelAsset.base64}`,
  );
  expect(element.style.backgroundSize).toBe('cover, auto');
  expect(element.style.backgroundRepeat).toBe('no-repeat, no-repeat');
  expect(element.textContent).toBe('Child');
  expect(panel.props.backgroundImage).toBe(panelImage);
  const instance = runtimeComponentRegistry.create(dom.window.document, panel) as WebPanel;
  expect(instance.backgroundImage).toBe(panelImage);
  instance.backgroundSize = 'stretch';
  instance.backgroundPosition = 'right bottom';
  instance.backgroundRepeat = 'repeat-x';
  expect(instance.element.style.backgroundSize).toBe('100% 100%');
  expect(instance.element.style.backgroundPosition).toBe('right bottom');
  expect(instance.element.style.backgroundRepeat).toBe('repeat-x');
  instance.backgroundImage = '';
  expect(instance.element.style.backgroundImage).toBe('');
  expect(instance.element.style.backgroundSize).toBe('');
  instance.backgroundImage = panelImage;
  expect(instance.element.style.backgroundSize).toBe('100% 100%');
  const older = { ...panel, props: { caption: 'Old panel' } };
  expect(
    runtimeComponentRegistry.create(dom.window.document, older).element.style.backgroundImage,
  ).toBe('');
  dom.window.close();
});

it('quotes URLs as CSS data and normalizes invalid stored options', () => {
  const projected = projectPanelBackground({
    backgroundImage: 'image"\\\n.png',
    backgroundSize: 'bad',
    backgroundRepeat: 'bad',
    backgroundPosition: 'bad',
  });
  expect(projected).toMatchObject({
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  });
  expect(projected.backgroundImage).toBe('url("image\\22 \\5c \\a .png")');
  expect(projectPanelBackground({ backgroundImage: '   ' }).backgroundImage).toBe('');
});

it.each([false, true])(
  'provides typed Panel background completion and invalid-use diagnostics in reusable=%s',
  (reusable) => {
    const page = panelBackgroundProject().pages[0]!;
    const filename = '/virtual/PageMain.ts';
    const source = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  run(): void { Panel1.backgroundImage = 5; this.Panel1.backgroundSize = 'bad'; Panel1.backgroundRepeat = 'bad'; this.Panel1.backgroundPosition = 'bad'; }
  shadow(): void { const Panel1 = { backgroundImage: 5 }; const value: number = Panel1.backgroundImage; void value; }
}`;
    const files = new Map([
      [
        filename,
        appendComponentReferenceDeclarations(ts, filename, source, {
          className: page.name,
          generatedClassName: `${page.name}Generated`,
          componentNames: ['Panel1', 'Button1'],
        }),
      ],
      [
        '/virtual/PageMain.generated.d.ts',
        reusable
          ? generateReusableElementTypings({
              ...createReusableElement('PageMain'),
              rootComponentId: page.rootComponentId,
              components: page.components.map((node) =>
                node.id === page.rootComponentId ? { ...node, type: 'WebPanel' } : node,
              ),
            })
          : generatePageTypings(page),
      ],
      ['/virtual/runtime.d.ts', generateRuntimeTypings()],
    ]);
    const options: ts.CompilerOptions = {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
    };
    const service = ts.createLanguageService({
      getCompilationSettings: () => options,
      getCurrentDirectory: () => '/virtual',
      getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
      getScriptFileNames: () => [...files.keys()],
      getScriptVersion: () => '1',
      getScriptSnapshot: (name) => {
        const value = files.get(name) ?? ts.sys.readFile(name);
        return value === undefined ? undefined : ts.ScriptSnapshot.fromString(value);
      },
      fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
      readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
      readDirectory: ts.sys.readDirectory,
      directoryExists: (name) => name === '/virtual' || ts.sys.directoryExists(name),
    });
    for (const marker of ['Panel1.backgroundImage', 'this.Panel1.backgroundSize']) {
      const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
      expect(
        service
          .getCompletionsAtPosition(filename, position, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(
        expect.arrayContaining([
          'backgroundImage',
          'backgroundSize',
          'backgroundPosition',
          'backgroundRepeat',
        ]),
      );
    }
    expect(service.getSemanticDiagnostics(filename).map((diagnostic) => diagnostic.code)).toEqual([
      2322, 2322, 2322, 2322,
    ]);
    service.dispose();
  },
);

it('exports referenced assets and executes Panel background updates in compiled Preview', async () => {
  const compiled = await compileProjectToMemory(panelBackgroundProject(), {
    userSources: panelBackgroundUserSources,
  });
  expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
  expect(compiled.binaryFiles?.[panelImage]).toBeDefined();
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.test/',
  });
  try {
    dom.window.eval(compiled.files['assets/app.js']!);
    const panel = dom.window.document.querySelector<HTMLElement>('[data-webrad-id="panel"]')!;
    expect(panel.style.getPropertyValue('--wr-panel-background-image')).toContain(panelImage);
    expect(panel.style.backgroundSize).toBe('cover, auto');
    const child = panel.querySelector<HTMLButtonElement>('button')!;
    child.click();
    expect(panel.style.backgroundSize).toBe('contain, auto');
    expect(panel.style.backgroundPosition).toBe('right bottom, 0% 0%');
    child.click();
    expect(child.textContent).toBe('Cleared');
    expect(panel.style.backgroundImage).toBe('');
    expect(panel.style.getPropertyValue('--wr-panel-background-image')).toBe('');
  } finally {
    dom.window.close();
  }
}, 30_000);
