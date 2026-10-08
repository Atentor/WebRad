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
      <div className="wr-restgo-settings-group">
        <label className="wr-restgo-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => onChange({ enabled: event.currentTarget.checked })}
          />
          <span>Enable native RestGO integration</span>
        </label>
        <div className="wr-restgo-settings-fields">
          <label className="wr-restgo-settings-field full-width">
            <span>RestGO instance URL</span>
            <input
              type="url"
              value={settings.baseUrl}
              maxLength={2048}
              placeholder="https://api.example.com"
              spellCheck={false}
              onChange={(event) => onChange({ baseUrl: event.currentTarget.value })}
            />
            <small>HTTP or HTTPS, including a reverse-proxy base path.</small>
          </label>
          <label className="wr-restgo-settings-field">
            <span>Application API token</span>
            <input
              type="password"
              value={settings.apiToken}
              maxLength={4096}
              autoComplete="off"
              spellCheck={false}
              placeholder="Raw token, without Bearer"
              onChange={(event) => onChange({ apiToken: event.currentTarget.value })}
            />
            <small>Optional browser token for dynamic APIs. Login and signup omit it.</small>
          </label>
          <label className="wr-restgo-settings-field">
            <span>Default database slug</span>
            <input
              type="text"
              value={settings.defaultDatabase}
              maxLength={128}
              placeholder="clientes"
              spellCheck={false}
              onChange={(event) => onChange({ defaultDatabase: event.currentTarget.value })}
            />
            <small>Optional default for SDK calls.</small>
          </label>
        </div>
      </div>
      <section className="wr-restgo-session-settings" aria-label="User session">
        <h3>User session</h3>
        <label className="wr-restgo-toggle">
          <input
            type="checkbox"
            checked={settings.persistSession}
            onChange={(event) => onChange({ persistSession: event.currentTarget.checked })}
          />
          <span>Persist the user session</span>
        </label>
        <div className="wr-restgo-settings-fields">
          <label className="wr-restgo-settings-field">
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
              <option value="local">Local storage</option>
              <option value="session">Current browser tab</option>
              <option value="memory">Memory only</option>
            </select>
            <small>Persistence off keeps the session in memory.</small>
          </label>
          <label className="wr-restgo-settings-field">
            <span>Session storage key</span>
            <input
              type="text"
              value={settings.storageKey}
              maxLength={200}
              spellCheck={false}
              onChange={(event) => onChange({ storageKey: event.currentTarget.value })}
            />
            <small>Use a unique key for this application.</small>
          </label>
        </div>
      </section>
      <p className="wr-restgo-settings-note">
        The application token is included in Preview and Build. Use a browser-safe token.
      </p>
      {error !== null && (
        <div className="wr-project-settings-error" id={errorId} role="alert">
          {error}
        </div>
      )}
    </>
  );
}
