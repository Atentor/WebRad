import { SettingsField } from './SettingsField';
import type { ProjectBuildSettings as BuildSettings } from '@webrad/project-model';
import { useState, type ReactElement } from 'react';

interface ProjectBuildSettingsProps {
  readonly value: BuildSettings;
  readonly onChange: (value: BuildSettings) => void;
  readonly onChooseDirectory?: () => Promise<string | null>;
}

export function ProjectBuildSettings({
  value,
  onChange,
  onChooseDirectory,
}: ProjectBuildSettingsProps): ReactElement {
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const chooseDirectory = async (): Promise<void> => {
    if (onChooseDirectory === undefined || choosingDirectory) return;
    setChoosingDirectory(true);
    setDirectoryError(null);
    try {
      const directory = await onChooseDirectory();
      if (directory !== null) onChange({ ...value, deployDirectory: directory });
    } catch (error) {
      setDirectoryError(
        error instanceof Error ? error.message : 'The directory could not be selected.',
      );
    } finally {
      setChoosingDirectory(false);
    }
  };

  return (
    <>
      <p>Choose where Deploy creates the files ready for static hosting.</p>
      <div className="wr-project-settings-fields">
        <SettingsField
          path="build.deployDirectory"
          className="wr-project-settings-field full-width"
        >
          <span>Deploy directory</span>
          <span className="wr-project-settings-directory">
            <input
              type="text"
              value={value.deployDirectory}
              maxLength={4096}
              placeholder="Choose a folder or enter a path"
              spellCheck={false}
              onChange={(event) =>
                onChange({ ...value, deployDirectory: event.currentTarget.value })
              }
            />
            {onChooseDirectory !== undefined && (
              <button
                type="button"
                disabled={choosingDirectory}
                onClick={() => void chooseDirectory()}
              >
                {choosingDirectory ? 'Choosing...' : 'Choose folder'}
              </button>
            )}
          </span>
          <small>
            An absolute path or a folder relative to the project. Save it once for future
            deployments.
          </small>
        </SettingsField>
        <SettingsField path="build.environment" className="wr-project-settings-field full-width">
          <span>Deploy environment</span>
          <select
            value={value.environment}
            onChange={(event) =>
              onChange({
                ...value,
                environment:
                  event.currentTarget.value === 'development' ? 'development' : 'production',
              })
            }
          >
            <option value="production">Production</option>
            <option value="development">Development</option>
          </select>
          <small>
            Uses the values configured in Environment variables. Preview keeps its own environment.
          </small>
        </SettingsField>
      </div>
      <div className="wr-project-settings-toggles">
        <SettingsField path="build.minify">
          <input
            type="checkbox"
            checked={value.minify}
            onChange={(event) => onChange({ ...value, minify: event.currentTarget.checked })}
          />
          <span>Minify JavaScript and CSS</span>
        </SettingsField>
        <SettingsField path="build.sourceMaps">
          <input
            type="checkbox"
            checked={value.sourceMaps}
            onChange={(event) => onChange({ ...value, sourceMaps: event.currentTarget.checked })}
          />
          <span>Include source maps for troubleshooting</span>
        </SettingsField>
      </div>
      <div className="wr-project-settings-note" role="note">
        Deploy includes only the application code and resources in use. Upload the generated
        index.html and folders to your hosting service.
      </div>
      {directoryError !== null && (
        <div className="wr-project-settings-error" role="alert">
          {directoryError}
        </div>
      )}
    </>
  );
}
