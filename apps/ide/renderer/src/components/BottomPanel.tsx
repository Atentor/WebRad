import { useState, type ReactElement } from 'react';
import type { BuildDiagnostic } from '../../../shared/contracts';

export interface OutputEntry {
  id: string;
  category: string;
  message: string;
  timestamp: string;
}

interface BottomPanelProps {
  diagnostics: readonly BuildDiagnostic[];
  output: readonly OutputEntry[];
}

type BottomTab = 'problems' | 'output' | 'terminal' | 'build';

export function BottomPanel({ diagnostics, output }: BottomPanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<BottomTab>('output');
  const tabs: readonly BottomTab[] = ['problems', 'output', 'terminal', 'build'];

  return (
    <section className="wr-bottom-panel">
      <div className="wr-bottom-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0]?.toUpperCase()}
            {tab.slice(1)}
            {tab === 'problems' && diagnostics.length > 0 ? ` (${diagnostics.length})` : ''}
          </button>
        ))}
      </div>
      <div className="wr-bottom-content">
        {activeTab === 'problems' &&
          (diagnostics.length === 0 ? (
            <div className="wr-empty-state compact">No problems detected.</div>
          ) : (
            diagnostics.map((item, index) => (
              <div
                className={`wr-problem wr-problem-${item.category}`}
                key={`${item.message}-${index}`}
              >
                <span>
                  {item.category === 'error' ? '●' : item.category === 'warning' ? '▲' : '◆'}
                </span>
                <span>{item.message}</span>
                {item.file && <small>{`${item.file}${item.line ? `:${item.line}` : ''}`}</small>}
              </div>
            ))
          ))}
        {activeTab === 'output' &&
          (output.length === 0 ? (
            <div className="wr-empty-state compact">WebRAD is ready.</div>
          ) : (
            output.map((item) => (
              <div className="wr-output-line" key={item.id}>
                <time>{item.timestamp}</time>
                <strong>{item.category}</strong>
                <span>{item.message}</span>
              </div>
            ))
          ))}
        {activeTab === 'terminal' && (
          <div className="wr-empty-state compact">
            The integrated terminal is planned for a later milestone.
          </div>
        )}
        {activeTab === 'build' && (
          <div className="wr-output-line">
            <span>Build diagnostics appear here when F9 runs the compiler pipeline.</span>
          </div>
        )}
      </div>
    </section>
  );
}
