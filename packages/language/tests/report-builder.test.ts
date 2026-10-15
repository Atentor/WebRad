import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, createPage, createReusableElement } from '@webrad/project-model';
import { createDefaultReportTemplate } from '@webrad/runtime/report-template';
import { appendComponentReferenceDeclarations } from '../src/component-references.js';
import {
  generatePageSource,
  generatePageTypings,
  generateReusableElementSource,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '../src/index.js';

function reportDocument(reusable: boolean) {
  let document = reusable ? createReusableElement('ReportCard') : createPage('PageReports');
  document = addComponent(
    document,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'report-api-id',
      name: 'CustomersApi',
      parentId: document.rootComponentId,
    }),
  );
  return addComponent(
    document,
    defaultComponentRegistry.createComponent('WebReportBuilder', {
      id: 'report-id',
      name: 'ReportBuilder1',
      parentId: document.rootComponentId,
      props: {
        reportTemplate: {
          ...createDefaultReportTemplate(),
          parameters: [
            { name: 'Title', type: 'string', defaultValue: 'Sales' },
            { name: 'Year', type: 'number', defaultValue: 2026 },
            { name: 'Published', type: 'boolean', defaultValue: false },
            { name: 'Date', type: 'date', defaultValue: null },
          ],
        },
      },
    }),
  );
}

function serviceFor(body: string, reusable: boolean) {
  const document = reportDocument(reusable);
  const directory = fileURLToPath(new URL('./report-builder-virtual/', import.meta.url));
  const fileName = `${directory}${document.name}.ts`;
  const declarationName = `${directory}${document.name}.generated.d.ts`;
  const runtimeName = `${directory}runtime.d.ts`;
  const source = `import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated { public async run(): Promise<void> { ${body} } }`;
  const augmented = appendComponentReferenceDeclarations(ts, fileName, source, {
    className: document.name,
    generatedClassName: `${document.name}Generated`,
    componentNames: document.components
      .filter((component) => component.id !== document.rootComponentId)
      .map((component) => component.name),
  });
  const key = (name: string) => name.replaceAll('\\', '/').toLowerCase();
  const files = new Map([
    [key(fileName), augmented],
    [key(runtimeName), generateRuntimeTypings()],
    [
      key(declarationName),
      reusable ? generateReusableElementTypings(document) : generatePageTypings(document),
    ],
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
    getScriptFileNames: () => [fileName, declarationName, runtimeName],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const value = files.get(key(name)) ?? ts.sys.readFile(name);
      return value === undefined ? undefined : ts.ScriptSnapshot.fromString(value);
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

it.each([false, true])(
  'exposes typed nested report sections, appearance and grid completion for reusable=%s',
  (reusable) => {
    const fixture = serviceFor(
      `const group = ReportBuilder1.template.bands[0]!.elements[0]!;
if (group.type === 'repeater') {
  const columns: number | undefined = group.layout?.columns;
  const height: number | undefined = group.header?.height;
  const headerColumns: number | undefined = group.header?.columns;
  const footerGap: number | undefined = group.footer?.columnGap;
  const color: string | null | undefined = group.appearance?.backgroundColor;
  const inner = group.children[0];
  if (inner?.type === 'repeater') { const footer = inner.footer; void footer; }
  void columns; void height; void color; void headerColumns; void footerGap; group.header;
}`,
      reusable,
    );
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
      const position = fixture.source.lastIndexOf('group.header;') + 'group.'.length;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, position, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(expect.arrayContaining(['header', 'footer', 'children', 'appearance', 'layout']));
      const columnPosition =
        fixture.source.indexOf('group.header?.columns') + 'group.header?.'.length;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, columnPosition, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(expect.arrayContaining(['columns', 'columnGap', 'elements', 'height']));
    } finally {
      fixture.service.dispose();
    }
    const invalid = serviceFor(
      `const group = this.ReportBuilder1.template.bands[0]!.elements[0]!;
if (group.type === 'repeater') {
  const layout: NonNullable<typeof group.layout> = { columns: 2, rows: 0, columnGap: 0, fill: 'spiral' };
  group.footer = undefined; void layout;
}`,
      reusable,
    );
    try {
      expect(invalid.service.getSemanticDiagnostics(invalid.fileName)).toHaveLength(2);
    } finally {
      invalid.service.dispose();
    }
  },
);

it.each([false, true])(
  'generates isolated concrete report instances and loaded API bindings for reusable=%s',
  (reusable) => {
    const document = reportDocument(reusable);
    const source = reusable
      ? generateReusableElementSource(document)
      : generatePageSource(document);
    expect(source).toContain('new WebReportBuilder<ReportBuilder1ReportParameters>');
    expect(source).toContain(
      'this.ReportBuilder1.bindApiClient("report-api-id", this.CustomersApi);',
    );
    expect(source).toContain(
      'this.ReportBuilder1.bindApiClient("CustomersApi", this.CustomersApi);',
    );
    expect(source).toContain('this.ReportBuilder1.dispose();');
    expect(source).not.toContain('ReportBuilder1.withRequests');
  },
);

it.each([false, true])(
  'offers report and parameter completion, hover, signatures and diagnostics for reusable=%s',
  (reusable) => {
    const fixture = serviceFor(
      `ReportBuilder1.Parameters.Set('Title', 'Sales'); this.ReportBuilder1.Parameters.Set('Year', 2026);
ReportBuilder1.Parameters.Set('Published', true); ReportBuilder1.Parameters.Set('Date', '2026-10-14');
const title: string | null = ReportBuilder1.Parameters.Get('Title');
const pdf = await ReportBuilder1.GeneratePDF(); const count: number = pdf.pageCount;
await ReportBuilder1.LoadTemplate(ReportBuilder1.SaveTemplate()); ReportBuilder1.ClosePreview();
await ReportBuilder1.Generate({ previewMode: 'download', fileName: 'sales.pdf' }); void title; void count;
this.ReportBuilder1.GeneratePDF(); ReportBuilder1.GeneratePDF();`,
      reusable,
    );
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
      for (const text of ['this.ReportBuilder1.GeneratePDF();', 'ReportBuilder1.GeneratePDF();']) {
        const position = fixture.source.lastIndexOf(text) + text.indexOf('GeneratePDF');
        expect(
          fixture.service
            .getCompletionsAtPosition(fixture.fileName, position, {})
            ?.entries.map((entry) => entry.name),
        ).toEqual(
          expect.arrayContaining([
            'GeneratePDF',
            'Generate',
            'LoadTemplate',
            'SaveTemplate',
            'ClosePreview',
            'Parameters',
            'previewMode',
            'fileName',
            'template',
          ]),
        );
        expect(
          ts.displayPartsToString(
            fixture.service.getQuickInfoAtPosition(fixture.fileName, position)?.displayParts,
          ),
        ).toContain('Promise<WebReportResult>');
        const signature = fixture.service.getSignatureHelpItems(
          fixture.fileName,
          position + 'GeneratePDF('.length,
          undefined,
        );
        expect(signature?.items[0]?.parameters[0]?.name).toBe('options');
      }
      const setPosition = fixture.source.indexOf("Set('Title'") + 'Set('.length + 1;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, setPosition, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(expect.arrayContaining(['Title', 'Year', 'Published', 'Date']));
    } finally {
      fixture.service.dispose();
    }
    const invalid = serviceFor(
      `ReportBuilder1.Parameters.Set('Year', 'wrong'); ReportBuilder1.Parameters.Set('Missing', 1); ReportBuilder1.previewMode = 'popup'; ReportBuilder1.NotAReportMethod();`,
      reusable,
    );
    try {
      expect(invalid.service.getSemanticDiagnostics(invalid.fileName)).toHaveLength(4);
    } finally {
      invalid.service.dispose();
    }
  },
);
