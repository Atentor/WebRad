import type { ReactElement } from 'react';
import { Icon } from './Icon';

interface ActivityBarProps {
  stylesActive: boolean;
  restGoActive?: boolean;
  codexActive?: boolean;
  codexBusy?: boolean;
  projectActive: boolean;
  hasProject: boolean;
  outputVisible: boolean;
  onShowProject: () => void;
  onOpenStyles: () => void;
  onOpenSettings: () => void;
  onOpenRestGo?: () => void;
  onToggleCodex: () => void;
  onToggleOutput: () => void;
}

export function ActivityBar(props: ActivityBarProps): ReactElement {
  return (
    <nav className="wr-activity-bar" aria-label="Workspace navigation">
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
        aria-label="RestGo integration"
        title="RestGo integration"
        aria-pressed={props.restGoActive === true}
        disabled={!props.hasProject}
        onClick={props.onOpenRestGo}
      >
        <Icon name="database" />
      </button>
      <span className="wr-activity-spacer" />
      <button
        type="button"
        aria-label="Codex assistant"
        title={props.codexBusy ? 'Codex is preparing a proposal' : 'Codex assistant'}
        aria-pressed={props.codexActive === true}
        aria-busy={props.codexBusy === true}
        onClick={props.onToggleCodex}
      >
        <Icon name="sparkles" />
        {props.codexBusy && <span className="wr-codex-activity-dot" aria-hidden="true" />}
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
