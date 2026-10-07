import { DESIGNER_VIEWPORTS, type DesignerViewportName } from '@webrad/designer';
import type { PageModel } from '@webrad/project-model';
import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type DesignerSidebarMode = 'builder' | 'responsive' | 'project';

interface DesignerSidebarProps {
  mode: DesignerSidebarMode;
  onModeChange: (mode: DesignerSidebarMode) => void;
  page: PageModel | null;
  viewport: DesignerViewportName;
  onViewportChange: (viewport: DesignerViewportName) => void;
  onInspectPage: () => void;
  tree: ReactNode;
  explorer: ReactNode;
}

const VIEWPORT_ICONS: Record<DesignerViewportName, IconName> = {
  desktop: 'monitor',
  tablet: 'tablet',
  mobile: 'smartphone',
};

export function DesignerSidebar(props: DesignerSidebarProps): ReactElement {
  const root = props.page?.components.find((node) => node.id === props.page?.rootComponentId);
  return (
    <section className="wr-designer-sidebar">
      <div className="wr-builder-tabs" role="tablist" aria-label="Designer tools">
        <button
          type="button"
          role="tab"
          aria-selected={props.mode === 'builder'}
          onClick={() => props.onModeChange('builder')}
        >
          Builder
        </button>
        <button
          aria-label="Responsive"
          type="button"
          role="tab"
          aria-selected={props.mode === 'responsive'}
          onClick={() => props.onModeChange('responsive')}
        >
          Responsive
        </button>
        <button
          type="button"
          className="wr-sidebar-project-toggle"
          aria-label="Show pages"
          title="Pages and reusable components"
          aria-pressed={props.mode === 'project'}
          onClick={() => props.onModeChange('project')}
        >
          <Icon name="layers" />
        </button>
      </div>
      <div className="wr-sidebar-content">
        {props.mode === 'builder' ? (
          props.tree
        ) : props.mode === 'project' ? (
          props.explorer
        ) : (
          <div className="wr-responsive-panel">
            <h2>Preview width</h2>
            <p>Check how your page adapts to different screen sizes.</p>
            <div className="wr-viewport-presets" role="group" aria-label="Responsive viewport">
              {Object.entries(DESIGNER_VIEWPORTS).map(([name, preset]) => {
                const viewport = name as DesignerViewportName;
                return (
                  <button
                    type="button"
                    key={name}
                    aria-label={preset.label}
                    aria-pressed={props.viewport === name}
                    disabled={props.page === null}
                    onClick={() => props.onViewportChange(viewport)}
                  >
                    <Icon name={VIEWPORT_ICONS[viewport]} />
                    <strong>{preset.label}</strong>
                    <span>{preset.width === null ? 'Available width' : `${preset.width} px`}</span>
                  </button>
                );
              })}
            </div>
            {root !== undefined && (
              <div className="wr-responsive-page">
                <h2>Page layout</h2>
                <dl>
                  <div>
                    <dt>Container</dt>
                    <dd>{root.layout.container.mode}</dd>
                  </div>
                  <div>
                    <dt>Width</dt>
                    <dd>{root.layout.item.width}</dd>
                  </div>
                  <div>
                    <dt>Height</dt>
                    <dd>{root.layout.item.height}</dd>
                  </div>
                </dl>
                <button type="button" onClick={props.onInspectPage}>
                  Edit page layout <Icon name="chevron-right" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
