import { createElement, type ReactElement } from 'react';
import { projectIcon } from '@webrad/runtime/icon';

/** The same upstream SVG nodes and attributes used by the browser runtime. */
export function LucideGraphic({
  icon,
  strokeWidth = 2,
  className = 'wr-icon-graphic',
}: {
  readonly icon: string;
  readonly strokeWidth?: number;
  readonly className?: string;
}): ReactElement {
  const state = projectIcon({ icon, strokeWidth });
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={state.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {state.nodes.map(([tag, attributes], index) =>
        createElement(tag, { ...attributes, key: index }),
      )}
    </svg>
  );
}
