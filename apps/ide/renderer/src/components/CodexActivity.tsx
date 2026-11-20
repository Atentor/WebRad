import { useEffect, useState } from 'react';
import type { CodexProgress } from '../../../shared/codex-contracts';
import { Icon } from './Icon';

/** Activity reflects host/provider events; elapsed time is not an estimated completion percentage. */
export function CodexActivity({ progress, stopping }: { readonly progress: CodexProgress | null; readonly stopping: boolean }) {
  const [started] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const [lastEvent, setLastEvent] = useState(Date.now);
  useEffect(() => { setLastEvent(Date.now()); }, [progress]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  return (
    <div className="wr-codex-activity" aria-label="Codex activity">
      <div className="wr-codex-activity-heading"><Icon name="loader-circle" /><strong>{stopping ? 'Stopping…' : 'Working on your request'}</strong><time aria-label="Elapsed time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</time></div>
      <p role="status">{progress?.message ?? 'Connecting to Codex…'}</p>
      {!stopping && now - lastEvent > 30_000 && <small>No new activity received for {Math.floor((now - lastEvent) / 1000)}s. Codex may still be reasoning; you can stop this request below.</small>}
    </div>
  );
}
