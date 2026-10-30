import { SettingsField } from './SettingsField';
import { NativeColorInput } from './NativeColorInput';
import type { ProjectPwaSettings as PwaSettings } from '@webrad/project-model';
import type { ReactElement } from 'react';

interface ProjectPwaSettingsProps {
  readonly value: PwaSettings;
  readonly applicationName: string;
  readonly onChange: (value: PwaSettings) => void;
}

export function ProjectPwaSettings({
  value,
  applicationName,
  onChange,
}: ProjectPwaSettingsProps): ReactElement {
  return (
    <>
      <p>Let users install this application on their device and open it from their home screen.</p>
      <div className="wr-project-settings-toggles">
        <SettingsField path="pwa.enabled">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
          />
          <span>Enable PWA installation</span>
        </SettingsField>
      </div>
      <fieldset className="wr-project-settings-seo-options" disabled={!value.enabled}>
        <legend>Installed application</legend>
        <div className="wr-project-settings-fields">
          <SettingsField path="pwa.shortName" className="wr-project-settings-field full-width">
            <span>Short name</span>
            <input
              type="text"
              value={value.shortName}
              maxLength={32}
              placeholder={applicationName}
              onChange={(event) => onChange({ ...value, shortName: event.currentTarget.value })}
            />
            <small>Optional label for the home screen. Uses the application name when empty.</small>
          </SettingsField>
          <SettingsField path="pwa.display" className="wr-project-settings-field">
            <span>Display mode</span>
            <select
              value={value.display}
              onChange={(event) =>
                onChange({ ...value, display: event.currentTarget.value as PwaSettings['display'] })
              }
            >
              <option value="standalone">Standalone</option>
              <option value="fullscreen">Fullscreen</option>
              <option value="minimal-ui">Minimal browser controls</option>
            </select>
          </SettingsField>
          <SettingsField path="pwa.orientation" className="wr-project-settings-field">
            <span>Orientation</span>
            <select
              value={value.orientation}
              onChange={(event) =>
                onChange({
                  ...value,
                  orientation: event.currentTarget.value as PwaSettings['orientation'],
                })
              }
            >
              <option value="any">Automatic</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </SettingsField>
          <SettingsField path="pwa.themeColor" className="wr-project-settings-field">
            <span>Theme color</span>
            <NativeColorInput
              value={value.themeColor}
              onChange={(themeColor) => onChange({ ...value, themeColor })}
            />
            <small>Color for supported browser and application controls.</small>
          </SettingsField>
          <SettingsField path="pwa.backgroundColor" className="wr-project-settings-field">
            <span>Background color</span>
            <NativeColorInput
              value={value.backgroundColor}
              onChange={(backgroundColor) => onChange({ ...value, backgroundColor })}
            />
            <small>Background used while the installed application starts.</small>
          </SettingsField>
        </div>
        <div className="wr-project-settings-toggles">
          <SettingsField path="pwa.offline">
            <input
              type="checkbox"
              checked={value.offline}
              onChange={(event) => onChange({ ...value, offline: event.currentTarget.checked })}
            />
            <span>Keep the application available offline</span>
          </SettingsField>
        </div>
        <p>
          The application files are available after the first visit. Online services still need an
          internet connection.
        </p>
      </fieldset>
      <div className="wr-project-settings-note" role="note">
        Name and description come from General. The image in Icons is converted automatically into
        installation icons; an application icon is generated when no image is selected. Host over
        HTTPS to enable installation and offline use.
      </div>
    </>
  );
}
