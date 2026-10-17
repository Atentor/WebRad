import { describe, expect, it, vi } from 'vitest';
import { DebugSourceMap } from './debugger-source-map';
import { DebugSession } from './debugger-session';
import type { DebugEvent } from '../shared/debugger-contracts';

const map = JSON.stringify({
  version: 3,
  names: [],
  sources: ['pages/PageMain.ts', '__runtime/runtime.ts'],
  sourcesContent: ['', ''],
  mappings: 'AAAA;AACA;ACAA',
});

function fixture() {
  const events: DebugEvent[] = [];
  const send = vi.fn(
    async (method: string, parameters?: Record<string, unknown>): Promise<unknown> => {
      void parameters;
      if (method === 'Debugger.setInstrumentationBreakpoint')
        return { breakpointId: 'instrumentation' };
      if (method === 'Debugger.setBreakpointByUrl')
        return {
          breakpointId: 'breakpoint',
          locations: [{ scriptId: 'app', lineNumber: 1, columnNumber: 0 }],
        };
      if (method === 'Debugger.evaluateOnCallFrame')
        return { result: { type: 'object', description: 'Object', objectId: 'evaluated-object' } };
      if (method === 'Runtime.getProperties')
        return {
          result: [
            { name: 'value', value: { type: 'number', value: 42 } },
            {
              name: 'nested',
              value: { type: 'object', description: 'Object', objectId: 'nested-object' },
            },
            { name: 'lazy', get: { type: 'function', objectId: 'getter' } },
          ],
        };
      return {};
    },
  );
  const session = new DebugSession(
    { send },
    new DebugSourceMap(map, ['pages/PageMain.ts']),
    'webrad-debug://app.js',
    (event) => events.push(event),
  );
  const paused = () =>
    session.onMessage('Debugger.paused', {
      reason: 'other',
      callFrames: [
        {
          callFrameId: 'raw-frame',
          functionName: 'test',
          location: { scriptId: 'app', lineNumber: 1, columnNumber: 0 },
          scopeChain: [{ type: 'local', object: { type: 'object', objectId: 'raw-scope' } }],
          this: { type: 'object', objectId: 'raw-this', description: 'PageMain' },
        },
      ],
    });
  return { session, send, events, paused };
}

describe('Debug source map', () => {
  it('maps authored code in both directions and excludes runtime/generated paths', () => {
    const sourceMap = new DebugSourceMap(map, ['pages/PageMain.ts']);
    expect(sourceMap.original(1, 0)).toEqual({ path: 'pages/PageMain.ts', line: 2, column: 1 });
    expect(sourceMap.original(2, 0)).toBeUndefined();
    expect(sourceMap.generated('pages\\PageMain.ts', 2)).toMatchObject({
      generatedLine: 1,
      generatedColumn: 0,
    });
    expect(sourceMap.generated('pages/PageMain.ts', 10)).toBeUndefined();
  });
});

describe('Debug session CDP and security', () => {
  it('guards automatic hover evaluation against side effects without restricting the console', async () => {
    const { session, send, paused } = fixture();
    await session.initialize([], 'none');
    await paused();
    const frame = session.getState().frames[0]!;
    await session.evaluate(session.id, frame.id, 'value', true);
    expect(send).toHaveBeenLastCalledWith(
      'Debugger.evaluateOnCallFrame',
      expect.objectContaining({
        throwOnSideEffect: true,
        expression: 'value',
        silent: true,
        timeout: 500,
      }),
    );
    await session.evaluate(session.id, frame.id, 'value = 2');
    expect(send).toHaveBeenLastCalledWith(
      'Debugger.evaluateOnCallFrame',
      expect.objectContaining({ throwOnSideEffect: false }),
    );
  });
  it('exposes prototype and private fields through opaque handles for component inspection', async () => {
    const { session, send, paused } = fixture();
    await session.initialize([], 'none');
    await paused();
    const frame = session.getState().frames[0]!;
    send.mockResolvedValueOnce({
      result: [],
      privateProperties: [{ name: '#state', value: { type: 'number', value: 4 } }],
      internalProperties: [
        {
          name: '[[Prototype]]',
          value: { type: 'object', objectId: 'raw-prototype', description: 'WebComponent' },
        },
      ],
    });
    const variables = await session.properties(session.id, frame.thisValue.objectId!);
    expect(variables[0]).toEqual({
      name: '#state',
      value: { type: 'number', description: '4', objectId: undefined },
    });
    expect(variables[1]?.value.objectId).toBeDefined();
    expect(variables[1]?.value.objectId).not.toBe('raw-prototype');
    await session.properties(session.id, variables[1]!.value.objectId!);
    expect(send).toHaveBeenLastCalledWith('Runtime.getProperties', {
      objectId: 'raw-prototype',
      ownProperties: true,
      generatePreview: true,
    });
  });

  it('skips generated runtime ranges when stepping and automatically leaves generated caller frames', async () => {
    const { session, send, paused } = fixture();
    await session.initialize([], 'none');
    await session.onMessage('Debugger.scriptParsed', {
      scriptId: 'app',
      url: 'webrad-debug://app.js',
      hasSourceURL: true,
      startLine: 5,
      startColumn: 8,
      endLine: 8,
      endColumn: 0,
    });
    await paused();
    await session.command('stepInto');
    expect(send).toHaveBeenLastCalledWith('Debugger.stepInto', {
      skipList: [
        {
          scriptId: 'app',
          start: { lineNumber: 2, columnNumber: 0 },
          end: { lineNumber: 3, columnNumber: 0 },
        },
      ],
    });
    await session.onMessage('Debugger.paused', {
      reason: 'step',
      data: { auxiliary: true },
      callFrames: [
        {
          callFrameId: 'generated',
          functionName: 'dispatch',
          location: { scriptId: 'app', lineNumber: 2 },
          scopeChain: [],
          this: { type: 'undefined' },
        },
      ],
    });
    expect(send).toHaveBeenLastCalledWith('Debugger.stepOut');
    expect(session.getState().status).toBe('running');
    await paused();
    expect(session.getState().status).toBe('paused');
  });

  it('installs conditional breakpoints before execution and handles sourceURL coordinates', async () => {
    const { session, send } = fixture();
    const breakpoints = [
      { path: 'pages/PageMain.ts', line: 2, enabled: true, condition: 'count === 1' },
    ];
    await session.initialize(breakpoints, 'uncaught');
    expect(send).toHaveBeenCalledWith('Debugger.setPauseOnExceptions', { state: 'uncaught' });
    expect(send).toHaveBeenCalledWith('Debugger.setBreakpointByUrl', {
      url: 'webrad-debug://app.js',
      lineNumber: 1,
      columnNumber: 0,
      condition: 'count === 1',
    });
    await session.onMessage('Debugger.scriptParsed', {
      scriptId: 'app',
      url: 'webrad-debug://app.js',
      startLine: 30,
      startColumn: 10,
      hasSourceURL: true,
    });
    await session.onMessage('Debugger.paused', {
      reason: 'instrumentation',
      data: { scriptId: 'app' },
    });
    expect(send).toHaveBeenLastCalledWith('Debugger.resume');
    expect(session.getState().status).toBe('running');
    const setCalls = send.mock.calls.filter(([method]) => method === 'Debugger.setBreakpointByUrl');
    expect(setCalls).toHaveLength(2);
    expect(setCalls[1]?.[1]).toMatchObject({ lineNumber: 1 });
  });

  it('issues opaque pause scoped frames/objects and expands properties without invoking getters', async () => {
    const { session, send, paused } = fixture();
    await session.initialize([], 'none');
    await session.onMessage('Debugger.scriptParsed', {
      scriptId: 'app',
      url: 'webrad-debug://app.js',
    });
    await paused();
    const frame = session.getState().frames[0]!;
    expect(frame.id).not.toBe('raw-frame');
    expect(frame.location).toEqual({ path: 'pages/PageMain.ts', line: 2, column: 1 });
    expect(frame.scopes[0]?.objectId).not.toBe('raw-scope');
    await expect(session.evaluate(session.id, 'raw-frame', '1')).rejects.toThrow(
      'Unknown or expired',
    );
    await expect(session.properties(session.id, 'raw-scope')).rejects.toThrow('Unknown or expired');
    await expect(session.evaluate('other-session', frame.id, '1')).rejects.toThrow(
      'current paused session',
    );
    const evaluated = await session.evaluate(session.id, frame.id, 'this');
    const properties = await session.properties(session.id, evaluated.value.objectId!);
    expect(properties).toMatchObject([
      { name: 'value', value: { description: '42' } },
      { name: 'nested', value: { type: 'object' } },
      { name: 'lazy', value: { type: 'accessor', description: '[Getter]' } },
    ]);
    expect(send).toHaveBeenCalledWith('Runtime.getProperties', {
      objectId: 'evaluated-object',
      ownProperties: true,
      generatePreview: true,
    });
    await session.command('stepOver');
    expect(send).toHaveBeenLastCalledWith('Debugger.stepOver', { skipList: [] });
    await expect(session.properties(session.id, evaluated.value.objectId!)).rejects.toThrow(
      'current paused session',
    );
    await paused();
    await expect(session.properties(session.id, evaluated.value.objectId!)).rejects.toThrow(
      'Unknown or expired',
    );
  });

  it('rejects evaluation completing after resume and reports console without granting object capabilities', async () => {
    const { session, send, events, paused } = fixture();
    await session.initialize([], 'none');
    await paused();
    let resolve!: (value: unknown) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = session.evaluate(session.id, session.getState().frames[0]!.id, 'this');
    await session.onMessage('Debugger.resumed', {});
    resolve({ result: { type: 'object', objectId: 'late-object' } });
    await expect(pending).rejects.toThrow('current paused session');
    await session.onMessage('Runtime.consoleAPICalled', {
      type: 'log',
      args: [{ type: 'object', objectId: 'console-object', description: 'Object' }],
    });
    expect(events.at(-1)).toEqual({
      type: 'console',
      level: 'log',
      values: [{ type: 'object', description: 'Object', objectId: undefined }],
    });
  });

  it('keeps invalid/disabled breakpoints unverified and validates command lifecycle', async () => {
    const { session, send } = fixture();
    await session.initialize(
      [
        { path: 'pages/PageMain.ts', line: 50, enabled: true },
        { path: 'pages/PageMain.ts', line: 2, enabled: false },
      ],
      'all',
    );
    expect(session.getState().breakpoints.map((entry) => entry.verified)).toEqual([false, false]);
    expect(send.mock.calls.some(([method]) => method === 'Debugger.setBreakpointByUrl')).toBe(
      false,
    );
    await expect(session.command('stepInto')).rejects.toThrow('must be paused');
    await session.command('pause');
    expect(send).toHaveBeenLastCalledWith('Debugger.pause');
    session.stopped('closed');
    await session.onMessage('Debugger.resumed', {});
    expect(session.getState()).toMatchObject({ status: 'stopped', frames: [], message: 'closed' });
  });
});
