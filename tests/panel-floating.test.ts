import ts from 'typescript';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import { panelProgressProject } from './fixtures/panel-progress';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { compileProjectToMemory } from '@webrad/compiler';
import { parseProject, serializeProject, safeParseProject } from '@webrad/project-model';
import { WebPanel, mountPage, projectRuntimeLayout } from '@webrad/runtime';
import { panelFloatingProject, panelFloatingUserSources } from './fixtures/panel-floating';
afterEach(() => vi.unstubAllGlobals());
it('persists Panel placement, validates anchors and keeps legacy Panels in flow', () => {
  const project = panelFloatingProject();
  expect(defaultComponentRegistry.require('WebPanel').supportsFloatingPlacement).toBe(true);
  expect(defaultComponentRegistry.require('WebGroup').supportsFloatingPlacement).toBeUndefined();
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  for (const props of [
    { placement: 'bad' },
    { floatingHorizontalAnchor: 'middle' },
    { floatingVerticalAnchor: 'middle' },
    { floatingZIndex: 1.5 },
  ]) {
    const page = project.pages[0]!;
    expect(
      safeParseProject({
        ...project,
        pages: [
          {
            ...page,
            components: page.components.map((node) =>
              node.id === 'floating-panel' ? { ...node, props: { ...node.props, ...props } } : node,
            ),
          },
        ],
      }).success,
    ).toBe(false);
  }
  const page = project.pages[0]!;
  const legacy = parseProject({
    ...project,
    pages: [
      {
        ...page,
        components: page.components.map((node) =>
          node.id === 'floating-panel' ? { ...node, props: {} } : node,
        ),
      },
    ],
  });
  const panel = legacy.pages[0]!.components.find((node) => node.id === 'floating-panel')!;
  expect(
    projectRuntimeLayout(panel, { ...page.components[0]!.layout.container, mode: 'column' }).item
      .position,
  ).toBe('relative');
});
it.each(['left', 'center', 'right'] as const)(
  'projects page-owned floating geometry for %s anchoring',
  (horizontal) => {
    const panel = panelFloatingProject().pages[0]!.components.find(
      (node) => node.id === 'floating-panel',
    )!;
    const styles = projectRuntimeLayout({
      ...panel,
      props: {
        ...panel.props,
        floatingHorizontalAnchor: horizontal,
        floatingVerticalAnchor: 'bottom',
      },
    }).item;
    expect(styles).toMatchObject({
      position: 'absolute',
      width: '220px',
      height: '140px',
      bottom: '32px',
      'z-index': '200',
    });
    expect(horizontal === 'right' ? styles.right : styles.left).toBe(
      horizontal === 'center' ? 'calc(50% + 24px)' : '24px',
    );
    if (horizontal === 'center') expect(styles.translate).toBe('-50% 0');
  },
);
it('executes typed bare/this assignments in compiled Preview and restores parent order without recreating children', async () => {
  const compiled = await compileProjectToMemory(panelFloatingProject(), {
    userSources: panelFloatingUserSources,
  });
  expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.test/',
  });
  try {
    dom.window.eval(compiled.files['assets/app.js']!);
    const document = dom.window.document;
    const panel = document.querySelector<HTMLElement>('[data-webrad-name="FloatingPanel"]')!;
    const child = panel.querySelector<HTMLButtonElement>('button')!;
    const parent = document.querySelector('[data-webrad-name="ParentPanel"]')!;
    const toggle = document.querySelector<HTMLButtonElement>('[data-webrad-name="ToggleButton"]')!;
    expect(panel.parentElement?.className).toBe('wr-panel-floating-layer');
    expect(panel.style.position).toBe('absolute');
    child.click();
    expect(panel.style.right).toBe('24px');
    expect(panel.style.bottom).toBe('32px');
    expect(panel.style.left).toBe('');
    expect(panel.style.zIndex).toBe('300');
    toggle.click();
    expect(panel.parentElement).toBe(parent);
    expect(panel.style.zIndex).toBe('');
    toggle.click();
    expect(panel.parentElement?.className).toBe('wr-panel-floating-layer');
    expect(panel.querySelector('button')).toBe(child);
    expect(child.textContent).toBe('Anchored');
  } finally {
    dom.window.close();
  }
});
it('shares floating state across wrappers and removes placement listeners on mount disposal', () => {
  const page = panelFloatingProject().pages[0]!;
  const dom = new JSDOM('<!doctype html><body></body>');
  try {
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
    const mounted = mountPage(page, dom.window.document.body);
    const panel = mounted.components.get('floating-panel') as WebPanel;
    const wrapper = new WebPanel(panel.element);
    wrapper.placement = 'in-flow';
    expect(panel.placement).toBe('in-flow');
    expect(panel.element.parentElement?.dataset.webradName).toBe('ParentPanel');
    wrapper.placement = 'floating';
    expect(panel.element.parentElement?.className).toBe('wr-panel-floating-layer');
    expect(() => {
      wrapper.floatingZIndex = Number.NaN;
    }).toThrow(TypeError);
    mounted.dispose();
    wrapper.placement = 'in-flow';
    expect(panel.element.parentElement?.className).toBe('wr-panel-floating-layer');
  } finally {
    dom.window.close();
  }
});
it('isolates floating Panels and their authored handlers in two reusable placements', async () => {
  const original = panelProgressProject(true);
  const project = {
    ...original,
    reusableElements: original.reusableElements.map((definition) => ({
      ...definition,
      components: definition.components.map((node) =>
        node.name === 'Panel1'
          ? { ...node, props: { ...node.props, placement: 'floating' } }
          : node,
      ),
    })),
  };
  const compiled = await compileProjectToMemory(project, {
    userSources: {
      'pages/index.ts': `import { indexGenerated } from "./index.generated"; export class index extends indexGenerated {}`,
      'reusables/ProgressCard.ts': `import { ProgressCardGenerated } from './ProgressCard.generated';
export class ProgressCard extends ProgressCardGenerated {
  advance(): void { Panel1.placement = 'in-flow'; this.Panel1.floatingZIndex = 300; Advance1.caption = 'Updated'; }
}`,
    },
  });
  expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.test/',
  });
  try {
    dom.window.eval(compiled.files['assets/app.js']!);
    const panels = [
      ...dom.window.document.querySelectorAll<HTMLElement>('[data-webrad-name="Panel1"]'),
    ];
    expect(panels).toHaveLength(2);
    expect(
      panels.every((panel) => panel.parentElement?.className === 'wr-panel-floating-layer'),
    ).toBe(true);
    panels[0]!.querySelector<HTMLButtonElement>('button')!.click();
    expect(panels[0]!.parentElement?.className).not.toBe('wr-panel-floating-layer');
    expect(panels[0]!.querySelector('button')?.textContent).toBe('Updated');
    expect(panels[1]!.parentElement?.className).toBe('wr-panel-floating-layer');
    expect(panels[1]!.querySelector('button')?.textContent).toBe('Advance');
  } finally {
    dom.window.close();
  }
});
it.each([false, true])(
  'offers typed bare/this Panel floating placement completion, hover and diagnostics in reusable=%s',
  (reusable) => {
    const project = panelProgressProject(reusable);
    const document = reusable ? project.reusableElements[0]! : project.pages[0]!;
    const filename = `/virtual/${document.name}.ts`;
    const source = `import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated {
  run(): void { Panel1.placement = 'bad'; this.Panel1.floatingZIndex = 'bad'; Panel1.floatingVerticalAnchor = true; }
  shadow(): void { const Panel1 = { floatingZIndex: 'local' }; const value: string = Panel1.floatingZIndex; void value; }
}`;
    const files = new Map([
      [
        filename,
        appendComponentReferenceDeclarations(ts, filename, source, {
          className: document.name,
          generatedClassName: `${document.name}Generated`,
          componentNames: ['Panel1', 'Advance1'],
        }),
      ],
      [
        `/virtual/${document.name}.generated.d.ts`,
        reusable
          ? generateReusableElementTypings(project.reusableElements[0]!)
          : generatePageTypings(project.pages[0]!),
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
    for (const marker of ['Panel1.placement', 'this.Panel1.floatingZIndex']) {
      const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
      expect(
        service
          .getCompletionsAtPosition(filename, position, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(
        expect.arrayContaining([
          'placement',
          'floatingZIndex',
          'floatingVerticalAnchor',
          'floatingHorizontalAnchor',
        ]),
      );
      expect(
        service
          .getQuickInfoAtPosition(filename, position)
          ?.displayParts?.map((part) => part.text)
          .join(''),
      ).toContain(marker.endsWith('ZIndex') ? 'number' : 'in-flow');
    }
    expect(service.getSemanticDiagnostics(filename).map((diagnostic) => diagnostic.code)).toEqual([
      2322, 2322, 2322,
    ]);
    service.dispose();
  },
);
