import {
  getWebRadIconShapes,
  type WebRadIconName,
  type WebRadIconShape,
} from '@webrad/runtime/icons';
import type { ReactElement } from 'react';

type IconName = WebRadIconName;

interface IconProps {
  readonly name: IconName;
  readonly className?: string;
}

function IconShape({ name }: Pick<IconProps, 'name'>): ReactElement {
  return <>{getWebRadIconShapes(name).map((shape, index) => renderIconShape(shape, index))}</>;
}

function renderIconShape(shape: WebRadIconShape, index: number): ReactElement {
  if (shape.kind === 'path') {
    return (
      <path
        d={shape.d}
        fill={shape.fill}
        key={`${shape.kind}-${String(index)}`}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
      />
    );
  }
  return (
    <circle
      cx={shape.cx}
      cy={shape.cy}
      fill={shape.fill}
      key={`${shape.kind}-${String(index)}`}
      r={shape.r}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
    />
  );
}

/** Exact saved application artwork for Inspector/gallery previews, matching generated apps. */
export function ProjectIconGraphic({ name, className = '' }: IconProps): ReactElement {
  return (
    <svg
      className={`wr-icon${className.length > 0 ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <IconShape name={name} />
    </svg>
  );
}
