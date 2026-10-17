import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  addComponent,
  createDefaultApiClientConfiguration,
  createProject,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { generatePageTypings, generateRuntimeTypings } from '../src/index.js';
import { appendComponentReferenceDeclarations } from '../src/component-references.js';

function serviceFor(
  body: string,
  requestName = 'PutKey',
): {
  readonly service: ts.LanguageService;
  readonly fileName: string;
  readonly source: string;
} {
  const project = createProject('ObjectApi');
  const page = project.pages[0];
  if (page === undefined) throw new Error('Expected a page.');
  const configuration = createDefaultApiClientConfiguration();
  const configured = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'api-object',
      name: 'ApiClient1',
      parentId: page.rootComponentId,
      props: {
        baseUrl: 'https://api.example.test',
        apiClientConfig: {
          ...configuration,
          defaultHeaders: [
            { id: 'accept', name: 'Accept', value: 'application/json', enabled: true },
          ],
          operations: configuration.operations.map((operation) => ({
            ...operation,
            name: requestName,
            method: 'PUT',
            path: '/key',
            headers: [{ id: 'source', name: 'X-Source', value: 'configured', enabled: true }],
            query: [{ id: 'page', name: 'page', value: '1', enabled: false }],
            body: {
              kind: 'json',
              content: '{"idinstancia":<idinstancia>,"chave":<chave>}',
              parameters: [
                { name: 'idinstancia', type: 'integer' },
                { name: 'chave', type: 'string' },
              ],
            },
            responseSchema: {
              version: 1,
              root: {
                id: 'response',
                name: 'Response',
                path: '',
                kind: 'object',
                fieldType: 'object',
                nullable: false,
                children: [
                  {
                    id: 'saved',
                    name: 'saved',
                    path: '/saved',
                    kind: 'field',
                    fieldType: 'boolean',
                    nullable: false,
                    children: [],
                  },
                ],
              },
            },
          })),
        },
      },
    }),
    page.rootComponentId,
  );
  const directory = fileURLToPath(new URL('./object-api-virtual/', import.meta.url));
  const fileName = `${directory}${page.name}.ts`;
  const generatedName = `${directory}${page.name}.generated.d.ts`;
  const runtimeName = `${directory}runtime.d.ts`;
  const source = `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  public async run(): Promise<void> {
    ${body}
  }
}`;
  const snapshot = appendComponentReferenceDeclarations(ts, fileName, source, {
    className: page.name,
    generatedClassName: `${page.name}Generated`,
    componentNames: ['ApiClient1'],
  });
  const key = (value: string): string => value.replaceAll('\\', '/').toLowerCase();
  const files = new Map([
    [key(fileName), snapshot],
    [key(generatedName), generatePageTypings(configured)],
    [key(runtimeName), generateRuntimeTypings()],
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
    getScriptFileNames: () => [fileName, generatedName, runtimeName],
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

describe('generated API Client object contract', () => {
  it('offers only canonical native request completions', () => {
    const fixture = serviceFor(`ApiClient1.PutKey.parameter.idinstancia = 42;
      ApiClient1.PutKey.parameter.chave = 'value';
      await ApiClient1.PutKey.execute();
      const request = this.ApiClient1.PutKey;
      request.parameter.idinstancia;`);
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
      const position = fixture.source.lastIndexOf('request.parameter') + 'request.'.length;
      const names = fixture.service
        .getCompletionsAtPosition(fixture.fileName, position, {})
        ?.entries.map((entry) => entry.name);
      expect(names).toEqual(
        expect.arrayContaining(['execute', 'parameter', 'Response', 'Options']),
      );
      expect(names).not.toContain('Execute');
      expect(names).not.toContain('Parameter');
    } finally {
      fixture.service.dispose();
    }
  });

  it('diagnoses removed aliases on the client and named requests', () => {
    const fixture = serviceFor(`ApiClient1.PutKey.Execute();
      ApiClient1.PutKey.Parameter.idinstancia = 42;
      ApiClient1.Execute();
      ApiClient1.Parameter.idinstancia = 42;`);
    try {
      const diagnostics = fixture.service.getSemanticDiagnostics(fixture.fileName);
      expect(diagnostics).toHaveLength(4);
      expect(
        diagnostics.every((diagnostic) => diagnostic.code === 2339 || diagnostic.code === 2551),
      ).toBe(true);
    } finally {
      fixture.service.dispose();
    }
  });

  it('preserves typed fallback access for names that collide with client members', () => {
    const fixture = serviceFor(
      `ApiClient1.Requests.execute.parameter.idinstancia = 42;
      const result = await ApiClient1.Requests.execute.execute();
      const saved: boolean = result.saved;
      const callable: typeof ApiClient1.execute = ApiClient1.execute;
      void saved; void callable;`,
      'execute',
    );
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
    } finally {
      fixture.service.dispose();
    }
    const reserved = serviceFor(
      `ApiClient1.Requests.then.parameter.idinstancia = 42;
      ApiClient1.then;`,
      'then',
    );
    try {
      expect(
        reserved.service
          .getSemanticDiagnostics(reserved.fileName)
          .map((diagnostic) => diagnostic.code),
      ).toEqual([2339]);
    } finally {
      reserved.service.dispose();
    }
  });

  it('preserves lexical shadowing for direct request access', () => {
    const fixture = serviceFor(`const ApiClient1 = { PutKey: { parameter: { local: true } } };
      const local: boolean = ApiClient1.PutKey.parameter.local;
      this.ApiClient1.PutKey.parameter.idinstancia = 1;
      const input: number | undefined = this.ApiClient1.PutKey.parameter.idinstancia;
      void local; void input;`);
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
    } finally {
      fixture.service.dispose();
    }
  });

  it('completes direct request objects and lowercase parameters with typed results', () => {
    const fixture = serviceFor(`ApiClient1.PutKey.parameter.idinstancia = 42;
      this.ApiClient1.PutKey.parameter.chave = 'direct';
      const result = await ApiClient1.PutKey.execute();
      const saved: boolean = result.saved;
      const input: number | undefined = this.ApiClient1.PutKey.parameter.idinstancia;
      void saved; void input;`);
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
      const requestPosition = fixture.source.indexOf('ApiClient1.PutKey') + 'ApiClient1.'.length;
      const requestNames = fixture.service
        .getCompletionsAtPosition(fixture.fileName, requestPosition, {})
        ?.entries.map((entry) => entry.name);
      expect(requestNames).toContain('PutKey');
      const position = fixture.source.indexOf('parameter.idinstancia') + 'parameter.'.length;
      const parameters = fixture.service
        .getCompletionsAtPosition(fixture.fileName, position, {})
        ?.entries.map((entry) => entry.name);
      expect(parameters).toEqual(expect.arrayContaining(['idinstancia', 'chave']));
      expect(
        fixture.service
          .getQuickInfoAtPosition(fixture.fileName, position)
          ?.displayParts?.map((part) => part.text)
          .join(''),
      ).toContain('number');
      expect(
        fixture.service.getSignatureHelpItems(
          fixture.fileName,
          fixture.source.indexOf('execute()') + 'execute('.length,
          undefined,
        )?.items.length,
      ).toBeGreaterThan(0);
    } finally {
      fixture.service.dispose();
    }
  });

  it('diagnoses invalid direct names, parameter types and replacement of a request', () => {
    const fixture = serviceFor(`ApiClient1.Missing.parameter.idinstancia = 42;
      ApiClient1.PutKey.parameter.idinstancia = 'wrong';
      this.ApiClient1.PutKey.parameter.missing = true;
      ApiClient1.PutKey = ApiClient1.Requests.PutKey;`);
    try {
      const codes = fixture.service
        .getSemanticDiagnostics(fixture.fileName)
        .map((diagnostic) => diagnostic.code);
      expect(codes).toEqual(expect.arrayContaining([2339, 2322, 2540]));
      expect(codes.length).toBe(4);
    } finally {
      fixture.service.dispose();
    }
  });

  it('completes configured request and parameter names through direct and this references', () => {
    const fixture = serviceFor(`ApiClient1.Operation = 'PutKey';
    ApiClient1.parameter.idinstancia = 42;
    this.ApiClient1.parameter.chave = 'value';
    ApiClient1.Connection.Timeout = 12000;
    ApiClient1.Body.Value = '{"idinstancia":<idinstancia>,"chave":<chave>}';
    this.ApiClient1.Requests.PutKey.Headers['X-Source'] = 'code';
    const result = await ApiClient1.Requests.PutKey.execute();
    const saved: boolean = result.saved;
    const latest: boolean | undefined = ApiClient1.Response.Value?.saved;
    void saved; void latest;
    ApiClient1.Requests.PutKey;
    this.ApiClient1.parameter.chave;`);
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
      const requestsPosition =
        fixture.source.lastIndexOf('ApiClient1.Requests.') + 'ApiClient1.Requests.'.length;
      const names =
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, requestsPosition, {})
          ?.entries.map((entry) => entry.name) ?? [];
      expect(names).toContain('PutKey');
      const parametersPosition =
        fixture.source.lastIndexOf('this.ApiClient1.parameter.') +
        'this.ApiClient1.parameter.'.length;
      const parameters =
        fixture.service
          .getCompletionsAtPosition(fixture.fileName, parametersPosition, {})
          ?.entries.map((entry) => entry.name) ?? [];
      expect(parameters).toEqual(expect.arrayContaining(['idinstancia', 'chave', 'page']));
      expect(
        fixture.service
          .getQuickInfoAtPosition(fixture.fileName, fixture.source.indexOf('idinstancia ='))
          ?.displayParts?.map((part) => part.text)
          .join(''),
      ).toContain('number');
      expect(
        fixture.service.getSignatureHelpItems(
          fixture.fileName,
          fixture.source.indexOf('execute()') + 'execute('.length,
          undefined,
        )?.items.length,
      ).toBeGreaterThan(0);
    } finally {
      fixture.service.dispose();
    }
  });

  it('diagnoses unknown request/parameter names and incompatible values without any escapes', () => {
    const fixture = serviceFor(`ApiClient1.Operation = 'NotConfigured';
      ApiClient1.parameter.idinstancia = 'wrong';
      ApiClient1.parameter.chave = 12;
      ApiClient1.parameter.notConfigured = true;
      ApiClient1.Requests.NotConfigured.execute();
      ApiClient1.Connection.Timeout = 'wrong';
      ApiClient1.Body.Kind = 'xml';
      ApiClient1.Response.Value = {};
      this.ApiClient1.Requests.PutKey.Headers['X-Source'] = 42;`);
    try {
      const codes = fixture.service
        .getSemanticDiagnostics(fixture.fileName)
        .map((diagnostic) => diagnostic.code);
      expect(codes).toEqual(expect.arrayContaining([2322, 2339, 2540]));
      expect(codes.length).toBeGreaterThanOrEqual(8);
    } finally {
      fixture.service.dispose();
    }
  });

  it('keeps lexical shadowing independent of generated component parameter names', () => {
    const fixture = serviceFor(`const ApiClient1 = { parameter: { local: true } };
      const local: boolean = ApiClient1.parameter.local;
      this.ApiClient1.parameter.idinstancia = 1;
      const value: number | undefined = this.ApiClient1.parameter.idinstancia;
      void local; void value;`);
    try {
      expect(fixture.service.getSemanticDiagnostics(fixture.fileName)).toEqual([]);
    } finally {
      fixture.service.dispose();
    }
  });
});
