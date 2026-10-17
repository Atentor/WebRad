import type { Bounds } from '@webrad/project-model';
import type { ReactElement } from 'react';
import type { ProblemCounts } from '../editor-problems';

export interface DesignerStatus {
  readonly kind: 'designer';
  readonly name: string;
  readonly bounds?: Bounds;
  readonly zoom: number;
}

export interface CodeStatus {
  readonly kind: 'code';
  readonly line: number;
  readonly column: number;
  readonly selectionLength: number;
}

export interface EmptyStatus {
  readonly kind: 'empty';
}

export type StatusBarStatus = DesignerStatus | CodeStatus | EmptyStatus;

export interface StatusBarProps {
  readonly status: StatusBarStatus;
  readonly dirty: boolean;
  readonly problemCounts: ProblemCounts;
  readonly onShowProblems: () => void;
}

function countLabel(count: number, singular: string): string {
  return `${String(count)} ${count === 1 ? singular : `${singular}s`}`;
}

function problemsLabel(problemCounts: ProblemCounts): string {
  return `Show Problems, ${countLabel(problemCounts.error, 'error')}, ${countLabel(problemCounts.warning, 'warning')}`;
}

export function StatusBar({
  status,
  dirty,
  problemCounts,
  onShowProblems,
}: StatusBarProps): ReactElement {
  const showProblemsLabel = problemsLabel(problemCounts);
  return (
    <footer className="wr-status-bar" aria-label="Application status">
      <span className="wr-status-ready">{dirty ? 'Modified' : 'Ready'}</span>
      <button
        type="button"
        className="wr-status-problems"
        aria-label={showProblemsLabel}
        title={showProblemsLabel}
        onClick={onShowProblems}
      >
        <span className="wr-status-problem wr-status-problem-error" aria-hidden="true">
          <span className="wr-status-problem-glyph">&times;</span>
          {problemCounts.error}
        </span>
        <span className="wr-status-problem wr-status-problem-warning" aria-hidden="true">
          <span className="wr-status-problem-glyph">!</span>
          {problemCounts.warning}
        </span>
      </button>
      {status.kind === 'designer' && (
        <>
          <span className="wr-status-item">{status.name}</span>
          {status.bounds && (
            <span className="wr-status-item wr-status-bounds">
              X: {status.bounds.x}&nbsp; Y: {status.bounds.y}&nbsp; W: {status.bounds.width}&nbsp;
              H: {status.bounds.height}
            </span>
          )}
          <span className="wr-status-spacer" />
          <span className="wr-status-item">Zoom: {status.zoom}%</span>
        </>
      )}
      {status.kind === 'code' && (
        <>
          <span
            className="wr-status-item wr-status-position"
            aria-label={`Line ${String(status.line)}, column ${String(status.column)}`}
          >
            Ln {status.line}, Col {status.column}
          </span>
          {status.selectionLength > 0 && (
            <span className="wr-status-item wr-status-selection">
              {status.selectionLength} selected
            </span>
          )}
          <span className="wr-status-spacer" />
          <span className="wr-status-item">Spaces: 2</span>
          <span className="wr-status-item">LF</span>
          <span className="wr-status-item">TypeScript</span>
        </>
      )}
      {status.kind === 'empty' && <span className="wr-status-spacer" />}
      <span className="wr-status-item">UTF-8</span>
    </footer>
  );
}
