// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ComponentTypeScriptWorker } from './component-typescript-worker';

const fileName = 'file:///project/pages/PageMain.ts';
const generatedFileName = 'file:///project/pages/PageMain.generated.d.ts';
const declaration = `// @webrad-component-scope {"className":"PageMain","generatedClassName":"PageMainGenerated","componentNames":["Button1","Edit1"]}
export declare class PageMainGenerated {
  readonly Button1: { caption: string; enabled: boolean };
  readonly Edit1: { value: string };
}`;

function workerFor(body: string, typedDeclaration = declaration) {
  let source = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
${body}
}`;
  let model = {
    uri: { path: '/project/pages/PageMain.ts', toString: () => fileName },
    version: 1,
    getValue: () => source,
  };
  const worker = new ComponentTypeScriptWorker(
    { getMirrorModels: () => [model] },
    {
      compilerOptions: { strict: true, noLib: true, target: 9, module: 99, moduleResolution: 100 },
      extraLibs: { [generatedFileName]: { content: typedDeclaration, version: 1 } },
    },
  );
  return {
    worker,
    source,
    updateSource: (value: string) => {
      source = value;
      model.version += 1;
    },
    reopenSource: (value: string) => {
      source = value;
      model = { ...model, version: 1 };
    },
  };
}

describe('Monaco component TypeScript worker', () => {
  it('offers canonical native members and diagnoses removed request aliases', async () => {
    const typedDeclaration = `export declare class PageMainGenerated {
      readonly ApiClient1: { GetKey: {
        execute(): void;
        readonly parameter: { chave: string };
      } };
    }`;
    const fixture = workerFor(
      `handler() {
      this.ApiClient1.GetKey.parameter.chave = 'value';
      this.ApiClient1.GetKey.exe
    }`,
      typedDeclaration,
    );
    const position = fixture.source.lastIndexOf('GetKey.exe') + 'GetKey.exe'.length;
    const names = (await fixture.worker.getCompletionsAtPosition(fileName, position))?.entries.map(
      (entry) => entry.name,
    );
    expect(names).toEqual(expect.arrayContaining(['execute', 'parameter']));
    expect(names).not.toContain('Execute');
    expect(names).not.toContain('Parameter');
    const invalid = workerFor(
      `handler() {
      this.ApiClient1.GetKey.Execute();
      this.ApiClient1.GetKey.Parameter.chave = 'value';
    }`,
      typedDeclaration,
    );
    const diagnostics = await invalid.worker.getSemanticDiagnostics(fileName);
    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.every((diagnostic) => diagnostic.code === 2339 || diagnostic.code === 2551),
    ).toBe(true);
    const local = workerFor(`handler() {
      const request = { execute() {}, Execute() {}, parameter: 1, Parameter: 2 };
      request.exe
    }`);
    const localPosition = local.source.lastIndexOf('request.exe') + 'request.exe'.length;
    const localNames = (
      await local.worker.getCompletionsAtPosition(fileName, localPosition)
    )?.entries.map((entry) => entry.name);
    expect(localNames).toEqual(
      expect.arrayContaining(['execute', 'Execute', 'parameter', 'Parameter']),
    );
  });

  it('types bare component members and reports invalid assignments at authored offsets', async () => {
    const { worker, source } = workerFor(
      `handler() { Button1.caption = 123; Edit1.value = 'Ada'; }`,
    );
    const diagnostics = await worker.getSemanticDiagnostics(fileName);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2322);
    expect(
      source.slice(
        diagnostics[0]?.start,
        (diagnostics[0]?.start ?? 0) + (diagnostics[0]?.length ?? 0),
      ),
    ).toBe('Button1.caption');
  });

  it('offers native property completions and preserves existing this access', async () => {
    const { worker, source } = workerFor(
      `handler() { Edit1.value = 'Ada'; this.Button1.enabled = true; Button1.ca }`,
    );
    const info = await worker.getCompletionsAtPosition(
      fileName,
      source.indexOf('Button1.ca') + 'Button1.ca'.length,
    );
    expect(info?.entries.some((entry) => entry.name === 'caption')).toBe(true);
    const typed = workerFor(
      `handler() { Button1.caption = Edit1.value; this.Button1.enabled = true; }`,
    );
    expect(await typed.worker.getSemanticDiagnostics(fileName)).toEqual([]);
    const names = await typed.worker.getCompletionsAtPosition(
      fileName,
      typed.source.indexOf('Button1.caption'),
    );
    expect(names?.entries.filter((entry) => entry.name === 'Button1')).toHaveLength(1);
    expect(names?.entries.find((entry) => entry.name === 'Button1')?.sortText).toBe('0000_Button1');
  });

  it('reports instance boundaries and keeps module names out of static completions', async () => {
    const { worker, source } = workerFor(`static handler() { Button1.caption = 'bad'; }`);
    expect(
      (await worker.getSemanticDiagnostics(fileName)).some(
        (diagnostic) => diagnostic.code === 95001,
      ),
    ).toBe(true);
    const info = await worker.getCompletionsAtPosition(fileName, source.indexOf('Button1'));
    expect(info?.entries.some((entry) => entry.name === 'Edit1')).toBe(false);
  });

  it('types method defaults with the same instance members as the body', async () => {
    const valid = workerFor(`handler(value = Button1.caption, { text = Edit1.value } = {}) {
      return value + text;
    }`);
    expect(await valid.worker.getSemanticDiagnostics(fileName)).toEqual([]);
    const invalid = workerFor(`handler(value = Button1.missing) { return value; }`);
    const diagnostics = await invalid.worker.getSemanticDiagnostics(fileName);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2339);
    expect(invalid.source.slice(diagnostics[0]?.start, (diagnostics[0]?.start ?? 0) + 7)).toBe(
      'missing',
    );
    const completion = workerFor(`handler(value = Button1.ca) { return value; }`);
    const info = await completion.worker.getCompletionsAtPosition(
      fileName,
      completion.source.indexOf('Button1.ca') + 'Button1.ca'.length,
    );
    expect(info?.entries.some((entry) => entry.name === 'caption')).toBe(true);
  });

  it('reuses stable snapshots and invalidates them after authored edits or component changes', async () => {
    const fixture = workerFor(`handler() { Button1.caption = 'ok'; }`);
    const initial = fixture.worker.getScriptSnapshot(fileName);
    expect(fixture.worker.getScriptSnapshot(fileName)).toBe(initial);
    fixture.updateSource(fixture.source.replace("'ok'", '123'));
    const edited = fixture.worker.getScriptSnapshot(fileName);
    expect(edited).not.toBe(initial);
    expect(fixture.worker.getScriptSnapshot(fileName)).toBe(edited);
    expect((await fixture.worker.getSemanticDiagnostics(fileName))[0]?.code).toBe(2322);

    fixture.worker.getExtraLibs()[generatedFileName] = {
      content: declaration.replaceAll('Button1', 'RenamedButton'),
      version: 2,
    };
    const renamed = fixture.worker.getScriptSnapshot(fileName);
    expect(renamed).not.toBe(edited);
    expect(renamed?.getText(0, renamed.getLength())).toContain('declare const RenamedButton');
    expect(
      (await fixture.worker.getSemanticDiagnostics(fileName)).some(
        (diagnostic) => diagnostic.code === 2304,
      ),
    ).toBe(true);
    delete fixture.worker.getExtraLibs()[generatedFileName];
    const detached = fixture.worker.getScriptSnapshot(fileName);
    expect(detached?.getText(0, detached.getLength())).not.toContain('declare const');
  });

  it('refreshes native diagnostics after a document is recreated at the same path and version', async () => {
    const fixture = workerFor(`handler() { Button1.caption = 'ok'; }`);
    const initial = fixture.worker.getScriptSnapshot(fileName);
    expect(await fixture.worker.getSemanticDiagnostics(fileName)).toEqual([]);
    fixture.reopenSource(fixture.source.replace("'ok'", '123'));
    const diagnostics = await fixture.worker.getSemanticDiagnostics(fileName);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2322);
    expect(fixture.worker.getScriptSnapshot(fileName)).not.toBe(initial);
  });

  it('navigates to the generated field and never formats or displays synthetic declarations', async () => {
    const { worker, source } = workerFor(`handler(){Button1.caption='ok';}`);
    const definitions = await worker.getDefinitionAtPosition(fileName, source.indexOf('Button1'));
    expect(definitions?.[0]?.fileName).toBe(generatedFileName);
    const changes = await worker.getFormattingEditsForDocument(fileName, {
      indentSize: 2,
      tabSize: 2,
      newLineCharacter: '\n',
      convertTabsToSpaces: true,
    });
    expect(changes.every((change) => change.span.start + change.span.length <= source.length)).toBe(
      true,
    );
    const symbols = await worker.getNavigationTree(fileName);
    expect(
      symbols?.childItems?.some((item) => item.text === 'Button1' || item.text === 'Edit1'),
    ).toBe(false);
    expect(await worker.getRenameInfo(fileName, source.indexOf('Button1'), {})).toMatchObject({
      canRename: false,
    });
  });

  it('keeps component renames in the Designer for bare and this access while allowing local renames', async () => {
    const fixture = workerFor(`handler() {
      Button1.caption = 'bare';
      this.Button1.caption = 'instance';
      const local = { Button1: 'local' };
      local.Button1;
      { const Button1 = 'binding'; void Button1; }
    }`);
    for (const position of [
      fixture.source.indexOf('Button1.caption'),
      fixture.source.indexOf('this.Button1') + 'this.'.length,
    ])
      expect(await fixture.worker.getRenameInfo(fileName, position, {})).toMatchObject({
        canRename: false,
        localizedErrorMessage: 'Rename this component in the Designer.',
      });
    for (const position of [
      fixture.source.indexOf('local.Button1') + 'local.'.length,
      fixture.source.lastIndexOf('Button1'),
    ])
      expect(await fixture.worker.getRenameInfo(fileName, position, {})).toMatchObject({
        canRename: true,
      });
  });

  it('preserves shadowing in static completions and refreshes aliases after component metadata changes', async () => {
    const local = workerFor(`static handler() { const Button1 = { caption: 'local' }; Button1; }`);
    const info = await local.worker.getCompletionsAtPosition(
      fileName,
      local.source.lastIndexOf('Button1'),
    );
    expect(info?.entries.some((entry) => entry.name === 'Button1')).toBe(true);
    const { worker } = workerFor(`handler() { Button1.caption = 'ok'; }`);
    expect(await worker.getSemanticDiagnostics(fileName)).toEqual([]);
    worker.getExtraLibs()[generatedFileName] = {
      content: declaration.replaceAll('Button1', 'RenamedButton'),
      version: 2,
    };
    expect(
      (await worker.getSemanticDiagnostics(fileName)).some(
        (diagnostic) => diagnostic.code === 2304,
      ),
    ).toBe(true);
  });
});
