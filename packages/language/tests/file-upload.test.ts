import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, createReusableElement } from '@webrad/project-model';
import {
  generatePageSource,
  generatePageTypings,
  generateReusableElementSource,
  generateReusableElementTypings,
  generateRuntimeTypings,
  ensureEventHandler,
} from '../src/index.js';
import { appendComponentReferenceDeclarations } from '../src/component-references.js';
import { fileUploadProject } from '../../../tests/fixtures/file-upload.js';

function uploadDocument(reusable: boolean) {
  const fixturePage = fileUploadProject().pages[0];
  if (fixturePage === undefined) throw new Error('Missing upload page.');
  const page = addComponent(
    fixturePage,
    defaultComponentRegistry.createComponent('WebLabel', {
      id: 'upload-progress-label',
      name: 'ProgressLabel',
      parentId: fixturePage.rootComponentId,
      props: { caption: 'Aguardando' },
    }),
    fixturePage.rootComponentId,
  );
  if (!reusable) return page;
  const definition = createReusableElement('AttachmentPicker');
  return {
    ...definition,
    components: page.components.map((component) =>
      component.id === page.rootComponentId
        ? { ...component, id: definition.rootComponentId, name: definition.name, type: 'WebPanel' }
        : { ...component, parentId: definition.rootComponentId },
    ),
  };
}

function serviceFor(body: string, reusable = false) {
  const document = uploadDocument(reusable);
  const directory = fileURLToPath(new URL('./file-upload-virtual/', import.meta.url));
  const fileName = `${directory}${document.name}.ts`;
  const source = `import { WebFileUpload, type WebFileUploadConfiguration, type WebFileUploadOptions, type WebFileUploadResult, type WebFileUploadSelection, type WebFileUploadProgressEventDetail } from '@webrad/runtime';
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
  'offers concrete FileUpload completion, hover and signatures in reusable=%s',
  (reusable) => {
    const fixture = serviceFor(
      `const instance: WebFileUpload = FileUpload1;
    const options: WebFileUploadOptions = { isPublic: false, name: 'photo.png', signal: new AbortController().signal };
    const configuration: WebFileUploadConfiguration = { id: 'upload', name: 'NewUpload', accept: '.pdf', enabled: true, isPublic: false };
    const service: WebFileUpload = new WebFileUpload(configuration);
    const file: WebFileUploadSelection | null = await this.FileUpload1.OpenFile();
    const path: string | null | undefined = file?.path;
    const size: number | undefined = file?.size;
    const extension: string | undefined = file?.extension;
    const result: WebFileUploadResult = await FileUpload1.SendToRestGO(options);
    const id: string = result.id; const url: string = result.url; const isPublic: boolean = result.isPublic;
    const originalName: string = result.originalName; const downloadUrl: string = result.downloadUrl;
    const contentType: string = result.contentType; const updated: string = result.updatedAt;
    const bytes: number = result.sizeBytes; const created: string = result.createdAt;
    const owner: string | undefined = result.ownerId; const ownerEmail: string | undefined = result.ownerEmail;
    FileUpload1.onSuccess = (sender) => { const sent: string | undefined = sender.result?.id; void sent; };
    void instance; void service; void file; void path; void size; void extension; void originalName; void downloadUrl; void contentType; void updated; void bytes; void created; void owner; void ownerEmail; void id; void url; void isPublic;
    FileUpload1.SendToRestGO(); this.FileUpload1.SendToRestGO();
    FileUpload1.OpenFile(); this.FileUpload1.OpenFile();
    result.id; file?.name;`,
      reusable,
    );
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
      for (const text of ['FileUpload1.SendToRestGO();', 'this.FileUpload1.SendToRestGO();']) {
        const position = fixture.source.lastIndexOf(text) + text.indexOf('SendToRestGO');
        const names = fixture.service
          .getCompletionsAtPosition(fixture.fileName, position, {})
          ?.entries.map((entry) => entry.name);
        expect(names).toEqual(
          expect.arrayContaining([
            'OpenFile',
            'SendToRestGO',
            'Clear',
            'accept',
            'isPublic',
            'selectedFile',
            'selection',
            'fileName',
            'uploading',
            'result',
            'lastError',
            'onChange',
            'onSuccess',
            'onError',
            'onComplete',
            'onProgress',
            'progress',
          ]),
        );
        for (const legacy of [
          'selectFile',
          'upload',
          'clear',
          'caption',
          'uploadCaption',
          'element',
        ])
          expect(names).not.toContain(legacy);
        const hover = fixture.service.getQuickInfoAtPosition(fixture.fileName, position);
        expect(ts.displayPartsToString(hover?.displayParts)).toContain(
          'SendToRestGO(options?: WebFileUploadOptions): Promise<WebFileUploadResult>',
        );
        const signature = fixture.service.getSignatureHelpItems(
          fixture.fileName,
          position + 'SendToRestGO('.length,
          undefined,
        );
        expect(signature?.items[0]?.parameters[0]?.name).toBe('options');
        expect(ts.displayPartsToString(signature?.items[0]?.suffixDisplayParts)).toContain(
          'Promise<WebFileUploadResult>',
        );
      }
      for (const text of ['FileUpload1.OpenFile();', 'this.FileUpload1.OpenFile();']) {
        const position = fixture.source.lastIndexOf(text) + text.indexOf('OpenFile');
        const hover = fixture.service.getQuickInfoAtPosition(fixture.fileName, position);
        expect(ts.displayPartsToString(hover?.displayParts)).toContain(
          'OpenFile(): Promise<WebFileUploadSelection | null>',
        );
        const signature = fixture.service.getSignatureHelpItems(
          fixture.fileName,
          position + 'OpenFile('.length,
          undefined,
        );
        expect(signature?.items[0]?.parameters).toEqual([]);
      }
      const resultPosition = fixture.source.lastIndexOf('result.id;') + 'result.'.length;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, resultPosition, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(
        expect.arrayContaining([
          'id',
          'url',
          'downloadUrl',
          'isPublic',
          'originalName',
          'contentType',
          'sizeBytes',
          'ownerId',
          'ownerEmail',
          'createdAt',
          'updatedAt',
        ]),
      );
      const selectionPosition = fixture.source.lastIndexOf('file?.name;') + 'file?.'.length;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, selectionPosition, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(expect.arrayContaining(['name', 'path', 'size', 'extension']));
    } finally {
      fixture.service.dispose();
    }
  },
);

it('rejects invalid upload options and readonly state while retaining lexical shadowing', () => {
  const fixture = serviceFor(`this.FileUpload1.SendToRestGO({ isPublic: 'false' });
    FileUpload1.SendToRestGO({ name: 42 });
    FileUpload1.selectedFile = null;
    this.FileUpload1.result = { id: 'fake', url: '/fake', isPublic: true };
    FileUpload1.isPublic = 1;
    FileUpload1.result?.id.toFixed();
    { const FileUpload1 = { local: true }; FileUpload1.local; FileUpload1.SendToRestGO(); }`);
  try {
    const diagnostics = fixture.service.getSemanticDiagnostics(fixture.fileName);
    expect(diagnostics).toHaveLength(7);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([2322, 2540, 2339]),
    );
    const position = fixture.source.indexOf('FileUpload1.local;') + 'FileUpload1.'.length;
    const names = fixture.service
      .getCompletionsAtPosition(fixture.fileName, position, {})
      ?.entries.map((entry) => entry.name);
    expect(names).toContain('local');
    expect(names).not.toContain('SendToRestGO');
  } finally {
    fixture.service.dispose();
  }
});

it('rejects visual properties, obsolete lowercase aliases and malformed nonvisual configuration', () => {
  const fixture = serviceFor(`FileUpload1.selectFile();
    this.FileUpload1.upload();
    FileUpload1.clear();
    FileUpload1.caption = 'Choose';
    FileUpload1.uploadCaption = 'Send';
    FileUpload1.element.focus();
    new WebFileUpload('upload');
    new WebFileUpload({ enabled: 'true' });
    if (FileUpload1.result) FileUpload1.result.sizeBytes = 1;
    if (this.FileUpload1.selection) this.FileUpload1.selection.size = 1;`);
  try {
    const diagnostics = fixture.service.getSemanticDiagnostics(fixture.fileName);
    expect(diagnostics).toHaveLength(10);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([2339, 2559, 2322, 2540]),
    );
  } finally {
    fixture.service.dispose();
  }
});

it.each([false, true])('types measured progress for Label updates in reusable=%s', (reusable) => {
  const fixture = serviceFor(
    `const event: CustomEvent<WebFileUploadProgressEventDetail> = new CustomEvent('progress', {
      detail: { percentage: 50, loaded: 128, total: 256, lengthComputable: true },
    });
    const { percentage, loaded, total, lengthComputable } = event.detail;
    const bytes: number = loaded; const size: number | null = total; const measurable: boolean = lengthComputable;
    const current: number | null = this.FileUpload1.progress;
    ProgressLabel.text = percentage === null ? 'Enviando' : String(percentage) + '%';
    this.ProgressLabel.text = String(current ?? 0);
    void bytes; void size; void measurable;
    event.detail.percentage;`,
    reusable,
  );
  try {
    expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
    const position =
      fixture.source.lastIndexOf('event.detail.percentage;') + 'event.detail.'.length;
    expect(
      fixture.service
        .getCompletionsAtPosition(fixture.fileName, position, {})
        ?.entries.map((entry) => entry.name),
    ).toEqual(expect.arrayContaining(['percentage', 'loaded', 'total', 'lengthComputable']));
  } finally {
    fixture.service.dispose();
  }
});

it('scaffolds registered typed OnProgress details and diagnoses invalid percentage bindings', () => {
  const event = defaultComponentRegistry
    .require('WebFileUpload')
    .events.find((candidate) => candidate.name === 'OnProgress');
  if (event === undefined) throw new Error('Missing upload progress event.');
  const handler = ensureEventHandler('export class PageMain {}\n', {
    className: 'PageMain',
    componentName: 'FileUpload1',
    componentType: 'WebFileUpload',
    eventName: event.name,
    eventDetailType: event.eventDetailType,
    eventDetailProperties: event.eventDetailProperties,
  });
  expect(handler.sourceText).toContain(
    'sender: WebFileUpload, event: CustomEvent<WebFileUploadProgressEventDetail>',
  );
  expect(handler.sourceText).toContain(
    'const { percentage, loaded, total, lengthComputable } = event.detail;',
  );
  const fixture =
    serviceFor(`const progress: WebFileUploadProgressEventDetail = { percentage: '50', loaded: 1, total: 2, lengthComputable: true };
    ProgressLabel.text = progress.percentage;
    const percentage: number = this.FileUpload1.progress;
    progress.total = '100';
    void percentage;`);
  try {
    expect(
      fixture.service.getSemanticDiagnostics(fixture.fileName).map((diagnostic) => diagnostic.code),
    ).toEqual([2322, 2322, 2322, 2322]);
  } finally {
    fixture.service.dispose();
  }
});

it('generates typed upload instances and event bindings for pages and reusable placements', () => {
  const page = uploadDocument(false);
  const typings = generatePageTypings(page);
  expect(typings).toContain('WebFileUpload');
  expect(typings).toContain('public readonly FileUpload1: WebFileUpload;');
  const source = generatePageSource(page);
  expect(source).toContain('new WebFileUpload({');
  expect(source).not.toContain('requireComponentElement("file-upload")');
  expect(source).toContain('this.FileUpload1.dispose();');
  expect(source).toContain('"id":"file-upload"');
  expect(source).toContain('"name":"FileUpload1"');
  expect(source).toContain('"accept":".txt,image/*"');
  expect(source).toContain('"isPublic":false');
  expect(source).toContain('this.bindGeneratedEvent(this.FileUpload1, "OnSuccess", "fileSent");');
  expect(source).toContain('this.bindGeneratedEvent(this.FileUpload1, "OnError", "fileFailed");');
  expect(source).toContain(
    'this.bindGeneratedEvent(this.FileUpload1, "OnProgress", "uploadProgress");',
  );
  const reusable = uploadDocument(true);
  const reusableSource = generateReusableElementSource(reusable);
  expect(reusableSource).not.toContain('this.componentId("file-upload")');
  expect(reusableSource).toContain('new WebFileUpload({');
  expect(reusableSource).toContain('this.FileUpload1.dispose();');
  expect(generateReusableElementTypings(reusable)).toContain(
    'public readonly FileUpload1: WebFileUpload;',
  );
});
