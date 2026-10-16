import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  applyDefaultComponentStyle,
  createComponentStyle,
  projectToManifest,
  defaultComponentStyleId,
  findDefaultComponentStyle,
  parseProject,
  parseProjectManifest,
  serializeProject,
} from '@webrad/project-model';
import {
  WebToggle,
  runtimeComponentRegistry,
  resolveComponentStyleClassName,
} from '@webrad/runtime';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import { toggleProject, toggleUserSources } from './fixtures/toggle';

it('registers a styled Toggle without a caption and preserves its model', () => {
  const project = toggleProject();
  const node = project.pages[0]!.components.find((n) => n.id === 'toggle')!;
  const definition = defaultComponentRegistry.require('WebToggle');
  expect(definition).toMatchObject({
    visual: true,
    canHaveChildren: false,
    defaultEvent: 'OnChange',
  });
  expect(definition.properties.map((p) => p.name)).not.toContain('caption');
  expect(node.props).not.toHaveProperty('caption');
  expect(definition.events.map((e) => e.name)).toEqual([
    'OnChange',
    'OnClick',
    'OnFocus',
    'OnBlur',
  ]);
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  const style = findDefaultComponentStyle(project.styles, 'WebToggle')!;
  expect(style).toMatchObject({
    name: 'Default Toggle',
    preset: 'default',
    states: {
      base: {
        borderRadius: { value: 6, unit: 'px' },
        toggleCheckedColor: 'var(--wr-palette-aurora-blue)',
        toggleThumbColor: 'var(--wr-palette-aurora-white)',
      },
    },
  });
  expect(node.styleId).toBe(style.id);
  expect(resolveComponentStyleClassName(style)).toContain('--wr-toggle-checked-color');
  const dom = new JSDOM(
    renderToStaticMarkup(
      <ComponentView
        node={node}
        designTime
        styleClassName={resolveComponentStyleClassName(style)}
      />,
    ),
  );
  const element = dom.window.document.querySelector('button')!;
  expect(element.getAttribute('role')).toBe('switch');
  expect(element.getAttribute('aria-label')).toBe('Toggle1');
  expect(element.textContent).toBe('');
  expect(element.tabIndex).toBe(-1);
  expect(dom.window.document.querySelector('label')).toBeNull();
  dom.window.close();
});

it('restores the missing default on projects and manifests without overwriting saved styles or bindings', () => {
  const project = toggleProject();
  const custom = createComponentStyle('Default Toggle', 'WebToggle', {
    idFactory: () => defaultComponentStyleId(project.id, 'WebToggle'),
    states: { base: { toggleCheckedColor: '#123456' } },
  });
  const prior = {
    ...project,
    styles: [...project.styles.filter((s) => s.componentType !== 'WebToggle'), custom],
  };
  const parsed = parseProject(prior);
  expect(parsed.styles.find((s) => s.id === custom.id)).toEqual(custom);
  const restored = findDefaultComponentStyle(parsed.styles, 'WebToggle')!;
  expect(restored.id).not.toBe(custom.id);
  expect(restored.name).toBe('Default Toggle 2');
  expect(parsed.pages).toEqual(prior.pages);
  expect(
    applyDefaultComponentStyle(
      prior.pages[0]!.components.find((n) => n.id === 'toggle')!,
      parsed.styles,
    ).styleId,
  ).toBe(custom.id);
  const manifest = projectToManifest(project);
  const parsedManifest = parseProjectManifest({ ...manifest, styles: prior.styles });
  expect(parsedManifest.styles).toEqual(parsed.styles);
  expect(parseProject(parsed)).toEqual(parsed);
});

it('shares native activation between mounted and generated wrappers and releases it on disposal', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  try {
    const node = toggleProject().pages[0]!.components.find((n) => n.id === 'toggle')!;
    const mounted = runtimeComponentRegistry.create(dom.window.document, node) as WebToggle;
    const generated = new WebToggle(mounted.element);
    dom.window.document.body.append(mounted.element);
    const changed = vi.fn();
    generated.onChange = changed;
    generated.checked = true;
    expect(changed).not.toHaveBeenCalled();
    generated.click();
    expect(generated.checked).toBe(false);
    expect(mounted.checked).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0]![0]).toBe(generated);
    generated.enabled = false;
    generated.click();
    expect(changed).toHaveBeenCalledTimes(1);
    generated.enabled = true;
    generated.tabIndex = 3;
    generated.focus();
    expect(dom.window.document.activeElement).toBe(generated.element);
    expect(generated.element.tabIndex).toBe(3);
    mounted.dispose();
    mounted.dispose();
    generated.click();
    expect(generated.checked).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
    generated.dispose();
    generated.click();
    expect(generated.checked).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it.each([false, true])(
  'provides typed Toggle completion and invalid-use diagnostics in reusable=%s',
  (reusable) => {
    const project = toggleProject(reusable);
    const document = reusable ? project.reusableElements[0]! : project.pages[0]!;
    const filename = `/virtual/${document.name}.ts`;
    const source = `import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated {
  run(): void { Toggle1.checked = 'bad'; this.Toggle1.caption = 'bad'; Toggle1.click(); this.Toggle1.enabled = false; }
  shadow(): void { const Toggle1 = { checked: 'local' }; const value: string = Toggle1.checked; void value; }
}`;
    const augmented = appendComponentReferenceDeclarations(ts, filename, source, {
      className: document.name,
      generatedClassName: `${document.name}Generated`,
      componentNames: ['Toggle1', 'Status1'],
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
      for (const marker of ['Toggle1.checked', 'this.Toggle1.caption']) {
        const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
        const members = service
          .getCompletionsAtPosition(filename, position, {})
          ?.entries.map((e) => e.name);
        expect(members).toEqual(
          expect.arrayContaining([
            'checked',
            'enabled',
            'click',
            'onChange',
            'show',
            'hide',
            'bindEvent',
          ]),
        );
        expect(members).not.toContain('caption');
        expect(
          service.getQuickInfoAtPosition(
            filename,
            source.indexOf(marker) + marker.lastIndexOf('.') + 1,
          )?.displayParts,
        ).toBeDefined();
      }
      expect(service.getSemanticDiagnostics(filename).map((d) => d.code)).toEqual([2322, 2339]);
    } finally {
      service.dispose();
    }
  },
);

it.each([false, true])(
  'executes Toggle once per click in compiled Preview with reusable=%s',
  async (reusable) => {
    const compiled = await compileProjectToMemory(toggleProject(reusable), {
      userSources: toggleUserSources(reusable),
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://preview.test/',
    });
    try {
      dom.window.eval(compiled.files['assets/app.js']!);
      const toggles = [...dom.window.document.querySelectorAll<HTMLButtonElement>('[role=switch]')];
      expect(toggles).toHaveLength(reusable ? 2 : 1);
      const first = toggles[0]!;
      first.click();
      expect(first.getAttribute('aria-checked')).toBe('true');
      expect(first.parentElement!.dataset.changes).toBe('1');
      expect(first.parentElement!.dataset.sameInstanceState).toBe('true');
      expect(first.parentElement!.querySelector('.wr-weblabel')!.textContent).toBe('On');
      first.focus();
      first.blur();
      expect(first.parentElement!.dataset.focused).toBe('true');
      expect(first.parentElement!.dataset.blurred).toBe('true');
      if (reusable) {
        expect(toggles[1]!.getAttribute('aria-checked')).toBe('false');
        expect(toggles[1]!.parentElement!.dataset.changes).toBeUndefined();
        expect(toggles[0]!.dataset.webradId).not.toBe(toggles[1]!.dataset.webradId);
      }
      first.disabled = true;
      first.click();
      expect(first.parentElement!.dataset.changes).toBe('1');
      first.disabled = false;
      first.click();
      expect(first.getAttribute('aria-checked')).toBe('false');
      expect(first.parentElement!.dataset.changes).toBe('2');
    } finally {
      dom.window.close();
    }
  },
  120_000,
);
