import { Icon } from './Icon';
import type { ReactElement, ReactNode } from 'react';
import {
  countEditorProblems,
  isProblemNavigable,
  type EditorProblem,
  type ProblemCategory,
  type ProblemCounts,
} from '../editor-problems';

export interface OutputEntry {
  id: string;
  category: string;
  message: string;
  timestamp: string;
}

export type BottomPanelTab = 'problems' | 'output' | 'build' | 'debug';

export interface BottomPanelProps {
  readonly activeTab: BottomPanelTab;
  readonly problems: readonly EditorProblem[];
  readonly output: readonly OutputEntry[];
  readonly building: boolean;
  readonly debugContent?: ReactNode;
  readonly onActiveTabChange: (tab: BottomPanelTab) => void;
  readonly onProblemActivate: (problem: EditorProblem) => void;
}

const tabs: readonly BottomPanelTab[] = ['problems', 'output', 'build'];

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function problemsAriaLabel(counts: ProblemCounts): string {
  return `Problems, ${countLabel(counts.error, 'error')}, ${countLabel(counts.warning, 'warning')}, ${countLabel(counts.info, 'information', 'information items')}`;
}

function ProblemCount({
  category,
  count,
}: {
  readonly category: ProblemCategory;
  readonly count: number;
}): ReactElement {
  const label =
    category === 'error'
      ? countLabel(count, 'error')
      : category === 'warning'
        ? countLabel(count, 'warning')
        : countLabel(count, 'information', 'information items');
  return (
    <span className={`wr-problem-count wr-problem-count-${category}`} aria-label={label}>
      <span aria-hidden="true">
        <Icon
          name={
            category === 'error' ? 'circle-x' : category === 'warning' ? 'triangle-alert' : 'info'
          }
        />
      </span>
      {count}
    </span>
  );
}

function problemLocation(problem: EditorProblem): string | undefined {
  const location = problem.file ?? problem.resource;
  if (location === undefined) {
    return problem.path === undefined ? undefined : problem.path.map(String).join('.');
  }
  if (problem.range === undefined) return location;
  return `${location}:${String(problem.range.startLineNumber)}:${String(problem.range.startColumn)}`;
}

function problemMetadata(problem: EditorProblem): string {
  const code = problem.code === undefined ? '' : ` ${String(problem.code)}`;
  return `${problem.source}${code}`;
}

function problemAriaLabel(problem: EditorProblem): string {
  const location = problemLocation(problem);
  const category = problem.category[0]?.toUpperCase() + problem.category.slice(1);
  return [category, problem.message, location, problemMetadata(problem)].filter(Boolean).join('. ');
}

function ProblemRow({
  problem,
  onActivate,
}: {
  readonly problem: EditorProblem;
  readonly onActivate: (problem: EditorProblem) => void;
}): ReactElement {
  const location = problemLocation(problem);
  const contents = (
    <>
      <span className="wr-problem-icon" aria-hidden="true">
        <Icon
          name={
            problem.category === 'error'
              ? 'circle-x'
              : problem.category === 'warning'
                ? 'triangle-alert'
                : 'info'
          }
        />
      </span>
      <span className="wr-problem-message">{problem.message}</span>
      <small className="wr-problem-source">{problemMetadata(problem)}</small>
      {location && <small className="wr-problem-location">{location}</small>}
    </>
  );

  return isProblemNavigable(problem) ? (
    <button
      type="button"
      className={`wr-problem wr-problem-${problem.category}`}
      aria-label={problemAriaLabel(problem)}
      onClick={() => onActivate(problem)}
    >
      {contents}
    </button>
  ) : (
    <div className={`wr-problem wr-problem-${problem.category}`}>{contents}</div>
  );
}

function OutputLines({ entries }: { readonly entries: readonly OutputEntry[] }): ReactElement {
  return (
    <div className="wr-output-lines">
      {entries.map((item) => (
        <div className="wr-output-line" key={item.id}>
          <time>{item.timestamp}</time>
          <strong>{item.category}</strong>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

export function BottomPanel({
  activeTab,
  problems,
  output,
  building,
  debugContent,
  onActiveTabChange,
  onProblemActivate,
}: BottomPanelProps): ReactElement {
  const counts = countEditorProblems(problems);
  const buildOutput = output.filter((entry) => entry.category === 'COMPILER');

  return (
    <section className="wr-bottom-panel" aria-label="IDE messages">
      <div className="wr-bottom-tabs" role="tablist" aria-label="Messages">
        {(debugContent === undefined ? tabs : [...tabs, 'debug' as const]).map((tab) => {
          const selected = activeTab === tab;
          return (
            <button
              id={`wr-bottom-tab-${tab}`}
              key={tab}
              type="button"
              role="tab"
              aria-controls={`wr-bottom-panel-${tab}`}
              aria-label={tab === 'problems' ? problemsAriaLabel(counts) : undefined}
              aria-selected={selected}
              className={selected ? 'active' : ''}
              onClick={() => onActiveTabChange(tab)}
            >
              <span>
                {tab === 'debug' ? 'Debugger' : `${tab[0]?.toUpperCase() ?? ''}${tab.slice(1)}`}
              </span>
              {tab === 'problems' && counts.total > 0 && (
                <span className="wr-problem-tab-counts" aria-hidden="true">
                  {counts.error > 0 && <ProblemCount category="error" count={counts.error} />}
                  {counts.warning > 0 && <ProblemCount category="warning" count={counts.warning} />}
                  {counts.info > 0 && <ProblemCount category="info" count={counts.info} />}
                </span>
              )}
              {tab === 'build' && building && (
                <span className="wr-build-tab-running" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`wr-bottom-panel-${activeTab === 'debug' ? 'messages' : activeTab}`}
        className="wr-bottom-content"
        hidden={activeTab === 'debug'}
        role="tabpanel"
        aria-labelledby={`wr-bottom-tab-${activeTab}`}
      >
        {activeTab === 'problems' &&
          (problems.length === 0 ? (
            <div className="wr-empty-state compact">No problems detected.</div>
          ) : (
            <>
              <div className="wr-problems-summary" aria-label={problemsAriaLabel(counts)}>
                <ProblemCount category="error" count={counts.error} />
                <ProblemCount category="warning" count={counts.warning} />
                <ProblemCount category="info" count={counts.info} />
              </div>
              <div className="wr-problem-list">
                {problems.map((problem) => (
                  <ProblemRow key={problem.id} problem={problem} onActivate={onProblemActivate} />
                ))}
              </div>
            </>
          ))}
        {activeTab === 'output' &&
          (output.length === 0 ? (
            <div className="wr-empty-state compact">WebRAD is ready.</div>
          ) : (
            <OutputLines entries={output} />
          ))}
        {activeTab === 'build' && (
          <>
            {building && (
              <div className="wr-build-progress" role="status">
                <span className="wr-spinner" aria-hidden="true" />
                Building the browser application…
              </div>
            )}
            {buildOutput.length > 0 ? (
              <OutputLines entries={buildOutput} />
            ) : (
              !building && <div className="wr-empty-state compact">No build activity yet.</div>
            )}
          </>
        )}
      </div>
      {debugContent !== undefined && (
        <div
          id="wr-bottom-panel-debug"
          className="wr-bottom-content wr-bottom-debug-content"
          role="tabpanel"
          aria-labelledby="wr-bottom-tab-debug"
          hidden={activeTab !== 'debug'}
        >
          {debugContent}
        </div>
      )}
    </section>
  );
}
