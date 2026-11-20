import type { CodexBridge, CodexStatus } from './codex-contracts';

/** Explicitly disconnected fixture for existing workflows unrelated to Codex. */
export function createCodexTestBridge(): CodexBridge {
  const state: CodexStatus = {
    available: false,
    executablePath: null,
    account: null,
    models: [],
    preferences: { executablePath: null, model: 'gpt-6.1-terra', effort: 'medium' },
    message: 'Codex is outside this test fixture.',
  };
  return {
    readHistory: async () => ({}),
    saveHistory: async () => undefined,
    usage: async () => ({ updatedAt: Date.now(), buckets: [] }),
    onUsageChanged: () => () => undefined,
    status: async () => state,
    chooseExecutable: async () => state,
    preferences: async () => state,
    login: async () => {
      throw new Error(state.message);
    },
    cancelLogin: async () => undefined,
    generate: async () => {
      throw new Error(state.message);
    },
    review: async () => {
      throw new Error(state.message);
    },
    cancel: async () => undefined,
    subscribe: () => () => undefined,
    onAccountChanged: () => () => undefined,
  };
}
