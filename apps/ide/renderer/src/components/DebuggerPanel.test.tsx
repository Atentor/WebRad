// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DebugBridge,
  DebugEvaluation,
  DebugEvent,
  DebugFrame,
  DebugState,
  DebugVariable,
} from '../../../shared/debugger-contracts';
import { DebuggerPanel, type DebuggerPanelProps } from './DebuggerPanel';

afterEach(cleanup);

const frame: DebugFrame = {
  id: 'frame-1',
  name: 'Button1Click',
  location: { path: 'pages/PageMain.ts', line: 7, column: 3 },
  scopes: [{ type: 'local', objectId: 'locals-1' }],
  thisValue: { type: 'object', description: 'PageMain', objectId: 'this-1' },
};
const pausedState: DebugState = {
  sessionId: 'session-1',
  status: 'paused',
  frames: [
    frame,
    {
      ...frame,
      id: 'frame-2',
      name: 'dispatchEvent',
      location: { path: 'pages/PageMain.ts', line: 3, column: 1 },
    },
  ],
  breakpoints: [],
  reason: 'breakpoint',
};

function createBridge() {
  let listener: ((event: DebugEvent) => void) | undefined;
  const bridge = {
    start: vi.fn(),
    command: vi.fn(),
    getState: vi.fn(),
    setBreakpoints: vi.fn(),
    setPauseOnExceptions: vi.fn(),
    evaluate: vi
      .fn<DebugBridge['evaluate']>()
      .mockResolvedValue({ value: { type: 'number', description: '42' } }),
    properties: vi.fn<DebugBridge['properties']>().mockResolvedValue([
      { name: 'counter', value: { type: 'number', description: '42' } },
      { name: 'child', value: { type: 'object', description: 'Object', objectId: 'child-1' } },
    ]),
    subscribe: vi.fn((next: (event: DebugEvent) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
    emit: (event: DebugEvent) => listener?.(event),
  } satisfies DebugBridge & { emit: (event: DebugEvent) => void };
  return bridge;
}

function props(overrides: Partial<DebuggerPanelProps> = {}): DebuggerPanelProps {
  return {
    state: pausedState,
    bridge: createBridge(),
    breakpoints: [{ path: 'pages/PageMain.ts', line: 7, enabled: true }],
    watches: [],
    pauseOnExceptions: 'uncaught',
    onAction: vi.fn(),
    onStart: vi.fn(),
    onToggleBreakpoint: vi.fn(),
    onUpdateBreakpoint: vi.fn(),
    onRemoveBreakpoint: vi.fn(),
    onClearBreakpoints: vi.fn(),
    onWatchesChange: vi.fn(),
    onExceptionModeChange: vi.fn(),
    onSelectFrame: vi.fn(),
    onNavigateLocation: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (resolve === undefined) throw new Error('Missing resolver');
      resolve(value);
    },
  };
}

describe('DebuggerPanel', () => {
  it('drives real debugger commands and enables actions only in the proper session state', async () => {
    const user = userEvent.setup();
    const initial = props();
    const { rerender } = render(<DebuggerPanel {...initial} />);
    for (const [label, action] of [
      ['Continue', 'resume'],
      ['Step over', 'stepOver'],
      ['Step into', 'stepInto'],
      ['Step out', 'stepOut'],
      ['Restart', 'restart'],
      ['Stop', 'stop'],
    ]) {
      await user.click(screen.getByRole('button', { name: new RegExp(label ?? '') }));
      expect(initial.onAction).toHaveBeenLastCalledWith(action);
    }
    await user.selectOptions(screen.getByRole('combobox', { name: 'Pause on exceptions' }), 'all');
    expect(initial.onExceptionModeChange).toHaveBeenCalledWith('all');
    rerender(
      <DebuggerPanel {...initial} state={{ ...pausedState, status: 'running', frames: [] }} />,
    );
    expect((screen.getByRole('button', { name: 'Step over' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: /Pause$/ }));
    expect(initial.onAction).toHaveBeenLastCalledWith('pause');
    expect(
      (screen.getByRole('textbox', { name: 'Debug console expression' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    rerender(
      <DebuggerPanel
        {...initial}
        state={{ ...pausedState, status: 'idle', sessionId: null, frames: [] }}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Start$/ }));
    expect(initial.onStart).toHaveBeenCalledTimes(1);
  });

  it('navigates frames and sources and edits breakpoint enablement, conditions and removal', async () => {
    const user = userEvent.setup();
    const initial = props();
    render(<DebuggerPanel {...initial} />);
    await user.click(screen.getByRole('button', { name: /dispatchEvent/ }));
    expect(initial.onSelectFrame).toHaveBeenCalledWith(pausedState.frames[1]);
    await user.click(screen.getByRole('button', { name: 'pages/PageMain.ts:7' }));
    expect(initial.onNavigateLocation).toHaveBeenCalledWith({
      path: 'pages/PageMain.ts',
      line: 7,
      column: 1,
    });
    await user.click(
      screen.getByRole('checkbox', { name: 'Enable breakpoint pages/PageMain.ts:7' }),
    );
    expect(initial.onUpdateBreakpoint).toHaveBeenLastCalledWith({
      path: 'pages/PageMain.ts',
      line: 7,
      enabled: false,
    });
    await user.type(
      screen.getByRole('textbox', { name: 'Condition for pages/PageMain.ts:7' }),
      'counter > 2{Enter}',
    );
    expect(initial.onUpdateBreakpoint).toHaveBeenLastCalledWith({
      path: 'pages/PageMain.ts',
      line: 7,
      enabled: true,
      condition: 'counter > 2',
    });
    await user.click(screen.getByRole('button', { name: 'Remove breakpoint pages/PageMain.ts:7' }));
    expect(initial.onRemoveBreakpoint).toHaveBeenCalledWith('pages/PageMain.ts', 7);
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(initial.onClearBreakpoints).toHaveBeenCalledTimes(1);
  });

  it('loads this, scopes and nested object properties on demand', async () => {
    const user = userEvent.setup();
    const bridge = createBridge();
    render(<DebuggerPanel {...props({ bridge })} />);
    expect(bridge.properties).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Expand local' }));
    await screen.findByText('counter');
    expect(bridge.properties).toHaveBeenLastCalledWith({
      sessionId: 'session-1',
      objectId: 'locals-1',
    });
    await user.click(screen.getByRole('button', { name: 'Expand child' }));
    expect(bridge.properties).toHaveBeenLastCalledWith({
      sessionId: 'session-1',
      objectId: 'child-1',
    });
    await user.click(screen.getByRole('button', { name: 'Expand this' }));
    expect(bridge.properties).toHaveBeenLastCalledWith({
      sessionId: 'session-1',
      objectId: 'this-1',
    });
  });

  it('evaluates watches in the selected frame and persists add and remove through the owner', async () => {
    const user = userEvent.setup();
    const bridge = createBridge();
    const initial = props({ bridge, watches: ['counter'], selectedFrameId: 'frame-2' });
    render(<DebuggerPanel {...initial} />);
    await screen.findByText('42');
    expect(bridge.evaluate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      frameId: 'frame-2',
      expression: 'counter',
    });
    await user.type(
      screen.getByRole('textbox', { name: 'New watch expression' }),
      'this.Button1.text{Enter}',
    );
    expect(initial.onWatchesChange).toHaveBeenLastCalledWith(['counter', 'this.Button1.text']);
    await user.click(screen.getByRole('button', { name: 'Remove watch counter' }));
    expect(initial.onWatchesChange).toHaveBeenLastCalledWith([]);
  });

  it('evaluates console expressions, shows exceptions and streams the actual preview console', async () => {
    const user = userEvent.setup();
    const bridge = createBridge();
    const initial = props({ bridge });
    render(<DebuggerPanel {...initial} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Debug console expression' }),
      'counter + 1{Enter}',
    );
    expect(bridge.evaluate).toHaveBeenCalledWith({
      sessionId: 'session-1',
      frameId: 'frame-1',
      expression: 'counter + 1',
    });
    await screen.findByText('42');
    bridge.evaluate.mockResolvedValueOnce({
      value: { type: 'object', description: 'ReferenceError' },
      error: 'Missing is not defined',
    });
    await user.type(
      screen.getByRole('textbox', { name: 'Debug console expression' }),
      'Missing{Enter}',
    );
    await screen.findByText('Missing is not defined');
    act(() =>
      bridge.emit({
        type: 'console',
        level: 'log',
        values: [{ type: 'string', description: 'Preview says hello' }],
      }),
    );
    expect(screen.getByRole('log').textContent).toContain('Preview says hello');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('log').textContent).toBe('');
  });

  it('ignores evaluations and property requests completing after the paused session changes', async () => {
    const user = userEvent.setup();
    const bridge = createBridge();
    const evaluation = deferred<DebugEvaluation>();
    const properties = deferred<readonly DebugVariable[]>();
    bridge.evaluate.mockReturnValue(evaluation.promise);
    bridge.properties.mockReturnValue(properties.promise);
    const initial = props({ bridge, watches: ['counter'] });
    const { rerender } = render(<DebuggerPanel {...initial} />);
    await user.click(screen.getByRole('button', { name: 'Expand local' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Debug console expression' }),
      'counter{Enter}',
    );
    rerender(
      <DebuggerPanel
        {...initial}
        state={{ sessionId: null, status: 'stopped', frames: [], breakpoints: [] }}
      />,
    );
    await act(async () => {
      evaluation.resolve({ value: { type: 'string', description: 'STALE RESULT' } });
      properties.resolve([
        { name: 'STALE PROPERTY', value: { type: 'number', description: '99' } },
      ]);
    });
    expect(screen.queryByText('STALE RESULT')).toBeNull();
    expect(screen.queryByText('STALE PROPERTY')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: /Start$/ })).toBeTruthy());
  });

  it('shows debugger and remote inspection failures as truthful errors', async () => {
    const user = userEvent.setup();
    const bridge = createBridge();
    bridge.properties.mockRejectedValue(new Error('Object is no longer available.'));
    const initial = props({ bridge });
    const { rerender } = render(<DebuggerPanel {...initial} />);
    await user.click(screen.getByRole('button', { name: 'Expand local' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Object is no longer available.');
    rerender(
      <DebuggerPanel
        {...initial}
        state={{ ...pausedState, status: 'error', frames: [], message: 'Debugger attach failed.' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Debugger attach failed.');
  });
});
