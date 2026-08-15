import type { ReactElement } from 'react';
import type { IdeCommand } from '../../../shared/contracts';
import { applicationIconUrl } from '../application-assets';

interface ToolbarProps {
  onCommand: (command: IdeCommand) => void;
  canSave: boolean;
  canRun: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

interface ToolButtonProps {
  command: IdeCommand;
  label: string;
  glyph: string;
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
      style={{ width: '40px' }}
    >
      <span
        className="material-icons"
        style={{ 
          fontSize: '22px', 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: '1' 
        }}
        aria-hidden="true"
      >
        {glyph}
      </span>
    </button>
  );
}

export function Toolbar({
  onCommand,
  canSave,
  canRun,
  theme,
  onToggleTheme,
}: ToolbarProps): ReactElement {
  return (
    <header className="wr-toolbar" aria-label="Main toolbar">
      <div className="wr-tool-group">
        <ToolButton
          command="file.newProject"
          glyph="add"
          label="New project (Ctrl+N)"
          onCommand={onCommand}
        />
        <ToolButton
          command="file.openProject"
          glyph="folder_open"
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
      <div className="wr-tool-separator" />
      <div className="wr-tool-group">
        <ToolButton
          command="edit.undo"
          glyph="undo"
          label="Undo (Ctrl+Z)"
          onCommand={onCommand}
        />
        <ToolButton
          command="edit.redo"
          glyph="redo"
          label="Redo (Ctrl+Y)"
          onCommand={onCommand}
        />
      </div>
      <div className="wr-tool-separator" />
      <ToolButton
        command="run.run"
        glyph="play_arrow"
        label="Build and run (F9)"
        disabled={!canRun}
        onCommand={onCommand}
      />
      <span className="wr-toolbar-spacer" />
      <button className="wr-theme-toggle" type="button" onClick={onToggleTheme}>
        {theme === 'dark' ? 'Light' : 'Dark'} theme
      </button>
    </header>
  );
}
