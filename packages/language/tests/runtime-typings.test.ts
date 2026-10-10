import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { MVP_COMPONENT_DEFINITIONS } from '@webrad/component-registry';
import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';

import { generateEnvironmentTypings } from '../src/environment-typings.js';
import { generateRuntimeTypings } from '../src/runtime-typings.js';

const compilerOptions: ts.CompilerOptions = {
  allowSyntheticDefaultImports: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
};

function runtimeModuleExports(typings: string): readonly string[] {
  const source = ts.createSourceFile(
    'webrad-runtime.d.ts',
    typings,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const runtimeModule = source.statements.find(
    (statement): statement is ts.ModuleDeclaration =>
      ts.isModuleDeclaration(statement) &&
      ts.isStringLiteral(statement.name) &&
      statement.name.text === '@webrad/runtime',
  );
  const moduleBody = runtimeModule?.body;
  if (moduleBody === undefined || !ts.isModuleBlock(moduleBody)) return [];

  const names = new Set<string>();
  for (const statement of moduleBody.statements) {
    if (
      ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      if (statement.name !== undefined) names.add(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return [...names].sort();
}

function publicRuntimeExports(): readonly string[] {
  const runtimeIndex = fileURLToPath(new URL('../../runtime/src/index.ts', import.meta.url));
  const program = ts.createProgram([runtimeIndex], compilerOptions);
  const source = program.getSourceFile(runtimeIndex);
  if (source === undefined) return [];
  const symbol = program.getTypeChecker().getSymbolAtLocation(source);
  if (symbol === undefined) return [];
  return program
    .getTypeChecker()
    .getExportsOfModule(symbol)
    .map((item) => item.name)
    .sort();
}

interface MarkedSource {
  readonly text: string;
  readonly positions: ReadonlyMap<string, number>;
}

function extractMarkers(source: string): MarkedSource {
  const positions = new Map<string, number>();
  let text = '';
  let remaining = source;
  while (true) {
    const markerStart = remaining.indexOf('/*@');
    if (markerStart < 0) break;
    const markerEnd = remaining.indexOf('*/', markerStart);
    if (markerEnd < 0) throw new Error('Unterminated editor test marker.');
    text += remaining.slice(0, markerStart);
    positions.set(remaining.slice(markerStart + 3, markerEnd), text.length);
    remaining = remaining.slice(markerEnd + 2);
  }
  return { text: text + remaining, positions };
}

function createLanguageService(
  source: string,
  environmentTypings?: string,
): {
  readonly fileName: string;
  readonly service: ts.LanguageService;
} {
  const typingsFileName = fileURLToPath(new URL('./webrad-runtime.virtual.d.ts', import.meta.url));
  const environmentFileName = fileURLToPath(
    new URL('./webrad-environment.virtual.d.ts', import.meta.url),
  );
  const sourceFileName = fileURLToPath(new URL('./editor-contract.virtual.ts', import.meta.url));
  const canonicalFileName = (fileName: string): string =>
    fileName.replaceAll('\\', '/').toLocaleLowerCase();
  const files = new Map<string, string>([
    [canonicalFileName(typingsFileName), generateRuntimeTypings()],
    ...(environmentTypings === undefined
      ? []
      : [[canonicalFileName(environmentFileName), environmentTypings] as const]),
    [canonicalFileName(sourceFileName), source],
  ]);
  const host: ts.LanguageServiceHost = {
    directoryExists: ts.sys.directoryExists,
    fileExists: (fileName) => files.has(canonicalFileName(fileName)) || ts.sys.fileExists(fileName),
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => fileURLToPath(new URL('.', import.meta.url)),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories: ts.sys.getDirectories,
    getScriptFileNames: () => [
      typingsFileName,
      ...(environmentTypings === undefined ? [] : [environmentFileName]),
      sourceFileName,
    ],
    getScriptSnapshot: (fileName) => {
      const contents = files.get(canonicalFileName(fileName)) ?? ts.sys.readFile(fileName);
      return contents === undefined ? undefined : ts.ScriptSnapshot.fromString(contents);
    },
    getScriptVersion: () => '1',
    readDirectory: ts.sys.readDirectory,
    readFile: (fileName) => files.get(canonicalFileName(fileName)) ?? ts.sys.readFile(fileName),
  };
  return { fileName: sourceFileName, service: ts.createLanguageService(host) };
}

function completionNames(
  languageService: ts.LanguageService,
  fileName: string,
  position: number,
): readonly string[] {
  return (
    languageService
      .getCompletionsAtPosition(fileName, position, {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
      })
      ?.entries.map((entry) => entry.name) ?? []
  );
}

describe('Monaco runtime typings', () => {
  it('types the shared image binding and rejects non-image DOM elements', () => {
    const valid =
      createLanguageService(`import { bindImageResampling } from '@webrad/runtime/image-display';
const dispose: () => void = bindImageResampling(document.createElement('img'));
dispose();`);
    const invalid =
      createLanguageService(`import { bindImageResampling } from '@webrad/runtime/image-display';
bindImageResampling(document.createElement('canvas'));`);
    try {
      expect(valid.service.getSemanticDiagnostics(valid.fileName)).toEqual([]);
      expect(
        invalid.service
          .getSemanticDiagnostics(invalid.fileName)
          .some((diagnostic) => diagnostic.code === 2345),
      ).toBe(true);
    } finally {
      valid.service.dispose();
      invalid.service.dispose();
    }
  });

  it('completes numeric margin for every concrete visual type and rejects invalid uses', () => {
    const visuals = MVP_COMPONENT_DEFINITIONS.filter((definition) => definition.visual);
    const marked =
      extractMarkers(`import type { ${visuals.map((definition) => definition.type).join(', ')}, WebApiClient } from '@webrad/runtime';
${visuals
  .map(
    (definition, index) => `declare const component${String(index)}: ${definition.type};
component${String(index)}./*@margin${String(index)}*/margin = 12;
const margin${String(index)}: number = component${String(index)}.margin;
component${String(index)}.marginTop = 1;
component${String(index)}.marginRight = 2;
component${String(index)}.marginBottom = 3;
const left${String(index)}: number = component${String(index)}.marginLeft;
component${String(index)}.alignSelf = 'center';`,
  )
  .join('\n')}
component0.marginLeft = '12px';
component0.alignSelf = 'middle';
declare const api: WebApiClient;
api.marginTop = 12;
api.alignSelf = 'center';
`);
    const { service, fileName } = createLanguageService(marked.text);
    try {
      for (const [index] of visuals.entries()) {
        expect(
          completionNames(service, fileName, marked.positions.get(`margin${String(index)}`) ?? 0),
        ).toEqual(
          expect.arrayContaining([
            'margin',
            'marginTop',
            'marginRight',
            'marginBottom',
            'marginLeft',
            'alignSelf',
          ]),
        );
      }
      expect(service.getSemanticDiagnostics(fileName).map((diagnostic) => diagnostic.code)).toEqual(
        [2322, 2322, 2339, 2339],
      );
    } finally {
      service.dispose();
    }
  });
  it('offers typed current-user fields in page authentication event handlers', () => {
    const marked =
      extractMarkers(`import type { WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
declare const login: CustomEvent<WebPageLoginEventDetail>;
declare const logout: CustomEvent<WebPageLogoutEventDetail>;
login.detail.user./*@loginUser*/;
logout.detail.user./*@logoutUser*/;
`);
    const { service, fileName } = createLanguageService(marked.text);
    for (const marker of ['loginUser', 'logoutUser'])
      expect(completionNames(service, fileName, marked.positions.get(marker) ?? 0)).toEqual(
        expect.arrayContaining([
          'id',
          'email',
          'fullName',
          'avatarUrl',
          'active',
          'emailConfirmed',
        ]),
      );
  });
  it('derives every button icon literal from the shared local catalogue', () => {
    const typings = generateRuntimeTypings();
    for (const icon of WEBRAD_ICON_NAMES) {
      expect(typings).toContain(`| '${icon}'`);
    }
  });

  it('stays in parity with every public runtime export', () => {
    const typingsExports = runtimeModuleExports(generateRuntimeTypings());
    const runtimeExports = publicRuntimeExports();
    expect(typingsExports).toEqual(runtimeExports);
    expect(runtimeExports).not.toContain('WebForm');
  });

  it('offers typed readonly CurrentUser members on the shared and standalone clients', () => {
    const marked =
      extractMarkers(`import { createClient, type RestGoCurrentUser } from '@webrad/restgo-sdk';
import { RestGO as shared } from '@webrad/runtime';
const user: RestGoCurrentUser | null = RestGO.CurrentUser;
if (user) {
  user./*@identity*/nome;
  const nome: string = user.nome;
  const email: string = user.email;
  const id: string = user.id;
  const confirmed: boolean = user.emailconfirmed;
  const active: boolean = user.ativo;
}
const client = createClient('https://restgo.example.test');
const independent: RestGoCurrentUser | null = client.CurrentUser;
const imported: RestGoCurrentUser | null = shared.CurrentUser;
RestGO./*@client*/CurrentUser;
`);
    const { service, fileName } = createLanguageService(marked.text);
    try {
      expect(service.getSemanticDiagnostics(fileName)).toEqual([]);
      expect(completionNames(service, fileName, marked.positions.get('identity') ?? 0)).toEqual(
        expect.arrayContaining(['nome', 'email', 'id', 'emailconfirmed', 'ativo']),
      );
      expect(completionNames(service, fileName, marked.positions.get('client') ?? 0)).toContain(
        'CurrentUser',
      );
    } finally {
      service.dispose();
    }
    const invalid = createLanguageService(`RestGO.CurrentUser.nome;
function replace(): void { RestGO.CurrentUser = null; }
if (RestGO.CurrentUser) {
  RestGO.CurrentUser.nome = 'Outro';
  const active: string = RestGO.CurrentUser.ativo;
  RestGO.CurrentUser.inexistente;
}`);
    try {
      const codes = invalid.service
        .getSemanticDiagnostics(invalid.fileName)
        .map(({ code }) => code);
      expect(codes).toEqual(expect.arrayContaining([18047, 2540, 2322, 2339]));
      expect(codes.filter((code) => code === 2540)).toHaveLength(2);
    } finally {
      invalid.service.dispose();
    }
  });

  it('offers login sucess completion and narrows session or error with the boolean', () => {
    const marked =
      extractMarkers(`import { createClient, type RestGoLoginResult, type RestGoUser, RestGoError } from '@webrad/restgo-sdk';
async function login(): Promise<string> {
  const log: RestGoLoginResult = await RestGO.login('cliente@example.test', 'segredo', false);
  const flag: boolean = log.sucess;
  log./*@loginResult*/sucess;
  if (log.sucess) {
    const succeeded: true = log.sucess;
    const user: RestGoUser = log.data.user;
    const error: null = log.error;
    log.data.user./*@loginUser*/fullName;
    return user.fullName;
  } else {
    const failed: false = log.sucess;
    const data: null = log.data;
    const error: RestGoError = log.error;
    return error.message;
  }
}
async function standaloneLogin(): Promise<string> {
  const client = createClient('https://restgo.example.test', { persistSession: false });
  const log = await client.login('cliente@example.test', 'segredo');
  if (!log.sucess) return log.error.message;
  return log.data.user.fullName;
}
`);
    const { service, fileName } = createLanguageService(marked.text);
    try {
      expect(service.getSyntacticDiagnostics(fileName)).toEqual([]);
      expect(service.getSemanticDiagnostics(fileName)).toEqual([]);
      expect(completionNames(service, fileName, marked.positions.get('loginResult') ?? 0)).toEqual(
        expect.arrayContaining(['data', 'error', 'sucess']),
      );
      expect(completionNames(service, fileName, marked.positions.get('loginUser') ?? 0)).toContain(
        'fullName',
      );
    } finally {
      service.dispose();
    }
    const invalid = createLanguageService(`async function login(): Promise<string> {
  const log = await RestGO.login('cliente@example.test', 'segredo');
  if (!log.sucess) return log.data.user.fullName;
  return log.error.message;
}`);
    try {
      const diagnostics = invalid.service.getSemanticDiagnostics(invalid.fileName);
      expect(diagnostics.filter(({ code }) => code === 18047)).toHaveLength(2);
    } finally {
      invalid.service.dispose();
    }
  });

  it('offers the native RestGO global and SDK imports with actual SDK method signatures', () => {
    const marked =
      extractMarkers(`import { createClient, type RestGoSession, type RestGoAuthEvent } from '@webrad/restgo-sdk';
import { RestGO as sharedClient } from '@webrad/runtime';
const independentClient = createClient('https://restgo.example.test', { sessionStorage: 'memory' });
RestGO./*@client*/auth;
RestGO.auth./*@auth*/signInWithPassword;
RestGO.from('pessoas')./*@endpoint*/get;
const subscription = RestGO.auth.onAuthStateChange((event, session) => {
  const current: RestGoSession | null = session;
  const renewed: RestGoAuthEvent = 'TOKEN_REFRESHED';
  const refresh: string | undefined = current?.refreshToken;
  const expiry: string | undefined = current?.refreshExpiresAt;
  void renewed; void refresh; void expiry;
  void event;
  void current;
});
subscription.unsubscribe();
void RestGO.auth.signInWithPassword({ email: 'cliente@example.test', password: 'segredo' });
void independentClient.auth.getSession();
void RestGO.login('cliente@example.test', 'segredo', true);
void RestGO.logout();
void RestGO.getUser();
void RestGO.getSession();
void RestGO.refreshSession();
RestGO.onAuthStateChange((event, session) => {
  const current: RestGoSession | null = session;
  void current; void event;
}).unsubscribe();
void independentClient.auth.refreshSession();
independentClient.dispose();
void sharedClient.storage;
`);
    const { fileName, service } = createLanguageService(marked.text);
    expect(service.getProgram()?.getSyntacticDiagnostics()).toEqual([]);
    expect(service.getSemanticDiagnostics(fileName)).toEqual([]);
    expect(completionNames(service, fileName, marked.positions.get('client') ?? 0)).toEqual(
      expect.arrayContaining([
        'auth',
        'storage',
        'api',
        'from',
        'login',
        'logout',
        'getSession',
        'getUser',
        'refreshSession',
        'onAuthStateChange',
      ]),
    );
    expect(completionNames(service, fileName, marked.positions.get('auth') ?? 0)).toEqual(
      expect.arrayContaining([
        'signInWithPassword',
        'signUp',
        'getSession',
        'signOut',
        'refreshSession',
      ]),
    );
    expect(completionNames(service, fileName, marked.positions.get('endpoint') ?? 0)).toEqual(
      expect.arrayContaining(['get', 'post', 'put', 'patch', 'delete']),
    );

    const invalid = createLanguageService(`import { createClient } from '@webrad/restgo-sdk';
createClient('https://restgo.example.test', { sessionStorage: 'browser' });
void RestGO.auth.signInWithPassword({ email: 'cliente@example.test', password: 42 });
void RestGO.login('cliente@example.test', 42);
void RestGO.login('cliente@example.test', 'segredo', 'sim');
`);
    expect(
      invalid.service.getSemanticDiagnostics(invalid.fileName).map(({ code }) => code),
    ).toEqual(expect.arrayContaining([2322]));
    const unsupportedPrivateImport =
      createLanguageService(`import { RestGoTransport } from '@webrad/restgo-sdk/transport';
void RestGoTransport;
`);
    expect(
      unsupportedPrivateImport.service
        .getSemanticDiagnostics(unsupportedPrivateImport.fileName)
        .map(({ code }) => code),
    ).toContain(2307);
    const unsupportedPrivateExport =
      createLanguageService(`import { RestGoTransport } from '@webrad/restgo-sdk';
void RestGoTransport;
`);
    expect(
      unsupportedPrivateExport.service
        .getSemanticDiagnostics(unsupportedPrivateExport.fileName)
        .map(({ code }) => code),
    ).toContain(2459);
    const invalidStorage = createLanguageService(`import { createClient } from '@webrad/restgo-sdk';
createClient('https://restgo.example.test', { sessionStorage: 'browser' });
`);
    expect(
      invalidStorage.service
        .getSemanticDiagnostics(invalidStorage.fileName)
        .map(({ code }) => code),
    ).toContain(2322);
  });

  it('accepts bound REST clients, multipart bodies, HEAD/OPTIONS and transient test-session sources', () => {
    const valid = createLanguageService(`import {
  WebApiClient,
  prepareRestGoApiRequest,
  getRestGoClient,
  type WebApiBodyKind,
  type WebApiConnection,
  type WebApiClientConfiguration,
  type RestGoApiSessionSource,
} from '@webrad/runtime';
const bodyKind: WebApiBodyKind = 'form-data';
const connection: WebApiConnection = 'restgo-session';
const configuration: WebApiClientConfiguration = {
  schemaVersion: 1,
  connection,
  defaultHeaders: [],
  timeoutMs: 30_000,
  operations: [{
    id: 'upload', name: 'Upload', method: 'POST', path: '/files',
    headers: [], query: [], body: { kind: bodyKind, content: 'name=Ana' },
    credentials: 'omit', timeoutMs: null, responseSchema: null,
  }],
};
const api = new WebApiClient({ apiClientConfig: configuration });
const headResult: Promise<void> = api.head('/files', { responseType: 'json' });
const optionResult: Promise<{ allowed: string[] }> = api.options<{ allowed: string[] }>('/files');
const source: RestGoApiSessionSource = {
  baseUrl: 'https://restgo.example.test/prefix',
  async getSession() { return { data: { token: 'transient-test-jwt' }, error: null }; },
};
const sharedSource: RestGoApiSessionSource = getRestGoClient();
const prepared: Promise<{ readonly url: string; readonly init: RequestInit }> = prepareRestGoApiRequest(
  '/files', { method: 'POST', body: new FormData() }, source,
);
void headResult; void optionResult; void sharedSource; void prepared;
`);
    expect(valid.service.getSemanticDiagnostics(valid.fileName)).toEqual([]);

    const invalid = createLanguageService(`import {
  WebApiClient,
  type WebApiBodyKind,
  type WebApiConnection,
  type RestGoApiSessionSource,
} from '@webrad/runtime';
const unsupportedBody: WebApiBodyKind = 'multipart';
const unsupportedConnection: WebApiConnection = 'raw-api-token';
const source: RestGoApiSessionSource = {
  baseUrl: 'https://restgo.example.test',
  async getSession() { return { data: { token: 42 }, error: null }; },
};
new WebApiClient().head('/files').then((result) => { const text: string = result; });
void source; void unsupportedBody; void unsupportedConnection;
`);
    expect(
      invalid.service.getSemanticDiagnostics(invalid.fileName).map(({ code }) => code),
    ).toEqual([2322, 2322, 2322, 2322]);
  });

  it('offers component, page, API client, and collection completions', () => {
    const marked = extractMarkers(`import {
  WebApiClient,
  WebButton,
  WebCheckBox,
  WebComboBox,
  WebDataGrid,
  WebEdit,
  WebFileUpload,
  WebPage,
  WebImage,
  WebLabel,
  WebListBox,
  WebPanel,
  WebPopup,
  WebReusableElement,
  WebReusableElementInstance,
  WebTextArea,
} from '@webrad/runtime';

class EditorPage extends WebPage {
  configure(
    panel: WebPanel,
    reusable: WebReusableElement,
    label: WebLabel,
    edit: WebEdit,
    fileUpload: WebFileUpload,
    textArea: WebTextArea,
    button: WebButton,
    checkBox: WebCheckBox,
    combo: WebComboBox,
    image: WebImage,
    list: WebListBox,
    grid: WebDataGrid,
    popup: WebPopup,
    api: WebApiClient,
    reusableInstance: WebReusableElementInstance,
  ): void {
    panel./*@panel*/caption;
    reusable./*@reusable*/placement;
    label./*@label*/autoSize;
    edit./*@edit*/inputType;
    fileUpload./*@fileUpload*/upload;
    textArea./*@textArea*/rows;
    button./*@button*/caption;
    checkBox./*@checkBox*/checked;
    combo./*@combo*/items;
    image./*@image*/objectFit;
    list./*@list*/selectedIndex;
    grid./*@grid*/configuration;
    popup./*@popup*/modal;
    api./*@api*/request;
    reusableInstance./*@reusableInstance*/pageName;
    this./*@page*/show;
  }
}
`);
    const { fileName, service } = createLanguageService(marked.text);
    const completions = (marker: string): readonly string[] => {
      const position = marked.positions.get(marker);
      if (position === undefined) throw new Error(`Missing editor test marker "${marker}".`);
      return completionNames(service, fileName, position);
    };
    const commonVisualProperties = [
      'backgroundColor',
      'borderColor',
      'collapseWhenHidden',
      'color',
      'enabled',
      'height',
      'name',
      'visible',
      'width',
      'x',
      'y',
    ];

    expect(completions('panel')).toEqual(
      expect.arrayContaining([...commonVisualProperties, 'caption']),
    );
    expect(completions('reusable')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'reusableElementId',
        'placement',
        'floatingHorizontalAnchor',
        'floatingVerticalAnchor',
        'floatingZIndex',
      ]),
    );
    expect(completions('reusableInstance')).toEqual(
      expect.arrayContaining(['componentId', 'instanceId', 'pageName']),
    );
    expect(completions('label')).toEqual(
      expect.arrayContaining([...commonVisualProperties, 'autoSize', 'caption', 'text']),
    );
    expect(completions('edit')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'inputType',
        'placeholder',
        'readOnly',
        'tabIndex',
        'value',
      ]),
    );
    expect(completions('textArea')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'placeholder',
        'readOnly',
        'rows',
        'tabIndex',
        'value',
      ]),
    );
    expect(completions('button')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'bindEvent',
        'caption',
        'click',
        'element',
        'onClick',
        'tabIndex',
      ]),
    );
    expect(completions('checkBox')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'caption',
        'checked',
        'onChange',
        'tabIndex',
      ]),
    );
    expect(completions('combo')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'items',
        'onChange',
        'selectedIndex',
        'tabIndex',
        'value',
      ]),
    );
    expect(completions('image')).toEqual(
      expect.arrayContaining([...commonVisualProperties, 'alt', 'objectFit', 'src']),
    );
    expect(completions('list')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'items',
        'multiple',
        'selectedIndex',
        'selectedValues',
        'tabIndex',
        'value',
      ]),
    );
    expect(completions('grid')).toEqual(
      expect.arrayContaining([...commonVisualProperties, 'bindApiClient', 'configuration']),
    );
    expect(completions('popup')).toEqual(
      expect.arrayContaining([...commonVisualProperties, 'close', 'modal', 'open', 'returnValue']),
    );
    expect(completions('popup')).not.toContain('caption');
    expect(completions('popup')).not.toContain('message');
    expect(completions('api')).toEqual(
      expect.arrayContaining([
        'baseUrl',
        'delete',
        'get',
        'head',
        'id',
        'name',
        'options',
        'patch',
        'post',
        'put',
        'request',
      ]),
    );
    expect(completions('page')).toEqual(
      expect.arrayContaining([
        ...commonVisualProperties,
        'bindGeneratedEvent',
        'caption',
        'close',
        'layoutMode',
        'requireComponentElement',
        'show',
      ]),
    );

    const completionMarkerByType: Readonly<Record<string, string>> = {
      WebApiClient: 'api',
      WebButton: 'button',
      WebCheckBox: 'checkBox',
      WebComboBox: 'combo',
      WebEdit: 'edit',
      WebFileUpload: 'fileUpload',
      WebDataGrid: 'grid',
      WebPage: 'page',
      WebImage: 'image',
      WebLabel: 'label',
      WebListBox: 'list',
      WebPanel: 'panel',
      WebPopup: 'popup',
      WebReusableElement: 'reusable',
      WebTextArea: 'textArea',
    };
    for (const definition of MVP_COMPONENT_DEFINITIONS) {
      const marker = completionMarkerByType[definition.type];
      const available = marker === undefined ? [] : completions(marker);
      expect({
        type: definition.type,
        missingProperties: definition.properties
          .filter((property) => {
            const source = property.source ?? 'props';
            return source === 'props' || source === 'node' || source === 'bounds';
          })
          .map((property) => property.name)
          .filter((property) => !available.includes(property)),
      }).toEqual({ type: definition.type, missingProperties: [] });
    }
  });

  it('offers the configured environment variables through the global Env object', () => {
    const marked = extractMarkers(`class EditorPage {
  read(): string {
    return Env./*@environment*/API_BASE_URL;
  }
}`);
    const { fileName, service } = createLanguageService(
      marked.text,
      generateEnvironmentTypings([
        {
          name: 'API_BASE_URL',
          values: {
            development: 'http://localhost:3000',
            production: 'https://api.example.test',
          },
        },
      ]),
    );
    const position = marked.positions.get('environment');
    if (position === undefined) throw new Error('Missing environment completion marker.');

    expect(completionNames(service, fileName, position)).toContain('API_BASE_URL');
    expect(service.getSemanticDiagnostics(fileName)).toEqual([]);
  });

  it('accepts the supported authoring contract and reports invalid assignments', () => {
    const validSource = `import {
  WebApiClient,
  WebApiError,
  WebButton,
  WebComboBox,
  WebEdit,
  WebPage,
  WebImage,
  WebLabel,
  WebListBox,
  WebPanel,
  WebPopup,
  WebReusableElement,
  WebReusableElementInstance,
  WebTextArea,
  resolveComponentStyleClassName,
  resolveComponentStyleClassNames,
  resolveComponentStylePreviewClassName,
  resolveStylePropertyCandidate,
  tokenizeTailwindClasses,
  type RuntimeComponentNode,
  type TailwindStyleSource,
  type WebDataGridCellEventDetail,
  type WebNonvisualComponent,
  type WebSelectItem,
} from '@webrad/runtime';

class EditorPage extends WebPage {
  configure(
    panel: WebPanel,
    reusable: WebReusableElement,
    label: WebLabel,
    edit: WebEdit,
    textArea: WebTextArea,
    button: WebButton,
    combo: WebComboBox,
    image: WebImage,
    list: WebListBox,
    popup: WebPopup,
    api: WebApiClient,
  ): void {
    this.caption = 'Editor';
    this.layoutMode = 'fixed';
    panel.caption = 'Details';
    reusable.placement = 'floating';
    reusable.floatingHorizontalAnchor = 'right';
    reusable.floatingVerticalAnchor = 'bottom';
    reusable.floatingZIndex = 300;
    panel.x = 10;
    panel.y = 20;
    panel.width = 320;
    panel.height = 200;
    panel.backgroundColor = '#fff';
    panel.borderColor = '#ccc';
    label.caption = 'Name';
    label.color = '#111';
    label.autoSize = true;
    edit.inputType = 'email';
    edit.placeholder = 'name@example.test';
    textArea.rows = 5;
    button.caption = 'Save';
    button.collapseWhenHidden = false;
    button.onClick = async (sender, event) => {
      sender.enabled = false;
      event.preventDefault();
    };
    combo.items = ['One', { value: 'two', label: 'Two' }];
    const items: readonly WebSelectItem[] = combo.items;
    void items;
    image.objectFit = 'cover';
    image.alt = 'Portrait';
    list.items = ['One', 'Two'];
    list.selectedIndex = 1;
    list.multiple = true;
    popup.modal = true;
    popup.show();
    popup.close('accepted');
    const popupOpen: boolean = popup.open;
    void popupOpen;
    this.bindGeneratedEvent(button, 'OnClick', 'SaveClick');
    api.baseUrl = 'https://api.example.test';
    const service: WebNonvisualComponent = api;
    const identity: readonly [string, string] = [api.id, api.name];
    void service;
    void identity;
    void api.get<{ readonly id: number }>('/items', { query: { page: 1 } });
  }
}

class EditorReusable extends WebReusableElementInstance {
  hostPageName(): string {
    return this.pageName;
  }
}

declare const response: Response;
const error = new WebApiError('Conflict', 409, 'Conflict', '/items', {}, response);
Message(error.message);

declare const gridCellEvent: CustomEvent<WebDataGridCellEventDetail>;
const clickedUrl = gridCellEvent.detail.getValue<string>('url');
const clickedValue: unknown = gridCellEvent.detail.value;
const clickedColumnIndex: number = gridCellEvent.detail.columnIndex;
void clickedUrl;
void clickedValue;
void clickedColumnIndex;

const reusableStyle: TailwindStyleSource = {
  states: {
    base: {
      backgroundGradient: {
        kind: 'linear',
        direction: 'to-bottom-right',
        from: '#2563eb',
        to: '#7c3aed',
      },
      transitionProperty: 'colors',
    },
    hover: { backgroundColor: '#1d4ed8' },
    focus: {},
    active: {},
    disabled: {},
  },
};
const runtimeNode: RuntimeComponentNode = {
  id: 'button-id',
  type: 'WebButton',
  name: 'Button1',
  parentId: 'page-id',
  layout: {
    container: {
      mode: 'fixed',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      gap: 0,
      wrap: false,
      justifyContent: 'start',
      alignItems: 'start',
    },
    item: {
      width: 'fixed',
      height: 'fixed',
      minWidth: 0,
      maxWidth: null,
      minHeight: 0,
      maxHeight: null,
      grow: 0,
      shrink: true,
      horizontalAnchor: 'start',
      verticalAnchor: 'start',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
  },
  bounds: { x: 0, y: 0, width: 100, height: 32 },
  props: {},
  children: [],
  styleClassName: resolveComponentStyleClassName(reusableStyle),
};
const styleClasses: readonly string[] = resolveComponentStyleClassNames(reusableStyle);
const hoverPreview: string = resolveComponentStylePreviewClassName(reusableStyle, 'hover');
const backgroundCandidate: string | undefined = resolveStylePropertyCandidate(
  'backgroundColor',
  '#2563eb',
);
const gradientCandidate: string | undefined = resolveStylePropertyCandidate(
  'backgroundGradient',
  {
    kind: 'linear',
    direction: 'to-right',
    from: '#2563eb',
    to: '#7c3aed',
  },
);
const tokens: readonly string[] = tokenizeTailwindClasses(runtimeNode.styleClassName ?? '');
void styleClasses;
void hoverPreview;
void backgroundCandidate;
void gradientCandidate;
void tokens;
`;
    const valid = createLanguageService(validSource);
    expect(valid.service.getSemanticDiagnostics(valid.fileName)).toEqual([]);

    const invalid = createLanguageService(`import {
  WebApiClient,
  WebButton,
  WebEdit,
  WebPage,
  WebImage,
  WebListBox,
  WebPopup,
  WebReusableElementInstance,
} from '@webrad/runtime';
declare const button: WebButton;
declare const edit: WebEdit;
declare const page: WebPage;
declare const image: WebImage;
declare const list: WebListBox;
declare const popup: WebPopup;
declare const api: WebApiClient;
declare const reusableInstance: WebReusableElementInstance;
button.caption = 42;
button.collapseWhenHidden = 'no';
edit.inputType = 'date';
page.layoutMode = 'table';
image.objectFit = 'stretch';
list.multiple = 'yes';
popup.caption = 'Legacy caption';
popup.message = 'Legacy message';
popup.modal = 'yes';
popup.returnValue = 42;
popup.open = false;
api.baseUrl = 42;
api.id = 'replacement';
reusableInstance.pageName = 'Replacement';
void api.get<number>(42);
`);
    expect(
      invalid.service.getSemanticDiagnostics(invalid.fileName).map(({ code }) => code),
    ).toEqual(expect.arrayContaining([2322, 2339, 2345, 2540]));
  });

  it('offers template parameters in request options and rejects non-JSON runtime values', () => {
    const marked =
      extractMarkers(`import { WebApiClient, type WebApiRequestOptions } from '@webrad/runtime';
declare const options: WebApiRequestOptions;
options./*@options*/parameters;
const api = new WebApiClient();
void api.execute('PutKey', { parameters: { id: 3, chave: 'key', enabled: true, extra: { nested: [1, null] } } });`);
    const { fileName, service } = createLanguageService(marked.text);
    try {
      expect(service.getSemanticDiagnostics(fileName)).toEqual([]);
      expect(completionNames(service, fileName, marked.positions.get('options') ?? 0)).toContain(
        'parameters',
      );
    } finally {
      service.dispose();
    }
    const invalid = createLanguageService(`import { WebApiClient } from '@webrad/runtime';
void new WebApiClient().execute('PutKey', { parameters: { id: () => 1 } });`);
    try {
      expect(
        invalid.service.getSemanticDiagnostics(invalid.fileName).map((diagnostic) => ({
          code: diagnostic.code,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          source: diagnostic.file?.text.slice(
            diagnostic.start ?? 0,
            (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
          ),
        })),
      ).toEqual([
        {
          code: 2769,
          message: expect.stringContaining(
            "Type '() => number' is not assignable to type 'WebApiTemplateValue'.",
          ),
          source: '() => 1',
        },
      ]);
    } finally {
      invalid.service.dispose();
    }
  });
});
