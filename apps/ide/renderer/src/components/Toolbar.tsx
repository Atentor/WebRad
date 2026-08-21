import type { ReactElement } from 'react';
import type { IdeCommand } from '../../../shared/contracts';
import { Icon, type IconName } from './Icon';

interface ToolbarProps {
  onCommand: (command: IdeCommand) => void;
  canSave: boolean;
  canRun: boolean;
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

export function Toolbar({ onCommand, canSave, canRun }: ToolbarProps): ReactElement {
  return (
    <header className="wr-toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="wr-tool-group" role="group" aria-label="Project actions">
        <ToolButton
          command="file.newProject"
          glyph="add"
          label="New project (Ctrl+N)"
          onCommand={onCommand}
        />
        <ToolButton
          command="file.openProject"
          glyph="folder-open"
          label="Open project (Ctrl+O)"
          onCommand={onCommand}
        />
        <ToolButton
          command="file.save"
          glyph="save"
          label="Save (Ctrl+S)"
          disabled={!canSave}
          onCommand={onCommand}
        />
      </div>
      <span className="wr-tool-separator" role="separator" aria-orientation="vertical" />
      <div className="wr-tool-group" role="group" aria-label="History actions">
        <ToolButton command="edit.undo" glyph="undo" label="Undo (Ctrl+Z)" onCommand={onCommand} />
        <ToolButton command="edit.redo" glyph="redo" label="Redo (Ctrl+Y)" onCommand={onCommand} />
      </div>
      <span className="wr-tool-separator" role="separator" aria-orientation="vertical" />
      <div className="wr-tool-group" role="group" aria-label="Run actions">
        <ToolButton
          command="run.run"
          glyph="play"
          label="Build and run (F9)"
          disabled={!canRun}
          onCommand={onCommand}
        />
      </div>
    </header>
  );
}
