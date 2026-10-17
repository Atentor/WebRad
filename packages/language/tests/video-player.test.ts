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
import { videoPlayerProject } from '../../../tests/fixtures/video-player';
function serviceFor(body: string, reusable: boolean) {
  const page = videoPlayerProject().pages[0]!;
  const reusableModel = createReusableElement('MediaCard');
  const document = reusable
    ? {
        ...reusableModel,
        components: page.components.map((node) =>
          node.id === page.rootComponentId
            ? { ...node, id: reusableModel.rootComponentId, name: 'MediaCard', type: 'WebPanel' }
            : { ...node, parentId: reusableModel.rootComponentId },
        ),
      }
    : page;
  const filename = `/video-player/${document.name}.ts`;
  const source = `import { WebVideoPlayer } from '@webrad/runtime';
import { ${document.name}Generated } from './${document.name}.generated';
export class ${document.name} extends ${document.name}Generated { public async inspect() {${body}} }`;
  const runtime = '/video-player/runtime.d.ts';
  const generated = filename.replace('.ts', '.generated.d.ts');
  const files = new Map([
    [
      filename,
      appendComponentReferenceDeclarations(ts, filename, source, {
        className: document.name,
        generatedClassName: `${document.name}Generated`,
        componentNames: document.components
          .filter((node) => node.id !== document.rootComponentId)
          .map((node) => node.name),
      }),
    ],
    [runtime, generateRuntimeTypings()],
    [
      generated,
      reusable ? generateReusableElementTypings(document) : generatePageTypings(document),
    ],
  ]);
  const normalized = (name: string) => name.replaceAll('\\', '/');
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
    getCurrentDirectory: () => '/video-player',
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
    directoryExists: (name) => normalized(name) === '/video-player' || ts.sys.directoryExists(name),
    getDirectories: ts.sys.getDirectories,
  };
  return { filename, source, document, service: ts.createLanguageService(host) };
}
it.each([false, true])(
  'offers typed player completion, hover/signatures and lexical shadowing in reusable=%s',
  (reusable) => {
    const fixture = serviceFor(
      `const instance: WebVideoPlayer = VideoPlayer1;
    VideoPlayer1.source = { kind: 'restgo', videoId: 'video-1' }; this.VideoPlayer1.source = {kind:'url',url:'https://cdn.test/master.m3u8',format:'hls'};
    await VideoPlayer1.LoadRestGo('video-1', {public:true}); await this.VideoPlayer1.LoadUrl('https://cdn.test/a.mpd',{format:'dash'});
    await VideoPlayer1.Play(); this.VideoPlayer1.Pause(); VideoPlayer1.Stop(); VideoPlayer1.Seek(1);
    VideoPlayer1.SetQuality('auto'); this.VideoPlayer1.SetQuality(720); await VideoPlayer1.Unload();
    VideoPlayer1.aspectRatio = '16:9'; this.VideoPlayer1.aspectRatio = '9:16'; VideoPlayer1.aspectRatio = 'none';
    VideoPlayer1.LoadRestGo('id'); this.VideoPlayer1.LoadRestGo('id');
    {const VideoPlayer1={local:true};VideoPlayer1.local;} void instance;`,
      reusable,
    );
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.filename)).toEqual([]);
      for (const access of [
        "VideoPlayer1.LoadRestGo('id');",
        "this.VideoPlayer1.LoadRestGo('id');",
      ]) {
        const position = fixture.source.lastIndexOf(access) + access.indexOf('LoadRestGo');
        expect(
          fixture.service
            .getCompletionsAtPosition(fixture.filename, position, {})
            ?.entries.map((entry) => entry.name),
        ).toEqual(
          expect.arrayContaining([
            'LoadRestGo',
            'LoadUrl',
            'Play',
            'Pause',
            'Stop',
            'Seek',
            'SetQuality',
            'Unload',
            'source',
            'availableQualities',
            'currentQuality',
            'buffered',
            'state',
            'controls',
            'poster',
            'aspectRatio',
            'onLoaded',
            'onError',
          ]),
        );
        expect(
          ts.displayPartsToString(
            fixture.service.getQuickInfoAtPosition(fixture.filename, position)?.displayParts,
          ),
        ).toContain('Promise<void>');
        expect(
          fixture.service
            .getSignatureHelpItems(fixture.filename, position + 'LoadRestGo('.length, undefined)
            ?.items[0]?.parameters.map((parameter) => parameter.name),
        ).toEqual(['videoId', 'options']);
      }
      const position = fixture.source.indexOf('VideoPlayer1.local;') + 'VideoPlayer1.'.length;
      expect(
        fixture.service
          .getCompletionsAtPosition(fixture.filename, position, {})
          ?.entries.map((entry) => entry.name),
      ).toEqual(['local']);
      const generated = reusable
        ? generateReusableElementSource(fixture.document)
        : generatePageSource(fixture.document);
      expect(generated).toContain('public readonly VideoPlayer1: WebVideoPlayer;');
    } finally {
      fixture.service.dispose();
    }
  },
);
it('rejects invalid source unions, media options, readonly state and wrong argument types', () => {
  const fixture = serviceFor(
    `VideoPlayer1.source={kind:'url',url:'https://cdn.test/a',format:'youtube'};
    VideoPlayer1.LoadRestGo(42); this.VideoPlayer1.LoadRestGo('id',{public:'true'}); VideoPlayer1.Seek('1');
    VideoPlayer1.SetQuality('1080p'); VideoPlayer1.currentTime=2; this.VideoPlayer1.availableQualities=[]; VideoPlayer1.duration=5;`,
    false,
  );
  try {
    expect(fixture.service.getSemanticDiagnostics(fixture.filename)).toHaveLength(8);
  } finally {
    fixture.service.dispose();
  }
});
it.each(['VideoPlayer1', 'this.VideoPlayer1'])('rejects invalid ratios on %s', (access) => {
  const fixture = serviceFor(`${access}.aspectRatio = '4:3';`, false);
  try {
    expect(fixture.service.getSemanticDiagnostics(fixture.filename)).toHaveLength(1);
  } finally {
    fixture.service.dispose();
  }
});
it('scaffolds every player event with real typed details', () => {
  for (const event of defaultComponentRegistry.require('WebVideoPlayer').events) {
    const result = ensureEventHandler('export class PageMain {}', {
      className: 'PageMain',
      componentName: 'VideoPlayer1',
      componentType: 'WebVideoPlayer',
      eventName: event.name,
      eventDetailType: event.eventDetailType,
      eventDetailProperties: event.eventDetailProperties,
    });
    expect(result.sourceText).toContain(
      `sender: WebVideoPlayer, event: CustomEvent<${event.eventDetailType}>`,
    );
  }
});
