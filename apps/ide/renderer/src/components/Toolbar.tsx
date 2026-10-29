import type { UpdateState } from '../../../shared/update-contracts';
import { UpdateIndicator } from './UpdateIndicator';
import { BugReportButton } from './BugReportButton';
import { DocumentTabs, type DocumentTabsProps } from './DocumentTabs';
import type { ReactElement } from 'react';
import type { IdeCommand } from '../../../shared/contracts';
import type { DebugState } from '../../../shared/debugger-contracts';
import { Icon, type IconName } from './Icon';

interface ToolbarProps extends DocumentTabsProps {
  updateState: UpdateState;
  onUpdate: () => void;
  onCommand: (command: IdeCommand) => void;
  canSave: boolean;
  canRun: boolean;
  canBuildApplication: boolean;
  canUndo: boolean;
  canRedo: boolean;
  projectName?: string;
  dirty: boolean;
  pendingChanges?: boolean;
  saving: boolean;
  building: boolean;
  debugStatus: DebugState['status'];
  debugBusy: boolean;
  issueCount: number;
  onShowProblems: () => void;
}

interface ToolButtonProps {
  command: IdeCommand;
  label: string;
  glyph: IconName;
  disabled?: boolean;
  onCommand: (command: IdeCommand) => void;
}

function ToolButton({ command, label, glyph, disabled, onCommand }: ToolButtonProps): ReactElement {
  return (
    <button
      className="wr-tool-button"
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCommand(command)}
    >
      <Icon name={glyph} />
    </button>
  );
}

export function Toolbar(props: ToolbarProps): ReactElement {
  const debugActive =
    props.debugBusy || ['starting', 'running', 'paused'].includes(props.debugStatus);
  const debugLabel = debugActive ? 'Stop debugging (Shift+F5)' : 'Start debugging (F5)';
  const debugStatus = props.debugBusy ? 'starting' : props.debugStatus;
  return (
    <header className="wr-toolbar" role="toolbar" aria-label="Main toolbar">
      <span className="wr-toolbar-platform" title={props.projectName ?? 'Browser applications'}>
        <Icon name="monitor" />
        <span>Web</span>
      </span>
      <span className="wr-toolbar-slash" aria-hidden="true">
        /
      </span>
      <DocumentTabs
        documents={props.documents.filter((document) => document.id === props.activeDocumentId)}
        activeDocumentId={props.activeDocumentId}
        onSelectDocument={props.onSelectDocument}
        onCloseDocument={props.onCloseDocument}
      />
      <span className="wr-toolbar-spacer" />
      <UpdateIndicator state={props.updateState} onUpdate={props.onUpdate} />
      <span className="wr-toolbar-beta" title="WebRAD Beta">
        Beta
      </span>
      <span
        className={props.dirty || props.pendingChanges ? 'wr-toolbar-save-state dirty' : 'wr-toolbar-save-state'}
        aria-live="polite"
        title={props.pendingChanges ? 'Apply or save the pending editor changes before saving the project.' : undefined}
      >
        <Icon name={props.dirty || props.pendingChanges ? 'edit' : 'check-circle'} />
        {props.saving
          ? 'Saving...'
          : props.pendingChanges
            ? 'Pending edits'
            : props.dirty
              ? 'Unsaved'
              : props.projectName
                ? 'Saved'
                : 'No project'}
      </span>
      <div className="wr-tool-group" role="group" aria-label="Project actions">
        <ToolButton
          command="file.newProject"
          glyph="add"
          label="New project (Ctrl+N)"
          onCommand={props.onCommand}
        />
        <ToolButton
          command="file.openProject"
          glyph="folder-open"
          label="Open project (Ctrl+O)"
          onCommand={props.onCommand}
        />
        <ToolButton
          command="file.save"
          glyph="save"
          label="Save (Ctrl+S)"
          disabled={!props.canSave}
          onCommand={props.onCommand}
        />
      </div>
      <span className="wr-tool-separator" role="separator" aria-orientation="vertical" />
      <div className="wr-tool-group" role="group" aria-label="History actions">
        <ToolButton
          command="edit.undo"
          glyph="undo"
          label="Undo (Ctrl+Z)"
          disabled={!props.canUndo}
          onCommand={props.onCommand}
        />
        <ToolButton
          command="edit.redo"
          glyph="redo"
          label="Redo (Ctrl+Y)"
          disabled={!props.canRedo}
          onCommand={props.onCommand}
        />
      </div>
      <button
        aria-label={`${props.issueCount} issues`}
        className="wr-toolbar-issues"
        type="button"
        onClick={props.onShowProblems}
      >
        <Icon name="info" />
        <span>{props.issueCount} issues</span>
      </button>
      <button
        className="wr-tool-button"
        type="button"
        title="Build Application"
        aria-label="Build Application"
        disabled={!props.canBuildApplication}
        onClick={() => props.onCommand('project.buildApplication')}
      >
        <Icon name="layers" />
      </button>
      <BugReportButton />
      <button
        className={
          debugActive ? 'wr-toolbar-run wr-toolbar-debug active' : 'wr-toolbar-run wr-toolbar-debug'
        }
        type="button"
        title={
          debugActive
            ? `${debugStatus === 'paused' ? 'Paused' : debugStatus === 'starting' ? 'Starting' : 'Running'} — ${debugLabel}`
            : debugLabel
        }
        aria-label={debugLabel}
        aria-pressed={debugActive}
        data-debug-status={debugStatus}
        disabled={!debugActive && !props.canRun}
        onClick={() => props.onCommand(debugActive ? 'debug.stop' : 'debug.start')}
      >
        <Icon name={debugActive ? 'stop' : 'play'} />
        <span aria-live="polite">
          {!debugActive
            ? 'Debug'
            : debugStatus === 'starting'
              ? 'Starting...'
              : debugStatus === 'paused'
                ? 'Debug Paused'
                : 'Stop Debug'}
        </span>
      </button>
      <button
        className="wr-toolbar-run"
        type="button"
        title="Build and run (F9)"
        aria-label="Build and run (F9)"
        disabled={!props.canRun}
        onClick={() => props.onCommand('run.run')}
      >
        <Icon name="play" />
        <span>{props.building ? 'Building...' : 'Preview'}</span>
      </button>
    </header>
  );
}
