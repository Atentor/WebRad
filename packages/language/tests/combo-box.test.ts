import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import {
  generatePageSource,
  generatePageTypings,
  generateRuntimeTypings,
  generateReusableElementSource,
} from '../src/index.js';
import { appendComponentReferenceDeclarations } from '../src/component-references.js';
import { createReusableElement } from '@webrad/project-model';
import { comboBoxProject } from '../../../tests/fixtures/combo-box.js';

function serviceFor(body: string) {
  const page = comboBoxProject().pages[0];
  if (page === undefined) throw new Error('Missing page.');
  const directory = fileURLToPath(new URL('./combo-box-virtual/', import.meta.url));
  const fileName = `${directory}${page.name}.ts`;
  const source = `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  public run(): void { ${body} }
}`;
  const augmented = appendComponentReferenceDeclarations(ts, fileName, source, {
    className: page.name,
    generatedClassName: `${page.name}Generated`,
    componentNames: page.components
      .filter((component) => component.id !== page.rootComponentId)
      .map((component) => component.name),
  });
  const key = (name: string) => name.replaceAll('\\', '/').toLowerCase();
  const files = new Map([
    [key(fileName), augmented],
    [key(`${directory}${page.name}.generated.d.ts`), generatePageTypings(page)],
    [key(`${directory}runtime.d.ts`), generateRuntimeTypings()],
  ]);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getCurrentDirectory: () => directory,
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
    getScriptFileNames: () => [
      fileName,
      `${directory}${page.name}.generated.d.ts`,
      `${directory}runtime.d.ts`,
    ],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const text = files.get(key(name)) ?? ts.sys.readFile(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    fileExists: (name) => files.has(key(name)) || ts.sys.fileExists(name),
    readFile: (name) => files.get(key(name)) ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: (name) =>
      key(name) === key(directory).replace(/\/$/u, '') || ts.sys.directoryExists(name),
    getDirectories: ts.sys.getDirectories,
  };
  return { service: ts.createLanguageService(host), fileName, source };
}

it('offers native binding members through direct and this-scoped typed ComboBox instances', () => {
  const fixture = serviceFor(`ComboBox1.bindApiClient(ApiClient1);
    this.ComboBox1.value = '2';
    this.ComboBox1.values = ['1', '2'];
    const keys: readonly string[] = ComboBox1.values; void keys;
    const configuration = this.ComboBox1.comboBoxConfig;
    if (configuration !== null) { const key: string = configuration.keyField; void key; }
    ComboBox1.value; this.ComboBox1.value;`);
  try {
    expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
    for (const text of ['ComboBox1.value;', 'this.ComboBox1.value;']) {
      const offset = fixture.source.lastIndexOf(text) + text.indexOf('value');
      const names = fixture.service
        .getCompletionsAtPosition(fixture.fileName, offset, {})
        ?.entries.map((entry) => entry.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'value',
          'selectedIndex',
          'items',
          'comboBoxConfig',
          'bindApiClient',
        ]),
      );
    }
  } finally {
    fixture.service.dispose();
  }
});

it('diagnoses invalid key/value/binding assignments and preserves lexical shadowing', () => {
  const fixture = serviceFor(`this.ComboBox1.value = 3;
    this.ComboBox1.values = [1];
    this.ComboBox1.bindApiClient('ApiClient1');
    if (this.ComboBox1.comboBoxConfig) this.ComboBox1.comboBoxConfig.keyField = 3;
    { const ComboBox1 = { local: true }; ComboBox1.local; ComboBox1.bindApiClient(null); }`);
  try {
    const diagnostics = fixture.service.getSemanticDiagnostics(fixture.fileName);
    expect(diagnostics).toHaveLength(5);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([2322, 2345, 2540, 2339]),
    );
    const position = fixture.source.indexOf('ComboBox1.local;') + 'ComboBox1.'.length;
    const names = fixture.service
      .getCompletionsAtPosition(fixture.fileName, position, {})
      ?.entries.map((entry) => entry.name);
    expect(names).toContain('local');
    expect(names).not.toContain('comboBoxConfig');
  } finally {
    fixture.service.dispose();
  }
});

it('generates model-backed initialization, local API binding, and subscription disposal for pages and reusables', () => {
  const page = comboBoxProject().pages[0];
  if (page === undefined) throw new Error('Missing page.');
  const source = generatePageSource(page);
  expect(source).toContain('this.ComboBox1.comboBoxConfig = {');
  expect(source).toContain('this.ComboBox1.bindApiClient(this.ApiClient1);');
  expect(source).toContain('this.ComboBox1.dispose();');
  const reusable = createReusableElement('CustomerPicker');
  const definition = {
    ...reusable,
    components: page.components.map((component) =>
      component.id === page.rootComponentId
        ? { ...component, id: reusable.rootComponentId, name: reusable.name, type: 'WebPanel' }
        : { ...component, parentId: reusable.rootComponentId },
    ),
  };
  const reusableSource = generateReusableElementSource(definition);
  expect(reusableSource).toContain(
    'this.requireComponentElement(this.componentId("customer-combo"))',
  );
  expect(reusableSource).toContain('this.ComboBox1.bindApiClient(this.ApiClient1);');
});
