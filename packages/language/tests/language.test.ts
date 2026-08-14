import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { MVP_COMPONENT_TYPES, type MvpComponentType } from '@webrad/component-registry';
import { parseForm, type ComponentNode, type FormModel } from '@webrad/project-model';

import {
  createUserFormSource,
  ensureEventHandler,
  generateFormArtifacts,
  generateFormSource,
  generateFormTypings,
  generateRuntimeTypings,
} from '../src/index.js';

type NonRootMvpComponentType = Exclude<MvpComponentType, 'WebForm'>;

interface MvpComponentFixture {
  readonly id: string;
  readonly type: NonRootMvpComponentType;
  readonly name: string;
}

const MVP_COMPONENT_FIXTURES = [
  { id: 'stable-panel-main', type: 'WebPanel', name: 'PanelMain' },
  { id: 'stable-label-status', type: 'WebLabel', name: 'LBLStatus' },
  { id: 'stable-edit-name', type: 'WebEdit', name: 'EDTNome' },
  { id: 'stable-text-area-notes', type: 'WebTextArea', name: 'MEMNotas' },
  { id: 'button-show', type: 'WebButton', name: 'BTNMostrar' },
  { id: 'stable-check-box-active', type: 'WebCheckBox', name: 'CHKAtivo' },
  { id: 'stable-combo-box-kind', type: 'WebComboBox', name: 'CBOTipo' },
  { id: 'stable-image-logo', type: 'WebImage', name: 'IMGLogo' },
  { id: 'stable-list-box-results', type: 'WebListBox', name: 'LSTResultados' },
  { id: 'api-client', type: 'WebApiClient', name: 'ApiClient1' },
] as const satisfies readonly MvpComponentFixture[];

function fixtureComponent(fixture: MvpComponentFixture): ComponentNode {
  const isPanel = fixture.type === 'WebPanel';
  const isApiClient = fixture.type === 'WebApiClient';
  return {
    ...fixture,
    parentId: isPanel || isApiClient ? 'form-root' : 'stable-panel-main',
    bounds: { x: 16, y: 16, width: 120, height: 32 },
    props:
      fixture.type === 'WebApiClient'
        ? { baseUrl: 'https://api.example.test' }
        : fixture.type === 'WebButton'
          ? { caption: 'Mostrar', visible: true, enabled: true }
          : {},
    events: fixture.type === 'WebButton' ? { OnClick: 'BTNMostrarClick' } : {},
    children: isPanel
      ? MVP_COMPONENT_FIXTURES.filter(
          (candidate) => candidate.type !== 'WebPanel' && candidate.type !== 'WebApiClient',
        ).map((candidate) => candidate.id)
      : [],
  };
}

function testForm(): FormModel {
  return parseForm({
    formatVersion: 1,
    id: 'form-model',
    name: 'FrmMain',
    caption: 'Main',
    width: 640,
    height: 480,
    layoutMode: 'absolute',
    rootComponentId: 'form-root',
    components: [
      {
        id: 'form-root',
        type: 'WebForm',
        name: 'FrmMain',
        parentId: null,
        bounds: { x: 0, y: 0, width: 640, height: 480 },
        props: { caption: 'Main', visible: true, enabled: true },
        events: {
          OnCreate: 'FrmMainCreate',
          OnShow: null,
          OnHide: null,
          OnResize: null,
        },
        children: ['stable-panel-main', 'api-client'],
      },
      ...MVP_COMPONENT_FIXTURES.map(fixtureComponent),
    ],
  });
}

function createLanguageService(filesInput: Readonly<Record<string, string>>): ts.LanguageService {
  const normalize = (fileName: string): string => fileName.replaceAll('\\', '/');
  const files = new Map(
    Object.entries(filesInput).map(([fileName, contents]) => [normalize(fileName), contents]),
  );
  const containsVirtualDirectory = (directoryName: string): boolean => {
    const normalized = normalize(directoryName).replace(/\/$/, '');
    return [...files.keys()].some((fileName) => fileName.startsWith(`${normalized}/`));
  };
  const readFile = (fileName: string): string | undefined =>
    files.get(normalize(fileName)) ?? ts.sys.readFile(fileName);
  const compilerOptions: ts.CompilerOptions = {
    allowNonTsExtensions: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: {
      '@webrad/runtime': ['/webrad-language-test/node_modules/@webrad/runtime/index.d.ts'],
    },
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host: ts.LanguageServiceHost = {
    directoryExists: (directoryName) =>
      containsVirtualDirectory(directoryName) || ts.sys.directoryExists(directoryName),
    fileExists: (fileName) => files.has(normalize(fileName)) || ts.sys.fileExists(fileName),
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => '/webrad-language-test',
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories: ts.sys.getDirectories,
    getNewLine: () => ts.sys.newLine,
    getScriptFileNames: () => [...files.keys()],
    getScriptSnapshot: (fileName) => {
      const contents = readFile(fileName);
      return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
    },
    getScriptVersion: () => '1',
    readDirectory: ts.sys.readDirectory,
    readFile,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  return ts.createLanguageService(host);
}

describe('form language generation', () => {
  it('generates separate executable source and editor typings from the model', () => {
    const form = testForm();
    const source = generateFormSource(form);
    const typings = generateFormTypings(form);
    const userSource = createUserFormSource(form);
    const artifacts = generateFormArtifacts(form);

    expect(form.components.slice(1).map((component) => component.type)).toEqual(
      MVP_COMPONENT_TYPES.slice(1),
    );
    for (const component of MVP_COMPONENT_FIXTURES) {
      const declaration = `public readonly ${component.name}: ${component.type};`;
      expect(source).toContain(declaration);
      expect(typings).toContain(declaration);
      if (component.type !== 'WebApiClient') {
        expect(source).toContain(
          `this.${component.name} = new ${component.type}(this.requireComponentElement(${JSON.stringify(component.id)}))`,
        );
      }
    }
    expect(source).toContain('this.ApiClient1 = new WebApiClient(');
    expect(source).toContain('"baseUrl":"https://api.example.test"');
    expect(source).toContain('"id":"api-client"');
    expect(source).toContain('"name":"ApiClient1"');
    expect(source).not.toContain('requireComponentElement("api-client")');
    expect(source).not.toContain('public readonly FrmMain: WebForm;');
    expect(typings).not.toContain('public readonly FrmMain: WebForm;');
    expect(source).not.toContain('requireComponentElement("form-root")');
    expect(source).toContain('this.bindGeneratedEvent(this, "OnCreate", "FrmMainCreate")');
    expect(source).toContain(
      'this.bindGeneratedEvent(this.BTNMostrar, "OnClick", "BTNMostrarClick")',
    );
    const panel = form.components.find((component) => component.id === 'stable-panel-main');
    expect(panel?.children).toEqual(
      MVP_COMPONENT_FIXTURES.filter(
        (component) => component.type !== 'WebPanel' && component.type !== 'WebApiClient',
      ).map((component) => component.id),
    );
    expect(
      form.components
        .filter((component) => component.type !== 'WebForm' && component.type !== 'WebApiClient')
        .slice(1)
        .every((component) => component.parentId === panel?.id),
    ).toBe(true);
    expect(typings).toContain('export declare abstract class FrmMainGenerated extends WebForm');
    expect(userSource).toContain('export class FrmMain extends FrmMainGenerated');
    expect(artifacts.generatedFileName).toBe('forms/FrmMain.generated.ts');
    expect(artifacts.userFileName).toBe('forms/FrmMain.ts');
    expect(generateRuntimeTypings()).toContain("declare module '@webrad/runtime'");
  });

  it('provides typed this.Name completions for every generated MVP component', () => {
    const form = testForm();
    const runtimeFileName = '/webrad-language-test/node_modules/@webrad/runtime/index.d.ts';
    const generatedFileName = '/webrad-language-test/forms/FrmMain.generated.d.ts';
    const userFileName = '/webrad-language-test/forms/FrmMain.ts';
    const memberExpressions = MVP_COMPONENT_FIXTURES.map(
      (component) => `    this.${component.name};`,
    ).join('\n');
    const userSource = `import { FrmMainGenerated } from './FrmMain.generated';

export class FrmMain extends FrmMainGenerated {
  inspectComponents(): void {
${memberExpressions}
  }
}
`;
    const service = createLanguageService({
      [runtimeFileName]: generateRuntimeTypings(),
      [generatedFileName]: generateFormTypings(form),
      [userFileName]: userSource,
    });

    try {
      const diagnostics = service.getSemanticDiagnostics(userFileName).map((diagnostic) => ({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        start: diagnostic.start,
      }));
      expect(diagnostics).toEqual([]);
      const firstMember = MVP_COMPONENT_FIXTURES[0];
      const completionPosition = userSource.indexOf(`this.${firstMember.name}`) + 'this.'.length;
      const completions = service.getCompletionsAtPosition(userFileName, completionPosition, {});
      const completionNames = new Set(completions?.entries.map((entry) => entry.name));
      for (const component of MVP_COMPONENT_FIXTURES) {
        expect(completionNames.has(component.name)).toBe(true);
        const expression = `this.${component.name}`;
        const identifierPosition = userSource.indexOf(expression) + 'this.'.length + 1;
        const quickInfo = service.getQuickInfoAtPosition(userFileName, identifierPosition);
        expect(quickInfo).toBeDefined();
        const display = ts.displayPartsToString(quickInfo?.displayParts);
        expect(display).toContain(`${component.name}: ${component.type}`);
        expect(display).not.toMatch(/\bany\b/);
      }
    } finally {
      service.dispose();
    }
  });
});

describe('event handler AST editing', () => {
  it('inserts a typed async method and returns its navigation position', () => {
    const original = `// user formatting is retained
export class FrmMain extends FrmMainGenerated {
  readonly answer = 42;
}
`;
    const edit = ensureEventHandler(original, {
      className: 'FrmMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(true);
    expect(edit.sourceText).toContain('import type { WebButton } from "@webrad/runtime";');
    expect(edit.sourceText).toContain('async BTNMostrarClick(sender: WebButton): Promise<void>');
    expect(edit.sourceText).toContain('readonly answer = 42;');
    expect(edit.location.line).toBeGreaterThan(1);

    const second = ensureEventHandler(edit.sourceText, {
      className: 'FrmMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });
    expect(second.changed).toBe(false);
    expect(second.sourceText).toBe(edit.sourceText);
    expect(second.location).toEqual(edit.location);
  });

  it('uses an existing aliased runtime type import', () => {
    const edit = ensureEventHandler(
      `import type { WebButton as Button } from '@webrad/runtime';
export class FrmMain {}
`,
      {
        className: 'FrmMain',
        componentName: 'BTNMostrar',
        componentType: 'WebButton',
        eventName: 'OnClick',
      },
    );
    expect(edit.sourceText).toContain('sender: Button');
    expect(edit.sourceText.match(/@webrad\/runtime/g)).toHaveLength(1);
  });

  it('does not duplicate an existing property-style handler', () => {
    const source = `export class FrmMain {
  BTNMostrarClick = async (sender: WebButton): Promise<void> => {};
}
`;
    const edit = ensureEventHandler(source, {
      className: 'FrmMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(false);
    expect(edit.sourceText).toBe(source);
  });
});
