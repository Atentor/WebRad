import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import {
  defaultComponentRegistry,
  MVP_COMPONENT_TYPES,
  type MvpComponentType,
} from '@webrad/component-registry';
import {
  addComponent,
  bindComponentEvent,
  createDefaultComponentLayout,
  createReusableElement,
  parsePage,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';

import {
  createUserPageSource,
  createUserReusableElementSource,
  ensureEventHandler,
  generatePageArtifacts,
  generatePageSource,
  generatePageTypings,
  generateReusableElementSource,
  generateReusableElementTypings,
  generateRuntimeTypings,
} from '../src/index.js';

type NonRootMvpComponentType = Exclude<MvpComponentType, 'WebPage'>;

interface MvpComponentFixture {
  readonly id: string;
  readonly type: NonRootMvpComponentType;
  readonly name: string;
}

const MVP_COMPONENT_FIXTURES = [
  { id: 'stable-panel-main', type: 'WebPanel', name: 'PanelMain' },
  { id: 'stable-group', type: 'WebGroup', name: 'Group1' },
  { id: 'reusable-card', type: 'WebReusableElement', name: 'ReusableCard' },
  { id: 'stable-label-status', type: 'WebLabel', name: 'LBLStatus' },
  { id: 'stable-edit-name', type: 'WebEdit', name: 'EDTNome' },
  { id: 'stable-text-area-notes', type: 'WebTextArea', name: 'MEMNotas' },
  { id: 'button-show', type: 'WebButton', name: 'BTNMostrar' },
  { id: 'stable-check-box-active', type: 'WebCheckBox', name: 'CHKAtivo' },
  { id: 'stable-toggle', type: 'WebToggle', name: 'Toggle1' },
  { id: 'stable-progress-bar', type: 'WebProgressBar', name: 'ProgressBar1' },
  { id: 'stable-combo-box-kind', type: 'WebComboBox', name: 'CBOTipo' },
  { id: 'stable-image-logo', type: 'WebImage', name: 'IMGLogo' },
  { id: 'stable-list-box-results', type: 'WebListBox', name: 'LSTResultados' },
  { id: 'data-grid', type: 'WebDataGrid', name: 'DataGrid1' },
  { id: 'repeating-group', type: 'WebRepeatingGroup', name: 'RepeatingGroup1' },
  { id: 'popup-dialog', type: 'WebPopup', name: 'Popup1' },
  { id: 'api-client', type: 'WebApiClient', name: 'ApiClient1' },
  { id: 'stable-file-upload', type: 'WebFileUpload', name: 'FileUpload1' },
  { id: 'stable-video-upload', type: 'WebVideoUpload', name: 'VideoUpload1' },
  { id: 'stable-video-player', type: 'WebVideoPlayer', name: 'VideoPlayer1' },
  { id: 'stable-report-builder', type: 'WebReportBuilder', name: 'ReportBuilder1' },
] as const satisfies readonly MvpComponentFixture[];

function fixtureComponent(fixture: MvpComponentFixture): ComponentNode {
  const isPanel = fixture.type === 'WebPanel';
  const isNonvisual = !defaultComponentRegistry.require(fixture.type).visual;
  const isPopup = fixture.type === 'WebPopup';
  return {
    ...fixture,
    parentId: isPanel || isNonvisual || isPopup ? 'page-root' : 'stable-panel-main',
    layout: createDefaultComponentLayout(),
    bounds: { x: 16, y: 16, width: 120, height: 32 },
    props:
      fixture.type === 'WebApiClient'
        ? { baseUrl: 'https://api.example.test' }
        : fixture.type === 'WebDataGrid'
          ? {
              dataGridConfig: {
                schemaVersion: 1,
                apiClientId: 'api-client',
                operationId: 'operation-1',
                listPath: '',
                columnCount: 1,
                showHeader: true,
                stickyHeader: true,
                showFooter: false,
                stickyFooter: true,
                columns: [
                  {
                    id: 'column-1',
                    header: 'Name',
                    fieldPath: '/name',
                    cellKind: 'text',
                    footer: '',
                  },
                ],
              },
            }
          : fixture.type === 'WebButton'
            ? { caption: 'Mostrar', visible: true, enabled: true }
            : fixture.type === 'WebPopup'
              ? {
                  modal: true,
                  visible: false,
                  collapseWhenHidden: true,
                  enabled: true,
                }
              : fixture.type === 'WebReusableElement'
                ? {
                    reusableElementId: 'shared-card',
                    placement: 'in-flow',
                    floatingHorizontalAnchor: 'left',
                    floatingVerticalAnchor: 'top',
                    floatingZIndex: 100,
                    visible: true,
                    enabled: true,
                  }
                : {},
    events:
      fixture.type === 'WebButton'
        ? { OnClick: 'BTNMostrarClick' }
        : fixture.type === 'WebApiClient'
          ? { OnSuccess: 'ApiClient1Success' }
          : {},
    children: isPanel
      ? MVP_COMPONENT_FIXTURES.filter(
          (candidate) =>
            candidate.type !== 'WebPanel' &&
            defaultComponentRegistry.require(candidate.type).visual &&
            candidate.type !== 'WebPopup',
        ).map((candidate) => candidate.id)
      : [],
  };
}

function testPage(): PageModel {
  return parsePage({
    formatVersion: 2,
    id: 'page-model',
    name: 'PageMain',
    caption: 'Main',
    width: 640,
    height: 480,
    rootComponentId: 'page-root',
    components: [
      {
        id: 'page-root',
        type: 'WebPage',
        name: 'PageMain',
        parentId: null,
        layout: createDefaultComponentLayout(),
        bounds: { x: 0, y: 0, width: 640, height: 480 },
        props: { caption: 'Main', visible: true, enabled: true },
        events: {
          OnCreate: 'PageMainCreate',
          OnShow: null,
          OnHide: null,
          OnResize: null,
        },
        children: [
          'stable-panel-main',
          'popup-dialog',
          'api-client',
          'stable-file-upload',
          'stable-video-upload',
          'stable-report-builder',
        ],
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

describe('page language generation', () => {
  it('generates separate executable source and editor typings from the model', () => {
    const page = testPage();
    const source = generatePageSource(page);
    const typings = generatePageTypings(page);
    const userSource = createUserPageSource(page);
    const artifacts = generatePageArtifacts(page);

    expect(page.components.slice(1).map((component) => component.type)).toEqual(
      MVP_COMPONENT_TYPES.slice(1),
    );
    for (const component of MVP_COMPONENT_FIXTURES) {
      const typeName =
        component.type === 'WebRepeatingGroup'
          ? 'WebRepeatingGroup<RepeatingGroup1RowValue>'
          : component.type;
      const declaration = `public readonly ${component.name}: ${typeName};`;
      expect(source).toContain(declaration);
      expect(typings).toContain(declaration);
      if (defaultComponentRegistry.require(component.type).visual) {
        expect(source).toContain(
          `this.${component.name} = new ${typeName}(this.requireComponentElement(${JSON.stringify(component.id)}))`,
        );
      }
    }
    expect(source).toContain('this.ApiClient1 = new WebApiClient(');
    expect(source).toContain(
      'this.DataGrid1 = new WebDataGrid(this.requireComponentElement("data-grid"))',
    );
    expect(source).toContain(
      'this.Popup1 = new WebPopup(this.requireComponentElement("popup-dialog"))',
    );
    expect(source).toContain('this.DataGrid1.dataGridConfig = {');
    expect(source).toContain('"apiClientId":"api-client"');
    expect(source).toContain('"operationId":"operation-1"');
    expect(source).toContain('this.DataGrid1.bindApiClient(this.ApiClient1)');
    expect(source).toContain('"baseUrl":"https://api.example.test"');
    expect(source).toContain('"id":"api-client"');
    expect(source).toContain('"name":"ApiClient1"');
    expect(source).not.toContain('requireComponentElement("api-client")');
    expect(source).not.toContain('requireComponentElement("stable-file-upload")');
    expect(source).toContain('this.FileUpload1 = new WebFileUpload(');
    expect(source).toContain('this.FileUpload1.dispose();');
    expect(source).toContain('this.ApiClient1.dispose();');
    expect(source).not.toContain('public readonly PageMain: WebPage;');
    expect(typings).not.toContain('public readonly PageMain: WebPage;');
    expect(source).not.toContain('requireComponentElement("page-root")');
    expect(source).toContain('this.bindGeneratedEvent(this, "OnCreate", "PageMainCreate")');
    expect(source).toContain(
      'this.bindGeneratedEvent(this.BTNMostrar, "OnClick", "BTNMostrarClick")',
    );
    expect(source).toContain(
      'this.bindGeneratedEvent(this.ApiClient1, "OnSuccess", "ApiClient1Success")',
    );
    const panel = page.components.find((component) => component.id === 'stable-panel-main');
    expect(panel?.children).toEqual(
      MVP_COMPONENT_FIXTURES.filter(
        (component) =>
          component.type !== 'WebPanel' &&
          defaultComponentRegistry.require(component.type).visual &&
          component.type !== 'WebPopup',
      ).map((component) => component.id),
    );
    expect(
      page.components
        .filter(
          (component) =>
            component.type !== 'WebPage' &&
            defaultComponentRegistry.require(component.type).visual &&
            component.type !== 'WebPopup',
        )
        .slice(1)
        .every((component) => component.parentId === panel?.id),
    ).toBe(true);
    expect(typings).toContain('export declare abstract class PageMainGenerated extends WebPage');
    expect(userSource).toContain('export class PageMain extends PageMainGenerated');
    expect(artifacts.generatedFileName).toBe('pages/PageMain.generated.ts');
    expect(artifacts.userFileName).toBe('pages/PageMain.ts');
    expect(generateRuntimeTypings()).toContain("declare module '@webrad/runtime'");
  });

  it('generates typed programming access for visual children inside a Popup', () => {
    const popupPage = testPage();
    const popup = popupPage.components.find((component) => component.id === 'popup-dialog');
    if (popup === undefined) throw new Error('Expected a Popup fixture.');
    const popupButton = defaultComponentRegistry.createComponent('WebButton', {
      id: 'popup-confirm-button',
      name: 'BTNConfirmar',
      parentId: popup.id,
      x: 24,
      y: 96,
      props: { caption: 'Confirmar' },
    });
    const pageWithPopupChild = addComponent(popupPage, popupButton, popup.id);

    const source = generatePageSource(pageWithPopupChild);
    const typings = generatePageTypings(pageWithPopupChild);
    const persistedPopup = pageWithPopupChild.components.find(
      (component) => component.id === popup.id,
    );

    expect(persistedPopup?.children).toEqual([popupButton.id]);
    expect(source).toContain('public readonly BTNConfirmar: WebButton;');
    expect(typings).toContain('public readonly BTNConfirmar: WebButton;');
    expect(source).toContain(
      'this.BTNConfirmar = new WebButton(this.requireComponentElement("popup-confirm-button"))',
    );
  });

  it('generates a reusable class with scoped component access and event bindings', () => {
    const idFactory = (() => {
      let sequence = 0;
      return () => `reusable-${String((sequence += 1))}`;
    })();
    let reusableElement = createReusableElement('CustomerCard', { idFactory });
    const button = defaultComponentRegistry.createComponent('WebButton', {
      id: 'customer-card-button',
      name: 'CustomerCardButton',
      parentId: reusableElement.rootComponentId,
      x: 16,
      y: 16,
    });
    reusableElement = bindComponentEvent(
      addComponent(reusableElement, button, reusableElement.rootComponentId),
      button.id,
      'OnClick',
      'CustomerCardButtonClick',
    );

    const source = generateReusableElementSource(reusableElement);
    const typings = generateReusableElementTypings(reusableElement);
    const userSource = createUserReusableElementSource(reusableElement);

    expect(source).toContain(
      'import { WebButton, WebComponent, WebPanel, WebReusableElementInstance } from "@webrad/runtime";',
    );
    expect(source).toContain(
      'export abstract class CustomerCardGenerated extends WebReusableElementInstance',
    );
    expect(source).toContain(
      'element: HTMLElement, instanceId: string, componentElements: ReadonlyMap<string, WebComponent>, componentIds: ReadonlyMap<string, string>',
    );
    expect(source).toContain('super(element, instanceId, componentElements, componentIds);');
    expect(source).toContain(
      'this.CustomerCardButton = new WebButton(this.requireComponentElement(this.componentId("customer-card-button")))',
    );
    expect(source).toContain(
      'this.bindGeneratedEvent(this.CustomerCardButton, "OnClick", "CustomerCardButtonClick")',
    );
    expect(typings).toContain(
      'export declare abstract class CustomerCardGenerated extends WebReusableElementInstance',
    );
    expect(generateRuntimeTypings()).toContain('readonly pageName: string;');
    expect(userSource).toContain('export class CustomerCard extends CustomerCardGenerated');
  });

  it('provides typed this.Name completions for every generated MVP component', () => {
    const page = testPage();
    const runtimeFileName = '/webrad-language-test/node_modules/@webrad/runtime/index.d.ts';
    const generatedFileName = '/webrad-language-test/pages/PageMain.generated.d.ts';
    const userFileName = '/webrad-language-test/pages/PageMain.ts';
    const memberExpressions = MVP_COMPONENT_FIXTURES.map(
      (component) => `    this.${component.name};`,
    ).join('\n');
    const userSource = `import { PageMainGenerated } from './PageMain.generated';

export class PageMain extends PageMainGenerated {
  inspectComponents(): void {
${memberExpressions}
    this.IMGLogo.placeholder = 'user';
    this.IMGLogo.src = null;
  }
}
`;
    const service = createLanguageService({
      [runtimeFileName]: generateRuntimeTypings(),
      [generatedFileName]: generatePageTypings(page),
      [userFileName]: userSource,
    });

    try {
      const diagnostics = service.getSemanticDiagnostics(userFileName).map((diagnostic) => ({
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        start: diagnostic.start,
      }));
      expect(diagnostics).toEqual([]);
      const imagePosition = userSource.indexOf('this.IMGLogo.placeholder') + 'this.IMGLogo.'.length;
      expect(
        service
          .getCompletionsAtPosition(userFileName, imagePosition, {})
          ?.entries.map((entry) => entry.name),
      ).toContain('placeholder');
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
export class PageMain extends PageMainGenerated {
  readonly answer = 42;
}
`;
    const edit = ensureEventHandler(original, {
      className: 'PageMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(true);
    expect(edit.sourceText).toContain('import type { WebButton } from "@webrad/runtime";');
    expect(edit.sourceText).toContain(
      '  async BTNMostrarClick(sender: WebButton): Promise<void> {\n    \n  }',
    );
    const sourceLines = edit.sourceText.split('\n');
    const handlerLine = sourceLines.findIndex((line) => line.includes('async BTNMostrarClick')) + 1;
    expect(edit.cursor.line).toBe(handlerLine + 1);
    expect(edit.cursor.column).toBe(5);
    expect(sourceLines[edit.cursor.line - 1]).toBe('    ');
    expect(edit.sourceText).toContain(original.slice(0, original.lastIndexOf('}')));
    expect(edit.sourceText).toContain('readonly answer = 42;');
    expect(edit.location.line).toBeGreaterThan(1);
    const handlerStart = edit.sourceText.indexOf('async BTNMostrarClick');
    const bodyStart = edit.sourceText.indexOf('{', handlerStart);
    const bodyEnd = edit.sourceText.indexOf('}', bodyStart);
    expect(edit.cursor.start).toBeGreaterThan(bodyStart);
    expect(edit.cursor.start).toBeLessThan(bodyEnd);
    expect(edit.cursor.end).toBe(edit.cursor.start);

    const second = ensureEventHandler(edit.sourceText, {
      className: 'PageMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });
    expect(second.changed).toBe(false);
    expect(second.sourceText).toBe(edit.sourceText);
    expect(second.location).toEqual(edit.location);
    expect(second.cursor).toEqual(edit.cursor);
  });

  it.each([
    { source: 'export class PageMain {}\n', indent: '  ', asynchronous: false },
    {
      source: 'namespace Pages {\n  export class PageMain {}\n}\n',
      indent: '    ',
      asynchronous: true,
    },
  ])('indents empty handlers and cursor targets in $source', ({ source, indent, asynchronous }) => {
    const request = {
      className: 'PageMain',
      componentName: 'Button1',
      componentType: 'WebButton',
      eventName: 'OnClick',
      async: asynchronous,
    };
    const edit = ensureEventHandler(source, request);
    const signature = asynchronous
      ? 'async Button1Click(sender: WebButton): Promise<void>'
      : 'Button1Click(sender: WebButton): void';
    expect(edit.sourceText).toContain(indent + signature + ' {\n' + indent + '  \n' + indent + '}');
    expect(edit.sourceText.split('\n')[edit.cursor.line - 1]).toBe(indent + '  ');
    expect(edit.cursor.column).toBe(indent.length + 3);
    const reopened = ensureEventHandler(edit.sourceText, request);
    expect(reopened.changed).toBe(false);
    expect(reopened.sourceText).toBe(edit.sourceText);
    expect(reopened.cursor).toEqual(edit.cursor);
  });

  it('returns the first statement inside an existing handler body as its cursor target', () => {
    const source = `export class PageMain {
  async BTNMostrarClick(sender: WebButton): Promise<void> {
    const answer = sender;
  }
}
`;
    const edit = ensureEventHandler(source, {
      className: 'PageMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(false);
    expect(source.slice(edit.cursor.start)).toMatch(/^const answer = sender;/);
  });

  it('uses an existing aliased runtime type import', () => {
    const edit = ensureEventHandler(
      `import type { WebButton as Button } from '@webrad/runtime';
export class PageMain {}
`,
      {
        className: 'PageMain',
        componentName: 'BTNMostrar',
        componentType: 'WebButton',
        eventName: 'OnClick',
      },
    );
    expect(edit.sourceText).toContain('sender: Button');
    expect(edit.sourceText.match(/@webrad\/runtime/g)).toHaveLength(1);
  });

  it('inserts an API Client lifecycle handler with typed event details', () => {
    const edit = ensureEventHandler('export class PageMain {}\n', {
      className: 'PageMain',
      componentName: 'ApiClient1',
      componentType: 'WebApiClient',
      eventName: 'OnSuccess',
      eventDetailType: 'WebApiOperationEventDetail',
    });

    expect(edit.sourceText).toContain(
      'async ApiClient1Success(sender: WebApiClient, event: CustomEvent<WebApiOperationEventDetail>): Promise<void>',
    );
    expect(edit.sourceText).toContain('import type { WebApiClient } from "@webrad/runtime";');
    expect(edit.sourceText).toContain(
      'import type { WebApiOperationEventDetail } from "@webrad/runtime";',
    );
  });

  it('creates the registered unauthenticated page handler without requiring user data', () => {
    const event = defaultComponentRegistry
      .get('WebPage')
      ?.events.find((event) => event.name === 'OnUnauthenticated');
    expect(event?.category).toBe('RestGO');
    const edit = ensureEventHandler('export class PageMain {}\n', {
      className: 'PageMain',
      componentName: 'PageMain',
      componentType: 'WebPage',
      eventName: 'OnUnauthenticated',
      eventDetailType: event?.eventDetailType,
    });
    expect(edit.sourceText).toContain(
      'async PageMainUnauthenticated(sender: WebPage): Promise<void>',
    );
    expect(edit.sourceText).not.toContain('event.detail');
  });

  it.each(['OnLogin', 'OnLogout'])(
    'authors a typed %s page handler using registry metadata',
    (eventName) => {
      const metadata = defaultComponentRegistry
        .get('WebPage')
        ?.events.find((event) => event.name === eventName);
      if (!metadata) throw new Error('Missing registered page auth event.');
      const options = {
        className: 'PageMain',
        componentName: 'PageMain',
        componentType: 'WebPage',
        eventName,
        eventDetailType: metadata.eventDetailType,
        eventDetailProperties: metadata.eventDetailProperties,
      };
      const edit = ensureEventHandler(
        'export class PageMain { private usuarioId = ""; }\n',
        options,
      );
      expect(edit.sourceText).toContain(`event: CustomEvent<${metadata.eventDetailType}>`);
      expect(edit.sourceText).toContain('const { user } = event.detail;');
      expect(edit.sourceText).toContain('private usuarioId = "";');
      expect(ensureEventHandler(edit.sourceText, options).changed).toBe(false);
    },
  );

  it('scaffolds Data Grid cell detail constants in a new cell-click handler', () => {
    const edit = ensureEventHandler('export class PageMain {}\n', {
      className: 'PageMain',
      componentName: 'DataGrid1',
      componentType: 'WebDataGrid',
      eventName: 'OnCellClick',
      eventDetailType: 'WebDataGridCellEventDetail',
      eventDetailProperties: ['column', 'rowIndex', 'columnIndex', 'value', 'getValue'],
    });

    expect(edit.sourceText).toContain(
      'async DataGrid1CellClick(sender: WebDataGrid, event: CustomEvent<WebDataGridCellEventDetail>): Promise<void>',
    );
    expect(edit.sourceText).toContain(
      '\n    const { column, rowIndex, columnIndex, value, getValue } = event.detail;\n  }',
    );
  });

  it('rejects detail constants without an event detail type', () => {
    expect(() =>
      ensureEventHandler('export class PageMain {}\n', {
        className: 'PageMain',
        componentName: 'DataGrid1',
        componentType: 'WebDataGrid',
        eventName: 'OnCellClick',
        eventDetailProperties: ['column'],
      }),
    ).toThrow('require an event detail type');
  });

  it('does not duplicate an existing property-style handler', () => {
    const source = `export class PageMain {
  BTNMostrarClick = async (sender: WebButton): Promise<void> => {};
}
`;
    const edit = ensureEventHandler(source, {
      className: 'PageMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(false);
    expect(edit.sourceText).toBe(source);
    const bodyStart = source.indexOf('{', source.indexOf('BTNMostrarClick'));
    const bodyEnd = source.indexOf('}', bodyStart);
    expect(edit.cursor.start).toBeGreaterThan(bodyStart);
    expect(edit.cursor.start).toBeLessThanOrEqual(bodyEnd);
  });
});
