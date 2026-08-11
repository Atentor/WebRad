import type { Bounds } from '@webrad/project-model';
import type { ReactElement } from 'react';

interface DesignerStatus {
  kind: 'designer';
  name: string;
  bounds?: Bounds;
  zoom: number;
}

interface CodeStatus {
  kind: 'code';
  line: number;
  column: number;
}

interface EmptyStatus {
  kind: 'empty';
}

interface StatusBarProps {
  status: DesignerStatus | CodeStatus | EmptyStatus;
  dirty: boolean;
}

export function StatusBar({ status, dirty }: StatusBarProps): ReactElement {
  return (
    <footer className="wr-status-bar">
      <span className="wr-status-ready">{dirty ? 'Modified' : 'Ready'}</span>
      {status.kind === 'designer' && (
        <>
          <span>{status.name}</span>
          {status.bounds && (
            <>
              <span>X: {status.bounds.x}</span>
              <span>Y: {status.bounds.y}</span>
              <span>W: {status.bounds.width}</span>
              <span>H: {status.bounds.height}</span>
            </>
          )}
          <span className="wr-status-spacer" />
          <span>Zoom: {status.zoom}%</span>
        </>
      )}
      {status.kind === 'code' && (
        <>
          <span>Ln {status.line}</span>
          <span>Col {status.column}</span>
          <span className="wr-status-spacer" />
          <span>TypeScript</span>
        </>
      )}
      {status.kind === 'empty' && <span className="wr-status-spacer" />}
      <span>UTF-8</span>
    </footer>
  );
}
