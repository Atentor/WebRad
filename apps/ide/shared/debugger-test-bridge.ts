import { vi } from 'vitest';
import type { DebugBridge, DebugState } from './debugger-contracts';

export function createDebugTestBridge(): DebugBridge {
  const idle: DebugState = { sessionId: null, status: 'idle', frames: [], breakpoints: [] };
  return {
    start: vi.fn(async () => ({
      build: { success: true, diagnostics: [] },
      state: { ...idle, sessionId: 'test-debug', status: 'running' as const },
    })),
    command: vi.fn(async () => ({ ...idle, status: 'stopped' as const })),
    getState: vi.fn(async () => idle),
    setBreakpoints: vi.fn(async () => idle),
    setPauseOnExceptions: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({ value: { type: 'undefined', description: 'undefined' } })),
    properties: vi.fn(async () => []),
    subscribe: vi.fn(() => () => undefined),
  };
}
