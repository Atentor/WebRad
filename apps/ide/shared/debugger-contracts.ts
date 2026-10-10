import type { BuildRequest, BuildResponse } from './contracts';

export interface DebugBreakpoint {
  readonly path: string;
  readonly line: number;
  readonly column?: number;
  readonly enabled: boolean;
  readonly condition?: string;
}

export interface ResolvedDebugBreakpoint extends DebugBreakpoint {
  readonly verified: boolean;
  readonly actualLine?: number;
  readonly message?: string;
}

export interface DebugLocation {
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

export interface DebugValue {
  readonly type: string;
  readonly description: string;
  readonly objectId?: string;
}

export interface DebugVariable {
  readonly name: string;
  readonly value: DebugValue;
}

export interface DebugScope {
  readonly type: string;
  readonly name?: string;
  readonly objectId: string;
}

export interface DebugFrame {
  readonly id: string;
  readonly name: string;
  readonly location?: DebugLocation;
  readonly scopes: readonly DebugScope[];
  readonly thisValue: DebugValue;
}

export type DebugExceptionMode = 'none' | 'uncaught' | 'all';
export type DebugAction =
  'pause' | 'resume' | 'stepOver' | 'stepInto' | 'stepOut' | 'stop' | 'restart';

export interface DebugState {
  readonly sessionId: string | null;
  readonly status: 'idle' | 'starting' | 'running' | 'paused' | 'stopped' | 'error';
  readonly frames: readonly DebugFrame[];
  readonly breakpoints: readonly ResolvedDebugBreakpoint[];
  readonly reason?: string;
  readonly message?: string;
  readonly exception?: DebugValue;
}

export type DebugEvent =
  | { readonly type: 'state'; readonly state: DebugState }
  | { readonly type: 'console'; readonly level: string; readonly values: readonly DebugValue[] };

export interface DebugStartRequest extends BuildRequest {
  readonly breakpoints: readonly DebugBreakpoint[];
  readonly pauseOnExceptions: DebugExceptionMode;
}

export interface DebugStartResponse {
  readonly build: BuildResponse;
  readonly state: DebugState;
}

export interface DebugEvaluation {
  readonly value: DebugValue;
  readonly error?: string;
}

export interface DebugBridge {
  start(request: DebugStartRequest): Promise<DebugStartResponse>;
  command(action: DebugAction): Promise<DebugState>;
  getState(): Promise<DebugState>;
  setBreakpoints(breakpoints: readonly DebugBreakpoint[]): Promise<DebugState>;
  setPauseOnExceptions(mode: DebugExceptionMode): Promise<void>;
  evaluate(request: {
    sessionId: string;
    frameId: string;
    expression: string;
    /** Automatic inspection must reject evaluations with side effects. */
    throwOnSideEffect?: boolean;
  }): Promise<DebugEvaluation>;
  properties(request: { sessionId: string; objectId: string }): Promise<readonly DebugVariable[]>;
  subscribe(listener: (event: DebugEvent) => void): () => void;
}
