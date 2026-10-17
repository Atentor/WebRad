import { createElement, type ReactElement } from 'react';
import type { ProgressBarProjection } from '@webrad/runtime/progress-bar';

export function ProgressBarGraphic({
  state,
}: {
  readonly state: ProgressBarProjection;
}): ReactElement {
  return (
    <>
      <svg
        className="wr-progress-graphic"
        viewBox="0 0 100 100"
        preserveAspectRatio={state.format === 'bars' ? 'none' : 'xMidYMid meet'}
        aria-hidden="true"
      >
        {state.shapes.map((shape, index) => {
          const {
            class: className,
            'stroke-dasharray': strokeDasharray,
            ...attributes
          } = shape.attributes;
          return createElement(shape.tag, {
            ...attributes,
            className,
            strokeDasharray,
            key: index,
          });
        })}
      </svg>
      <span className="wr-progress-label" aria-hidden="true" hidden={!state.showValue}>
        {state.label}
      </span>
    </>
  );
}
