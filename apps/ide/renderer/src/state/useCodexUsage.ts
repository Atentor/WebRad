import { useEffect, useState } from 'react';
import type { CodexUsage } from '../../../shared/codex-contracts';

/** Refetch canonical snapshots; sparse provider notifications are not full usage records. */
export function useCodexUsage(accountKey: string | null, busy: boolean) {
  const [state, setState] = useState<{ key: string | null; usage: CodexUsage | null; error: string | null }>({ key: null, usage: null, error: null });
  useEffect(() => {
    if (!accountKey) return;
    let alive = true;
    let pending = false;
    let queued = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const refresh = async (): Promise<void> => {
      if (pending) { queued = true; return; }
      pending = true;
      try {
        const usage = await window.webrad.codex.usage();
        if (alive) setState({ key: accountKey, usage, error: null });
      } catch {
        if (alive) setState((previous) => ({ key: accountKey, usage: previous.key === accountKey ? previous.usage : null, error: 'Usage limits could not be refreshed.' }));
      } finally {
        pending = false;
        if (alive && queued) { queued = false; void refresh(); }
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    const unsubscribe = window.webrad.codex.onUsageChanged(() => {
      if (debounce !== undefined) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 1000);
    });
    return () => { alive = false; clearInterval(interval); clearTimeout(debounce); unsubscribe(); };
  }, [accountKey, busy]);
  return state.key === accountKey ? state : { key: accountKey, usage: null, error: null };
}
