import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  applyDefaultComponentStyle,
  createReusableElement,
  parseProject,
  serializeProject,
} from '@webrad/project-model';
import { WebGroup, runtimeComponentRegistry } from '@webrad/runtime';
import {
  generatePageTypings,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '@webrad/language';
import { appendComponentReferenceDeclarations } from '../packages/language/src/component-references';
import { groupProject, groupUserSources } from './fixtures/group';
it('registers a transparent child container without appearance props or a default style', () => {
  const project = groupProject();
  const group = project.pages[0]!.components.find((n) => n.id === 'group')!;
  const definition = defaultComponentRegistry.require('WebGroup');
  expect(definition.canHaveChildren).toBe(true);
  expect(definition.supportsStyles).toBe(false);
  expect(definition.properties.map((p) => p.name)).not.toContain('borderColor');
  expect(definition.properties.map((p) => p.name)).not.toContain('backgroundColor');
  expect(applyDefaultComponentStyle(group, project.styles).styleId).toBeUndefined();
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  const dom = new JSDOM(
    renderToStaticMarkup(
      <ComponentView node={group} designTime>
        <span>Child</span>
      </ComponentView>,
    ),
  );
  const element = dom.window.document.querySelector('section')!;
  expect(element.textContent).toBe('Child');
  expect(element.style.backgroundColor).toBe('');
  expect(element.style.borderWidth).toBe('');
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  const instance = runtimeComponentRegistry.create(dom.window.document, group);
  expect(instance).toBeInstanceOf(WebGroup);
  instance.hide();
  expect(instance.visible).toBe(false);
  instance.show();
  expect(instance.visible).toBe(true);
  expect(instance.element.style.borderWidth).toBe('');
  instance.dispose();
  vi.unstubAllGlobals();
  dom.window.close();
});
it.each([false, true])(
  'provides typed Group completion and diagnostics in reusable=%s',
  (reusable) => {
    const page = groupProject().pages[0]!;
    const filename = '/virtual/index.ts';
    const source = `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {
  run(): void { Group1.width = 'bad'; this.Group1.missing(); Group1.show(); this.Group1.hide(); }
}`;
    const augmented = appendComponentReferenceDeclarations(ts, filename, source, {
      className: page.name,
      generatedClassName: `${page.name}Generated`,
      componentNames: ['Group1', 'Button1'],
    });
    const files = new Map([
      [filename, augmented],
      [
        '/virtual/index.generated.d.ts',
        reusable
          ? generateReusableElementTypings({
              ...createReusableElement('index'),
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
    for (const marker of ['Group1.width', 'this.Group1.missing']) {
      const position = source.indexOf(marker) + marker.lastIndexOf('.') + 1;
      const members = service
        .getCompletionsAtPosition(filename, position, {})
        ?.entries.map((e) => e.name);
      expect(members).toEqual(
        expect.arrayContaining(['width', 'show', 'hide', 'caption', 'bindEvent']),
      );
    }
    expect(service.getSemanticDiagnostics(filename).map((d) => d.code)).toEqual([2322, 2339]);
    service.dispose();
  },
);
it('executes the real Group instance, child hierarchy and bubbling handler in compiled Preview', async () => {
  const compiled = await compileProjectToMemory(groupProject(), { userSources: groupUserSources });
  expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.test/',
  });
  try {
    dom.window.eval(compiled.files['assets/app.js']!);
    const group = dom.window.document.querySelector<HTMLElement>('[data-webrad-id="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Ready');
    expect(group.style.backgroundColor).toBe('');
    expect(group.style.borderWidth).toBe('');
    const button = group.querySelector<HTMLButtonElement>('button')!;
    button.click();
    expect(button.textContent).toBe('Ready');
  } finally {
    dom.window.close();
  }
}, 120000);
