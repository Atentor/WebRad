import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  DebugAction,
  DebugBreakpoint,
  DebugEvaluation,
  DebugEvent,
  DebugExceptionMode,
  DebugFrame,
  DebugState,
  DebugValue,
  DebugVariable,
  ResolvedDebugBreakpoint,
} from '../shared/debugger-contracts';
import { type DebugSourceMap, portableDebugPath } from './debugger-source-map';

export interface DebugTransport {
  send(method: string, parameters?: Record<string, unknown>): Promise<unknown>;
}

const remoteObjectSchema = z.object({
  type: z.string(),
  subtype: z.string().optional(),
  description: z.string().optional(),
  value: z.unknown().optional(),
  unserializableValue: z.string().optional(),
  objectId: z.string().optional(),
});
type RemoteObject = z.infer<typeof remoteObjectSchema>;
const locationSchema = z.object({
  scriptId: z.string(),
  lineNumber: z.number().int().nonnegative(),
  columnNumber: z.number().int().nonnegative().default(0),
});
const frameSchema = z.object({
  callFrameId: z.string(),
  functionName: z.string(),
  location: locationSchema,
  scopeChain: z.array(
    z.object({ type: z.string(), name: z.string().optional(), object: remoteObjectSchema }),
  ),
  this: remoteObjectSchema,
});
const pausedSchema = z.object({
  reason: z.string(),
  callFrames: z.array(frameSchema),
  data: z.unknown().optional(),
});

/** A session owns CDP identifiers; renderer-visible handles are opaque and pause scoped. */
export class DebugSession {
  readonly id = randomUUID();
  private state: DebugState;
  private readonly frames = new Map<string, string>();
  private readonly objects = new Map<string, string>();
  private readonly objectHandles = new Map<string, string>();
  private readonly breakpointIds = new Map<string, number>();
  private readonly scriptIds = new Set<string>();
  private readonly scriptEnds = new Map<string, { lineNumber: number; columnNumber: number }>();
  private stepping = false;
  private scriptStart = { line: 0, column: 0 };
  private instrumentationId: string | undefined;
  private authoredBreakpoints: readonly DebugBreakpoint[] = [];
  private revision = 0;
  private breakpointQueue = Promise.resolve();

  constructor(
    private readonly transport: DebugTransport,
    private readonly sourceMap: DebugSourceMap,
    private readonly scriptUrl: string,
    private readonly emit: (event: DebugEvent) => void,
  ) {
    this.state = { sessionId: this.id, status: 'starting', frames: [], breakpoints: [] };
  }

  getState(): DebugState {
    return this.state;
  }

  private update(patch: Partial<DebugState>): void {
    this.state = { ...this.state, ...patch };
    this.emit({ type: 'state', state: this.state });
  }

  private clearPause(): void {
    if (this.objects.size > 0)
      void this.transport
        .send('Runtime.releaseObjectGroup', { objectGroup: `webrad-${this.id}` })
        .catch(() => undefined);
    this.revision++;
    this.frames.clear();
    this.objects.clear();
    this.objectHandles.clear();
  }

  async initialize(
    breakpoints: readonly DebugBreakpoint[],
    mode: DebugExceptionMode,
  ): Promise<void> {
    await this.transport.send('Runtime.enable');
    await this.transport.send('Debugger.enable');
    await this.transport.send('Debugger.setAsyncCallStackDepth', { maxDepth: 16 });
    this.instrumentationId = z.object({ breakpointId: z.string() }).parse(
      await this.transport.send('Debugger.setInstrumentationBreakpoint', {
        instrumentation: 'beforeScriptExecution',
      }),
    ).breakpointId;
    await this.setPauseOnExceptions(mode);
    await this.setBreakpoints(breakpoints);
    this.update({ status: 'running' });
  }

  async setPauseOnExceptions(mode: DebugExceptionMode): Promise<void> {
    await this.transport.send('Debugger.setPauseOnExceptions', { state: mode });
  }

  setBreakpoints(breakpoints: readonly DebugBreakpoint[]): Promise<DebugState> {
    const operation = this.breakpointQueue.then(() => this.installBreakpoints(breakpoints));
    this.breakpointQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async installBreakpoints(breakpoints: readonly DebugBreakpoint[]): Promise<DebugState> {
    this.authoredBreakpoints = breakpoints;
    for (const breakpointId of this.breakpointIds.keys()) {
      await this.transport.send('Debugger.removeBreakpoint', { breakpointId });
    }
    this.breakpointIds.clear();
    const resolved: ResolvedDebugBreakpoint[] = [];
    for (const breakpoint of breakpoints) {
      if (!breakpoint.enabled) {
        resolved.push({ ...breakpoint, verified: false, message: 'Breakpoint disabled.' });
        continue;
      }
      const position = this.sourceMap.generated(
        breakpoint.path,
        breakpoint.line,
        breakpoint.column,
      );
      if (position === undefined) {
        resolved.push({
          ...breakpoint,
          verified: false,
          message: 'No executable code on this line.',
        });
        continue;
      }
      try {
        const result = z
          .object({ breakpointId: z.string(), locations: z.array(locationSchema) })
          .parse(
            await this.transport.send('Debugger.setBreakpointByUrl', {
              url: this.scriptUrl,
              lineNumber: position.generatedLine + this.scriptStart.line,
              columnNumber:
                position.generatedColumn +
                (position.generatedLine === 0 ? this.scriptStart.column : 0),
              condition: breakpoint.condition ?? '',
            }),
          );
        const actual = result.locations[0];
        const original =
          actual === undefined
            ? undefined
            : this.originalLocation(actual.lineNumber, actual.columnNumber);
        const matchesSource =
          original !== undefined &&
          portableDebugPath(original.path) === portableDebugPath(breakpoint.path);
        if (actual !== undefined && !matchesSource)
          await this.transport.send('Debugger.removeBreakpoint', {
            breakpointId: result.breakpointId,
          });
        else this.breakpointIds.set(result.breakpointId, resolved.length);
        resolved.push({
          ...breakpoint,
          verified: matchesSource,
          actualLine: original?.line ?? position.line,
          message:
            actual === undefined
              ? 'Waiting for the application script.'
              : matchesSource
                ? undefined
                : 'No executable authored code at the resolved location.',
        });
      } catch (error) {
        resolved.push({
          ...breakpoint,
          verified: false,
          message: error instanceof Error ? error.message : 'Unable to set breakpoint.',
        });
      }
    }
    this.update({ breakpoints: resolved });
    return this.state;
  }

  private value(remote: RemoteObject, allowHandle: boolean): DebugValue {
    let objectId: string | undefined;
    if (allowHandle && remote.objectId !== undefined) {
      objectId = this.objectHandles.get(remote.objectId);
      if (objectId === undefined) {
        objectId = randomUUID();
        this.objectHandles.set(remote.objectId, objectId);
        this.objects.set(objectId, remote.objectId);
      }
    }
    const description =
      remote.unserializableValue ??
      remote.description ??
      (remote.type === 'undefined' ? 'undefined' : (JSON.stringify(remote.value) ?? remote.type));
    return {
      type: remote.subtype ?? remote.type,
      description: description.slice(0, 10000),
      objectId,
    };
  }

  private originalLocation(lineNumber: number, columnNumber: number) {
    return this.sourceMap.original(
      lineNumber - this.scriptStart.line,
      columnNumber - (lineNumber === this.scriptStart.line ? this.scriptStart.column : 0),
    );
  }

  async onMessage(method: string, input: unknown): Promise<void> {
    if (this.state.status === 'stopped' || this.state.status === 'error') return;
    if (method === 'Debugger.scriptParsed') {
      const parsed = z
        .object({
          scriptId: z.string(),
          url: z.string(),
          hasSourceURL: z.boolean().default(true),
          startLine: z.number().int().nonnegative().default(0),
          startColumn: z.number().int().nonnegative().default(0),
          endLine: z.number().int().nonnegative().optional(),
          endColumn: z.number().int().nonnegative().optional(),
        })
        .safeParse(input);
      if (parsed.success && parsed.data.url === this.scriptUrl) {
        this.scriptIds.add(parsed.data.scriptId);
        if (parsed.data.endLine !== undefined)
          this.scriptEnds.set(parsed.data.scriptId, {
            lineNumber: parsed.data.endLine - parsed.data.startLine,
            columnNumber: parsed.data.endColumn ?? 0,
          });
        // Chromium uses script-relative coordinates when //# sourceURL is present.
        this.scriptStart = parsed.data.hasSourceURL
          ? { line: 0, column: 0 }
          : { line: parsed.data.startLine, column: parsed.data.startColumn };
      }
    } else if (method === 'Debugger.breakpointResolved') {
      const parsed = z
        .object({ breakpointId: z.string(), location: locationSchema })
        .safeParse(input);
      if (!parsed.success) return;
      const index = this.breakpointIds.get(parsed.data.breakpointId);
      if (index === undefined) return;
      const location = this.originalLocation(
        parsed.data.location.lineNumber,
        parsed.data.location.columnNumber,
      );
      const breakpoint = this.state.breakpoints[index];
      if (breakpoint === undefined) return;
      const matchesSource =
        location !== undefined &&
        portableDebugPath(location.path) === portableDebugPath(breakpoint.path);
      if (!matchesSource) {
        this.breakpointIds.delete(parsed.data.breakpointId);
        await this.transport.send('Debugger.removeBreakpoint', {
          breakpointId: parsed.data.breakpointId,
        });
      }
      this.update({
        breakpoints: this.state.breakpoints.map((entry, i) =>
          i === index
            ? {
                ...entry,
                verified: matchesSource,
                actualLine: location?.line ?? entry.actualLine,
                message: matchesSource
                  ? undefined
                  : 'No executable authored code at the resolved location.',
              }
            : entry,
        ),
      });
    } else if (method === 'Debugger.paused') {
      const instrumentation = z
        .object({ reason: z.literal('instrumentation'), data: z.object({ scriptId: z.string() }) })
        .safeParse(input);
      if (instrumentation.success && this.instrumentationId !== undefined) {
        if (this.scriptIds.has(instrumentation.data.data.scriptId)) {
          await this.setBreakpoints(this.authoredBreakpoints);
          await this.transport.send('Debugger.removeBreakpoint', {
            breakpointId: this.instrumentationId,
          });
          this.instrumentationId = undefined;
        }
        await this.transport.send('Debugger.resume');
        return;
      }
      const parsed = pausedSchema.safeParse(input);
      if (!parsed.success) return;
      const top = parsed.data.callFrames[0];
      if (
        this.stepping &&
        top !== undefined &&
        parsed.data.reason !== 'exception' &&
        parsed.data.reason !== 'promiseRejection' &&
        (!this.scriptIds.has(top.location.scriptId) ||
          this.originalLocation(top.location.lineNumber, top.location.columnNumber) === undefined)
      ) {
        await this.transport.send('Debugger.stepOut');
        return;
      }
      this.stepping = false;
      this.clearPause();
      const exception = remoteObjectSchema.safeParse(parsed.data.data);
      const frames: DebugFrame[] = parsed.data.callFrames.map((frame) => {
        const id = randomUUID();
        this.frames.set(id, frame.callFrameId);
        return {
          id,
          name: frame.functionName || '(anonymous)',
          location: this.scriptIds.has(frame.location.scriptId)
            ? this.originalLocation(frame.location.lineNumber, frame.location.columnNumber)
            : undefined,
          scopes: frame.scopeChain.flatMap((scope) => {
            const objectId = this.value(scope.object, true).objectId;
            return objectId === undefined ? [] : [{ type: scope.type, name: scope.name, objectId }];
          }),
          thisValue: this.value(frame.this, true),
        };
      });
      this.update({
        status: 'paused',
        frames,
        reason: parsed.data.reason,
        exception: exception.success ? this.value(exception.data, true) : undefined,
        message: undefined,
      });
    } else if (method === 'Debugger.resumed') {
      this.clearPause();
      this.update({ status: 'running', frames: [], reason: undefined, exception: undefined });
    } else if (method === 'Runtime.consoleAPICalled') {
      const parsed = z
        .object({ type: z.string(), args: z.array(remoteObjectSchema) })
        .safeParse(input);
      if (parsed.success)
        this.emit({
          type: 'console',
          level: parsed.data.type,
          values: parsed.data.args.map((entry) => this.value(entry, false)),
        });
    } else if (method === 'Runtime.exceptionThrown') {
      const parsed = z
        .object({
          exceptionDetails: z.object({
            text: z.string(),
            exception: remoteObjectSchema.optional(),
          }),
        })
        .safeParse(input);
      if (parsed.success)
        this.emit({
          type: 'console',
          level: 'error',
          values: [
            parsed.data.exceptionDetails.exception === undefined
              ? { type: 'string', description: parsed.data.exceptionDetails.text }
              : this.value(parsed.data.exceptionDetails.exception, false),
          ],
        });
    }
  }

  async command(action: Exclude<DebugAction, 'stop' | 'restart'>): Promise<DebugState> {
    if (action === 'pause') {
      if (this.state.status !== 'running') throw new Error('The application is not running.');
      await this.transport.send('Debugger.pause');
    } else {
      if (this.state.status !== 'paused') throw new Error('The application must be paused.');
      // Invalidate renderer capabilities before any asynchronous resume or step operation.
      this.clearPause();
      this.stepping = action !== 'resume';
      this.update({ status: 'running', frames: [], reason: undefined, exception: undefined });
      const skipList =
        action === 'stepOver' || action === 'stepInto'
          ? [...this.scriptIds].flatMap((scriptId) => {
              const end = this.scriptEnds.get(scriptId);
              const positions = this.sourceMap.blackboxedPositions;
              return positions.flatMap((start, index) => {
                if (index % 2 !== 0) return [];
                const rangeEnd = positions[index + 1] ?? end;
                return rangeEnd === undefined ? [] : [{ scriptId, start, end: rangeEnd }];
              });
            })
          : undefined;
      await this.transport.send(
        `Debugger.${action}`,
        skipList === undefined ? undefined : { skipList },
      );
    }
    return this.state;
  }

  private requirePause(sessionId: string): number {
    if (sessionId !== this.id || this.state.status !== 'paused')
      throw new Error('The debug request does not belong to the current paused session.');
    return this.revision;
  }

  async evaluate(
    sessionId: string,
    frameId: string,
    expression: string,
    throwOnSideEffect = false,
  ): Promise<DebugEvaluation> {
    const revision = this.requirePause(sessionId);
    const callFrameId = this.frames.get(frameId);
    if (callFrameId === undefined) throw new Error('Unknown or expired debug frame.');
    const result = z
      .object({
        result: remoteObjectSchema,
        exceptionDetails: z
          .object({ text: z.string(), exception: remoteObjectSchema.optional() })
          .optional(),
      })
      .parse(
        await this.transport.send('Debugger.evaluateOnCallFrame', {
          callFrameId,
          expression,
          objectGroup: `webrad-${this.id}`,
          generatePreview: true,
          includeCommandLineAPI: false,
          silent: true,
          returnByValue: false,
          throwOnSideEffect,
          ...(throwOnSideEffect ? { timeout: 500 } : {}),
        }),
      );
    if (revision !== this.requirePause(sessionId))
      throw new Error('The application resumed during evaluation.');
    return {
      value: this.value(result.result, true),
      error: result.exceptionDetails?.exception?.description ?? result.exceptionDetails?.text,
    };
  }

  async properties(sessionId: string, objectId: string): Promise<readonly DebugVariable[]> {
    const revision = this.requirePause(sessionId);
    const remoteId = this.objects.get(objectId);
    if (remoteId === undefined) throw new Error('Unknown or expired debug object.');
    const result = z
      .object({
        result: z.array(
          z.object({
            name: z.string(),
            value: remoteObjectSchema.optional(),
            get: remoteObjectSchema.optional(),
            set: remoteObjectSchema.optional(),
            wasThrown: z.boolean().optional(),
          }),
        ),
        internalProperties: z
          .array(z.object({ name: z.string(), value: remoteObjectSchema.optional() }))
          .optional(),
        privateProperties: z
          .array(
            z.object({
              name: z.string(),
              value: remoteObjectSchema.optional(),
              get: remoteObjectSchema.optional(),
              set: remoteObjectSchema.optional(),
            }),
          )
          .optional(),
        exceptionDetails: z.unknown().optional(),
      })
      .parse(
        await this.transport.send('Runtime.getProperties', {
          objectId: remoteId,
          ownProperties: true,
          generatePreview: true,
        }),
      );
    if (revision !== this.requirePause(sessionId))
      throw new Error('The application resumed while reading variables.');
    if (result.exceptionDetails !== undefined)
      throw new Error('Unable to read debug object properties.');
    return [
      ...result.result,
      ...(result.privateProperties ?? []),
      ...(result.internalProperties ?? []),
    ]
      .slice(0, 2000)
      .map((entry) => ({
        name: entry.name,
        value:
          entry.value === undefined
            ? {
                type: 'accessor',
                description: !('get' in entry) || entry.get === undefined ? '[Setter]' : '[Getter]',
              }
            : this.value(entry.value, true),
      }));
  }

  stopped(message?: string, error = false): void {
    this.stepping = false;
    this.clearPause();
    this.update({
      status: error ? 'error' : 'stopped',
      frames: [],
      reason: undefined,
      exception: undefined,
      message,
    });
  }
}
