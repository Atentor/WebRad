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
import { WebIcon, runtimeComponentRegistry } from '@webrad/runtime';
import { LUCIDE_ICON_NAMES, createLucideIconElement, isLucideIconName } from '@webrad/runtime/icon';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import { iconProject, iconUserSources } from './fixtures/icon';

it('registers the Lucide catalogue, icon/button modes, no caption and protected default without changing saved IDs/styles', () => {
  const project = iconProject();
  const definition = defaultComponentRegistry.require('WebIcon');
  expect(definition.palette.caption).toBe('Icons');
  expect(definition.properties.find((p) => p.name === 'icon')).toMatchObject({
    type: 'icon',
    iconLibrary: 'lucide',
    options: LUCIDE_ICON_NAMES,
  });
  expect(definition.properties.find((p) => p.name === 'mode')?.options).toEqual(['icon', 'button']);
  expect(definition.properties.some((p) => p.name === 'caption')).toBe(false);
  expect(LUCIDE_ICON_NAMES.length).toBeGreaterThan(1500);
  expect(isLucideIconName('__proto__')).toBe(false);
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  expect(findDefaultComponentStyle(project.styles, 'WebIcon')).toMatchObject({
    name: 'Default Icons',
    preset: 'default',
    states: { hover: {}, focus: {}, active: {} },
  });
  const custom = createComponentStyle('Default Icons', 'WebIcon', {
    idFactory: () => defaultComponentStyleId(project.id, 'WebIcon'),
    states: { base: { textColor: '#123456' } },
  });
  const prior = {
    ...project,
    styles: [...project.styles.filter((s) => s.componentType !== 'WebIcon'), custom],
  };
  const parsed = parseProject(prior);
  expect(parsed.styles.find((s) => s.id === custom.id)).toEqual(custom);
  expect(parsed.pages).toEqual(prior.pages);
  expect(
    applyDefaultComponentStyle(
      prior.pages[0]!.components.find((n) => n.id === 'icon')!,
      parsed.styles,
    ).styleId,
  ).toBe(custom.id);
  expect(findDefaultComponentStyle(parsed.styles, 'WebIcon')?.id).not.toBe(custom.id);
  expect(findDefaultComponentStyle(parsed.styles, 'WebIcon')).toMatchObject({
    name: 'Default Icons 2',
    preset: 'default',
  });
  expect(parseProject(parsed)).toEqual(parsed);
  expect(
    parseProjectManifest({ ...projectToManifest(project), styles: prior.styles }).styles,
  ).toEqual(parsed.styles);
  expect(selectComponentCss(new Set(['WebIcon']))).toContain('.wr-icon-graphic');
  expect(selectComponentCss(new Set(['WebLabel']))).not.toContain('.wr-icon-graphic');
});

it('clears the old seeded default focus ring in projects/manifests while preserving authored styles and IDs', () => {
  const project = iconProject();
  const current = findDefaultComponentStyle(project.styles, 'WebIcon')!;
  const old = {
    ...current,
    states: {
      ...current.states,
      focus: { ringWidth: { value: 2, unit: 'px' }, ringColor: '#93c5fd' },
    },
  };
  const custom = { ...old, id: 'custom-icons', name: 'Custom Icons', preset: undefined };
  const styles = project.styles
    .map((style) => (style.id === current.id ? old : style))
    .concat(custom);
  const parsed = parseProject({ ...project, styles });
  expect(findDefaultComponentStyle(parsed.styles, 'WebIcon')).toEqual(current);
  expect(parsed.styles.find((style) => style.id === custom.id)?.states.focus).toEqual(
    old.states.focus,
  );
  expect(parsed.pages).toEqual(project.pages);
  expect(parseProjectManifest({ ...projectToManifest(project), styles }).styles).toEqual(
    parsed.styles,
  );
  expect(parseProject(parsed)).toEqual(parsed);
  const authored = {
    ...old,
    states: { ...old.states, focus: { ringWidth: { value: 3, unit: 'px' }, ringColor: '#123456' } },
  };
  expect(
    findDefaultComponentStyle(
      parseProject({
        ...project,
        styles: project.styles.map((style) => (style.id === current.id ? authored : style)),
      }).styles,
      'WebIcon',
    )?.states.focus,
  ).toEqual(authored.states.focus);
});

it.each(['icon', 'button'])(
  'projects upstream SVG identically in Designer and runtime in %s mode',
  (mode) => {
    const dom = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    try {
      const node = iconProject().pages[0]!.components.find((n) => n.id === mode)!;
      const designerDom = new JSDOM(renderToStaticMarkup(<ComponentView node={node} />));
      const designer = designerDom.window.document.querySelector('button')!;
      const component = runtimeComponentRegistry.create(dom.window.document, node) as WebIcon;
      for (const name of [
        'role',
        'aria-label',
        'tabindex',
        'data-webrad-icon',
        'data-webrad-icon-mode',
      ])
        expect(component.element.getAttribute(name)).toBe(designer.getAttribute(name));
      expect(component.element.firstElementChild!.isEqualNode(designer.firstElementChild)).toBe(
        true,
      );
      expect(component.element.textContent).toBe('');
      component.dispose();
      designerDom.window.close();
    } finally {
      vi.unstubAllGlobals();
      dom.window.close();
    }
  },
);

it('shares live state between wrappers, switches mode without losing events, rejects invalid API values and releases handlers', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const first = new WebIcon(dom.window.document.createElement('button'));
  const second = new WebIcon(first.element);
  const clicked = vi.fn();
  second.onClick = clicked;
  first.click();
  first.element.click();
  expect(clicked).not.toHaveBeenCalled();
  first.mode = 'button';
  first.icon = 'camera';
  first.strokeWidth = 4;
  first.accessibleLabel = 'Take photo';
  expect(second.icon).toBe('camera');
  expect(second.strokeWidth).toBe(4);
  expect(second.accessibleLabel).toBe('Take photo');
  first.click();
  expect(clicked).toHaveBeenCalledTimes(1);
  expect(clicked.mock.calls[0]![0]).toBe(second);
  second.enabled = false;
  first.click();
  first.element.dispatchEvent(new dom.window.MouseEvent('click'));
  expect(clicked).toHaveBeenCalledTimes(1);
  first.enabled = true;
  second.tabIndex = 3;
  first.mode = 'icon';
  expect(first.element.tabIndex).toBe(-1);
  first.mode = 'button';
  expect(first.element.tabIndex).toBe(3);
  expect(first.element.querySelectorAll('svg')).toHaveLength(1);
  expect(first.element.textContent).toBe('');
  for (const value of [0, -1, NaN, Infinity, 25])
    expect(() => {
      first.strokeWidth = value;
    }).toThrow(RangeError);
  expect(() => {
    first.icon = 'invalid' as 'star';
  }).toThrow(RangeError);
  expect(() => {
    first.mode = 'invalid' as 'icon';
  }).toThrow(RangeError);
  expect(() => new WebIcon(dom.window.document.createElement('div'))).toThrow(TypeError);
  second.dispose();
  second.dispose();
  first.click();
  expect(clicked).toHaveBeenCalledTimes(1);
  first.dispose();
  dom.window.close();
});

it('renders every installed Lucide icon from real upstream nodes without network or markup injection', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  for (const name of LUCIDE_ICON_NAMES) {
    const svg = createLucideIconElement(dom.window.document, name);
    expect(svg.childElementCount, name).toBeGreaterThan(0);
    expect(svg.querySelector('script, foreignObject, image')).toBeNull();
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
  }
  dom.window.close();
});

it.each([false, true])(
  'provides typed bare/this completion, hover, signatures, shadowing and invalid-use diagnostics in reusable=%s',
  (reusable) => {
    const project = iconProject(reusable);
    const document = reusable ? project.reusableElements[0]! : project.pages[0]!;
    const filename = `/virtual/${document.name}.ts`;
    const source = `import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated {
  run(): void { Icon1.icon = 'missing-icon'; this.Action1.mode = 'invalid'; Action1.strokeWidth = 'bad'; Action1.click(); }
  shadow(): void { const Icon1 = { icon: 12 }; const value: number = Icon1.icon; void value; }
}`;
    const augmented = appendComponentReferenceDeclarations(ts, filename, source, {
      className: document.name,
      generatedClassName: `${document.name}Generated`,
      componentNames: ['Icon1', 'Action1'],
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
      for (const marker of ['Icon1.icon', 'this.Action1.mode']) {
        const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
        expect(
          service.getCompletionsAtPosition(filename, position, {})?.entries.map((e) => e.name),
        ).toEqual(
          expect.arrayContaining([
            'icon',
            'mode',
            'accessibleLabel',
            'strokeWidth',
            'click',
            'onClick',
            'enabled',
            'visible',
          ]),
        );
        expect(service.getQuickInfoAtPosition(filename, position)?.displayParts).toBeDefined();
      }
      expect(
        service.getSignatureHelpItems(
          filename,
          source.indexOf('Action1.click()') + 'Action1.click('.length,
          {},
        )?.items[0]?.parameters,
      ).toEqual([]);
      expect(service.getSemanticDiagnostics(filename).map((d) => d.code)).toEqual([
        2322, 2322, 2322,
      ]);
    } finally {
      service.dispose();
    }
  },
);

it.each([false, true])(
  'executes typed icon buttons, disabled state, stable SVG updates and isolated reusable placements in compiled Preview reusable=%s',
  async (reusable) => {
    const compiled = await compileProjectToMemory(iconProject(reusable), {
      userSources: iconUserSources(reusable),
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    expect(compiled.files['assets/licenses/Lucide.txt']).toContain('ISC License');
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://preview.test/',
    });
    try {
      dom.window.eval(compiled.files['assets/app.js']!);
      const icons = [
        ...dom.window.document.querySelectorAll<HTMLButtonElement>('[data-webrad-type=WebIcon]'),
      ];
      expect(icons).toHaveLength(reusable ? 4 : 2);
      icons[0]!.click();
      expect(icons[0]!.dataset.webradIcon).toBe('camera');
      icons[1]!.click();
      expect(icons[0]!.dataset.webradIcon).toBe('check');
      expect(icons[0]!.querySelector('svg')?.getAttribute('stroke-width')).toBe('3');
      expect(icons[1]!.getAttribute('aria-label')).toBe('Saved');
      expect(icons[0]!.parentElement!.dataset.activations).toBe('1');
      icons[1]!.disabled = true;
      icons[1]!.click();
      expect(icons[0]!.parentElement!.dataset.activations).toBe('1');
      for (const icon of icons) expect(icon.textContent).toBe('');
      if (reusable) {
        expect(icons[2]!.dataset.webradIcon).toBe('camera');
        expect(icons[0]!.dataset.webradId).not.toBe(icons[2]!.dataset.webradId);
        icons[3]!.click();
        expect(icons[2]!.dataset.webradIcon).toBe('check');
      }
    } finally {
      dom.window.close();
    }
  },
);
