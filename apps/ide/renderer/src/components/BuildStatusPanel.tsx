import { useEffect, useRef, type ReactElement } from 'react';
import type { BuildApplicationController, BuildApplicationState } from '../use-build-application';
import { BUILD_STAGE_LABELS } from '../build-application-labels';
import { Icon } from './Icon';

export function BuildStatusPanel({
  state,
  build,
}: {
  readonly state: BuildApplicationState;
  readonly build: BuildApplicationController;
}): ReactElement {
  const logsRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [state.logs]);
  const label = state.cancelling
    ? 'Cancelling…'
    : state.exportingCi && state.stage === 'completed'
      ? 'CI project exported'
      : BUILD_STAGE_LABELS[state.stage];
  const missing =
    state.result?.prerequisites?.checks.filter((check) => check.status !== 'available').length ?? 0;
  const description =
    state.stage === 'idle'
      ? 'Your build activity and generated files will appear here.'
      : state.stage === 'failed' && missing > 0
        ? `Resolve ${missing} ${missing === 1 ? 'missing requirement' : 'missing requirements'} above, then build again.`
        : (state.error ??
          (state.stage === 'completed'
            ? state.exportingCi
              ? 'The project is ready to build on a compatible CI runner.'
              : 'Your application artifacts are ready.'
            : state.stage === 'cancelled'
              ? 'The build was cancelled. You can start another build.'
              : 'Build output is being captured below.'));
  return (
    <section
      className="wr-build-application-status wr-build-card"
      aria-label="Build Status"
      data-stage={state.stage}
    >
      <div className="wr-build-card-heading">
        <div>
          <h3>Build Status</h3>
          <p role={state.stage === 'failed' || state.error ? 'alert' : undefined}>{description}</p>
        </div>
        <span className="wr-build-status-badge" role="status">
          <Icon
            name={
              state.stage === 'completed'
                ? 'check-circle'
                : state.stage === 'failed'
                  ? 'alert-circle'
                  : state.stage === 'cancelled'
                    ? 'stop'
                    : 'clock'
            }
          />
          {label}
        </span>
      </div>
      {build.busy && <progress aria-label="Build Application progress" />}
      <details className="wr-build-log-disclosure" open={build.busy || undefined}>
        <summary>
          <Icon name="terminal" />
          <span>Build logs</span>
          <span className="wr-build-log-count">
            {state.logs.length} {state.logs.length === 1 ? 'entry' : 'entries'}
          </span>
          <Icon name="chevron-down" />
        </summary>
        <pre
          ref={logsRef}
          className="wr-build-application-logs"
          role="log"
          aria-label="Build logs"
          tabIndex={0}
        >
          {state.logs
            .map(
              (entry) =>
                `[${BUILD_STAGE_LABELS[entry.stage]}${entry.stream === 'stderr' ? ' / stderr' : ''}] ${entry.message ?? ''}`,
            )
            .join('\n') || 'Build logs will appear here.'}
        </pre>
      </details>
      {state.result && state.result.diagnostics.length > 0 && (
        <details className="wr-build-diagnostic-disclosure">
          <summary>
            <Icon name="info" />
            <span>Diagnostics</span>
            <span className="wr-build-log-count">{state.result.diagnostics.length}</span>
            <Icon name="chevron-down" />
          </summary>
          <ul className="wr-build-application-diagnostics">
            {state.result.diagnostics.map((diagnostic, index) => (
              <li key={index} data-category={diagnostic.category}>
                {diagnostic.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {state.result?.success && (
        <div className="wr-build-application-artifacts">
          {state.result.artifacts.map((artifact, index) => (
            <div key={artifact.path} className="wr-project-settings-directory">
              <span className="wr-build-artifact-icon">
                <Icon name="archive" />
              </span>
              <code>{artifact.path}</code>
              <button
                type="button"
                onClick={() => void build.copyArtifact(index)}
                aria-label={
                  state.result?.artifacts.length === 1
                    ? 'Copy Artifact Path'
                    : `Copy Artifact Path ${index + 1}`
                }
              >
                <Icon name="copy" />
                Copy Artifact Path
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
