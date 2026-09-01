// @vitest-environment jsdom

import { createUserPageSource } from '@webrad/language';
import {
  createProject,
  parseApiClientConfiguration,
  parseDataGridConfiguration,
  type WebRadProject,
} from '@webrad/project-model';
import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuildRequest,
  BuildResponse,
  CreateProjectRequest,
  IdeCommand,
  ProjectSession,
  ReadFileRequest,
  SaveProjectRequest,
  WebRadBridge,
  WriteFileRequest,
} from '../../shared/contracts';
import { applicationIconUrl } from './application-assets';

interface MockCodeEditorProps {
  readonly path: string;
  readonly value: string;
  readonly pageComponents: readonly { readonly name: string; readonly type: string }[];
  readonly navigateTo?: { readonly line: number; readonly column?: number } | null;
  readonly onSourceChange: (resource: string, value: string) => void;
  readonly onMarkersChange: (
    markers: readonly {
      readonly owner: string;
      readonly resource: { toString(): string };
      readonly severity: number;
      readonly code?: string;
      readonly message: string;
      readonly source?: string;
      readonly startLineNumber: number;
      readonly startColumn: number;
      readonly endLineNumber: number;
      readonly endColumn: number;
    }[],
  ) => void;
  readonly onSave: () => void;
}

/** Mirrors the Windows file-URI normalization performed by Monaco's URI implementation. */
function canonicalMonacoResource(resource: string): string {
  const windowsFileUri = /^file:\/\/\/([A-Za-z]):(\/.*)$/.exec(resource);
  if (windowsFileUri === null) return resource;
  return `file:///${windowsFileUri[1]?.toLocaleLowerCase()}%3A${windowsFileUri[2]}`;
}

vi.mock('./components/CodeEditor', () => ({
  CodeEditor: ({
    path,
    value,
    pageComponents,
    navigateTo,
    onSourceChange,
    onMarkersChange,
    onSave,
  }: MockCodeEditorProps) => (
    <div
      data-testid="mock-monaco"
      data-navigation-line={navigateTo?.line}
      data-navigation-column={navigateTo?.column}
    >
      <output data-testid="mock-monaco-page-components">{JSON.stringify(pageComponents)}</output>
      <textarea
        aria-label="Mock Monaco editor"
        value={value}
        onChange={(event) =>
          onSourceChange(canonicalMonacoResource(path), event.currentTarget.value)
        }
      />
      <button type="button" onClick={onSave}>
        Save code
      </button>
      <button
        type="button"
        onClick={() =>
          onMarkersChange([
            {
              owner: 'typescript',
              resource: { toString: () => path },
              severity: 8,
              code: '2322',
              message: 'Type mismatch from the live TypeScript service.',
              source: 'ts',
              startLineNumber: 2,
              startColumn: 3,
              endLineNumber: 2,
              endColumn: 8,
            },
          ])
        }
      >
        Emit editor problem
      </button>
    </div>
  ),
  releaseMonacoWorkspace: vi.fn(),
}));

import { App } from './App';

function cloneSession(session: ProjectSession): ProjectSession {
  return structuredClone(session);
}

function initialSession(): ProjectSession {
  let sequence = 0;
  const project = createProject('MvpProject', {
    idFactory: () => `integration-id-${String((sequence += 1))}`,
  });
  const page = project.pages[0];
  if (page === undefined) throw new Error('The integration project requires PageMain.');
  return {
    rootPath: 'C:\\Projects\\MvpProject',
    projectFilePath: 'C:\\Projects\\MvpProject\\MvpProject.wrproj',
    project,
    userSources: { 'pages/PageMain.ts': createUserPageSource(page) },
  };
}

interface BridgeHarness {
  readonly bridge: WebRadBridge;
  readonly create: ReturnType<typeof vi.fn>;
  readonly open: ReturnType<typeof vi.fn>;
  readonly save: ReturnType<typeof vi.fn>;
  readonly build: ReturnType<typeof vi.fn>;
  readonly compileStyles: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
  readonly setDirty: ReturnType<typeof vi.fn>;
  readonly invokeCommand: (command: IdeCommand) => void;
  readonly persisted: () => ProjectSession;
}

function createBridgeHarness(seed: ProjectSession): BridgeHarness {
  let persisted = cloneSession(seed);
  let commandListener: ((command: IdeCommand) => void) | undefined;

  const create = vi.fn(async (request: CreateProjectRequest): Promise<ProjectSession | null> => {
    void request;
    return cloneSession(persisted);
  });
  const open = vi.fn(async (): Promise<ProjectSession | null> => cloneSession(persisted));
  const save = vi.fn(async (request: SaveProjectRequest): Promise<ProjectSession> => {
    persisted = {
      rootPath: request.rootPath,
      projectFilePath: persisted.projectFilePath,
      project: structuredClone(request.project),
      userSources: { ...request.userSources },
    };
    return cloneSession(persisted);
  });
  const release = vi.fn(async (rootPath: string): Promise<void> => {
    void rootPath;
  });
  const build = vi.fn(async (request: BuildRequest): Promise<BuildResponse> => {
    void request;
    return {
      success: true,
      outputDirectory: 'C:\\Projects\\MvpProject\\dist',
      previewUrl: 'webrad-preview://session/integration/index.html',
      diagnostics: [],
    };
  });
  const compileStyles = vi.fn(async (): Promise<{ readonly css: string }> => ({
    css: '.generated-style { background-color: rgb(37 99 235); }',
  }));
  const setDirty = vi.fn((dirty: boolean): void => {
    void dirty;
  });
  const subscribe = vi.fn((listener: (command: IdeCommand) => void): (() => void) => {
    commandListener = listener;
    return () => {
      if (commandListener === listener) commandListener = undefined;
    };
  });

  const bridge = {
    project: {
      create,
      open,
      save,
      saveAs: async (
        request: Omit<SaveProjectRequest, 'rootPath'>,
      ): Promise<ProjectSession | null> => {
        persisted = {
          ...persisted,
          project: structuredClone(request.project),
          userSources: { ...request.userSources },
        };
        return cloneSession(persisted);
      },
      release,
    },
    files: {
      read: async (request: ReadFileRequest): Promise<string> => {
        void request;
        return '';
      },
      write: async (request: WriteFileRequest): Promise<void> => {
        void request;
      },
    },
    build: { run: build },
    styles: { compile: compileStyles },
    commands: { subscribe },
    lifecycle: { setDirty },
    platform: 'win32',
  } satisfies WebRadBridge;

  return {
    bridge,
    create,
    open,
    save,
    build,
    compileStyles,
    release,
    setDirty,
    invokeCommand: (command) => {
      if (commandListener === undefined)
        throw new Error('The IDE command bridge is not subscribed.');
      commandListener(command);
    },
    persisted: () => cloneSession(persisted),
  };
}

function componentTypes(project: WebRadProject): readonly string[] {
  return project.pages[0]?.components.map((component) => component.type) ?? [];
}

function imageSource(selector: string): string | null {
  return document.querySelector<HTMLImageElement>(selector)?.getAttribute('src') ?? null;
}

function selectDesignerComponent(title: string): HTMLElement {
  const hitTarget = screen.getByTitle(title);
  Object.defineProperty(hitTarget, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  fireEvent.pointerDown(hitTarget, { button: 0, pointerId: 1 });
  fireEvent.pointerUp(hitTarget, { pointerId: 1 });
  return hitTarget;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'webrad');
  document.documentElement.removeAttribute('data-theme');
});

describe('App MVP integration', () => {
  it('creates, designs, generates code, persists, reopens, and runs the browser preview', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<App />);
    expect(screen.getByRole('heading', { name: 'WebRAD' })).toBeDefined();
    expect(screen.getByRole('toolbar', { name: 'Main toolbar' })).toBeDefined();
    expect(document.querySelector('.wr-brand-mark')).toBeNull();
    expect(document.querySelector('.wr-theme-toggle')).toBeNull();
    expect(imageSource('.wr-welcome-mark')).toBe(applicationIconUrl);

    await user.click(screen.getByRole('button', { name: 'New project (Ctrl+N)' }));
    await screen.findByRole('dialog', { name: 'Create a new project' });
    const projectName = screen.getByRole('textbox', { name: 'Project name' });
    await user.clear(projectName);
    await user.type(projectName, 'MvpProject');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.getAllByText('PageMain').length).toBeGreaterThan(0);
    expect(screen.getByTitle('Entry page')).toBeDefined();
    expect(screen.queryByText('Forms')).toBeNull();
    expect(imageSource('.wr-project-icon')).toBe(applicationIconUrl);
    expect(harness.create).toHaveBeenCalledWith({ name: 'MvpProject' });

    await user.dblClick(screen.getByRole('button', { name: 'Label' }));
    await screen.findByTitle('Label1: WebLabel');
    await user.dblClick(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByTitle('Edit1: WebEdit');
    await user.dblClick(screen.getByRole('button', { name: 'Button' }));
    await screen.findByTitle('Button1: WebButton');

    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Button1');
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'BTNMostrar' } });
    await screen.findByTitle('BTNMostrar: WebButton');
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Mostrar' } });
    await waitFor(() => {
      const button = document.querySelector<HTMLElement>('[data-component-type="WebButton"]');
      expect(button?.textContent).toBe('Mostrar');
    });
    const iconPicker = screen.getByRole('button', { name: 'Icon' });
    expect(screen.queryByRole('combobox', { name: 'Icon' })).toBeNull();
    await user.click(iconPicker);
    const iconDialog = await screen.findByRole('dialog', { name: 'Choose an icon' });
    expect(iconDialog.querySelectorAll('.wr-icon-picker-option .wr-icon')).toHaveLength(
      WEBRAD_ICON_NAMES.length,
    );
    await user.click(screen.getByRole('button', { name: 'Select Save icon' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose an icon' })).toBeNull();
      expect(document.activeElement).toBe(iconPicker);
    });
    await waitFor(() => {
      const buttonIcon = document.querySelector<SVGPathElement>(
        '[data-component-type="WebButton"] [data-webrad-button-icon] path',
      );
      expect(buttonIcon?.getAttribute('d')).toContain('M5 3h12');
    });

    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnClick'));
    const editor = (await screen.findByLabelText('Mock Monaco editor')) as HTMLTextAreaElement;
    expect(editor.value).toContain('async BTNMostrarClick(sender: WebButton): Promise<void>');
    const handlerLine =
      editor.value.split('\n').findIndex((line) => line.includes('BTNMostrarClick')) + 1;
    const navigation = screen.getByTestId('mock-monaco');
    expect(Number(navigation.dataset.navigationLine)).toBeGreaterThan(handlerLine);
    expect(Number(navigation.dataset.navigationColumn)).toBeGreaterThan(0);
    fireEvent.change(editor, { target: { value: `${editor.value}\n// integration edit\n` } });

    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.dblClick(screen.getByRole('button', { name: 'API Client' }));
    await screen.findByRole('option', { name: 'ApiClient1, API Client' });
    expect(
      document.querySelector('[data-component-id][title="ApiClient1: WebApiClient"]'),
    ).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByLabelText('OnRequest')).toBeDefined();
    expect(screen.getByLabelText('OnSuccess')).toBeDefined();
    expect(screen.getByLabelText('OnError')).toBeDefined();
    expect(screen.getByLabelText('OnComplete')).toBeDefined();
    await user.dblClick(screen.getByLabelText('OnSuccess'));
    const apiEventEditor = (await screen.findByLabelText(
      'Mock Monaco editor',
    )) as HTMLTextAreaElement;
    expect(apiEventEditor.value).toContain(
      'async ApiClient1Success(sender: WebApiClient, event: CustomEvent<WebApiOperationEventDetail>): Promise<void>',
    );
    await user.click(screen.getByRole('tab', { name: 'Properties' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('ApiClient1');
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ApiClientes' } });
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await screen.findByRole('option', { name: 'ApiClientes, API Client' });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://api.example.test/v1' },
    });
    await user.dblClick(screen.getByRole('button', { name: 'Popup' }));
    await screen.findByRole('option', { name: 'Popup1, Popup' });
    await waitFor(() => {
      expect(
        document.querySelector('[data-component-id][data-component-type="WebPopup"]'),
      ).not.toBeNull();
    });

    await user.click(screen.getByRole('tab', { name: 'Code' }));
    expect(screen.getByTestId('mock-monaco-page-components').textContent).toBe(
      JSON.stringify([
        { name: 'Label1', type: 'WebLabel' },
        { name: 'Edit1', type: 'WebEdit' },
        { name: 'BTNMostrar', type: 'WebButton' },
        { name: 'ApiClientes', type: 'WebApiClient' },
        { name: 'Popup1', type: 'WebPopup' },
      ]),
    );

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    const saved = harness.persisted();
    expect(componentTypes(saved.project)).toEqual([
      'WebPage',
      'WebLabel',
      'WebEdit',
      'WebButton',
      'WebApiClient',
      'WebPopup',
    ]);
    expect(
      saved.project.pages[0]?.components.find((component) => component.name === 'BTNMostrar')?.props
        .icon,
    ).toBe('save');
    expect(
      saved.project.pages[0]?.components.find((component) => component.name === 'ApiClientes')
        ?.props.baseUrl,
    ).toBe('https://api.example.test/v1');
    expect(saved.userSources['pages/PageMain.ts']).toContain('// integration edit');
    expect(
      saved.project.pages[0]?.components.find((component) => component.name === 'BTNMostrar')
        ?.events.OnClick,
    ).toBe('BTNMostrarClick');
    const defaultStyleIdByType = new Map(
      saved.project.styles
        .filter((style) => style.preset === 'default')
        .map((style) => [style.componentType, style.id]),
    );
    expect(
      saved.project.pages[0]?.components.find((component) => component.type === 'WebPage')?.styleId,
    ).toBe(defaultStyleIdByType.get('WebPage'));
    expect(
      saved.project.pages[0]?.components.find((component) => component.type === 'WebLabel')
        ?.styleId,
    ).toBe(defaultStyleIdByType.get('WebLabel'));
    expect(
      saved.project.pages[0]?.components.find((component) => component.type === 'WebEdit')?.styleId,
    ).toBe(defaultStyleIdByType.get('WebEdit'));
    expect(
      saved.project.pages[0]?.components.find((component) => component.type === 'WebButton')
        ?.styleId,
    ).toBe(defaultStyleIdByType.get('WebButton'));
    expect(
      saved.project.pages[0]?.components.find((component) => component.type === 'WebPopup')
        ?.styleId,
    ).toBe(defaultStyleIdByType.get('WebPopup'));

    await act(async () => {
      harness.invokeCommand('file.closeProject');
    });
    await screen.findByRole('heading', { name: 'WebRAD' });
    expect(harness.release).toHaveBeenCalledWith('C:\\Projects\\MvpProject');

    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByTitle('BTNMostrar: WebButton');
    await screen.findByRole('option', { name: 'ApiClientes, API Client' });
    await screen.findByRole('option', { name: 'Popup1, Popup' });
    expect(harness.open).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Build and run (F9)' }));
    const preview = await screen.findByTitle('WebRAD application preview');
    expect(preview.getAttribute('src')).toBe('webrad-preview://session/integration/index.html');
    expect(preview.getAttribute('sandbox')).toBe('allow-forms allow-modals allow-scripts');
    expect(harness.build).toHaveBeenCalledOnce();
    const buildRequest = harness.build.mock.calls[0]?.[0] as BuildRequest | undefined;
    expect(buildRequest?.userSources['pages/PageMain.ts']).toContain('// integration edit');
    expect(componentTypes(buildRequest?.project ?? saved.project)).toEqual([
      'WebPage',
      'WebLabel',
      'WebEdit',
      'WebButton',
      'WebApiClient',
      'WebPopup',
    ]);
    expect(harness.save.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(harness.setDirty).toHaveBeenCalledWith(true);
    expect(harness.setDirty).toHaveBeenLastCalledWith(false);
  }, 15_000);

  it('adds palette controls inside the selected floating Popup container', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.dblClick(screen.getByRole('button', { name: 'Popup' }));
    await screen.findByRole('option', { name: 'Popup1, Popup' });
    await waitFor(() => {
      expect(
        document.querySelector('[data-component-id][data-component-type="WebPopup"]'),
      ).not.toBeNull();
    });

    await user.dblClick(screen.getByRole('button', { name: 'Button' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Button1');
    });
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');

    const page = harness.persisted().project.pages[0];
    const popup = page?.components.find((component) => component.type === 'WebPopup');
    const button = page?.components.find((component) => component.type === 'WebButton');
    if (popup === undefined || button === undefined) {
      throw new Error('Expected the saved Popup and its child Button.');
    }
    expect(button.parentId).toBe(popup.id);
    expect(popup.children).toContain(button.id);
  });

  it('opens the API Client tester from the nonvisual tray and persists its response contract', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          customers: [{ id: 1, displayName: 'Ada' }],
          page: { total: 1 },
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });

    await user.dblClick(screen.getByRole('button', { name: 'API Client' }));
    const apiClient = await screen.findByRole('option', { name: 'ApiClient1, API Client' });
    await user.dblClick(apiClient);

    const dialog = await screen.findByRole('dialog', { name: 'Test API Client' });
    expect(dialog).toBeDefined();
    const tester = within(dialog);
    const baseUrl = tester.getByLabelText('Base URL');
    await user.clear(baseUrl);
    await user.type(baseUrl, 'https://api.example.test/v1');
    await user.type(tester.getByLabelText('Path'), '/customers');
    await user.click(tester.getByRole('button', { name: 'Send test request' }));

    await tester.findByRole('region', { name: 'Response definitions' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/customers',
      expect.objectContaining({ method: 'GET' }),
    );
    await user.selectOptions(tester.getByLabelText('Type for id'), 'string');
    await user.click(tester.getByRole('button', { name: 'Save API Client' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Test API Client' })).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    const persistedApiClient = harness
      .persisted()
      .project.pages[0]?.components.find((component) => component.type === 'WebApiClient');
    if (persistedApiClient === undefined) throw new Error('Expected the persisted API Client.');
    expect(persistedApiClient.props.baseUrl).toBe('https://api.example.test/v1');

    const configuration = parseApiClientConfiguration(persistedApiClient.props.apiClientConfig);
    expect(configuration.operations).toHaveLength(1);
    expect(configuration.operations[0]).toMatchObject({
      name: 'Request',
      method: 'GET',
      path: '/customers',
    });
    const responseSchema = configuration.operations[0]?.responseSchema;
    expect(responseSchema).not.toBeNull();
    const customers = responseSchema?.root.children.find((node) => node.name === 'customers');
    expect(customers).toMatchObject({ kind: 'list', path: '/customers' });
    expect(customers?.children.find((node) => node.name === 'id')).toMatchObject({
      fieldType: 'string',
      path: '/customers/*/id',
    });
    expect(JSON.stringify(configuration)).not.toContain('Ada');
  }, 15_000);

  it('opens the dedicated Data Grid editor and persists mixed column and row sizing', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });

    await user.dblClick(screen.getByRole('button', { name: 'Data Grid' }));
    await screen.findByTitle('DataGrid1: WebDataGrid');
    const configure = screen.getByRole('button', { name: 'Configure Data Grid' });
    await user.click(configure);

    const dialog = await screen.findByRole('dialog', { name: 'Configure Data Grid' });
    const editor = within(dialog);
    await user.selectOptions(editor.getByLabelText('Width mode for Data Grid column 1'), 'fixed');
    const fixedWidth = editor.getByLabelText('Fixed width for Data Grid column 1');
    await user.clear(fixedWidth);
    await user.type(fixedWidth, '240');
    await user.selectOptions(editor.getByLabelText('Data Grid row height mode'), 'fixed');
    const fixedHeight = editor.getByLabelText('Fixed Data Grid row height');
    await user.clear(fixedHeight);
    await user.type(fixedHeight, '52');
    await user.click(editor.getByRole('button', { name: 'Save Data Grid' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Configure Data Grid' })).toBeNull();
      expect(document.activeElement).toBe(configure);
    });

    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnCellClick'));
    const gridEventEditor = (await screen.findByLabelText(
      'Mock Monaco editor',
    )) as HTMLTextAreaElement;
    expect(gridEventEditor.value).toContain(
      'async DataGrid1CellClick(sender: WebDataGrid, event: CustomEvent<WebDataGridCellEventDetail>): Promise<void>',
    );
    expect(gridEventEditor.value).toContain(
      'const { column, rowIndex, columnIndex, value, getValue } = event.detail;',
    );

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    const dataGrid = harness
      .persisted()
      .project.pages[0]?.components.find((component) => component.type === 'WebDataGrid');
    if (dataGrid === undefined) throw new Error('Expected the persisted Data Grid.');
    expect(dataGrid.events.OnCellClick).toBe('DataGrid1CellClick');
    expect(parseDataGridConfiguration(dataGrid.props.dataGridConfig)).toMatchObject({
      schemaVersion: 2,
      rowHeightMode: 'fixed',
      fixedRowHeight: 52,
      columns: expect.arrayContaining([
        expect.objectContaining({ widthMode: 'fixed', width: 240 }),
      ]),
    });
  });

  it('keeps theme switching in the Tools command without rendering a toolbar button', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });

    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.queryByRole('button', { name: /Switch to .* theme/ })).toBeNull();

    act(() => {
      harness.invokeCommand('view.toggleTheme');
    });
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
  });

  it('creates, reuses, filters, persists, previews, and removes component styles', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByRole('button', { name: 'Collapse Pages' }));
    expect(screen.queryByRole('treeitem', { name: /PageMain/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Expand Pages' }));
    expect(await screen.findByRole('treeitem', { name: /PageMain/ })).toBeDefined();
    await user.dblClick(screen.getByTitle('Select Button; drag or double-click to insert'));
    await screen.findByTitle('Button1: WebButton');
    await user.dblClick(screen.getByTitle('Select Button; drag or double-click to insert'));
    await screen.findByTitle('Button2: WebButton');
    await user.dblClick(screen.getByTitle('Select Label; drag or double-click to insert'));
    await screen.findByTitle('Label1: WebLabel');

    const stylesItem = screen.getByRole('treeitem', { name: 'Styles' });
    await user.click(stylesItem);
    expect(stylesItem.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('region', { name: 'Styles editor' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Style library' })).toBeDefined();
    expect(screen.getByRole('tree', { name: 'MvpProject project tools' })).toBeDefined();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Design' })).toBeNull();

    await user.click(screen.getAllByRole('button', { name: 'New style' })[0]!);
    await user.selectOptions(screen.getByLabelText('Component type'), 'WebButton');
    const createName = screen.getByLabelText('New style name');
    await user.clear(createName);
    await user.type(createName, 'Primary Button Draft');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const openCategory = async (name: string): Promise<void> => {
      const category = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      const expandedCategories = screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-expanded') === 'true');
      if (category.getAttribute('aria-expanded') !== 'true' || expandedCategories.length > 1) {
        await user.click(category);
      }
    };
    const configure = async (label: string): Promise<void> => {
      await user.click(screen.getByLabelText(`Configure ${label}`));
    };

    expect(document.querySelector('textarea')).toBeNull();
    await openCategory('Colors');
    await configure('Background color');
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#2563eb' },
    });
    await configure('Text color');
    fireEvent.change(screen.getByLabelText('Text color'), {
      target: { value: '#ffffff' },
    });
    await openCategory('Border');
    await configure('Border radius');
    fireEvent.change(screen.getByLabelText('Border radius value'), {
      target: { value: '8' },
    });
    await openCategory('Animation');
    await configure('Transition property');
    await configure('Transition duration');
    await configure('Transition easing');

    await user.click(screen.getByRole('tab', { name: 'Hover' }));
    await openCategory('Colors');
    await configure('Background color');
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#1d4ed8' },
    });
    await openCategory('Transform');
    await configure('Scale');
    fireEvent.change(screen.getByLabelText('Scale'), { target: { value: '105' } });
    const buttonPreview = document.querySelector<HTMLElement>(
      '[data-style-preview] [data-component-type="WebButton"]',
    );
    expect(buttonPreview?.classList.contains('bg-[#1d4ed8]')).toBe(true);
    expect(buttonPreview?.classList.contains('scale-[1.05]')).toBe(true);
    expect(buttonPreview?.classList.contains('transition-all')).toBe(true);
    const styleName = screen.getByLabelText('Style name');
    await user.clear(styleName);
    await user.type(styleName, 'Primary Button');
    fireEvent.blur(styleName);
    await screen.findByRole('option', { name: /Primary Button/ });

    await user.click(screen.getByRole('button', { name: 'New style' }));
    await user.selectOptions(screen.getByLabelText('Component type'), 'WebLabel');
    await user.clear(screen.getByLabelText('New style name'));
    await user.type(screen.getByLabelText('New style name'), 'Muted Label');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await openCategory('Colors');
    await configure('Text color');
    fireEvent.change(screen.getByLabelText('Text color'), {
      target: { value: '#64748b' },
    });
    await openCategory('Typography');
    await configure('Font size');
    fireEvent.change(screen.getByLabelText('Font size value'), { target: { value: '14' } });

    await user.click(screen.getByRole('button', { name: 'New style' }));
    await user.selectOptions(screen.getByLabelText('Component type'), 'WebPage');
    await user.clear(screen.getByLabelText('New style name'));
    await user.type(screen.getByLabelText('New style name'), 'Page Surface');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await openCategory('Colors');
    await configure('Background color');
    fireEvent.change(screen.getByLabelText('Background color'), {
      target: { value: '#f1f5f9' },
    });
    await configure('Text color');
    fireEvent.change(screen.getByLabelText('Text color'), {
      target: { value: '#0f172a' },
    });

    await waitFor(() => expect(harness.compileStyles).toHaveBeenCalled());
    expect(document.querySelector('style[data-webrad-project-styles]')?.textContent).toContain(
      'background-color',
    );

    await user.click(screen.getByRole('treeitem', { name: /PageMain/ }));
    await screen.findByRole('tab', { name: 'Design' });
    const pageStyleSelect = (await screen.findByLabelText('Style')) as HTMLSelectElement;
    expect([...pageStyleSelect.options].map((option) => option.text)).toEqual([
      'None',
      'Default Page',
      'Page Surface',
    ]);
    await user.selectOptions(pageStyleSelect, screen.getByRole('option', { name: 'Page Surface' }));
    await waitFor(() => {
      expect(
        document
          .querySelector('[data-component-type="WebPage"]')
          ?.classList.contains('bg-[#f1f5f9]'),
      ).toBe(true);
    });
    const firstButtonHit = selectDesignerComponent('Button1: WebButton');
    const buttonStyleSelect = (await screen.findByLabelText('Style')) as HTMLSelectElement;
    expect([...buttonStyleSelect.options].map((option) => option.text)).toEqual([
      'None',
      'Default Button',
      'Primary Button',
    ]);
    await user.selectOptions(
      buttonStyleSelect,
      screen.getByRole('option', { name: 'Primary Button' }),
    );
    const firstButtonId = firstButtonHit.getAttribute('data-component-id');
    expect(firstButtonId).not.toBeNull();
    await waitFor(() => {
      expect(
        document
          .querySelector(
            `[data-component-type="WebButton"][data-component-id="${firstButtonId ?? ''}"]`,
          )
          ?.classList.contains('hover:bg-[#1d4ed8]'),
      ).toBe(true);
    });

    selectDesignerComponent('Button2: WebButton');
    await user.selectOptions(
      screen.getByLabelText('Style'),
      screen.getByRole('option', { name: 'Primary Button' }),
    );
    selectDesignerComponent('Label1: WebLabel');
    const labelStyleSelect = screen.getByLabelText('Style') as HTMLSelectElement;
    expect([...labelStyleSelect.options].map((option) => option.text)).toEqual([
      'None',
      'Default Label',
      'Muted Label',
    ]);
    expect([...labelStyleSelect.options].some((option) => option.text === 'Primary Button')).toBe(
      false,
    );
    await user.selectOptions(labelStyleSelect, screen.getByRole('option', { name: 'Muted Label' }));

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    const savedWithStyles = harness.persisted().project;
    expect(savedWithStyles.styles).toHaveLength(15);
    const primaryStyle = savedWithStyles.styles.find((style) => style.name === 'Primary Button');
    const mutedStyle = savedWithStyles.styles.find((style) => style.name === 'Muted Label');
    const pageStyle = savedWithStyles.styles.find((style) => style.name === 'Page Surface');
    expect(primaryStyle?.states).toMatchObject({
      base: {
        backgroundColor: '#2563eb',
        textColor: '#ffffff',
        borderRadius: { value: 8, unit: 'px' },
        transitionProperty: 'all',
        transitionDuration: 200,
        transitionTimingFunction: 'easeOut',
      },
      hover: { backgroundColor: '#1d4ed8', scale: 105 },
    });
    expect(
      savedWithStyles.pages[0]?.components
        .filter((component) => component.type === 'WebButton')
        .map((component) => component.styleId),
    ).toEqual([primaryStyle?.id, primaryStyle?.id]);
    expect(
      savedWithStyles.pages[0]?.components.find((component) => component.type === 'WebLabel')
        ?.styleId,
    ).toBe(mutedStyle?.id);
    expect(
      savedWithStyles.pages[0]?.components.find((component) => component.type === 'WebPage')
        ?.styleId,
    ).toBe(pageStyle?.id);

    await user.click(stylesItem);
    await screen.findByRole('region', { name: 'Styles editor' });
    await user.click(screen.getByRole('option', { name: /Primary Button/ }));
    await user.click(screen.getByRole('button', { name: 'Delete Primary Button' }));
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() => {
      const styles = harness.persisted().project.styles;
      expect(styles).toHaveLength(14);
      expect(styles.filter((style) => style.preset === 'default')).toHaveLength(12);
      expect(styles.some((style) => style.name === 'Primary Button')).toBe(false);
      expect(styles.some((style) => style.name === 'Muted Label')).toBe(true);
      expect(styles.some((style) => style.name === 'Page Surface')).toBe(true);
    });

    const savedAfterDelete = harness.persisted().project;
    expect(savedAfterDelete.styles).toHaveLength(14);
    expect(savedAfterDelete.styles.filter((style) => style.preset === 'default')).toHaveLength(12);
    expect(
      savedAfterDelete.pages[0]?.components
        .filter((component) => component.type === 'WebButton')
        .every((component) => component.styleId === undefined),
    ).toBe(true);
    expect(
      savedAfterDelete.pages[0]?.components.find((component) => component.type === 'WebLabel')
        ?.styleId,
    ).toBe(mutedStyle?.id);
  }, 25_000);

  it('creates additional pages with the Page naming contract', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await act(async () => {
      harness.invokeCommand('project.addPage');
    });

    const dialog = await screen.findByRole('dialog', { name: 'Add page' });
    const pageName = within(dialog).getByRole('textbox', { name: 'Page name' });
    expect((pageName as HTMLInputElement).value).toBe('Page2');
    await user.click(within(dialog).getByRole('button', { name: 'Add page' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add page' })).toBeNull();
    });

    expect((await screen.findAllByText('Page2')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    expect(harness.persisted().project.pages.map((page) => page.name)).toEqual([
      'PageMain',
      'Page2',
    ]);
    expect(harness.persisted().userSources['pages/Page2.ts']).toContain(
      'export class Page2 extends Page2Generated',
    );
  });

  it('saves general project settings from the Project panel while keeping future sections available', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByTitle('Open Project Settings'));

    const dialog = await screen.findByRole('dialog', { name: 'Settings for MvpProject' });
    expect(within(dialog).getByRole('tab', { name: 'Environment variables' })).toBeDefined();
    expect(within(dialog).getByRole('tab', { name: 'Authentication and JWT' })).toBeDefined();
    await user.click(within(dialog).getByRole('tab', { name: 'CORS and origins' }));
    expect(within(dialog).getByRole('heading', { name: 'CORS and trusted origins' })).toBeDefined();
    await user.click(within(dialog).getByRole('tab', { name: 'General' }));
    const applicationName = within(dialog).getByRole('textbox', { name: /^Application name/ });
    await user.clear(applicationName);
    await user.type(applicationName, 'Mvp Portal');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Settings for MvpProject' })).toBeNull();
    });

    await user.click(screen.getByTitle('Open Project Settings'));
    const reopenedDialog = await screen.findByRole('dialog', {
      name: 'Settings for MvpProject',
    });
    expect(
      (
        within(reopenedDialog).getByRole('textbox', {
          name: /^Application name/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Mvp Portal');
    await user.click(within(reopenedDialog).getByRole('button', { name: 'Cancel' }));
  });

  it('creates a reusable definition and inserts its page-owned instance', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await act(async () => {
      harness.invokeCommand('project.addReusableElement');
    });

    const dialog = await screen.findByRole('dialog', { name: 'Add reusable component' });
    const name = within(dialog).getByRole('textbox', { name: 'Reusable component name' });
    await user.clear(name);
    await user.type(name, 'CustomerCard');
    await user.click(within(dialog).getByRole('button', { name: 'Add reusable component' }));
    const projectTree = screen.getByRole('tree', { name: 'MvpProject project' });
    await within(projectTree).findByRole('treeitem', { name: 'CustomerCard', selected: true });
    const openDocuments = screen.getByRole('tablist', { name: 'Open documents' });
    expect(
      within(openDocuments).getByRole('tab', { name: /CustomerCard/, selected: true }),
    ).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Code' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Preview' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Design' })).toBeDefined();

    await user.dblClick(screen.getByRole('button', { name: 'Button' }));
    await screen.findByTitle('Button1: WebButton');
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnClick'));
    const reusableEditor = (await screen.findByLabelText(
      'Mock Monaco editor',
    )) as HTMLTextAreaElement;
    expect(reusableEditor.value).toContain('async Button1Click(sender: WebButton): Promise<void>');
    await user.click(screen.getByRole('tab', { name: 'Design' }));

    await user.click(screen.getByRole('treeitem', { name: /PageMain/ }));
    await screen.findByRole('tab', { name: 'Code' });
    const reusableTreeItem = within(projectTree).getByRole('treeitem', { name: 'CustomerCard' });
    const dragData = new Map<string, string>();
    const dragStartEvent = new MouseEvent('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: {
        effectAllowed: '',
        setData: (type: string, value: string) => dragData.set(type, value),
      },
    });
    fireEvent(reusableTreeItem, dragStartEvent);
    const overlay = document.querySelector<HTMLElement>('.wr-design-overlay');
    if (overlay === null) throw new Error('Expected Designer overlay.');
    const dropEvent = new MouseEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 20,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: (type: string) => dragData.get(type) ?? '' },
    });
    fireEvent(overlay, dropEvent);
    await screen.findByTitle('Reusable1: WebReusableElement');
    selectDesignerComponent('Reusable1: WebReusableElement');
    await user.click(screen.getByRole('tab', { name: 'Properties' }));
    await user.selectOptions(screen.getByLabelText('Responsive width'), 'stretch');
    await user.selectOptions(screen.getByLabelText('Responsive height'), 'fit-content');

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    const saved = harness.persisted().project;
    const reusable = saved.reusableElements[0];
    expect(reusable).toMatchObject({ name: 'CustomerCard' });
    expect(
      saved.pages[0]?.components.find((component) => component.type === 'WebReusableElement')
        ?.props,
    ).toMatchObject({ reusableElementId: reusable?.id, placement: 'in-flow' });
    expect(
      saved.pages[0]?.components.find((component) => component.type === 'WebReusableElement')
        ?.layout.item,
    ).toMatchObject({ width: 'stretch', height: 'fit-content' });
    expect(
      saved.reusableElements[0]?.components.find((component) => component.name === 'Button1')
        ?.events,
    ).toMatchObject({ OnClick: 'Button1Click' });
    expect(harness.persisted().userSources['reusables/CustomerCard.ts']).toContain(
      'async Button1Click(sender: WebButton): Promise<void>',
    );
  });

  it('preserves the latest Monaco buffer after focus leaves the editor and Design-Code remounts it', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByRole('tab', { name: 'Code' }));

    const editor = (await screen.findByLabelText('Mock Monaco editor')) as HTMLTextAreaElement;
    const editedSource = `${editor.value}\n// must survive focus and view changes\n`;
    fireEvent.change(editor, { target: { value: editedSource } });
    fireEvent.blur(editor);

    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.click(screen.getByRole('tab', { name: 'Code' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Mock Monaco editor') as HTMLTextAreaElement).value).toBe(
        editedSource,
      );
    });
    expect(harness.setDirty).toHaveBeenCalledWith(true);
  });

  it('saves the current Monaco buffer instead of restoring the previously persisted source', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByRole('tab', { name: 'Code' }));

    const editor = (await screen.findByLabelText('Mock Monaco editor')) as HTMLTextAreaElement;
    const editedSource = `${editor.value}\n// save this exact Monaco buffer\n`;
    fireEvent.change(editor, { target: { value: editedSource } });
    await user.click(screen.getByRole('button', { name: 'Save code' }));
    await screen.findByText('Saved MvpProject.');

    const saveRequest = harness.save.mock.calls.at(-1)?.[0] as SaveProjectRequest | undefined;
    expect(saveRequest?.userSources['pages/PageMain.ts']).toBe(editedSource);
    expect(harness.persisted().userSources['pages/PageMain.ts']).toBe(editedSource);
    expect((screen.getByLabelText('Mock Monaco editor') as HTMLTextAreaElement).value).toBe(
      editedSource,
    );
  });

  it('opens New Project from the File menu command and supports validation and cancel', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await act(async () => harness.invokeCommand('file.newProject'));

    await screen.findByRole('dialog', { name: 'Create a new project' });
    expect(
      screen.getByText(/make a folder with that name inside the selected location/i).textContent,
    ).toContain('folder with');
    await act(async () => harness.invokeCommand('file.openProject'));
    expect(harness.open).not.toHaveBeenCalled();

    const projectName = screen.getByRole('textbox', { name: 'Project name' });
    await user.clear(projectName);
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByRole('alert').textContent).toContain('cannot be empty');
    expect(harness.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Create a new project' })).toBeNull();
  });

  it('keeps the dialog ready for retry when the native folder picker is canceled', async () => {
    const harness = createBridgeHarness(initialSession());
    harness.create.mockResolvedValueOnce(null);
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await act(async () => harness.invokeCommand('file.newProject'));
    const projectName = await screen.findByRole('textbox', { name: 'Project name' });
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(harness.create).toHaveBeenCalledWith({ name: 'Project1' }));
    await waitFor(() => expect(document.activeElement).toBe(projectName));
    expect((projectName as HTMLInputElement).disabled).toBe(false);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Create a new project' })).toBeNull();
  });

  it('projects live TypeScript markers into Problems and navigates to their range', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByRole('tab', { name: 'Code' }));
    await user.click(await screen.findByRole('button', { name: 'Emit editor problem' }));

    const problemsTab = await screen.findByRole('tab', {
      name: /Problems, 1 error, 0 warnings/i,
    });
    await user.click(problemsTab);
    const problem = await screen.findByRole('button', {
      name: /Type mismatch from the live TypeScript service/i,
    });
    await user.click(problem);

    await waitFor(() => {
      expect(screen.getByTestId('mock-monaco').getAttribute('data-navigation-line')).toBe('2');
    });
    expect(
      screen.getByRole('button', { name: /Show Problems, 1 error, 0 warnings/i }),
    ).toBeDefined();
  });

  it('keeps build diagnostics authoritative and opens their source location', async () => {
    const harness = createBridgeHarness(initialSession());
    harness.build.mockResolvedValueOnce({
      success: false,
      diagnostics: [
        {
          category: 'error',
          source: 'typescript',
          code: 2322,
          message: "Type 'string' is not assignable to type 'number'.",
          file: 'pages/PageMain.ts',
          line: 3,
          column: 7,
          length: 6,
        },
      ],
    });
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByRole('button', { name: 'Build and run (F9)' }));

    const diagnostic = await screen.findByRole('button', {
      name: /Type 'string' is not assignable to type 'number'/i,
    });
    await user.click(diagnostic);
    const editor = await screen.findByTestId('mock-monaco');
    await waitFor(() => expect(editor.getAttribute('data-navigation-line')).toBe('3'));
    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
  });
});
