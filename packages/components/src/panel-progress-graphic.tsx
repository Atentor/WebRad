import { useLayoutEffect, useRef, type ReactElement } from 'react';
import {
  bindPanelProgressGeometry,
  panelProgressPath,
  projectPanelProgress,
} from '@webrad/runtime/panel-progress';
import type { ComponentNode } from '@webrad/project-model';

function VisiblePanelProgress({
  node,
  value,
}: {
  node: ComponentNode;
  value: number;
}): ReactElement {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (svg === null || host === undefined || host === null) return;
    return bindPanelProgressGeometry(host, svg).dispose;
  }, []);
  const d = panelProgressPath(node.bounds.width, node.bounds.height, [
    [6, 6],
    [6, 6],
    [6, 6],
    [6, 6],
  ]);
  return (
    <svg
      ref={ref}
      className="wr-panel-progress"
      role="progressbar"
      aria-label={`${node.name} progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      viewBox={`0 0 ${node.bounds.width} ${node.bounds.height}`}
      preserveAspectRatio="none"
    >
      <path className="wr-panel-progress-track" d={d} pathLength={100} strokeWidth={3} />
      <path
        className="wr-panel-progress-fill"
        d={d}
        pathLength={100}
        strokeWidth={3}
        strokeDasharray={`${value} 100`}
      />
    </svg>
  );
}

export function PanelProgressGraphic({ node }: { node: ComponentNode }): ReactElement | null {
  const state = projectPanelProgress(node.props);
  return state.visible ? <VisiblePanelProgress node={node} value={state.value} /> : null;
}
