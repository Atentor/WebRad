// @vitest-environment jsdom
import { useSyncExternalStore } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@webrad/project-model';
import type { ProjectSession, WebRadBridge } from '../../../shared/contracts';
import type {
  DebugBreakpoint,
  DebugEvent,
  DebugStartResponse,
} from '../../../shared/debugger-contracts';
import { createDebugTestBridge } from '../../../shared/debugger-test-bridge';
import { ProjectController } from './project-controller';
import { useDebugger } from './useDebugger';

afterEach(cleanup);

function harness() {
  const debuggerBridge = createDebugTestBridge();
  let listener: (event: DebugEvent) => void = () => undefined;
  debuggerBridge.subscribe = vi.fn((next) => {
    listener = next;
    return () => {
      listener = () => undefined;
    };
  });
  const session: ProjectSession = {
    rootPath: 'C:/projects/Debug',
    projectFilePath: 'C:/projects/Debug/Debug.wrproj',
    project: createProject('Debug'),
    userSources: {},
  };
  const bridge = {
    debugger: debuggerBridge,
    project: { save: vi.fn(async (request) => ({ ...session, ...request })) },
    lifecycle: { setDirty: vi.fn() },
    platform: 'win32',
  } as unknown as WebRadBridge;
  Object.defineProperty(window, 'webrad', { configurable: true, value: bridge });
  const controller = new ProjectController(bridge);
  controller.load(session);
  const callbacks = {
    onOutput: vi.fn(),
    onShow: vi.fn(),
    onNavigate: vi.fn(),
    onDiagnostics: vi.fn(),
  };
  const hook = renderHook(() => {
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    return useDebugger({ controller, project: snapshot.project, ...callbacks });
  });
  return { ...hook, controller, bridge, callbacks, emit: (event: DebugEvent) => listener(event) };
}

describe('integrated debugger controller', () => {
  it('persists only authored breakpoint preferences and merges locations collapsed by an edit', () => {
    const test = harness();
    act(() =>
      test.result.current.moveBreakpoints([
        {
          path: 'pages/PageMain.ts',
          line: 3,
          enabled: true,
          verified: true,
          actualLine: 4,
        } as DebugBreakpoint,
        { path: 'pages/PageMain.ts', line: 3, enabled: true },
      ]),
    );
    expect(test.controller.getSnapshot().project?.debugger?.breakpoints).toEqual([
      {
        path: 'pages/PageMain.ts',
        line: 3,
        column: undefined,
        condition: undefined,
        enabled: true,
      },
    ]);
  });
  it('persists breakpoints and watches and starts with the saved project snapshot', async () => {
    const test = harness();
    await waitFor(() => expect(test.bridge.debugger.getState).toHaveBeenCalled());
    act(() => {
      test.result.current.toggleBreakpoint('pages/PageMain.ts', 7);
      test.result.current.setWatches(['this.name']);
    });
    await act(() => test.result.current.start());
    expect(test.bridge.project.save).toHaveBeenCalled();
    expect(test.bridge.debugger.start).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: 'C:/projects/Debug',
        breakpoints: [{ path: 'pages/PageMain.ts', line: 7, enabled: true }],
        pauseOnExceptions: 'uncaught',
      }),
    );
    expect(test.controller.getSnapshot().project?.debugger?.watches).toEqual(['this.name']);
    expect(test.result.current.active).toBe(true);
  });

  it('navigates to a paused authored frame, synchronizes breakpoints, and keeps preference edits running', async () => {
    const test = harness();
    await act(() => test.result.current.start());
    const frame = {
      id: 'frame',
      name: 'onClick',
      location: { path: 'pages/PageMain.ts', line: 9, column: 5 },
      scopes: [],
      thisValue: { type: 'object', description: 'PageMain' },
    };
    act(() =>
      test.emit({
        type: 'state',
        state: {
          sessionId: 'test-debug',
          status: 'paused',
          frames: [frame],
          breakpoints: [],
          reason: 'breakpoint',
        },
      }),
    );
    expect(test.callbacks.onNavigate).toHaveBeenCalledWith(frame.location);
    expect(test.result.current.selectedFrameId).toBe('frame');
    act(() => test.result.current.setWatches(['this.name']));
    expect(test.bridge.debugger.command).not.toHaveBeenCalledWith('stop');
    act(() => test.result.current.toggleBreakpoint('pages/PageMain.ts', 10));
    await waitFor(() => expect(test.bridge.debugger.setBreakpoints).toHaveBeenCalled());
  });

  it('stops a session when authored code changes so stale maps cannot drive the editor', async () => {
    const test = harness();
    await act(() => test.result.current.start());
    act(() => test.controller.setUserSource('pages/PageMain.ts', '// changed source'));
    await waitFor(() => expect(test.bridge.debugger.command).toHaveBeenCalledWith('stop'));
    expect(test.callbacks.onNavigate).not.toHaveBeenCalled();
  });

  it('synchronizes preference changes while the debug target is starting', async () => {
    const test = harness();
    await act(async () => {
      await Promise.resolve();
    });
    act(() =>
      test.emit({
        type: 'state',
        state: { sessionId: null, status: 'starting', frames: [], breakpoints: [] },
      }),
    );
    act(() => {
      test.result.current.toggleBreakpoint('pages/PageMain.ts', 8);
      test.result.current.setExceptionMode('all');
    });
    await waitFor(() =>
      expect(test.bridge.debugger.setBreakpoints).toHaveBeenCalledWith([
        {
          path: 'pages/PageMain.ts',
          line: 8,
          column: undefined,
          condition: undefined,
          enabled: true,
        },
      ]),
    );
    expect(test.bridge.debugger.setPauseOnExceptions).toHaveBeenCalledWith('all');
  });

  it('rejects an obsolete start response after the project changes', async () => {
    const test = harness();
    let resolve!: (value: DebugStartResponse) => void;
    test.bridge.debugger.start = vi.fn(
      () =>
        new Promise<DebugStartResponse>((next) => {
          resolve = next;
        }),
    );
    let running!: Promise<void>;
    act(() => {
      running = test.result.current.start();
    });
    await waitFor(() => expect(test.bridge.debugger.start).toHaveBeenCalled());
    act(() => test.controller.setUserSource('pages/PageMain.ts', '// newer code'));
    await act(async () => {
      resolve({
        build: { success: true, diagnostics: [] },
        state: { sessionId: 'obsolete', status: 'running', frames: [], breakpoints: [] },
      });
      await running;
    });
    expect(test.result.current.state.sessionId).not.toBe('obsolete');
    expect(test.callbacks.onDiagnostics).not.toHaveBeenCalled();
  });
});
