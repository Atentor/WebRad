import type { CodexUsage as Usage, CodexUsageWindow } from '../../../shared/codex-contracts';

function UsageBar({
  label,
  window,
}: {
  readonly label: string;
  readonly window: CodexUsageWindow | null;
}) {
  const percent = window ? Math.max(0, Math.min(100, window.usedPercent)) : null;
  const reset = window?.resetsAt ? new Date(window.resetsAt * 1000) : null;
  const resetHint =
    reset && Number.isFinite(reset.getTime()) ? `Resets ${reset.toLocaleString()}` : undefined;
  return (
    <div className="wr-codex-usage-window" title={resetHint}>
      <div>
        <span>{label}</span>
        <strong>{percent === null ? 'Unavailable' : `${Math.round(percent)}% used`}</strong>
      </div>
      {percent === null ? (
        <div className="wr-codex-usage-track is-unavailable" />
      ) : (
        <div
          className={`wr-codex-usage-track${percent >= 90 ? ' is-high' : ''}`}
          role="progressbar"
          aria-label={`${label} limit used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

export function CodexUsage({
  usage,
  error,
  model,
  connected,
}: {
  readonly usage: Usage | null;
  readonly error: string | null;
  readonly model: string;
  readonly connected: boolean;
}) {
  const bucket =
    usage?.buckets.find((item) => item.model === model) ??
    usage?.buckets.find((item) => item.id === 'codex') ??
    (usage?.buckets.length === 1 ? usage.buckets[0] : undefined);
  return (
    <section className="wr-codex-usage" aria-label="Codex usage limits">
      <div className="wr-codex-usage-bars">
        <UsageBar label="5 hours" window={bucket?.fiveHour ?? null} />
        <UsageBar label="Weekly" window={bucket?.weekly ?? null} />
      </div>
      <p title={usage ? `Last updated ${new Date(usage.updatedAt).toLocaleString()}` : undefined}>
        {!connected
          ? 'Connect your account to view limits.'
          : error
            ? `${error}${usage ? ' Showing the last received snapshot.' : ''}`
            : bucket
              ? `Reported by Codex · ${bucket.name}`
              : 'Codex has not provided these limits.'}
      </p>
    </section>
  );
}
