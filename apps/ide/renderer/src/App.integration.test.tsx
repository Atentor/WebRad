// @vitest-environment jsdom

import { createUpdateTestBridge } from '../../shared/update-test-bridge';
import { createUserPageSource } from '@webrad/language';
import { componentRegistry } from '@webrad/component-registry';
import { StrictMode } from 'react';
import {
  createProject,
  createPage,
  createReusableElement,
  addComponent,
  updatePage,
  createDefaultRepeatingGroupConfiguration,
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
  DeployProgress,
  DeployResponse,
  IdeCommand,
  ProjectSession,
  ReadFileRequest,
  SaveProjectRequest,
  WebRadBridge,
  WriteFileRequest,
} from '../../shared/contracts';
import { applicationIconUrl } from './application-assets';
import { comboBoxBinding, comboBoxProject } from '../../../../tests/fixtures/combo-box';
import { reportBuilderProject } from '../../../../tests/fixtures/report-builder';
import { createDebugTestBridge } from '../../shared/debugger-test-bridge';
import type { DebugEvent } from '../../shared/debugger-contracts';

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
      className="monaco-editor"
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

function repeatingGroupSession(): ProjectSession {
  const project = comboBoxProject();
  let page = project.pages[0];
  if (page === undefined) throw new Error('Missing repeating project page.');
  const group = componentRegistry.createComponent('WebRepeatingGroup', {
    id: 'repeating-group',
    name: 'RepeatingGroup1',
    parentId: page.rootComponentId,
    props: {
      repeatingGroupConfig: {
        ...createDefaultRepeatingGroupConfiguration(),
        apiClientId: 'customers-api',
        operationId: 'load-customers',
        listPath: '/customers',
      },
    },
  });
  page = addComponent(page, group, page.rootComponentId);
  page = addComponent(
    page,
    componentRegistry.createComponent('WebButton', {
      id: 'row-button',
      name: 'RowButton',
      parentId: group.id,
      props: { currentRowBindings: [{ property: 'caption', fieldPath: '/name' }] },
    }),
    group.id,
  );
  return {
    ...initialSession(),
    project: updatePage(project, page.id, { components: page.components }),
    userSources: { [`pages/${page.name}.ts`]: createUserPageSource(page) },
  };
}

interface BridgeHarness {
  readonly bridge: WebRadBridge;
  readonly create: ReturnType<typeof vi.fn>;
  readonly open: ReturnType<typeof vi.fn>;
  readonly restore: ReturnType<typeof vi.fn>;
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
  const restore = vi.fn(async (): Promise<ProjectSession | null> => null);
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
      previewUrl: 'http://127.0.0.1:49152/integration/index.html',
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
    updates: createUpdateTestBridge(),
    debugger: createDebugTestBridge(),
    restgoDevelopment: {
      status: vi.fn(async (request) => ({
        baseUrl: request.baseUrl,
        connected: false,
        storage: 'none' as const,
        encryptionAvailable: false,
        email: null,
      })),
      login: vi.fn(),
      logout: vi.fn(),
      token: vi.fn(),
    },
    restgoAdmin: {
      status: vi.fn(async (request) => ({
        baseUrl: request.baseUrl,
        connected: false,
        storage: 'none' as const,
        encryptionAvailable: false,
      })),
      connect: vi.fn(),
      disconnect: vi.fn(),
      catalog: vi.fn(async () => ({ endpoints: [], bancos: [], publications: [], operations: [] })),
      getEndpoint: vi.fn(),
      saveEndpoint: vi.fn(),
      setEndpointActive: vi.fn(),
      savePublication: vi.fn(),
      setPublicationActive: vi.fn(),
    },
    project: {
      importAsset: vi.fn<WebRadBridge['project']['importAsset']>(async () => null),
      create,
      open,
      restore,
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
    deploy: {
      chooseDirectory: vi.fn(async () => 'C:\\Hosting\\MvpProject'),
      run: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    },
    styles: { compile: compileStyles },
    commands: { subscribe },
    lifecycle: { setDirty },
    links: { open: vi.fn().mockResolvedValue(undefined) },
    platform: 'win32',
  } satisfies WebRadBridge;

  return {
    bridge,
    create,
    open,
    restore,
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

async function ensureOutputVisible(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const toggle = screen.getByRole('button', { name: 'Toggle output' });
  if (toggle.getAttribute('aria-pressed') !== 'true') await user.click(toggle);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'webrad');
  document.documentElement.removeAttribute('data-theme');
});

describe('App MVP integration', () => {
  it.each(['page', 'reusable', 'model', 'unit', 'asset'] as const)(
    'deletes a selected %s from the Explorer only after confirmation and persists the removal',
    async (kind) => {
      const session = initialSession();
      const page = createPage('PageOther');
      const reusable = createReusableElement('Card');
      const sourceFiles = [
        { id: 'delete-model', name: 'Customer', kind: 'model' as const },
        { id: 'delete-unit', name: 'Helpers', kind: 'unit' as const },
      ];
      const asset = {
        id: 'delete-asset',
        fileName: 'logo.png',
        mediaType: 'image/png',
        base64: 'AP8B',
      };
      session.project = {
        ...session.project,
        pages: [...session.project.pages, page],
        reusableElements: [reusable],
        sourceFiles,
        assets: [asset],
      };
      session.userSources = {
        ...session.userSources,
        'models/Customer.ts': 'export class Customer {}',
        'units/Helpers.ts': 'export const value = 1;',
      };
      const name = {
        page: 'PageOther',
        reusable: 'Card',
        model: 'Customer',
        unit: 'Helpers',
        asset: 'logo.png',
      }[kind];
      const path = {
        page: 'pages/PageOther.ts',
        reusable: 'reusables/Card.ts',
        model: 'models/Customer.ts',
        unit: 'units/Helpers.ts',
        asset: '',
      }[kind];
      const harness = createBridgeHarness(session);
      Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
      await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
      await user.click(screen.getByRole('treeitem', { name }));
      const trash = screen.getByRole('button', { name: 'Delete selected project item' });
      expect(trash.getAttribute('title')).toBe(`Delete ${name}`);
      await user.click(trash);
      expect(confirm).toHaveBeenCalledOnce();
      expect(confirm.mock.calls[0]?.[0]).toContain(name);
      expect(screen.getByRole('treeitem', { name, selected: true })).toBeDefined();
      confirm.mockReturnValue(true);
      // Resources support the same confirmation from the Delete key.
      if (kind === 'unit')
        fireEvent.keyDown(screen.getByRole('treeitem', { name }), { key: 'Delete' });
      else await user.click(trash);
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('treeitem', { name })).toBeNull();
      expect(screen.queryByRole('tab', { name: new RegExp(name) })).toBeNull();
      expect(document.querySelector('.wr-page-surface')).not.toBeNull();
      await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
      await waitFor(() => expect(harness.save).toHaveBeenCalledOnce());
      const saved = harness.persisted();
      const names = [
        ...saved.project.pages.map((item) => item.name),
        ...saved.project.reusableElements.map((item) => item.name),
        ...(saved.project.sourceFiles ?? []).map((item) => item.name),
        ...(saved.project.assets ?? []).map((item) => item.fileName),
      ];
      expect(names).not.toContain(name);
      if (path) expect(saved.userSources[path]).toBeUndefined();
      await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
      await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
      expect(screen.queryByRole('treeitem', { name })).toBeNull();
      expect(
        (screen.getByRole('button', { name: 'Delete selected project item' }) as HTMLButtonElement)
          .disabled,
      ).toBe(kind === 'page');
    },
  );

  it('disables the Explorer trash without a project and for the last page', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    expect(
      (screen.getByRole('button', { name: 'Delete selected project item' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    const trash = screen.getByRole('button', { name: 'Delete selected project item' });
    expect((trash as HTMLButtonElement).disabled).toBe(true);
    expect(trash.getAttribute('title')).toContain('at least one page');
    await user.click(trash);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('configures Deploy first and reports correlated file progress without running on settings save', async () => {
    const harness = createBridgeHarness(initialSession());
    let listener: ((progress: DeployProgress) => void) | undefined;
    let finish: ((response: DeployResponse) => void) | undefined;
    harness.bridge.deploy.subscribe = (callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    };
    const runDeploy = vi.fn<WebRadBridge['deploy']['run']>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    harness.bridge.deploy.run = runDeploy;
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    act(() => harness.invokeCommand('project.deploy'));
    const settings = await screen.findByRole('dialog', { name: 'Settings for MvpProject' });
    expect(
      within(settings)
        .getByRole('tab', { name: 'Build and publishing' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    await user.click(within(settings).getByRole('button', { name: 'Choose folder' }));
    await user.click(within(settings).getByRole('tab', { name: 'PWA and metadata' }));
    await user.click(within(settings).getByLabelText('Enable PWA installation'));
    await user.click(within(settings).getByRole('button', { name: 'Save changes' }));
    expect(runDeploy).not.toHaveBeenCalled();
    act(() => harness.invokeCommand('project.deploy'));
    await waitFor(() => expect(runDeploy).toHaveBeenCalledOnce());
    const request = runDeploy.mock.calls[0]![0];
    expect(request.project.settings.build).toMatchObject({
      deployDirectory: 'C:\\Hosting\\MvpProject',
      environment: 'production',
    });
    expect(request.project.settings.pwa.enabled).toBe(true);
    const progress = screen.getByRole('progressbar', { name: 'Deploy progress' });
    expect(progress.getAttribute('value')).toBeNull();
    act(() =>
      listener?.({
        requestId: 'other-request',
        phase: 'writing',
        completedFiles: 8,
        totalFiles: 8,
      }),
    );
    expect(progress.getAttribute('value')).toBeNull();
    act(() =>
      listener?.({
        requestId: request.requestId,
        phase: 'writing',
        completedFiles: 2,
        totalFiles: 8,
        currentFile: 'pages/PageMain.js',
      }),
    );
    expect(progress.getAttribute('value')).toBe('2');
    expect(progress.getAttribute('max')).toBe('8');
    expect(screen.getByText('2 of 8 files')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Deploying…' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      finish?.({
        success: true,
        outputDirectory: 'C:\\Hosting\\MvpProject',
        diagnostics: [],
        fileCount: 8,
      });
    });
    expect(await screen.findByText('Your application is ready for hosting.')).toBeDefined();
    expect(screen.getByText('8 of 8 files')).toBeDefined();
    expect(harness.build).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Deploy' })).toBeNull();
  });
  it('inserts palette and dropped children inside a fixed Repeating Group row', async () => {
    const session = repeatingGroupSession();
    const page = session.project.pages[0];
    if (page === undefined) throw new Error('Missing repeating fixture page.');
    const project = updatePage(session.project, page.id, {
      components: page.components.map((component) =>
        component.id === 'repeating-group'
          ? {
              ...component,
              props: {
                ...component.props,
                repeatingGroupConfig: {
                  ...createDefaultRepeatingGroupConfiguration(),
                  rowHeightMode: 'fixed',
                  fixedRowHeight: 120,
                },
              },
            }
          : component,
      ),
    });
    const harness = createBridgeHarness({ ...session, project });
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByTitle('RepeatingGroup1: WebRepeatingGroup');
    selectDesignerComponent('RepeatingGroup1: WebRepeatingGroup');
    await user.dblClick(screen.getByTitle('Select Button; drag or double-click to insert'));
    await screen.findByTitle('Button1: WebButton');
    selectDesignerComponent('RepeatingGroup1: WebRepeatingGroup');
    const overlay = document.querySelector<HTMLElement>('.wr-design-overlay');
    if (overlay === null) throw new Error('Missing Designer overlay.');
    const drop = new MouseEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 250,
    });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        getData: (type: string) => (type === 'application/x-webrad-component' ? 'WebButton' : ''),
      },
    });
    fireEvent(overlay, drop);
    await screen.findByTitle('Button2: WebButton');
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledOnce());
    const components = harness.persisted().project.pages[0]?.components;
    expect(components?.find((component) => component.name === 'Button1')).toMatchObject({
      parentId: 'repeating-group',
      bounds: { x: 160, y: 40, width: 100, height: 36 },
    });
    expect(components?.find((component) => component.name === 'Button2')).toMatchObject({
      parentId: 'repeating-group',
      bounds: { x: 304, y: 84, width: 100, height: 36 },
    });
  }, 15_000);

  it('opens Report Builder from the nonvisual tray and commits or cancels its complete template through project history', async () => {
    const project = reportBuilderProject('https://example.test');
    const page = project.pages[0]!;
    const original = page.components.find((component) => component.id === 'report')!.props
      .reportTemplate;
    const harness = createBridgeHarness({
      ...initialSession(),
      project,
      userSources: { [`pages/${page.name}.ts`]: createUserPageSource(page) },
    });
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    const trayItem = await screen.findByRole('option', { name: 'ReportBuilder1, Report Builder' });
    fireEvent.doubleClick(trayItem);
    const editor = within(await screen.findByRole('dialog', { name: 'Report template' }));
    await user.clear(editor.getByLabelText('Report template name'));
    await user.type(editor.getByLabelText('Report template name'), 'Canceled report');
    await act(async () => harness.invokeCommand('file.save'));
    expect(harness.save).not.toHaveBeenCalled();
    await user.click(editor.getByRole('button', { name: 'Cancel' }));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(1));
    const savedTemplate = () =>
      harness
        .persisted()
        .project.pages[0]?.components.find((component) => component.id === 'report')?.props
        .reportTemplate;
    expect(savedTemplate()).toEqual(original);

    fireEvent.doubleClick(trayItem);
    const reopened = within(await screen.findByRole('dialog', { name: 'Report template' }));
    expect(reopened.getByLabelText('Report template name')).toHaveProperty('value', 'Clientes');
    await user.clear(reopened.getByLabelText('Report template name'));
    await user.type(reopened.getByLabelText('Report template name'), 'Quarterly customers');
    await user.click(reopened.getByRole('tab', { name: 'Parameters (1)' }));
    await user.clear(reopened.getByLabelText('Parameter 1 default'));
    await user.type(reopened.getByLabelText('Parameter 1 default'), 'Quarterly report');
    await user.click(reopened.getByRole('button', { name: 'Save template' }));
    expect(screen.queryByRole('dialog', { name: 'Report template' })).toBeNull();
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(2));
    const edited = savedTemplate();
    expect(edited).toMatchObject({
      name: 'Quarterly customers',
      parameters: [{ name: 'Title', type: 'string', defaultValue: 'Quarterly report' }],
    });
    await act(async () => harness.invokeCommand('edit.undo'));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(3));
    expect(savedTemplate()).toEqual(original);
    await act(async () => harness.invokeCommand('edit.redo'));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(4));
    expect(savedTemplate()).toEqual(edited);
    fireEvent.doubleClick(trayItem);
    expect(await screen.findByLabelText('Report template name')).toHaveProperty(
      'value',
      'Quarterly customers',
    );
    await user.keyboard('{Escape}');
  }, 15_000);

  it('persists Repeating Group and row bindings with atomic source changes and undo/redo', async () => {
    const harness = createBridgeHarness(repeatingGroupSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByTitle('RepeatingGroup1: WebRepeatingGroup');
    selectDesignerComponent('RepeatingGroup1: WebRepeatingGroup');
    await user.click(screen.getByRole('button', { name: 'Configure Repeating Group' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Configure Repeating Group' }));
    await user.selectOptions(dialog.getByLabelText('Repeating Group response list'), '/codes');
    await act(async () => harness.invokeCommand('file.save'));
    expect(harness.save).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(1));
    const savedComponent = (id: string) =>
      harness.persisted().project.pages[0]?.components.find((component) => component.id === id);
    expect(savedComponent('repeating-group')?.props.repeatingGroupConfig).toMatchObject({
      listPath: '/codes',
    });
    expect(savedComponent('row-button')?.props.currentRowBindings).toEqual([]);
    await act(async () => harness.invokeCommand('edit.undo'));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(2));
    expect(savedComponent('repeating-group')?.props.repeatingGroupConfig).toMatchObject({
      listPath: '/customers',
    });
    expect(savedComponent('row-button')?.props.currentRowBindings).toEqual([
      { property: 'caption', fieldPath: '/name' },
    ]);

    selectDesignerComponent('RowButton: WebButton');
    await user.click(screen.getByRole('button', { name: 'Bind Current Row' }));
    const bindingDialog = within(await screen.findByRole('dialog', { name: 'Bind Current Row' }));
    await user.selectOptions(bindingDialog.getByLabelText('Current row Caption'), '/id');
    await user.click(bindingDialog.getByRole('button', { name: 'Save' }));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(3));
    expect(savedComponent('row-button')?.props.currentRowBindings).toEqual([
      { property: 'caption', fieldPath: '/id' },
    ]);
    await act(async () => harness.invokeCommand('edit.undo'));
    await act(async () => harness.invokeCommand('edit.redo'));
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(4));
    expect(savedComponent('row-button')?.props.currentRowBindings).toEqual([
      { property: 'caption', fieldPath: '/id' },
    ]);
  }, 15_000);

  it('shows active debug feedback and stops the session when the toolbar button is clicked again', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    render(<App />);
    await act(async () => harness.invokeCommand('file.openProject'));
    fireEvent.click(screen.getByRole('button', { name: 'Start debugging (F5)' }));
    const stop = await screen.findByRole('button', { name: 'Stop debugging (Shift+F5)' });
    await waitFor(() => expect(stop.getAttribute('data-debug-status')).toBe('running'));
    expect(stop.getAttribute('aria-pressed')).toBe('true');
    expect(stop.classList.contains('active')).toBe(true);
    expect(stop.textContent).toBe('Stop Debug');
    fireEvent.click(stop);
    await waitFor(() => expect(harness.bridge.debugger.command).toHaveBeenCalledWith('stop'));
    const idle = await screen.findByRole('button', { name: 'Start debugging (F5)' });
    expect(idle.getAttribute('aria-pressed')).toBe('false');
    expect(idle.classList.contains('active')).toBe(false);
    expect(harness.bridge.debugger.start).toHaveBeenCalledTimes(1);
    expect(harness.bridge.debugger.command).not.toHaveBeenCalledWith('resume');
  });

  it('starts debugging with F5, navigates paused frames, persists watches, and dispatches step/stop controls', async () => {
    const harness = createBridgeHarness(initialSession());
    const listeners = new Set<(event: DebugEvent) => void>();
    harness.bridge.debugger.subscribe = vi.fn((next) => {
      listeners.add(next);
      return () => {
        listeners.delete(next);
      };
    });
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    render(<App />);
    await act(async () => harness.invokeCommand('file.openProject'));
    fireEvent.keyDown(window, { key: 'F5' });
    await waitFor(() => expect(harness.bridge.debugger.start).toHaveBeenCalled());
    expect(screen.getByRole('region', { name: 'Code debugger' })).toBeDefined();
    expect(harness.save).toHaveBeenCalled();
    const frame = {
      id: 'frame',
      name: 'onClick',
      location: { path: 'pages/PageMain.ts', line: 7, column: 5 },
      scopes: [],
      thisValue: { type: 'object', description: 'PageMain' },
    };
    act(() =>
      listeners.forEach((listener) =>
        listener({
          type: 'state',
          state: {
            sessionId: 'test-debug',
            status: 'paused',
            frames: [frame],
            breakpoints: [],
            reason: 'breakpoint',
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('mock-monaco').getAttribute('data-navigation-line')).toBe('7'),
    );
    expect(screen.getByRole('button', { name: 'Stop debugging (Shift+F5)' }).textContent).toBe(
      'Debug Paused',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'New watch expression' }), {
      target: { value: 'this.name' },
    });
    fireEvent.submit(
      screen.getByRole('textbox', { name: 'New watch expression' }).closest('form')!,
    );
    await act(async () => harness.invokeCommand('file.save'));
    expect(harness.persisted().project.debugger?.watches).toEqual(['this.name']);
    fireEvent.keyDown(window, { key: 'F10' });
    await waitFor(() => expect(harness.bridge.debugger.command).toHaveBeenCalledWith('stepOver'));
    fireEvent.keyDown(window, { key: 'F5', shiftKey: true });
    await waitFor(() => expect(harness.bridge.debugger.command).toHaveBeenCalledWith('stop'));
  });

  it('isolates the icon picker from native commands and F9/F12 shortcuts', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.dblClick(screen.getByRole('button', { name: 'Button' }));
    const button = await screen.findByTitle('Button1: WebButton');
    await user.click(screen.getByRole('button', { name: 'Icon' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose an icon' });
    await act(async () => {
      harness.invokeCommand('file.save');
      harness.invokeCommand('edit.delete');
      harness.invokeCommand('run.run');
    });
    fireEvent.keyDown(dialog, { key: 'F9' });
    fireEvent.keyDown(dialog, { key: 'F12' });
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.build).not.toHaveBeenCalled();
    expect(button.isConnected).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Choose an icon' })).toBe(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Close icon picker' }));
    expect(screen.getByRole('tab', { name: 'Design' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(harness.build).toHaveBeenCalledOnce());
  });

  it('keeps document navigation above the canvas and toggles F12 with Monaco focused', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    fireEvent.keyDown(window, { key: 'F12' });
    expect(screen.queryByRole('tablist', { name: 'Document view' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    const navigation = screen.getByRole('tablist', { name: 'Document view' });
    expect(navigation.parentElement?.classList.contains('wr-editor-workspace')).toBe(true);
    expect(navigation.nextElementSibling?.classList.contains('wr-editor-content')).toBe(true);
    expect(
      within(screen.getByRole('navigation', { name: 'Workspace navigation' })).queryByRole('tab'),
    ).toBeNull();
    expect(screen.getByRole('tab', { name: 'Code' }).title).toBe('Code (F12)');
    fireEvent.keyDown(window, { key: 'F12' });
    const editor = await screen.findByRole('textbox', { name: 'Mock Monaco editor' });
    await user.click(editor);
    const source = (editor as HTMLTextAreaElement).value + '\n// Keep authored edits across F12';
    fireEvent.change(editor, { target: { value: source } });
    const monacoHandler = vi.fn((event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    editor.addEventListener('keydown', monacoHandler);
    for (const modifier of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { repeat: true },
    ]) {
      fireEvent.keyDown(editor, { key: 'F12', ...modifier });
      expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
    }
    monacoHandler.mockClear();
    expect(fireEvent.keyDown(editor, { key: 'F12' })).toBe(false);
    expect(monacoHandler).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Design' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('mock-monaco')).toBeNull();
    fireEvent.keyDown(window, { key: 'F12' });
    expect(await screen.findByRole('textbox', { name: 'Mock Monaco editor' })).toHaveProperty(
      'value',
      source,
    );
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.click(screen.getByRole('tab', { name: 'Code' }));
    expect(await screen.findByRole('textbox', { name: 'Mock Monaco editor' })).toHaveProperty(
      'value',
      source,
    );
  });

  it('keeps F12 and native editing scoped to the visible workspace', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('tab', { name: 'Code' }));
    await user.click(screen.getByRole('button', { name: 'Styles' }));
    const editorCommand = vi.fn();
    const textCommand = vi.fn();
    window.addEventListener('webrad:editor-command', editorCommand);
    const originalExecCommand = document.execCommand;
    document.execCommand = textCommand;
    try {
      await act(async () => harness.invokeCommand('edit.undo'));
      fireEvent.keyDown(window, { key: 'F12' });
      expect(editorCommand).not.toHaveBeenCalled();
      expect(textCommand).toHaveBeenCalledWith('undo');
      expect(screen.getByRole('region', { name: 'Styles editor' })).toBeDefined();
      expect(screen.queryByTestId('mock-monaco')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Close Styles' }));
      await user.click(screen.getByRole('tab', { name: 'Code' }));
      await screen.findByTestId('mock-monaco');
      await act(async () => harness.invokeCommand('edit.undo'));
      expect(editorCommand).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('webrad:editor-command', editorCommand);
      document.execCommand = originalExecCommand;
    }
  });

  it('reopens the last project on startup once in StrictMode with its saved source', async () => {
    const session = initialSession();
    session.userSources['pages/PageMain.ts'] += '\n// Restored authored source';
    const harness = createBridgeHarness(session);
    harness.restore.mockResolvedValue(cloneSession(session));
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await waitFor(() => expect(document.querySelector('.wr-page-surface')).not.toBeNull());
    expect(document.querySelector('.wr-welcome-mark')).toBeNull();
    expect(harness.restore).toHaveBeenCalledTimes(1);
    expect(harness.open).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.setDirty).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    expect(await screen.findByRole('tree', { name: 'MvpProject project' })).toBeDefined();
    await user.click(screen.getByRole('tab', { name: 'Code' }));
    expect(await screen.findByRole('textbox', { name: 'Mock Monaco editor' })).toHaveProperty(
      'value',
      session.userSources['pages/PageMain.ts'],
    );
  });

  it('keeps the welcome screen and manual opening available without a restorable project', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();

    render(<App />);
    await waitFor(() => expect(harness.restore).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.wr-welcome-mark')).not.toBeNull();
    expect(document.querySelector('.wr-page-surface')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await waitFor(() => expect(document.querySelector('.wr-page-surface')).not.toBeNull());
    expect(harness.open).toHaveBeenCalledTimes(1);
  });

  it('logs a restore failure without blocking manual project creation', async () => {
    const harness = createBridgeHarness(initialSession());
    harness.restore.mockRejectedValue(new Error('Project is unavailable'));
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Toggle output' }));
    expect(
      await screen.findByText('Could not reopen the last project: Project is unavailable'),
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'New project (Ctrl+N)' }));
    expect(await screen.findByRole('dialog', { name: 'Create a new project' })).toBeDefined();
  });

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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.getAllByText('PageMain').length).toBeGreaterThan(0);
    expect(screen.getByTitle('Entry page')).toBeDefined();
    expect(screen.queryByText('Forms')).toBeNull();
    expect(
      within(screen.getByRole('toolbar', { name: 'Main toolbar' })).queryByRole('img'),
    ).toBeNull();
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
    expect(editor.value).toContain(
      '  async BTNMostrarClick(sender: WebButton): Promise<void> {\n    \n  }',
    );
    const handlerLine =
      editor.value.split('\n').findIndex((line) => line.includes('BTNMostrarClick')) + 1;
    const navigation = screen.getByTestId('mock-monaco');
    expect(Number(navigation.dataset.navigationLine)).toBe(handlerLine + 1);
    expect(Number(navigation.dataset.navigationColumn)).toBe(5);
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

    await user.click(screen.getByRole('tab', { name: 'Builder' }));
    await user.click(screen.getByRole('treeitem', { name: 'PageMain' }));
    await user.dblClick(screen.getByRole('button', { name: 'File Upload' }));
    const uploadTrayItem = await screen.findByRole('option', { name: 'FileUpload1, File Upload' });
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('FileUpload1');
    });
    const uploadId = uploadTrayItem.getAttribute('data-nonvisual-component-id');
    expect(uploadId).toBeTruthy();
    expect(document.querySelector('[data-component-type="WebFileUpload"]')).toBeNull();
    expect(screen.queryByLabelText('Caption')).toBeNull();
    expect(screen.queryByLabelText('Upload caption')).toBeNull();
    expect(screen.queryByLabelText('Width')).toBeNull();
    expect((screen.getByLabelText('Public file') as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Accepted file types'), { target: { value: '.pdf' } });
    await user.click(screen.getByLabelText('Public file'));
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnSuccess'));
    const uploadEventEditor = (await screen.findByLabelText(
      'Mock Monaco editor',
    )) as HTMLTextAreaElement;
    expect(uploadEventEditor.value).toContain(
      'async FileUpload1Success(sender: WebFileUpload, event: CustomEvent<WebFileUploadResult>): Promise<void>',
    );
    expect(uploadEventEditor.value).toContain(
      'const { id, downloadUrl, url, isPublic } = event.detail;',
    );
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnProgress'));
    const progressEventEditor = (await screen.findByLabelText(
      'Mock Monaco editor',
    )) as HTMLTextAreaElement;
    expect(progressEventEditor.value).toContain(
      'async FileUpload1Progress(sender: WebFileUpload, event: CustomEvent<WebFileUploadProgressEventDetail>): Promise<void>',
    );
    expect(progressEventEditor.value).toContain(
      'const { percentage, loaded, total, lengthComputable } = event.detail;',
    );
    await user.click(screen.getByRole('tab', { name: 'Code' }));
    expect(screen.getByTestId('mock-monaco-page-components').textContent).toBe(
      JSON.stringify([
        { name: 'Label1', type: 'WebLabel' },
        { name: 'Edit1', type: 'WebEdit' },
        { name: 'BTNMostrar', type: 'WebButton' },
        { name: 'ApiClientes', type: 'WebApiClient' },
        { name: 'Popup1', type: 'WebPopup' },
        { name: 'FileUpload1', type: 'WebFileUpload' },
      ]),
    );

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await ensureOutputVisible(user);
    await screen.findByText('Saved MvpProject.');
    const saved = harness.persisted();
    expect(componentTypes(saved.project)).toEqual([
      'WebPage',
      'WebLabel',
      'WebEdit',
      'WebButton',
      'WebApiClient',
      'WebPopup',
      'WebFileUpload',
    ]);
    expect(
      saved.project.pages[0]?.components.find((component) => component.id === uploadId),
    ).toMatchObject({
      name: 'FileUpload1',
      type: 'WebFileUpload',
      props: { isPublic: true, accept: '.pdf', enabled: true },
      events: { OnSuccess: 'FileUpload1Success', OnProgress: 'FileUpload1Progress' },
    });
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
    expect(
      saved.project.pages[0]?.components.find((component) => component.id === uploadId)?.styleId,
    ).toBeUndefined();

    await act(async () => {
      harness.invokeCommand('file.closeProject');
    });
    await screen.findByRole('heading', { name: 'WebRAD' });
    expect(harness.release).toHaveBeenCalledWith('C:\\Projects\\MvpProject');

    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByTitle('BTNMostrar: WebButton');
    await screen.findByRole('option', { name: 'ApiClientes, API Client' });
    await screen.findByRole('option', { name: 'Popup1, Popup' });
    expect(
      (await screen.findByRole('option', { name: 'FileUpload1, File Upload' })).getAttribute(
        'data-nonvisual-component-id',
      ),
    ).toBe(uploadId);
    expect(document.querySelector('[data-component-type="WebFileUpload"]')).toBeNull();
    expect(harness.open).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Build and run (F9)' }));
    const preview = await screen.findByTitle('WebRAD application preview');
    expect(preview.getAttribute('src')).toBe('http://127.0.0.1:49152/integration/index.html');
    expect(preview.hasAttribute('sandbox')).toBe(false);
    expect(preview.getAttribute('referrerpolicy')).toBe('no-referrer');
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
      'WebFileUpload',
    ]);
    expect(harness.save.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(harness.setDirty).toHaveBeenCalledWith(true);
    expect(harness.setDirty).toHaveBeenLastCalledWith(false);
  }, 120_000);

  it('adds palette controls inside the selected floating Popup container', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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
    await ensureOutputVisible(user);
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });

    await user.dblClick(screen.getByRole('button', { name: 'API Client' }));
    const apiClient = await screen.findByRole('option', { name: 'ApiClient1, API Client' });
    await user.dblClick(apiClient);

    const dialog = await screen.findByRole('dialog', { name: 'API Client' });
    expect(dialog).toBeDefined();
    const savesBeforeDialogCommand = harness.save.mock.calls.length;
    act(() => {
      harness.invokeCommand('file.save');
      harness.invokeCommand('edit.undo');
    });
    expect(harness.save.mock.calls.length).toBe(savesBeforeDialogCommand);
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
      expect(screen.queryByRole('dialog', { name: 'API Client' })).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await ensureOutputVisible(user);
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

  it('edits static ComboBox labels and values in a modal and undoes both lists together', async () => {
    const seeded = comboBoxProject();
    const project = {
      ...seeded,
      pages: seeded.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.type === 'WebComboBox'
            ? { ...component, props: { ...component.props, comboBoxConfig: null } }
            : component,
        ),
      })),
    };
    const harness = createBridgeHarness({ ...initialSession(), project });
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    fireEvent.doubleClick(await screen.findByTitle('ComboBox1: WebComboBox'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Edit Items…' }));
    const editor = within(screen.getByRole('dialog', { name: 'Edit ComboBox items' }));
    await user.clear(editor.getByLabelText('ComboBox Items'));
    await user.type(editor.getByLabelText('ComboBox Items'), 'Ana{Enter}Bruno');
    await user.type(editor.getByLabelText('ComboBox Values'), '1{Enter}2');
    await user.click(editor.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() =>
      expect(
        harness
          .persisted()
          .project.pages[0]?.components.find((component) => component.type === 'WebComboBox')
          ?.props,
      ).toMatchObject({ items: ['Ana', 'Bruno'], values: ['1', '2'] }),
    );
    await user.click(screen.getByRole('button', { name: 'Edit Values…' }));
    expect(document.activeElement).toBe(screen.getByLabelText('ComboBox Values'));
    expect(screen.getByLabelText('ComboBox Values')).toHaveProperty('value', '1\n2');
    await user.keyboard('{Escape}');
    await act(async () => harness.invokeCommand('edit.undo'));
    await user.click(screen.getByRole('button', { name: 'Edit Items…' }));
    expect(screen.getByLabelText('ComboBox Items')).toHaveProperty('value', 'Static item');
    expect(screen.getByLabelText('ComboBox Values')).toHaveProperty('value', '');
  });

  it('configures the ComboBox from the Designer, persists its binding, and undoes it as one change', async () => {
    const seeded = comboBoxProject();
    const project = {
      ...seeded,
      pages: seeded.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.type === 'WebComboBox'
            ? { ...component, props: { ...component.props, comboBoxConfig: null } }
            : component,
        ),
      })),
    };
    const harness = createBridgeHarness({ ...initialSession(), project });
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    const combo = await screen.findByTitle('ComboBox1: WebComboBox');
    fireEvent.doubleClick(combo);
    const editor = within(await screen.findByRole('dialog', { name: 'Configure ComboBox' }));
    await user.selectOptions(editor.getByLabelText('ComboBox API Client'), 'customers-api');
    await user.selectOptions(editor.getByLabelText('ComboBox display field'), '/name');
    await user.selectOptions(editor.getByLabelText('ComboBox key field'), '/id');
    await user.click(editor.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() =>
      expect(
        harness
          .persisted()
          .project.pages[0]?.components.find((component) => component.type === 'WebComboBox')?.props
          .comboBoxConfig,
      ).toEqual(comboBoxBinding),
    );
    await user.click(screen.getByRole('button', { name: 'Configure ComboBox' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Configure ComboBox' })).getByLabelText(
        'ComboBox key field',
      ),
    ).toHaveProperty('value', '/id');
    await act(async () => harness.invokeCommand('edit.undo'));
    expect(screen.getByRole('dialog', { name: 'Configure ComboBox' })).toBeDefined();
    await user.keyboard('{Escape}');
    await act(async () => harness.invokeCommand('edit.undo'));
    await user.click(screen.getByRole('button', { name: 'Configure ComboBox' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Configure ComboBox' })).getByLabelText(
        'ComboBox API Client',
      ),
    ).toHaveProperty('value', '');
  });

  it('opens the dedicated Data Grid editor and persists mixed column and row sizing', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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
    await ensureOutputVisible(user);
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

  it('blocks native project commands during Data Grid configuration and restores them after cancel', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.dblClick(screen.getByRole('button', { name: 'Data Grid' }));
    const grid = await screen.findByTitle('DataGrid1: WebDataGrid');
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(1));
    const originalGrid = harness
      .persisted()
      .project.pages[0]?.components.find((component) => component.type === 'WebDataGrid');
    if (originalGrid === undefined) throw new Error('Expected the original saved Data Grid.');
    const originalConfiguration = parseDataGridConfiguration(originalGrid.props.dataGridConfig);
    harness.save.mockClear();

    await user.click(screen.getByRole('button', { name: 'Configure Data Grid' }));
    const dialog = await screen.findByRole('dialog', { name: 'Configure Data Grid' });
    const editor = within(dialog);
    await user.type(editor.getByLabelText('Data Grid empty-state message'), ' draft only');
    await user.click(editor.getByRole('checkbox', { name: 'Show Data Grid header' }));
    editor.getByRole('button', { name: 'Cancel' }).focus();
    expect(document.querySelector('.wr-ide-modal-host')?.hasAttribute('inert')).toBe(true);

    for (const command of ['edit.undo', 'edit.delete', 'file.save', 'run.run'] as const) {
      await act(async () => harness.invokeCommand(command));
      expect(screen.getByRole('dialog', { name: 'Configure Data Grid' })).toBe(dialog);
      expect(grid.isConnected).toBe(true);
      expect(harness.save).not.toHaveBeenCalled();
      expect(harness.build).not.toHaveBeenCalled();
    }
    expect(editor.getByLabelText('Data Grid empty-state message')).toHaveProperty(
      'value',
      originalConfiguration.emptyMessage + ' draft only',
    );
    expect(editor.getByRole('checkbox', { name: 'Show Data Grid header' })).toHaveProperty(
      'checked',
      !originalConfiguration.showHeader,
    );
    fireEvent.keyDown(editor.getByLabelText('Data Grid empty-state message'), { key: 'F9' });
    fireEvent.keyDown(editor.getByLabelText('Data Grid empty-state message'), { key: 'F12' });
    expect(harness.build).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
    expect(
      screen.getByRole('tab', { name: 'Design', hidden: true }).getAttribute('aria-selected'),
    ).toBe('true');
    await act(async () => harness.invokeCommand('view.toggleTheme'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('dialog', { name: 'Configure Data Grid' })).toBe(dialog);
    await user.click(editor.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Configure Data Grid' })).toBeNull();
    expect(document.querySelector('.wr-ide-modal-host')?.hasAttribute('inert')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Configure Data Grid' }));
    const reopened = within(await screen.findByRole('dialog', { name: 'Configure Data Grid' }));
    expect(reopened.getByLabelText('Data Grid empty-state message')).toHaveProperty(
      'value',
      originalConfiguration.emptyMessage,
    );
    expect(reopened.getByRole('checkbox', { name: 'Show Data Grid header' })).toHaveProperty(
      'checked',
      originalConfiguration.showHeader,
    );
    await user.click(reopened.getByRole('button', { name: 'Cancel' }));

    await act(async () => harness.invokeCommand('edit.delete'));
    expect(screen.queryByTitle('DataGrid1: WebDataGrid')).toBeNull();
    await act(async () => harness.invokeCommand('edit.undo'));
    await screen.findByTitle('DataGrid1: WebDataGrid');
    await act(async () => harness.invokeCommand('file.save'));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(1));
    expect(
      harness
        .persisted()
        .project.pages[0]?.components.find((component) => component.id === originalGrid.id)?.props
        .dataGridConfig,
    ).toEqual(originalConfiguration);
    await act(async () => harness.invokeCommand('run.run'));
    await waitFor(() => expect(harness.build).toHaveBeenCalledTimes(1));
  }, 15_000);

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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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

    expect(document.querySelector('.wr-inspector-slot')).not.toBeNull();
    expect(screen.getByRole('separator', { name: 'Resize inspector' })).toBeDefined();

    const stylesItem = screen.getByRole('button', { name: 'Styles' });
    await user.click(stylesItem);
    expect(stylesItem.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByRole('region', { name: 'Styles editor' })).toBeDefined();
    expect(document.querySelector('.wr-inspector-slot')).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize inspector' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Style library' })).toBeDefined();
    expect(screen.getByRole('listbox', { name: 'Style components' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Search elements' })).toBeNull();
    expect(document.querySelector('.wr-tool-palette')).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Label' }));
    expect(screen.getByRole('option', { name: /Default Label/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Default Button/ })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toBeDefined();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Design' })).toBeNull();

    await user.click(screen.getAllByRole('button', { name: 'New style' })[0]!);
    await user.selectOptions(screen.getByLabelText('Component type'), 'WebButton');
    const createName = screen.getByLabelText('New style name');
    await user.clear(createName);
    await user.type(createName, 'Primary Button Draft');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const openCategory = async (name: string): Promise<void> => {
      if (name === 'Motion')
        await user.click(screen.getByRole('button', { name: 'All properties' }));
      const category = screen.getByRole('button', { name: new RegExp('^' + name + ',') });
      if (category.getAttribute('aria-expanded') !== 'true') await user.click(category);
    };
    const configure = async (label: string): Promise<void> => {
      await user.click(screen.getByLabelText(`Configure ${label}`));
    };

    expect(document.querySelector('textarea')).toBeNull();
    await openCategory('Appearance');
    await configure('Background color');
    fireEvent.change(
      screen.getByLabelText('Background color', { selector: 'input[type="color"]' }),
      {
        target: { value: '#2563eb' },
      },
    );
    await openCategory('Text');
    await configure('Text color');
    fireEvent.change(screen.getByLabelText('Text color', { selector: 'input[type="color"]' }), {
      target: { value: '#ffffff' },
    });
    await openCategory('Appearance');
    await configure('Border radius');
    fireEvent.change(screen.getByLabelText('Border radius value'), {
      target: { value: '8' },
    });
    await openCategory('Motion');
    await configure('Transition property');
    await configure('Transition duration');
    await configure('Transition easing');

    await user.click(screen.getByRole('tab', { name: 'Hover' }));
    await openCategory('Appearance');
    await configure('Background color');
    fireEvent.change(
      screen.getByLabelText('Background color', { selector: 'input[type="color"]' }),
      {
        target: { value: '#1d4ed8' },
      },
    );
    await openCategory('Motion');
    await configure('Scale');
    fireEvent.change(screen.getByLabelText('Scale', { selector: 'input[type="number"]' }), {
      target: { value: '105' },
    });
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
    await openCategory('Appearance');
    await openCategory('Text');
    await configure('Text color');
    fireEvent.change(screen.getByLabelText('Text color', { selector: 'input[type="color"]' }), {
      target: { value: '#64748b' },
    });
    await openCategory('Text');
    await configure('Font size');
    fireEvent.change(screen.getByLabelText('Font size value'), { target: { value: '14' } });

    await user.click(screen.getByRole('button', { name: 'New style' }));
    await user.selectOptions(screen.getByLabelText('Component type'), 'WebPage');
    await user.clear(screen.getByLabelText('New style name'));
    await user.type(screen.getByLabelText('New style name'), 'Page Surface');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await openCategory('Appearance');
    await configure('Background color');
    fireEvent.change(
      screen.getByLabelText('Background color', { selector: 'input[type="color"]' }),
      {
        target: { value: '#f1f5f9' },
      },
    );
    await openCategory('Text');
    await configure('Text color');
    fireEvent.change(screen.getByLabelText('Text color', { selector: 'input[type="color"]' }), {
      target: { value: '#0f172a' },
    });

    await waitFor(() => expect(harness.compileStyles).toHaveBeenCalled());
    expect(document.querySelector('style[data-webrad-project-styles]')?.textContent).toContain(
      'background-color',
    );

    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await user.click(screen.getByRole('treeitem', { name: /PageMain/ }));
    await screen.findByRole('tab', { name: 'Design' });
    expect(document.querySelector('.wr-inspector-slot')).not.toBeNull();
    expect(screen.getByRole('separator', { name: 'Resize inspector' })).toBeDefined();
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
    await ensureOutputVisible(user);
    await screen.findByText('Saved MvpProject.');
    const savedWithStyles = harness.persisted().project;
    expect(savedWithStyles.styles).toHaveLength(19);
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
    await user.click(screen.getByRole('option', { name: 'Button' }));
    await user.click(screen.getByRole('option', { name: /Primary Button/ }));
    await user.click(screen.getByRole('button', { name: 'Delete Primary Button' }));
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() => {
      const styles = harness.persisted().project.styles;
      expect(styles).toHaveLength(18);
      expect(styles.filter((style) => style.preset === 'default')).toHaveLength(16);
      expect(styles.some((style) => style.name === 'Primary Button')).toBe(false);
      expect(styles.some((style) => style.name === 'Muted Label')).toBe(true);
      expect(styles.some((style) => style.name === 'Page Surface')).toBe(true);
    });

    const savedAfterDelete = harness.persisted().project;
    expect(savedAfterDelete.styles).toHaveLength(18);
    expect(savedAfterDelete.styles.filter((style) => style.preset === 'default')).toHaveLength(16);
    expect(
      savedAfterDelete.pages[0]?.components
        .filter((component) => component.type === 'WebButton')
        .every((component) => component.styleId === undefined),
    ).toBe(true);
    expect(
      savedAfterDelete.pages[0]?.components.find((component) => component.type === 'WebLabel')
        ?.styleId,
    ).toBe(mutedStyle?.id);
  }, 120_000);

  it('creates, edits and reopens models and units from Project commands', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    for (const kind of ['model', 'unit'] as const) {
      await act(async () =>
        harness.invokeCommand(kind === 'model' ? 'project.addModel' : 'project.addUnit'),
      );
      const dialog = await screen.findByRole('dialog', { name: `Add ${kind}` });
      const field = within(dialog).getByRole('textbox');
      expect((field as HTMLInputElement).value).toBe(kind === 'model' ? 'Model1' : 'Unit1');
      await user.clear(field);
      await user.type(field, kind === 'model' ? 'Customer' : 'Helpers');
      await user.click(within(dialog).getByRole('button', { name: `Add ${kind}` }));
      const editor = await screen.findByRole('textbox', { name: 'Mock Monaco editor' });
      expect(screen.getByRole('tab', { name: 'Design' })).toHaveProperty('disabled', true);
      fireEvent.keyDown(editor, { key: 'F12' });
      expect(screen.getByRole('textbox', { name: 'Mock Monaco editor' })).toBe(editor);
      await act(async () => harness.invokeCommand('view.preview'));
      expect(screen.queryByRole('textbox', { name: 'Mock Monaco editor' })).toBeNull();
      await user.click(screen.getByRole('tab', { name: 'Code' }));
      await screen.findByRole('textbox', { name: 'Mock Monaco editor' });
      fireEvent.change(screen.getByRole('textbox', { name: 'Mock Monaco editor' }), {
        target: {
          value:
            kind === 'model'
              ? 'export class Customer { public name = "Alice"; }'
              : 'export const suffix = "!";',
        },
      });
      await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
      await waitFor(() =>
        expect(
          harness.persisted().userSources[
            kind === 'model' ? 'models/Customer.ts' : 'units/Helpers.ts'
          ],
        ).toContain(kind === 'model' ? 'Alice' : 'suffix'),
      );
    }
    await user.click(screen.getByRole('treeitem', { name: 'Customer' }));
    expect(
      (screen.getByRole('textbox', { name: 'Mock Monaco editor' }) as HTMLTextAreaElement).value,
    ).toContain('Alice');
    await act(async () => harness.invokeCommand('project.addModel'));
    const duplicate = await screen.findByRole('dialog', { name: 'Add model' });
    await user.clear(within(duplicate).getByRole('textbox'));
    await user.type(within(duplicate).getByRole('textbox'), 'customer');
    await user.click(within(duplicate).getByRole('button', { name: 'Add model' }));
    expect(within(duplicate).getByRole('alert').textContent).toContain('already exists');
    await user.click(within(duplicate).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await user.click(await screen.findByRole('treeitem', { name: 'Helpers' }));
    expect(
      (screen.getByRole('textbox', { name: 'Mock Monaco editor' }) as HTMLTextAreaElement).value,
    ).toContain('suffix');
  });

  it('imports assets through the native bridge, persists them and ignores cancellation', async () => {
    const harness = createBridgeHarness(initialSession());
    const asset = {
      id: 'test-image',
      fileName: 'logo.png',
      mediaType: 'image/png',
      base64: 'AP8B',
    };
    vi.mocked(harness.bridge.project.importAsset).mockResolvedValueOnce(asset);
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await act(async () => harness.invokeCommand('project.importAsset'));
    expect(await screen.findByRole('img', { name: 'logo.png' })).toBeDefined();
    expect(
      (screen.getByRole('textbox', { name: 'Asset application path' }) as HTMLInputElement).value,
    ).toBe('assets/imported/logo.png');
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() => expect(harness.persisted().project.assets).toEqual([asset]));
    await act(async () => harness.invokeCommand('project.importAsset'));
    expect(harness.bridge.project.importAsset).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    expect(harness.persisted().project.assets).toEqual([asset]);
  });

  it('creates additional pages with the Page naming contract', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', {
      configurable: true,
      value: harness.bridge,
    });
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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
    await ensureOutputVisible(user);
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByTitle('Open Project Settings'));

    const dialog = await screen.findByRole('dialog', { name: 'Settings for MvpProject' });
    expect(within(dialog).getByRole('tab', { name: 'Environment variables' })).toBeDefined();
    expect(within(dialog).queryByRole('tab', { name: 'RestGo integration' })).toBeNull();
    for (const name of ['CORS and origins', 'Headers and CSP', 'Logs and monitoring']) {
      expect(within(dialog).queryByRole('tab', { name })).toBeNull();
    }

    await user.click(within(dialog).getByRole('tab', { name: 'General' }));
    const applicationName = within(dialog).getByRole('textbox', { name: /^Application name/ });
    await user.clear(applicationName);
    await user.type(applicationName, 'Mvp Portal');
    expect(within(dialog).queryByRole('tab', { name: 'Color palette' })).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Styles' }));
    await user.click(screen.getByRole('button', { name: 'Color palette' }));
    fireEvent.change(screen.getByLabelText('Palette color 1'), { target: { value: '#007acc' } });
    await user.click(screen.getByRole('button', { name: 'Save palette' }));
    await user.click(screen.getByRole('button', { name: 'Color palette' }));
    expect((screen.getByLabelText('Palette color 1 hex') as HTMLInputElement).value).toBe(
      '#007acc',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() =>
      expect(harness.persisted().project.settings.colorPalette[0]).toMatchObject({
        id: 'aurora-blue',
        color: '#007acc',
      }),
    );
    await user.click(screen.getByRole('option', { name: 'Button' }));
    await user.click(screen.getByRole('button', { name: 'All properties' }));
    expect(
      screen.getByRole('button', { name: 'Predefined colors for Background gradient from color' }),
    ).toBeDefined();
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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
    expect(screen.queryByRole('tab', { name: 'Preview' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Design' })).toBeDefined();

    await user.dblClick(screen.getByRole('button', { name: 'Button' }));
    await screen.findByTitle('Button1: WebButton');
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnClick'));
    const reusableEditor = (await screen.findByLabelText(
      'Mock Monaco editor',
    )) as HTMLTextAreaElement;
    expect(reusableEditor.value).toContain(
      '  async Button1Click(sender: WebButton): Promise<void> {\n    \n  }',
    );
    const reusableNavigation = screen.getByTestId('mock-monaco');
    const reusableHandlerLine =
      reusableEditor.value.split('\n').findIndex((line) => line.includes('async Button1Click')) + 1;
    expect(Number(reusableNavigation.dataset.navigationLine)).toBe(reusableHandlerLine + 1);
    expect(Number(reusableNavigation.dataset.navigationColumn)).toBe(5);
    await user.click(screen.getByRole('tab', { name: 'Design' }));

    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await user.click(screen.getByRole('treeitem', { name: /PageMain/ }));
    await screen.findByRole('tab', { name: 'Code' });
    const reusableTreeItem = within(
      screen.getByRole('tree', { name: 'MvpProject project' }),
    ).getByRole('treeitem', { name: 'CustomerCard' });
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
    await ensureOutputVisible(user);
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await user.click(screen.getByRole('tab', { name: 'Code' }));

    const editor = (await screen.findByLabelText('Mock Monaco editor')) as HTMLTextAreaElement;
    const editedSource = `${editor.value}\n// save this exact Monaco buffer\n`;
    fireEvent.change(editor, { target: { value: editedSource } });
    await user.click(screen.getByRole('button', { name: 'Save code' }));
    await ensureOutputVisible(user);
    await screen.findByText('Saved MvpProject.');

    const saveRequest = harness.save.mock.calls.at(-1)?.[0] as SaveProjectRequest | undefined;
    expect(saveRequest?.userSources['pages/PageMain.ts']).toBe(editedSource);
    expect(harness.persisted().userSources['pages/PageMain.ts']).toBe(editedSource);
    expect((screen.getByLabelText('Mock Monaco editor') as HTMLTextAreaElement).value).toBe(
      editedSource,
    );
  });

  it('opens About from the menu without a project and restores focus after closing', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Open project (Ctrl+O)' });
    trigger.focus();
    await act(async () => harness.invokeCommand('help.about'));
    const dialog = await screen.findByRole('dialog', { name: 'About WebRAD' });
    expect(within(dialog).getByText(/Version /)).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Close About WebRAD' }),
    );
    expect(document.querySelector('.wr-ide-modal-host')?.hasAttribute('inert')).toBe(true);
    await act(async () => harness.invokeCommand('file.openProject'));
    expect(harness.open).not.toHaveBeenCalled();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }));
    await user.tab();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Close About WebRAD' }),
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('.wr-ide-modal-host')?.hasAttribute('inert')).toBe(false);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    await act(async () => harness.invokeCommand('help.about'));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'About WebRAD' })).getByRole('button', {
        name: 'Close',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => harness.invokeCommand('help.about'));
    await user.click(screen.getByRole('button', { name: 'Close About WebRAD' }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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
    await user.click(screen.getByRole('button', { name: 'Project Explorer' }));
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

  it('keeps the toolbar focused on the current page while preserving component IDs and bounds', async () => {
    const harness = createBridgeHarness(initialSession());
    Object.defineProperty(window, 'webrad', { configurable: true, value: harness.bridge });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    const tree = await screen.findByRole('tree', { name: 'Page elements' });
    expect(screen.getByRole('tab', { name: 'Builder' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tree', { name: 'MvpProject project' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Toggle output' }).getAttribute('aria-pressed')).toBe(
      'false',
    );

    await user.dblClick(screen.getByRole('button', { name: 'Button' }));
    const button = await within(tree).findByRole('treeitem', { name: 'Button1', selected: true });
    const componentId = button.getAttribute('data-component-id');
    expect(componentId).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'SaveOrder' } });
    const renamed = await within(tree).findByRole('treeitem', {
      name: 'SaveOrder',
      selected: true,
    });
    expect(renamed.getAttribute('data-component-id')).toBe(componentId);
    expect(document.querySelector('.wr-toolbar-selection')).toBeNull();
    const documents = within(screen.getByRole('tablist', { name: 'Open documents' }));
    expect(documents.getAllByRole('tab')).toHaveLength(1);
    expect(documents.getByRole('tab', { name: /PageMain/ })).toBeDefined();
    expect(screen.queryByRole('combobox', { name: 'Zoom' })).toBeNull();
    expect(screen.queryByLabelText('Arrange selection')).toBeNull();

    await user.click(within(tree).getByRole('treeitem', { name: 'PageMain' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('PageMain');
    await user.click(renamed);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('SaveOrder');
    const width = Number((screen.getByLabelText('Width') as HTMLInputElement).value);

    await user.click(screen.getByRole('tab', { name: 'Responsive' }));
    await user.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(document.querySelector('.wr-page-surface')?.getAttribute('data-viewport')).toBe(
      'mobile',
    );
    await user.click(screen.getByRole('tab', { name: 'Builder' }));
    expect(screen.getByRole('treeitem', { name: 'SaveOrder', selected: true })).toBeDefined();

    await user.dblClick(screen.getByRole('button', { name: 'Label' }));
    const labelId = (await screen.findByRole('treeitem', { name: 'Label1' })).getAttribute(
      'data-component-id',
    );
    expect(labelId).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Code' }));
    await screen.findByLabelText('Mock Monaco editor');
    await user.click(screen.getByRole('treeitem', { name: 'SaveOrder' }));
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('treeitem', { name: 'SaveOrder' })).toBeNull();
    await user.click(screen.getByRole('treeitem', { name: 'PageMain' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(
      (await screen.findByRole('treeitem', { name: 'SaveOrder' })).getAttribute(
        'data-component-id',
      ),
    ).toBe(componentId);
    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');

    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.click(screen.getByRole('treeitem', { name: 'SaveOrder' }));

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() => expect(harness.save).toHaveBeenCalledOnce());
    const frontPage = harness.persisted().project.pages[0];
    expect(
      frontPage?.components.find((component) => component.id === frontPage.rootComponentId)
        ?.children,
    ).toEqual([componentId, labelId]);

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await waitFor(() => expect(harness.save).toHaveBeenCalledTimes(2));
    const backPage = harness.persisted().project.pages[0];
    expect(
      backPage?.components.find((component) => component.id === backPage.rootComponentId)?.children,
    ).toEqual([componentId, labelId]);
    const persisted = harness
      .persisted()
      .project.pages[0]?.components.find((component) => component.id === componentId);
    expect(persisted?.name).toBe('SaveOrder');
    expect(persisted?.bounds.width).toBe(width);
    expect(screen.getByRole('button', { name: 'Toggle output' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});
