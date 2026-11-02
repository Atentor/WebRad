// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ComponentTypeScriptWorker } from './component-typescript-worker';

const resource = 'file:///c%3A/Projects/Example/units/clock.ts';
const libraries = {
  'file:///node_modules/dayjs/package.json': JSON.stringify({
    name: 'dayjs',
    types: './index.d.ts',
    exports: { '.': { types: './index.d.ts' }, './plugin/utc': { types: './plugin/utc.d.ts' } },
  }),
  'file:///node_modules/dayjs/index.d.ts': `/** Create a date. */
    declare function dayjs(): dayjs.Dayjs;
    declare namespace dayjs {
      interface Dayjs { /** Format this date. */ format(template: string): string; year(): number; }
    }
    export = dayjs;`,
  'file:///node_modules/dayjs/plugin/utc.d.ts': 'export default function utc(): void;',
  'file:///node_modules/@scope/example/package.json': JSON.stringify({
    name: '@scope/example',
    exports: { '.': { types: './index.d.ts' } },
  }),
  'file:///node_modules/@scope/example/index.d.ts': 'export declare const version: number;',
};

function fixture(source: string, files = libraries) {
  return new ComponentTypeScriptWorker(
    {
      getMirrorModels: () => [
        {
          uri: { path: '/c:/Projects/Example/units/clock.ts', toString: () => resource },
          version: 1,
          getValue: () => source,
        },
      ],
    },
    {
      compilerOptions: {
        strict: true,
        noLib: true,
        types: [],
        target: 9,
        module: 99,
        moduleResolution: 100,
        esModuleInterop: true,
      },
      extraLibs: Object.fromEntries(
        Object.entries(files).map(([name, content]) => [name, { content, version: 1 }]),
      ),
    },
  );
}

describe('Monaco installed package language service', () => {
  it('resolves CJS typings, scoped exports and subpaths from an isolated snapshot on Windows', async () => {
    const source = `import dayjs from 'dayjs';
      import utc from 'dayjs/plugin/utc';
      import { version } from '@scope/example';
      export const formatted: string = dayjs().format('YYYY'); utc();
      export const installed: number = version;`;
    const worker = fixture(source);
    expect(await worker.getSemanticDiagnostics(resource)).toEqual([]);
    const position = source.indexOf('.format') + 1;
    expect(
      (await worker.getCompletionsAtPosition(resource, position))?.entries.map(
        (entry) => entry.name,
      ),
    ).toEqual(expect.arrayContaining(['format', 'year']));
    expect(
      (await worker.getQuickInfoAtPosition(resource, position))?.displayParts
        ?.map((part) => part.text)
        .join(''),
    ).toContain('format(template: string): string');
    expect(
      (await worker.getSignatureHelpItems(resource, source.indexOf("'YYYY'"), {}))?.items[0]
        ?.parameters[0]?.name,
    ).toBe('template');
    expect((await worker.getDefinitionAtPosition(resource, position))?.[0]?.fileName).toBe(
      'file:///node_modules/dayjs/index.d.ts',
    );
  });

  it('retains strict invalid-use and missing package diagnostics', async () => {
    const source = `import dayjs from 'dayjs'; import missing from 'missing-package';
      dayjs().format(123); dayjs().invalid();`;
    const codes = (await fixture(source).getSemanticDiagnostics(resource)).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining([2307, 2345, 2339]));
  });

  it('suggests installed package names through the native TypeScript service', async () => {
    const source = "import date from 'da';";
    const result = await fixture(source).getCompletionsAtPosition(
      resource,
      source.indexOf("da';") + 2,
    );
    expect(result?.entries.map((entry) => entry.name)).toContain('dayjs');
  });

  it('invalidates declarations after update and removal in an already running worker', async () => {
    const source = "import dayjs from 'dayjs'; dayjs().format('YYYY');";
    const worker = fixture(source);
    expect(await worker.getSemanticDiagnostics(resource)).toEqual([]);
    await worker.updateExtraLibs(
      Object.fromEntries(
        Object.entries({
          ...libraries,
          'file:///node_modules/dayjs/index.d.ts':
            'declare function dayjs(): { format(template: number): number }; export = dayjs;',
        }).map(([name, content]) => [name, { content, version: 2 }]),
      ),
    );
    expect((await worker.getSemanticDiagnostics(resource)).map((item) => item.code)).toContain(
      2345,
    );
    await worker.updateExtraLibs({});
    expect((await worker.getSemanticDiagnostics(resource)).map((item) => item.code)).toContain(
      2307,
    );
  });
});
