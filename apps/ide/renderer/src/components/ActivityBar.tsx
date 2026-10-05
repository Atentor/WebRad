import type { ReactElement } from 'react';
import { Icon, type IconName } from './Icon';
import type { ViewMode } from './EditorWorkspace';

interface ActivityBarProps {
  activeView: ViewMode;
  stylesActive: boolean;
  projectActive: boolean;
  hasProject: boolean;
  hasDocument: boolean;
  outputVisible: boolean;
  onSelectView: (view: ViewMode) => void;
  onShowProject: () => void;
  onOpenStyles: () => void;
  onOpenSettings: () => void;
  onToggleOutput: () => void;
}

const VIEWS: readonly { view: ViewMode; label: string; icon: IconName }[] = [
  { view: 'design', label: 'Design', icon: 'layout' },
  { view: 'code', label: 'Code', icon: 'code' },
  { view: 'preview', label: 'Preview', icon: 'play' },
];

export function ActivityBar(props: ActivityBarProps): ReactElement {
  return (
    <nav className="wr-activity-bar" aria-label="Workspace navigation">
      {!props.stylesActive && (
        <div
          className={props.stylesActive ? 'wr-activity-views' : 'wr-activity-views wr-view-tabs'}
          role="tablist"
          aria-label="Document view"
        >
          {VIEWS.map(({ view, label, icon }) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-label={label}
              title={label}
              aria-selected={!props.stylesActive && props.activeView === view}
              disabled={!props.hasDocument}
              onClick={() => props.onSelectView(view)}
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>
      )}
      <span className="wr-activity-divider" />
      <button
        type="button"
        aria-label="Project Explorer"
        title="Project Explorer"
        aria-pressed={props.projectActive}
        onClick={props.onShowProject}
      >
        <Icon name="folder-open" />
      </button>
      <button
        className="wr-project-tool-row"
        type="button"
        aria-label="Styles"
        title="Open Styles"
        aria-pressed={props.stylesActive}
        disabled={!props.hasProject}
        onClick={props.onOpenStyles}
      >
        <Icon name="palette" />
      </button>
      <button
        type="button"
        aria-label="Project Settings"
        title="Open Project Settings"
        disabled={!props.hasProject}
        onClick={props.onOpenSettings}
      >
        <Icon name="settings" />
      </button>
      <span className="wr-activity-spacer" />
      <button
        type="button"
        aria-label="Toggle output"
        title="Output"
        aria-pressed={props.outputVisible}
        onClick={props.onToggleOutput}
      >
        <Icon name="terminal" />
      </button>
    </nav>
  );
}
