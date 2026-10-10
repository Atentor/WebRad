import { DocumentTabs, type DocumentTabsProps } from './DocumentTabs';
import { ComponentIcon } from './ComponentIcon';
import type { ReactElement } from 'react';
import type { IdeCommand } from '../../../shared/contracts';
import { Icon, type IconName } from './Icon';

interface ToolbarProps extends DocumentTabsProps {
  canArrange: boolean;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onCommand: (command: IdeCommand) => void;
  canSave: boolean;
  canRun: boolean;
  canUndo: boolean;
  canRedo: boolean;
  projectName?: string;
  dirty: boolean;
  saving: boolean;
  building: boolean;
  selectedName?: string;
  selectedIcon?: string;
  onClearSelection: () => void;
  zoom: number;
  zoomEnabled: boolean;
  onZoomChange: (zoom: number) => void;
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
        documents={props.documents}
        activeDocumentId={props.activeDocumentId}
        onSelectDocument={props.onSelectDocument}
        onCloseDocument={props.onCloseDocument}
      />
      {props.selectedName && (
        <div className="wr-toolbar-selection">
          <ComponentIcon icon={props.selectedIcon ?? 'component-page'} />
          <span>{props.selectedName}</span>
          <button
            type="button"
            aria-label="Clear selection"
            title="Clear selection"
            onClick={props.onClearSelection}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {props.zoomEnabled && (
        <select
          className="wr-toolbar-zoom"
          aria-label="Zoom"
          value={props.zoom}
          onChange={(event) => props.onZoomChange(Number(event.target.value))}
        >
          {[50, 75, 100, 125, 150].map((value) => (
            <option value={value} key={value}>
              {value}%
            </option>
          ))}
        </select>
      )}
      {props.zoomEnabled && (
        <details
          className="wr-toolbar-arrange"
          onBlur={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary aria-label="Arrange selection" title="Arrange selection">
            <Icon name="layers" />
          </summary>
          <div className="wr-toolbar-arrange-menu">
            <button
              type="button"
              disabled={!props.canArrange}
              onClick={(event) => {
                props.onBringToFront();
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              Bring to Front
            </button>
            <button
              type="button"
              disabled={!props.canArrange}
              onClick={(event) => {
                props.onSendToBack();
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
            >
              Send to Back
            </button>
          </div>
        </details>
      )}
      <span className="wr-toolbar-spacer" />
      <span className="wr-toolbar-beta" title="WebRAD Beta">
        Beta
      </span>
      <span
        className={props.dirty ? 'wr-toolbar-save-state dirty' : 'wr-toolbar-save-state'}
        aria-live="polite"
      >
        <Icon name={props.dirty ? 'edit' : 'check-circle'} />
        {props.saving
          ? 'Saving...'
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
        className="wr-toolbar-run"
        type="button"
        title="Start debugging (F5)"
        aria-label="Start debugging (F5)"
        disabled={!props.canRun}
        onClick={() => props.onCommand('debug.start')}
      >
        <Icon name="play" />
        <span>Debug</span>
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
