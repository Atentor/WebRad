import type { RestGoProjectSettings } from '@webrad/project-model';
import type { ReactElement } from 'react';

interface RestGoSettingsSectionProps {
  readonly settings: RestGoProjectSettings;

  readonly error: string | null;
  readonly errorId: string;
  readonly onChange: (patch: Partial<RestGoProjectSettings>) => void;
}

export function RestGoSettingsSection({
  settings,
  error,
  errorId,
  onChange,
}: RestGoSettingsSectionProps): ReactElement {
  return (
    <>
      <p>
        Configure the native RestGO connection, authentication, Storage, and published dynamic APIs
        in one place.
      </p>
      <fieldset className="wr-project-settings-seo-options">
        <legend>RestGO connection</legend>
        <div className="wr-project-settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => onChange({ enabled: event.currentTarget.checked })}
            />
            <span>Enable native RestGO integration</span>
          </label>
        </div>
        <div className="wr-project-settings-fields">
          <label className="wr-project-settings-field full-width">
            <span>RestGO instance URL</span>
            <input
              type="url"
              value={settings.baseUrl}
              maxLength={2048}
              placeholder="https://api.example.com"
              spellCheck={false}
              onChange={(event) => onChange({ baseUrl: event.currentTarget.value })}
            />
            <small>HTTP or HTTPS. A reverse-proxy base path is supported.</small>
          </label>
          <label className="wr-project-settings-field full-width">
            <span>Authorization token</span>
            <input
              type="password"
              value={settings.apiToken}
              maxLength={4096}
              autoComplete="off"
              spellCheck={false}
              placeholder="Raw token, without Bearer"
              onChange={(event) => onChange({ apiToken: event.currentTarget.value })}
            />
            <small>
              Optional, for dynamic APIs before login. Signup and login do not send this token.
            </small>
          </label>
          <label className="wr-project-settings-field">
            <span>Default database slug</span>
            <input
              type="text"
              value={settings.defaultDatabase}
              maxLength={128}
              placeholder="clientes"
              spellCheck={false}
              onChange={(event) => onChange({ defaultDatabase: event.currentTarget.value })}
            />
            <small>Optional. Calls may select another database explicitly.</small>
          </label>
        </div>
        <p>
          Dynamic endpoints use{' '}
          <code>
            /v{'{version}'}/{'{database}'}/{'{endpoint}'}
          </code>
          ; choose the version separately for each request in API Client. The server defines their
          methods and permissions.
        </p>
      </fieldset>
      <fieldset className="wr-project-settings-seo-options">
        <legend>User session</legend>
        <div className="wr-project-settings-toggles">
          <label>
            <input
              type="checkbox"
              checked={settings.persistSession}
              onChange={(event) => onChange({ persistSession: event.currentTarget.checked })}
            />
            <span>Persist the user session</span>
          </label>
        </div>
        <div className="wr-project-settings-fields">
          <label className="wr-project-settings-field">
            <span>Session storage</span>
            <select
              value={settings.sessionStorage}
              onChange={(event) => {
                const sessionStorage = event.currentTarget.value;
                if (
                  sessionStorage === 'local' ||
                  sessionStorage === 'session' ||
                  sessionStorage === 'memory'
                ) {
                  onChange({ sessionStorage });
                }
              }}
            >
              <option value="local">Local storage (across browser sessions)</option>
              <option value="session">Session storage (current browser tab)</option>
              <option value="memory">Memory (until the page closes)</option>
            </select>
            <small>When persistence is off, the session remains in memory.</small>
          </label>
          <label className="wr-project-settings-field">
            <span>Session storage key</span>
            <input
              type="text"
              value={settings.storageKey}
              maxLength={200}
              spellCheck={false}
              onChange={(event) => onChange({ storageKey: event.currentTarget.value })}
            />
            <small>Use a distinct key for applications sharing the same origin.</small>
          </label>
        </div>
        <p>
          RestGO validates the session and rotates refresh tokens. The SDK renews the JWT
          automatically; an expired or revoked refresh token requires signing in again.
        </p>
      </fieldset>
      <div className="wr-project-settings-security-note" role="note">
        These settings, including the Authorization token, are saved with the project and included
        in Preview and Build. Use an application API token suitable for browser access; keep
        administrative tokens and passwords on your server. Configure allowed browser origins on the
        RestGO server.
      </div>
      {error !== null && (
        <div className="wr-project-settings-error" id={errorId} role="alert">
          {error}
        </div>
      )}
    </>
  );
}
