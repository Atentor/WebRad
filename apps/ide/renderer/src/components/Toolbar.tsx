import type { ReactElement } from 'react';
import type { IdeCommand } from '../../../shared/contracts';

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
    >
      <span aria-hidden="true">{glyph}</span>
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
      <div className="wr-brand" aria-label="WebRAD">
        <span className="wr-brand-mark" aria-hidden="true">
          W
        </span>
        <span>WebRAD</span>
      </div>
      <div className="wr-tool-group">
        <ToolButton
          command="file.newProject"
          glyph="＋"
          label="New project (Ctrl+N)"
          onCommand={onCommand}
        />
        <ToolButton
          command="file.openProject"
          glyph="⌂"
          label="Open project (Ctrl+O)"
          onCommand={onCommand}
        />
        <ToolButton
          command="file.save"
          glyph="◇"
          label="Save (Ctrl+S)"
          disabled={!canSave}
          onCommand={onCommand}
        />
      </div>
      <div className="wr-tool-separator" />
      <div className="wr-tool-group">
        <ToolButton command="edit.undo" glyph="↶" label="Undo (Ctrl+Z)" onCommand={onCommand} />
        <ToolButton command="edit.redo" glyph="↷" label="Redo (Ctrl+Y)" onCommand={onCommand} />
      </div>
      <div className="wr-tool-separator" />
      <ToolButton
        command="run.run"
        glyph="▶"
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
