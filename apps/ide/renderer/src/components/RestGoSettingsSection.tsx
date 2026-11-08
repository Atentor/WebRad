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
        <label className="wr-restgo-toggle wr-restgo-integration-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => onChange({ enabled: event.currentTarget.checked })}
          />
          <span className="wr-restgo-toggle-copy">
            <strong>Use RestGO in this application</strong>
            <small>Make RestGO available to the application in Preview and Build.</small>
          </span>
        </label>
        <label className="wr-restgo-settings-field">
          <span>RestGO instance URL</span>
          <input
            type="url"
            value={settings.baseUrl}
            maxLength={2048}
            placeholder="https://api.example.com"
            spellCheck={false}
            onChange={(event) => onChange({ baseUrl: event.currentTarget.value })}
          />
          <small>Your server address, including any base path such as /backend.</small>
        </label>
      </div>
      <section
        className="wr-restgo-settings-section wr-restgo-api-defaults"
        aria-labelledby="wr-restgo-api-defaults-heading"
      >
        <div className="wr-restgo-settings-heading">
          <h3 id="wr-restgo-api-defaults-heading">API defaults</h3>
          <span>Optional</span>
        </div>
        <div className="wr-restgo-details-content">
          <div className="wr-restgo-settings-fields">
            <label className="wr-restgo-settings-field">
              <span>
                Application API token <small>(optional)</small>
              </span>
              <input
                type="password"
                aria-label="Application API token"
                value={settings.apiToken}
                maxLength={4096}
                autoComplete="off"
                spellCheck={false}
                placeholder="Raw token, without Bearer"
                onChange={(event) => onChange({ apiToken: event.currentTarget.value })}
              />
              <small>For dynamic APIs that require a token. Login and signup do not use it.</small>
            </label>
            <label className="wr-restgo-settings-field">
              <span>
                Default database slug <small>(optional)</small>
              </span>
              <input
                type="text"
                aria-label="Default database slug"
                value={settings.defaultDatabase}
                maxLength={128}
                placeholder="e.g. customers"
                spellCheck={false}
                onChange={(event) => onChange({ defaultDatabase: event.currentTarget.value })}
              />
              <small>Used when an SDK call does not specify a database.</small>
            </label>
          </div>
          <p className="wr-restgo-settings-note">
            This token is included in Preview and Build. Use a browser-safe application token, never
            your administrative token.
          </p>
        </div>
      </section>
      <section
        className="wr-restgo-settings-section wr-restgo-session-settings"
        aria-labelledby="wr-restgo-session-heading"
      >
        <div className="wr-restgo-settings-heading">
          <h3 id="wr-restgo-session-heading">User session</h3>
        </div>
        <div className="wr-restgo-details-content">
          <label className="wr-restgo-toggle">
            <input
              type="checkbox"
              checked={settings.persistSession}
              onChange={(event) => onChange({ persistSession: event.currentTarget.checked })}
            />
            <span>Remember signed-in users</span>
          </label>
          <div className="wr-restgo-settings-fields">
            <label className="wr-restgo-settings-field">
              <span>Session storage</span>
              <select
                value={settings.sessionStorage}
                disabled={!settings.persistSession}
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
                <option value="local">Across browser restarts</option>
                <option value="session">Until the browser tab closes</option>
                <option value="memory">Until the page reloads</option>
              </select>
              <small>
                {settings.persistSession
                  ? 'How long the application keeps its login locally. The server can still end the session.'
                  : 'Users stay signed in until the page reloads.'}
              </small>
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
              <small>
                Keep the default unless applications on the same origin need separate logins.
              </small>
            </label>
          </div>
        </div>
      </section>
      {error !== null && (
        <div className="wr-project-settings-error" id={errorId} role="alert">
          {error}
        </div>
      )}
    </>
  );
}
