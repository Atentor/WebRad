import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory, selectComponentCss } from '@webrad/compiler';
import {
  applyDefaultComponentStyle,
  createComponentStyle,
  defaultComponentStyleId,
  findDefaultComponentStyle,
  parseProject,
  parseProjectManifest,
  projectToManifest,
  serializeProject,
} from '@webrad/project-model';
import {
  WebProgressBar,
  runtimeComponentRegistry,
  resolveComponentStyleClassName,
} from '@webrad/runtime';
import { projectProgressBar } from '@webrad/runtime/progress-bar';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import { progressBarProject, progressBarUserSources } from './fixtures/progress-bar';

it('registers three persisted formats with Inspector/style metadata and a palette-linked default', () => {
  const project = progressBarProject();
  const definition = defaultComponentRegistry.require('WebProgressBar');
  expect(definition).toMatchObject({
    visual: true,
    canHaveChildren: false,
    defaultEvent: 'OnChange',
  });
  expect(definition.properties.find((p) => p.name === 'format')?.options).toEqual([
    'bars',
    'dunnet',
    'circus',
  ]);
  expect(definition.styleEditor?.essentialProperties).toEqual(
    expect.arrayContaining(['progressColor', 'progressTrackColor', 'progressThickness']),
  );
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  const style = findDefaultComponentStyle(project.styles, 'WebProgressBar')!;
  expect(style).toMatchObject({
    name: 'Default ProgressBar',
    preset: 'default',
    states: {
      base: {
        borderWidth: { value: 1, unit: 'px' },
        borderStyle: 'solid',
        borderGradient: { kind: 'linear', direction: 'to-bottom-right' },
        progressColor: 'var(--wr-palette-aurora-blue)',
        progressThickness: 8,
        borderRadius: { value: 6, unit: 'px' },
      },
    },
  });
  expect(resolveComponentStyleClassName(style)).toContain('--wr-progress-color');
  const css = selectComponentCss(new Set(['WebProgressBar']));
  expect(css).toContain('.wr-progress-track');
  expect(css).toContain('.wr-progress-label[hidden]');
  expect(selectComponentCss(new Set(['WebLabel']))).not.toContain('.wr-progress-track');
});

it('restores a missing default on projects/manifests and preserves colliding custom styles and bindings', () => {
  const project = progressBarProject();
  const custom = createComponentStyle('Default ProgressBar', 'WebProgressBar', {
    idFactory: () => defaultComponentStyleId(project.id, 'WebProgressBar'),
    states: {
      base: { progressColor: '#123456', progressTrackColor: '#abcdef', progressThickness: 12 },
    },
  });
  const prior = {
    ...project,
    styles: [...project.styles.filter((s) => s.componentType !== 'WebProgressBar'), custom],
  };
  const parsed = parseProject(prior);
  expect(parsed.styles.find((s) => s.id === custom.id)).toEqual(custom);
  expect(findDefaultComponentStyle(parsed.styles, 'WebProgressBar')).toMatchObject({
    name: 'Default ProgressBar 2',
  });
  expect(parsed.pages).toEqual(prior.pages);
  expect(
    applyDefaultComponentStyle(
      prior.pages[0]!.components.find((n) => n.id === 'bars')!,
      parsed.styles,
    ).styleId,
  ).toBe(custom.id);
  expect(
    parseProjectManifest({ ...projectToManifest(project), styles: prior.styles }).styles,
  ).toEqual(parsed.styles);
  expect(parseProject(parsed)).toEqual(parsed);
});

it.each(['bars', 'dunnet', 'circus'] as const)(
  'projects %s identically in Designer and runtime with accessible progress and a hidden label',
  (format) => {
    const dom = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    try {
      const base = progressBarProject().pages[0]!.components.find((n) => n.id === format)!;
      const node = {
        ...base,
        props: { ...base.props, min: -50, max: 150, value: 300, showValue: false },
      };
      const designerDom = new JSDOM(renderToStaticMarkup(<ComponentView node={node} designTime />));
      const designer = designerDom.window.document.querySelector('[role=progressbar]')!;
      const component = runtimeComponentRegistry.create(
        dom.window.document,
        node,
      ) as WebProgressBar;
      expect(component.value).toBe(150);
      expect(component.percentage).toBe(100);
      for (const name of [
        'role',
        'aria-label',
        'aria-valuemin',
        'aria-valuemax',
        'aria-valuenow',
        'aria-valuetext',
        'data-webrad-progress-format',
      ]) {
        expect(component.element.getAttribute(name)).toBe(designer.getAttribute(name));
      }
      const readChildren = (root: Element) =>
        [...root.querySelectorAll('*')].map((child) => ({
          tag: child.tagName,
          namespace: child.namespaceURI,
          attributes: Object.fromEntries(
            [...child.attributes]
              .map((a) => [a.name, a.value])
              .sort(([a], [b]) => a!.localeCompare(b!)),
          ),
          text: child.childElementCount === 0 ? child.textContent : '',
        }));
      expect(readChildren(component.element)).toEqual(readChildren(designer));
      expect(component.element.querySelector<HTMLSpanElement>('.wr-progress-label')!.hidden).toBe(
        true,
      );
      component.dispose();
      designerDom.window.close();
    } finally {
      vi.unstubAllGlobals();
      dom.window.close();
    }
  },
);

it('shares live runtime state, clamps range changes, fires OnChange only for effective values and releases handlers', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const first = new WebProgressBar(dom.window.document.createElement('div'));
  const second = new WebProgressBar(first.element);
  const changed = vi.fn();
  second.onChange = changed;
  first.value = 30;
  expect(second.value).toBe(30);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed.mock.calls[0]![0]).toBe(second);
  first.value = 30;
  first.format = 'dunnet';
  second.showValue = false;
  expect(changed).toHaveBeenCalledTimes(1);
  first.setRange(-20, 20);
  expect(second.value).toBe(20);
  expect(second.percentage).toBe(100);
  expect(changed).toHaveBeenCalledTimes(2);
  second.increment(-10);
  expect(first.value).toBe(10);
  expect(first.percentage).toBe(75);
  second.reset();
  expect(first.value).toBe(-20);
  expect(first.percentage).toBe(0);
  expect(changed).toHaveBeenCalledTimes(4);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    expect(() => {
      first.value = invalid;
    }).toThrow(RangeError);
    expect(() => first.setRange(0, invalid)).toThrow(RangeError);
  }
  expect(() => first.setRange(5, 5)).toThrow(RangeError);
  expect(() => {
    first.min = 30;
  }).toThrow(RangeError);
  expect(() => {
    first.max = -30;
  }).toThrow(RangeError);
  first.min = -40;
  first.max = 40;
  expect(first.value).toBe(-20);
  expect(first.percentage).toBe(25);
  first.dispose();
  second.dispose();
  second.dispose();
  first.value = 0;
  expect(changed).toHaveBeenCalledTimes(4);
  dom.window.close();
});

it('handles empty/full sectors, fractional values and invalid saved ranges without NaN graphics', () => {
  expect(projectProgressBar({ format: 'circus', value: 0 }).shapes).toHaveLength(1);
  expect(projectProgressBar({ format: 'circus', value: 100 }).shapes[1]?.tag).toBe('circle');
  expect(
    projectProgressBar({ format: 'circus', value: 0.5 }).shapes[1]?.attributes.d,
  ).not.toContain('NaN');
  expect(projectProgressBar({ min: 20, max: 10, value: 25 }).percentage).toBe(25);
  expect(projectProgressBar({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE }).percentage).toBe(0);
});

it.each([false, true])(
  'provides typed bare/this completion, hover/signatures and invalid-use diagnostics in reusable=%s',
  (reusable) => {
    const project = progressBarProject(reusable);
    const document = reusable ? project.reusableElements[0]! : project.pages[0]!;
    const filename = `/virtual/${document.name}.ts`;
    const source = `import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated {
  run(): void { Bars1.value = 'bad'; this.Dunnet1.format = 'invalid'; Circus1.percentage = 5; Bars1.setRange(0, 200); }
  shadow(): void { const Bars1 = { value: 'local' }; const value: string = Bars1.value; void value; }
}`;
    const augmented = appendComponentReferenceDeclarations(ts, filename, source, {
      className: document.name,
      generatedClassName: `${document.name}Generated`,
      componentNames: ['Bars1', 'Dunnet1', 'Circus1', 'Advance1'],
    });
    const files = new Map([
      [filename, augmented],
      [
        `/virtual/${document.name}.generated.d.ts`,
        reusable ? generateReusableElementTypings(document) : generatePageTypings(document),
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
    try {
      for (const marker of ['Bars1.value', 'this.Dunnet1.format']) {
        const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
        expect(
          service.getCompletionsAtPosition(filename, position, {})?.entries.map((e) => e.name),
        ).toEqual(
          expect.arrayContaining([
            'value',
            'min',
            'max',
            'format',
            'percentage',
            'showValue',
            'increment',
            'reset',
            'setRange',
            'onChange',
          ]),
        );
        expect(service.getQuickInfoAtPosition(filename, position)?.displayParts).toBeDefined();
      }
      const call = source.indexOf('Bars1.setRange(0') + 'Bars1.setRange('.length;
      expect(
        service.getSignatureHelpItems(filename, call, {})?.items[0]?.parameters.map((p) => p.name),
      ).toEqual(['min', 'max']);
      expect(service.getSemanticDiagnostics(filename).map((d) => d.code)).toEqual([
        2322, 2322, 2540,
      ]);
    } finally {
      service.dispose();
    }
  },
);

it.each([false, true])(
  'executes all formats and isolated event-driven progress in compiled Preview with reusable=%s',
  async (reusable) => {
    const compiled = await compileProjectToMemory(progressBarProject(reusable), {
      userSources: progressBarUserSources(reusable),
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://preview.test/',
    });
    try {
      dom.window.eval(compiled.files['assets/app.js']!);
      const bars = [...dom.window.document.querySelectorAll<HTMLElement>('[role=progressbar]')];
      expect(bars).toHaveLength(reusable ? 6 : 3);
      expect(bars.map((e) => e.getAttribute('aria-valuenow'))).toEqual(
        Array(reusable ? 6 : 3).fill('50'),
      );
      dom.window.document.querySelector<HTMLButtonElement>('[data-webrad-name=Advance1]')!.click();
      expect(bars.slice(0, 3).map((e) => e.getAttribute('aria-valuenow'))).toEqual([
        '100',
        '100',
        '100',
      ]);
      expect(bars[0]!.parentElement!.dataset.changes).toBe('1');
      expect(bars[0]!.parentElement!.dataset.progress).toBe('50');
      if (reusable) {
        expect(bars.slice(3).map((e) => e.getAttribute('aria-valuenow'))).toEqual([
          '50',
          '50',
          '50',
        ]);
        expect(bars[0]!.dataset.webradId).not.toBe(bars[3]!.dataset.webradId);
      }
      const button = dom.window.document.querySelector<HTMLButtonElement>(
        '[data-webrad-name=Advance1]',
      )!;
      button.click();
      button.click();
      button.click();
      expect(bars.slice(0, 3).map((e) => e.getAttribute('aria-valuenow'))).toEqual([
        '200',
        '200',
        '200',
      ]);
      expect(bars[0]!.parentElement!.dataset.changes).toBe('3');
    } finally {
      dom.window.close();
    }
  },
  30_000,
);
