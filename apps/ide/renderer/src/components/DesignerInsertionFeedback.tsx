import type { Bounds } from '@webrad/project-model';
import type { CSSProperties, ReactElement } from 'react';
import { Icon } from './Icon';

export interface DesignerInsertionPreview {
  readonly parentId: string;
  readonly parentBounds: Bounds;
  readonly parentPath: string;
  readonly componentLabel: string;
  readonly detail: string;
  readonly ghostBounds?: Bounds;
  readonly indicatorBounds?: Bounds;
  readonly tray: boolean;
  readonly invalid: boolean;
}

function rectangleStyle(bounds: Bounds): CSSProperties {
  return { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height };
}

export function DesignerInsertionFeedback({
  preview,
  scale,
}: {
  preview: DesignerInsertionPreview;
  scale: number;
}): ReactElement {
  return (
    <div
      className={`wr-insertion-feedback${preview.invalid ? ' invalid' : ''}`}
      role="status"
      aria-label={`${preview.componentLabel} · ${preview.parentPath}${!preview.ghostBounds ? ` · ${preview.detail}` : ''}`}
      data-drop-parent-id={preview.parentId}
      data-drop-valid={!preview.invalid}
      style={{ '--wr-feedback-scale': scale } as CSSProperties}
    >
      <div className="wr-drop-parent-highlight" style={rectangleStyle(preview.parentBounds)} />
      {preview.ghostBounds && (
        <div className="wr-drop-ghost" style={rectangleStyle(preview.ghostBounds)}>
          <span>
            <Icon name="add" />
            {preview.componentLabel}
          </span>
        </div>
      )}
      {preview.indicatorBounds && (
        <div
          className="wr-flow-drop-indicator wr-palette-drop-indicator"
          style={rectangleStyle(preview.indicatorBounds)}
        />
      )}
    </div>
  );
}
