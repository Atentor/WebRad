import { vi } from 'vitest';
import type { UpdateBridge, UpdateState } from './update-contracts';

export function createUpdateTestBridge(): UpdateBridge {
  const state: UpdateState = { status: 'disabled', currentVersion: '0.1.11' };
  return {
    getState: vi.fn(async () => state),
    check: vi.fn(async () => state),
    download: vi.fn(async () => state),
    install: vi.fn(async () => state),
    subscribe: vi.fn(() => () => undefined),
  };
}
