import type { ReactElement, ReactNode } from 'react';

interface PanelProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, actions, children, className = '' }: PanelProps): ReactElement {
  return (
    <section className={`wr-panel ${className}`}>
      <header className="wr-panel-header">
        <span>{title}</span>
        {actions && <div className="wr-panel-actions">{actions}</div>}
      </header>
      <div className="wr-panel-content">{children}</div>
    </section>
  );
}
