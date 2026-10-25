import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory, selectComponentCss } from '@webrad/compiler';
import {
  createComponentStyle,
  findDefaultComponentStyle,
  parseProject,
  serializeProject,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
} from '@webrad/project-model';
import { WebPanel, runtimeComponentRegistry } from '@webrad/runtime';
import { panelProgressPath, projectPanelProgress } from '@webrad/runtime/panel-progress';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import { panelProgressProject, panelProgressUserSources } from './fixtures/panel-progress';

afterEach(() => vi.unstubAllGlobals());

it('registers optional persisted progress and independent theme-linked Aurora style controls', () => {
  const project = panelProgressProject();
  const panel = defaultComponentRegistry.require('WebPanel');
  expect(panel.defaults).toMatchObject({ progressEnabled: false, progressValue: 0 });
  expect(
    panel.properties.find((property) => property.name === 'progressValue')?.validateValue?.(101),
  ).toBe(false);
  expect(
    defaultComponentRegistry.require('WebGroup').properties.map((property) => property.name),
  ).not.toContain('progressEnabled');
  expect(findDefaultComponentStyle(project.styles, 'WebPanel')?.states.base).toMatchObject({
    panelProgressColor: 'var(--wr-theme-primary)',
    panelProgressTrackColor: 'var(--wr-theme-border)',
    panelProgressThickness: 3,
  });
  for (const name of ['panelProgressColor', 'panelProgressTrackColor', 'panelProgressThickness']) {
    expect(panel.styleEditor?.essentialProperties).toContain(name);
    expect(
      COMPONENT_STYLE_PROPERTY_DEFINITIONS.find((property) => property.name === name),
    ).toMatchObject({ componentTypes: ['WebPanel'], category: 'Panel progress' });
  }
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  const custom = createComponentStyle('Custom Panel', 'WebPanel', {
    states: {
      base: {
        panelProgressColor: '#123456',
        panelProgressTrackColor: '#abcdef',
        panelProgressThickness: 5,
      },
    },
  });
  expect(
    parseProject({ ...project, styles: [...project.styles, custom] }).styles.find(
      (style) => style.id === custom.id,
    ),
  ).toEqual(custom);
  expect(selectComponentCss(new Set(['WebPanel']))).toContain('.wr-panel-progress-fill');
  expect(selectComponentCss(new Set(['WebLabel']))).not.toContain('.wr-panel-progress');
});

it.each([0, 0.1, 50, 99.9, 100])(
  'projects automatic visibility for %s percent without replacing Panel children',
  (value) => {
    const node = panelProgressProject(false, value).pages[0]!.components.find(
      (entry) => entry.id === 'panel',
    )!;
    const dom = new JSDOM(
      renderToStaticMarkup(
        <ComponentView node={node} designTime>
          <button>Child</button>
        </ComponentView>,
      ),
    );
    expect(dom.window.document.querySelector('button')?.textContent).toBe('Child');
    const progress = dom.window.document.querySelector('[role=progressbar]');
    expect(progress !== null).toBe(value > 0 && value < 100);
    if (progress) expect(progress.getAttribute('aria-valuenow')).toBe(String(value));
    dom.window.close();
  },
);

it('shares state between runtime wrappers, clamps values and releases observations on hiding/disposal', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  const disconnect = vi.fn();
  Object.defineProperty(dom.window, 'ResizeObserver', {
    value: class {
      observe = vi.fn();
      disconnect = disconnect;
    },
  });
  const node = panelProgressProject().pages[0]!.components.find((entry) => entry.id === 'panel')!;
  const first = runtimeComponentRegistry.create(dom.window.document, node) as WebPanel;
  const second = new WebPanel(first.element);
  const child = dom.window.document.createElement('button');
  child.textContent = 'Child';
  first.element.append(child);
  expect(first.element.querySelector('svg')).toBeNull();
  second.progressValue = 35;
  expect(first.progressValue).toBe(35);
  expect(first.progressVisible).toBe(true);
  expect(first.element.querySelectorAll('svg')).toHaveLength(1);
  expect(first.element.querySelector('svg')?.getAttribute('aria-valuenow')).toBe('35');
  first.progressEnabled = false;
  expect(second.progressVisible).toBe(false);
  expect(first.element.querySelector('svg')).toBeNull();
  expect(disconnect).toHaveBeenCalledTimes(1);
  first.progressEnabled = true;
  second.progressValue = 120;
  expect(first.progressValue).toBe(100);
  expect(first.element.querySelector('svg')).toBeNull();
  first.progressValue = -5;
  expect(first.progressValue).toBe(0);
  for (const value of [NaN, Infinity, -Infinity])
    expect(() => {
      first.progressValue = value;
    }).toThrow(RangeError);
  first.progressValue = 99.99;
  expect(first.progressVisible).toBe(true);
  first.dispose();
  first.dispose();
  expect(first.element.querySelector('svg')).toBeNull();
  expect(first.element.contains(child)).toBe(true);
  expect(disconnect).toHaveBeenCalledTimes(3);
  dom.window.close();
});

it('normalizes persisted values and constructs finite clockwise paths with asymmetric and oversized radii', () => {
  expect(projectPanelProgress({ progressEnabled: true, progressValue: Infinity })).toEqual({
    enabled: true,
    value: 0,
    visible: false,
  });
  expect(projectPanelProgress({ progressValue: 50 }).visible).toBe(false);
  const d = panelProgressPath(280, 160, [
    [6, 6],
    [12, 20],
    [30, 10],
    [0, 0],
  ]);
  expect(d).toContain('M 6 0 H 268 A 12 20');
  expect(d).toMatch(/Z$/u);
  for (const [width, height] of [
    [240, 120],
    [120, 240],
    [1, 1],
    [0, 0],
  ]) {
    expect(
      panelProgressPath(width!, height!, [
        [200, 200],
        [200, 200],
        [200, 200],
        [200, 200],
      ]),
    ).not.toMatch(/NaN|Infinity/u);
  }
});

it.each([false, true])(
  'offers typed bare/this Panel progress completion, hover and diagnostics in reusable=%s',
  (reusable) => {
    const project = panelProgressProject(reusable);
    const document = reusable ? project.reusableElements[0]! : project.pages[0]!;
    const filename = `/virtual/${document.name}.ts`;
    const source = `import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated {
  run(): void { Panel1.progressEnabled = 'bad'; this.Panel1.progressValue = 'bad'; Panel1.progressVisible = true; }
  shadow(): void { const Panel1 = { progressValue: 'local' }; const value: string = Panel1.progressValue; void value; }
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
    for (const marker of ['Panel1.progressEnabled', 'this.Panel1.progressValue']) {
      const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
      expect(
        service
          .getCompletionsAtPosition(filename, position, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(expect.arrayContaining(['progressEnabled', 'progressValue', 'progressVisible']));
      expect(
        service
          .getQuickInfoAtPosition(filename, position)
          ?.displayParts?.map((part) => part.text)
          .join(''),
      ).toContain(marker.endsWith('Value') ? 'number' : 'boolean');
    }
    expect(service.getSemanticDiagnostics(filename).map((diagnostic) => diagnostic.code)).toEqual([
      2322, 2322, 2540,
    ]);
    service.dispose();
  },
);

it.each([false, true])(
  'executes automatic visibility and isolated Panel progress in compiled Preview with reusable=%s',
  async (reusable) => {
    const compiled = await compileProjectToMemory(panelProgressProject(reusable), {
      userSources: panelProgressUserSources(reusable),
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
      expect(panels).toHaveLength(reusable ? 2 : 1);
      const first = panels[0]!;
      const child = first.querySelector<HTMLButtonElement>('button')!;
      expect(first.querySelector('.wr-panel-progress')).toBeNull();
      for (const value of [25, 50, 75, 100]) {
        child.click();
        expect(
          first.querySelector('.wr-panel-progress')?.getAttribute('aria-valuenow') ?? null,
        ).toBe(value === 100 ? null : String(value));
        if (reusable) expect(panels[1]!.querySelector('.wr-panel-progress')).toBeNull();
      }
      expect(child.textContent).toBe('Hidden');
    } finally {
      dom.window.close();
    }
  },
  120_000,
);
