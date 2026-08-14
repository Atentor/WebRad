// @vitest-environment jsdom

import { createUserFormSource } from '@webrad/language';
import { createProject, type WebRadProject } from '@webrad/project-model';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BuildRequest,
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
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
}

vi.mock('./components/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, onSave }: MockCodeEditorProps) => (
    <div data-testid="mock-monaco">
      <textarea
        aria-label="Mock Monaco editor"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <button type="button" onClick={onSave}>
        Save code
      </button>
    </div>
  ),
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
  const form = project.forms[0];
  if (form === undefined) throw new Error('The integration project requires FrmMain.');
  return {
    rootPath: 'C:\\Projects\\MvpProject',
    projectFilePath: 'C:\\Projects\\MvpProject\\MvpProject.wrproj',
    project,
    userSources: { 'forms/FrmMain.ts': createUserFormSource(form) },
  };
}

interface BridgeHarness {
  readonly bridge: WebRadBridge;
  readonly create: ReturnType<typeof vi.fn>;
  readonly open: ReturnType<typeof vi.fn>;
  readonly save: ReturnType<typeof vi.fn>;
  readonly build: ReturnType<typeof vi.fn>;
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
  const build = vi.fn(async (request: BuildRequest) => {
    void request;
    return {
      success: true,
      outputDirectory: 'C:\\Projects\\MvpProject\\dist',
      previewUrl: 'webrad-preview://session/integration/index.html',
      diagnostics: [],
    } as const;
  });
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
  return project.forms[0]?.components.map((component) => component.type) ?? [];
}

function imageSource(selector: string): string | null {
  return document.querySelector<HTMLImageElement>(selector)?.getAttribute('src') ?? null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'webrad');
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
    const toolbarIconSource = imageSource('.wr-brand-mark');
    expect(toolbarIconSource).toBe(applicationIconUrl);
    expect(imageSource('.wr-welcome-mark')).toBe(toolbarIconSource);

    await user.click(screen.getByRole('button', { name: 'New project (Ctrl+N)' }));
    await screen.findByRole('dialog', { name: 'Create a new project' });
    const projectName = screen.getByRole('textbox', { name: 'Project name' });
    await user.clear(projectName);
    await user.type(projectName, 'MvpProject');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByRole('tree', { name: 'MvpProject project' });
    expect(imageSource('.wr-project-icon')).toBe(toolbarIconSource);
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

    await user.click(screen.getByRole('tab', { name: 'Events' }));
    await user.dblClick(screen.getByLabelText('OnClick'));
    const editor = (await screen.findByLabelText('Mock Monaco editor')) as HTMLTextAreaElement;
    expect(editor.value).toContain('async BTNMostrarClick(sender: WebButton): Promise<void>');
    fireEvent.change(editor, { target: { value: `${editor.value}\n// integration edit\n` } });

    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.dblClick(screen.getByRole('button', { name: 'API Client' }));
    await screen.findByRole('option', { name: 'ApiClient1, API Client' });
    expect(
      document.querySelector('[data-component-id][title="ApiClient1: WebApiClient"]'),
    ).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Properties' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('ApiClient1');
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ApiClientes' } });
    await screen.findByRole('option', { name: 'ApiClientes, API Client' });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://api.example.test/v1' },
    });

    await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
    await screen.findByText('Saved MvpProject.');
    const saved = harness.persisted();
    expect(componentTypes(saved.project)).toEqual([
      'WebForm',
      'WebLabel',
      'WebEdit',
      'WebButton',
      'WebApiClient',
    ]);
    expect(
      saved.project.forms[0]?.components.find((component) => component.name === 'ApiClientes')
        ?.props.baseUrl,
    ).toBe('https://api.example.test/v1');
    expect(saved.userSources['forms/FrmMain.ts']).toContain('// integration edit');
    expect(
      saved.project.forms[0]?.components.find((component) => component.name === 'BTNMostrar')
        ?.events.OnClick,
    ).toBe('BTNMostrarClick');

    await act(async () => {
      harness.invokeCommand('file.closeProject');
    });
    await screen.findByRole('heading', { name: 'WebRAD' });
    expect(harness.release).toHaveBeenCalledWith('C:\\Projects\\MvpProject');

    await user.click(screen.getByRole('button', { name: 'Open project (Ctrl+O)' }));
    await screen.findByTitle('BTNMostrar: WebButton');
    await screen.findByRole('option', { name: 'ApiClientes, API Client' });
    expect(harness.open).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Build and run (F9)' }));
    const preview = await screen.findByTitle('WebRAD application preview');
    expect(preview.getAttribute('src')).toBe('webrad-preview://session/integration/index.html');
    expect(preview.getAttribute('sandbox')).toBe('allow-forms allow-modals allow-scripts');
    expect(harness.build).toHaveBeenCalledOnce();
    const buildRequest = harness.build.mock.calls[0]?.[0] as BuildRequest | undefined;
    expect(buildRequest?.userSources['forms/FrmMain.ts']).toContain('// integration edit');
    expect(componentTypes(buildRequest?.project ?? saved.project)).toEqual([
      'WebForm',
      'WebLabel',
      'WebEdit',
      'WebButton',
      'WebApiClient',
    ]);
    expect(harness.save.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(harness.setDirty).toHaveBeenCalledWith(true);
    expect(harness.setDirty).toHaveBeenLastCalledWith(false);
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
});
