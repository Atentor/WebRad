import ts from 'typescript';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { createReusableElement } from '@webrad/project-model';
import {
  generatePageSource,
  generatePageTypings,
  generateReusableElementSource,
  generateReusableElementTypings,
  generateRuntimeTypings,
  ensureEventHandler,
} from '../src/index.js';
import { appendComponentReferenceDeclarations } from '../src/component-references.js';
import { videoUploadProject } from '../../../tests/fixtures/video-upload';

function serviceFor(body: string, reusable = false) {
  const page = videoUploadProject().pages[0]!;
  const definition = createReusableElement('VideoPicker');
  const document = reusable
    ? {
        ...definition,
        components: page.components.map((entry) =>
          entry.id === page.rootComponentId
            ? { ...entry, id: definition.rootComponentId, name: definition.name, type: 'WebPanel' }
            : { ...entry, parentId: definition.rootComponentId },
        ),
      }
    : page;
  const filename = `C:/video-language/${document.name}.ts`;
  const source = `import { WebVideoUpload, type WebVideoUploadConfiguration, type WebVideoUploadProgressEventDetail } from '@webrad/runtime';
import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated { public async run() { ${body} } }`;
  const declaration = filename.replace('.ts', '.generated.d.ts');
  const runtime = 'C:/video-language/runtime.d.ts';
  const files = new Map([
    [
      filename,
      appendComponentReferenceDeclarations(ts, filename, source, {
        className: document.name,
        generatedClassName: `${document.name}Generated`,
        componentNames: document.components
          .filter((entry) => entry.id !== document.rootComponentId)
          .map((entry) => entry.name),
      }),
    ],
    [
      declaration,
      reusable ? generateReusableElementTypings(document) : generatePageTypings(document),
    ],
    [runtime, generateRuntimeTypings()],
  ]);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const normalized = (name: string) => name.replaceAll('\\', '/');
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options,
    getCurrentDirectory: () => 'C:/video-language',
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const value = files.get(normalized(name)) ?? ts.sys.readFile(name);
      return value === undefined ? undefined : ts.ScriptSnapshot.fromString(value);
    },
    fileExists: (name) => files.has(normalized(name)) || ts.sys.fileExists(name),
    readFile: (name) => files.get(normalized(name)) ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: (name) =>
      normalized(name) === 'C:/video-language' || ts.sys.directoryExists(name),
    getDirectories: ts.sys.getDirectories,
  };
  return { source, filename, document, service: ts.createLanguageService(host) };
}
it.each([false, true])(
  'offers concrete video APIs, limits, hover and signatures in reusable=%s',
  (reusable) => {
    const fixture = serviceFor(
      `
    const configuration: WebVideoUploadConfiguration = { maxFileSizeMB: 50, maxDurationSeconds: 60, isPublic: false };
    const typed: WebVideoUpload = VideoUpload1;
    const selected = await this.VideoUpload1.OpenFile();
    const duration: number | null | undefined = selected?.duration;
    const video = await VideoUpload1.SendToRestGO({ title: 'Aula', descri: 'Intro', isPublic: false });
    const id: string = video.id;
    VideoUpload1.Pause(); await this.VideoUpload1.Resume(); await VideoUpload1.CancelUpload();
    await this.VideoUpload1.WaitUntilReady({ timeoutMs: 1000 });
    const progress: WebVideoUploadProgressEventDetail = { confirmedBytes: 5, totalBytes: 10, percentage: 50, chunk: null };
    VideoUpload1.maxDurationSeconds = null;
    VideoUpload1.SendToRestGO(); this.VideoUpload1.SendToRestGO();
    { const VideoUpload1 = { local: true }; VideoUpload1.local; }
    void configuration; void typed; void duration; void id; void progress;`,
      reusable,
    );
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.filename)).toEqual([]);
      for (const access of ['VideoUpload1.SendToRestGO();', 'this.VideoUpload1.SendToRestGO();']) {
        const position = fixture.source.lastIndexOf(access) + access.indexOf('SendToRestGO');
        expect(
          fixture.service
            .getCompletionsAtPosition(fixture.filename, position, {})
            ?.entries.map((entry) => entry.name),
        ).toEqual(
          expect.arrayContaining([
            'OpenFile',
            'SendToRestGO',
            'Resume',
            'Pause',
            'CancelUpload',
            'WaitUntilReady',
            'Clear',
            'maxFileSizeMB',
            'maxDurationSeconds',
            'resumeToken',
            'state',
            'onReady',
            'onUploadComplete',
          ]),
        );
        expect(
          ts.displayPartsToString(
            fixture.service.getQuickInfoAtPosition(fixture.filename, position)?.displayParts,
          ),
        ).toContain('SendToRestGO');
        expect(
          fixture.service.getSignatureHelpItems(
            fixture.filename,
            position + 'SendToRestGO('.length,
            undefined,
          )?.items[0]?.parameters[0]?.name,
        ).toBe('options');
      }
      const shadow = fixture.source.indexOf('VideoUpload1.local;') + 'VideoUpload1.'.length;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.filename, shadow, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(['local']);
      const generated = reusable
        ? generateReusableElementSource(fixture.document)
        : generatePageSource(fixture.document);
      expect(generated).toContain('new WebVideoUpload({');
      expect(generated).toContain('this.VideoUpload1.dispose();');
      expect(generated).not.toContain('requireComponentElement("video-upload")');
    } finally {
      fixture.service.dispose();
    }
  },
);
it('diagnoses wrong limit types, readonly selection/session and nonexistent visual properties', () => {
  const fixture =
    serviceFor(`VideoUpload1.maxFileSizeMB = '10'; this.VideoUpload1.maxDurationSeconds = false;
    VideoUpload1.SendToRestGO({ isPublic: 'false' }); VideoUpload1.uploadSession = null;
    this.VideoUpload1.selection = null; VideoUpload1.element.focus();
    if (VideoUpload1.selection) VideoUpload1.selection.duration = 0;`);
  try {
    expect(
      fixture.service.getSemanticDiagnostics(fixture.filename).map((item) => item.code),
    ).toEqual([2322, 2322, 2322, 2540, 2540, 2339, 2540]);
  } finally {
    fixture.service.dispose();
  }
});
it('generates AST event handlers with typed details for every registered video event', () => {
  for (const event of defaultComponentRegistry.require('WebVideoUpload').events) {
    const result = ensureEventHandler('export class PageMain {}', {
      className: 'PageMain',
      componentName: 'VideoUpload1',
      componentType: 'WebVideoUpload',
      eventName: event.name,
      eventDetailType: event.eventDetailType,
      eventDetailProperties: event.eventDetailProperties,
    });
    expect(result.sourceText).toContain(
      `sender: WebVideoUpload, event: CustomEvent<${event.eventDetailType}>`,
    );
  }
});
