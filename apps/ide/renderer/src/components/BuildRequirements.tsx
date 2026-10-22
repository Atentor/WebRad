import type { ReactElement } from 'react';
import type { NativePrerequisiteReport } from '@webrad/native-build/contracts';
import { Icon } from './Icon';

export function BuildRequirements({
  report,
  checking,
  error,
  disabled,
  onRefresh,
}: {
  readonly report?: NativePrerequisiteReport;
  readonly checking: boolean;
  readonly error?: string;
  readonly disabled: boolean;
  readonly onRefresh: () => void;
}): ReactElement {
  const available = report?.checks.filter((check) => check.status === 'available').length ?? 0;
  const total = report?.checks.length ?? 0;
  const pending = total - available;
  return (
    <section
      className="wr-build-requirements wr-build-card"
      aria-label="Build Requirements"
      aria-busy={checking}
    >
      <div className="wr-build-card-heading">
        <div>
          <h3>Build Requirements</h3>
          <p>Checked on this computer</p>
        </div>
        <button
          type="button"
          className="wr-build-refresh"
          onClick={onRefresh}
          disabled={disabled || checking}
          title="Check build requirements again"
        >
          <Icon name="refresh" />
          <span>Check again</span>
        </button>
      </div>
      <div
        className="wr-build-requirements-summary"
        data-ready={report?.ready === true}
        aria-live="polite"
      >
        <span className="wr-build-requirements-count">
          {checking && !report ? '…' : `${available}/${total}`}
        </span>
        <div>
          <strong>
            {checking
              ? 'Checking requirements…'
              : error
                ? 'Could not check requirements'
                : report?.ready
                  ? 'Requirements met'
                  : `${pending} ${pending === 1 ? 'requirement needs' : 'requirements need'} attention`}
          </strong>
          <span>
            {checking
              ? 'Detecting installed tools and versions.'
              : error
                ? 'Try checking again.'
                : report?.ready
                  ? 'The required tools are available.'
                  : 'Resolve the items below before compiling.'}
          </span>
        </div>
      </div>
      {report && (
        <ul className="wr-build-requirements-list">
          {report.checks.map((check) => (
            <li key={check.id} data-status={check.status}>
              <span
                className="wr-build-requirement-mark"
                aria-label={
                  check.status === 'available'
                    ? 'Requirement met'
                    : check.status === 'unsupported'
                      ? 'Unsupported on this host'
                      : 'Requirement not met'
                }
              >
                <Icon
                  name={
                    check.status === 'available'
                      ? 'check'
                      : check.status === 'unsupported'
                        ? 'minus'
                        : 'close'
                  }
                />
              </span>
              <div className="wr-build-requirement-body">
                <div className="wr-build-requirement-title">
                  <strong>{check.name}</strong>
                  {check.status === 'available' && (
                    <span className="wr-build-requirement-ready">Ready</span>
                  )}
                </div>
                <p>
                  {check.version
                    ? `Detected ${check.version}`
                    : check.status === 'available'
                      ? 'Available'
                      : check.status === 'unsupported'
                        ? 'A compatible build host is required'
                        : 'Not available'}
                  {check.minimumVersion ? ` · Requires ${check.minimumVersion}+` : ''}
                </p>
                {check.status !== 'available' && (
                  <details>
                    <summary>How to resolve</summary>
                    <p>{check.instruction}</p>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="wr-build-check-error" role="alert">
          {error}
        </p>
      )}
      <p className="wr-build-requirements-footnote">
        <Icon name="info" />
        Checks do not install tools. CI export works without a local native toolchain.
      </p>
    </section>
  );
}
