import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import {
  appendComponentReferenceDeclarations,
  componentReferenceScope,
  currentRowHandlerType,
  ensureEventHandler,
  generatePageSource,
  generatePageTypings,
  generateRuntimeTypings,
} from '../src/index.js';
import { repeatingGroupProject } from '../../../tests/fixtures/repeating-group.js';

function serviceFor(body: string) {
  const page = repeatingGroupProject().pages[0]!;
  const directory = fileURLToPath(new URL('./repeating-group-virtual/', import.meta.url));
  const fileName = `${directory}${page.name}.ts`;
  const source = `import { ${page.name}Generated } from './${page.name}.generated';
import type { RepeatingGroup0CurrentRow } from './${page.name}.generated';
import type { WebButton } from '@webrad/runtime';
export class ${page.name} extends ${page.name}Generated {
  public choose0(sender: WebButton, event: Event, CurrentRow: RepeatingGroup0CurrentRow): void { ${body} }
}`;
  const key = (name: string) => name.replaceAll('\\', '/').toLowerCase();
  const files = new Map([
    [
      key(fileName),
      appendComponentReferenceDeclarations(ts, fileName, source, componentReferenceScope(page)),
    ],
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
    getDirectories: ts.sys.getDirectories,
    directoryExists: (name) =>
      key(name) === key(directory).replace(/\/$/u, '') || ts.sys.directoryExists(name),
  };
  return { service: ts.createLanguageService(host), fileName, source };
}

it('provides native typed current-row fields and concrete visual component APIs', () => {
  const fixture = serviceFor(`const name: string = CurrentRow.value.name;
    const id: number = CurrentRow.value.id; void name; void id;
    Name0.text = CurrentRow.value.name; this.Name0.text = String(CurrentRow.value.id);
    RepeatingGroup0.rows = [{ id: 2, name: 'Second', 'full/name': 'Second' }];
    CurrentRow.value.name; RepeatingGroup0.rowCount;`);
  try {
    expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
    const rowPosition =
      fixture.source.lastIndexOf('CurrentRow.value.name;') + 'CurrentRow.value.'.length;
    expect(
      fixture.service
        .getCompletionsAtPosition(fixture.fileName, rowPosition, {})
        ?.entries.map((entry) => entry.name),
    ).toEqual(expect.arrayContaining(['id', 'name']));
    const group = fixture.source.indexOf('RepeatingGroup0.rowCount;') + 'RepeatingGroup0.'.length;
    expect(
      fixture.service
        .getCompletionsAtPosition(fixture.fileName, group, {})
        ?.entries.map((entry) => entry.name),
    ).toEqual(expect.arrayContaining(['rows', 'rowCount', 'getRow', 'bindApiClient']));
  } finally {
    fixture.service.dispose();
  }
});

it('diagnoses nonexistent row fields, readonly writes and invalid visual values with lexical shadowing', () => {
  const fixture = serviceFor(`CurrentRow.value.missing; CurrentRow.value.id = 2;
    this.Name0.text = 2; this.RepeatingGroup0.rows = 'bad';
    { const Name0 = { local: true }; Name0.local; }
    { const CurrentRow = { value: { local: true } }; CurrentRow.value.local; }`);
  try {
    expect(
      fixture.service.getSemanticDiagnostics(fixture.fileName).map((diagnostic) => diagnostic.code),
    ).toEqual(expect.arrayContaining([2339, 2540, 2322]));
    expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toHaveLength(4);
  } finally {
    fixture.service.dispose();
  }
});

it('generates isolated subscriptions and avoids constructing template components before data exists', () => {
  const page = repeatingGroupProject().pages[0]!;
  const source = generatePageSource(page);
  expect(source).toContain(
    'public readonly RepeatingGroup0: WebRepeatingGroup<RepeatingGroup0RowValue>',
  );
  expect(source).toContain(
    'export type RepeatingGroup0CurrentRow = WebRepeatingGroupCurrentRow<RepeatingGroup0RowValue>',
  );
  expect(source).toContain('this.RepeatingGroup0.subscribeRows((CurrentRow0)');
  expect(source).toContain('CurrentRow0.component<WebButton>("button-fixed")');
  expect(source).toContain('this.RepeatingGroup0.dispose();');
  expect(source).not.toContain('this.Name0 = new WebLabel');
  expect(currentRowHandlerType(page, 'button-fixed')).toBe('RepeatingGroup0CurrentRow');
  expect(currentRowHandlerType(page, 'reload')).toBeUndefined();
});

it('creates and upgrades authored row handlers through TypeScript AST without changing method bodies', () => {
  const source = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {}`;
  const request = {
    className: 'PageMain',
    componentName: 'Choose0',
    componentType: 'WebButton',
    eventName: 'OnClick',
    currentRowType: 'RepeatingGroup0CurrentRow',
  };
  const edit = ensureEventHandler(source, request);
  expect(edit.text).toContain(
    'sender: WebButton, event: MouseEvent, CurrentRow: RepeatingGroup0CurrentRow',
  );
  expect(edit.text).toContain(
    'import type { RepeatingGroup0CurrentRow } from "./PageMain.generated"',
  );
  const existing = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated { Choose0Click() { const saved = 'preserved'; void saved; } }`;
  const upgrade = ensureEventHandler(existing, request);
  expect(upgrade.text).toContain(
    'CurrentRow: import("./PageMain.generated").RepeatingGroup0CurrentRow',
  );
  expect(upgrade.text).toContain("const saved = 'preserved'; void saved;");
  expect(ensureEventHandler(upgrade.text, request).changed).toBe(false);
});

it('reuses generated row imports and their aliases across multiple handlers', () => {
  const source = `import { PageMainGenerated } from './PageMain.generated';
import type { RepeatingGroup0CurrentRow as Row } from './PageMain.generated';
export class PageMain extends PageMainGenerated {}`;
  const request = {
    className: 'PageMain',
    componentName: 'Choose0',
    componentType: 'WebButton',
    eventName: 'OnClick',
    currentRowType: 'RepeatingGroup0CurrentRow',
  };
  const first = ensureEventHandler(source, request);
  const second = ensureEventHandler(first.text, { ...request, componentName: 'Choose1' });
  expect(second.text.match(/RepeatingGroup0CurrentRow/gu)).toHaveLength(1);
  expect(second.text.match(/CurrentRow: Row/gu)).toHaveLength(2);
});

it('updates a moved or renamed row handler type and removes its obsolete unused import', () => {
  const source = `import { PageMainGenerated } from './PageMain.generated';
import type { OldGroupCurrentRow } from './PageMain.generated';
import type { WebButton } from '@webrad/runtime';
export class PageMain extends PageMainGenerated {
  Choose0Click(sender: WebButton, event: Event, CurrentRow: OldGroupCurrentRow) { const selected = CurrentRow.value; void selected; }
}`;
  const request = {
    className: 'PageMain',
    componentName: 'Choose0',
    componentType: 'WebButton',
    eventName: 'OnClick',
    currentRowType: 'RepeatingGroup0CurrentRow',
  };
  const result = ensureEventHandler(source, request);
  expect(result.text).not.toContain('OldGroupCurrentRow');
  expect(result.text).toContain(
    'CurrentRow: import("./PageMain.generated").RepeatingGroup0CurrentRow',
  );
  expect(result.text).toContain('const selected = CurrentRow.value; void selected;');
  expect(ensureEventHandler(result.text, request).changed).toBe(false);
});

it('upgrades assigned arrow and function property handler signatures without replacing bodies', () => {
  const request = {
    className: 'PageMain',
    componentName: 'Choose0',
    componentType: 'WebButton',
    eventName: 'OnClick',
    currentRowType: 'RepeatingGroup0CurrentRow',
  };
  for (const initializer of [
    '() => { const saved = 1; void saved; }',
    'function() { const saved = 1; void saved; }',
    'sender => { const saved = 1; void saved; }',
  ]) {
    const source = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated { Choose0Click = ${initializer}; }`;
    const result = ensureEventHandler(source, request);
    expect(result.text).toContain(
      'CurrentRow: import("./PageMain.generated").RepeatingGroup0CurrentRow',
    );
    expect(result.text).toContain('const saved = 1; void saved;');
    expect(ensureEventHandler(result.text, request).changed).toBe(false);
  }
});
