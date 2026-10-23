import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { createReusableElement } from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  generatePageSource,
  generatePageTypings,
  generateReusableElementSource,
  generateReusableElementTypings,
  generateRuntimeTypings,
  ensureEventHandler,
} from '../src/index.js';
import { appendComponentReferenceDeclarations } from '../src/component-references.js';
import { timerProject } from '../../../tests/fixtures/timer.js';
function timerDocument(reusable: boolean) {
  const page = timerProject().pages[0]!;
  if (!reusable) return page;
  const definition = createReusableElement('TimerCard');
  return {
    ...definition,
    components: page.components.map((c) =>
      c.id === page.rootComponentId
        ? { ...c, id: definition.rootComponentId, name: definition.name, type: 'WebPanel' }
        : { ...c, parentId: definition.rootComponentId },
    ),
  };
}
function serviceFor(body: string, reusable = false) {
  const document = timerDocument(reusable);
  const directory = fileURLToPath(new URL('./file-upload-virtual/', import.meta.url));
  const fileName = `${directory}${document.name}.ts`;
  const source = `import { WebTimer, type WebTimerConfiguration, type WebTimerEventDetail } from '@webrad/runtime';
import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated {
  public async run(): Promise<void> { ${body} }
}`;
  const augmented = appendComponentReferenceDeclarations(ts, fileName, source, {
    className: document.name,
    generatedClassName: `${document.name}Generated`,
    componentNames: document.components
      .filter((component) => component.id !== document.rootComponentId)
      .map((component) => component.name),
  });
  const key = (name: string) => name.replaceAll('\\', '/').toLowerCase();
  const declarationFileName = `${directory}${document.name}.generated.d.ts`;
  const runtimeFileName = `${directory}runtime.d.ts`;
  const files = new Map([
    [key(fileName), augmented],
    [
      key(declarationFileName),
      reusable ? generateReusableElementTypings(document) : generatePageTypings(document),
    ],
    [key(runtimeFileName), generateRuntimeTypings()],
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
    getScriptFileNames: () => [fileName, declarationFileName, runtimeFileName],
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

it.each([false, true])(
  'provides concrete Timer completion, signatures and diagnostics in reusable=%s',
  (reusable) => {
    const valid = serviceFor(
      'Timer1.Start(); this.Timer1.Stop(); Timer1.Restart(); Timer1.time = 25; Timer1.loop = false; const config: WebTimerConfiguration = { enabled: true }; void config;',
      reusable,
    );
    expect(valid.service.getSemanticDiagnostics(valid.fileName)).toEqual([]);
    valid.service.dispose();
    const fixture = serviceFor('Timer1.Start(); this.Timer1.Stop();', reusable);
    const point = fixture.source.indexOf('Timer1.Start') + 'Timer1.'.length;
    expect(
      fixture.service
        .getCompletionsAtPosition(fixture.fileName, point, {})
        ?.entries.map((e) => e.name),
    ).toEqual(
      expect.arrayContaining([
        'Start',
        'Stop',
        'Restart',
        'time',
        'loop',
        'enabled',
        'tickCount',
        'onTimer',
      ]),
    );
    expect(
      ts.displayPartsToString(
        fixture.service.getQuickInfoAtPosition(fixture.fileName, point)?.displayParts,
      ),
    ).toContain('Start(): void');
    fixture.service.dispose();
    const invalid = serviceFor(
      'Timer1.time = "fast"; Timer1.loop = 1; Timer1.tickCount = 5; Timer1.missing();',
      reusable,
    );
    expect(invalid.service.getSemanticDiagnostics(invalid.fileName)).toHaveLength(4);
    invalid.service.dispose();
    const document = timerDocument(reusable);
    const source = reusable
      ? generateReusableElementSource(document)
      : generatePageSource(document);
    expect(source).toContain('new WebTimer(');
    expect(source).toContain('this.Timer1.dispose()');
  },
);
it('creates the Interact handler with typed sender and tick detail', () => {
  const event = defaultComponentRegistry
    .require('WebTimer')
    .events.find((e) => e.name === 'OnTimer')!;
  const edit = ensureEventHandler('export class PageMain {}', {
    className: 'PageMain',
    componentName: 'Timer1',
    componentType: 'WebTimer',
    eventName: event.name,
    eventDetailType: event.eventDetailType,
    eventDetailProperties: event.eventDetailProperties,
  });
  expect(edit.sourceText).toContain('sender: WebTimer, event: CustomEvent<WebTimerEventDetail>');
});
