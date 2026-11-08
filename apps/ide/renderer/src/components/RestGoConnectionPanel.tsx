import type { Dispatch, SetStateAction, FormEvent, ReactElement } from 'react';
import type { RestGoProjectSettings } from '@webrad/project-model';
import type { RestGoAdminCatalog, RestGoAdminStatus } from '../../../shared/restgo-admin';
import type { RestGoEndpointGroup } from './restgo-workspace-model';
import type { RestGoSection } from './RestGoSidebar';
import { Icon } from './Icon';
import { RestGoSettingsSection } from './RestGoSettingsSection';
import { RestGoDevelopmentLogin } from './RestGoDevelopmentLogin';
interface Props {
  readonly section: RestGoSection;
  readonly busy: boolean;
  readonly draftSettings: RestGoProjectSettings;
  readonly settingsError: string | null;
  readonly settingsDirty: boolean;
  readonly setDraftSettings: Dispatch<SetStateAction<RestGoProjectSettings>>;
  readonly setSettingsError: Dispatch<SetStateAction<string | null>>;
  readonly saveSettings: (event: FormEvent) => Promise<void>;
  readonly status: RestGoAdminStatus | null;
  readonly catalog: RestGoAdminCatalog;
  readonly groups: readonly RestGoEndpointGroup[];
  readonly refresh: () => void;
  readonly endpointDirty: boolean;
  readonly disconnect: () => void;
  readonly connect: (event: FormEvent) => Promise<void>;
  readonly adminToken: string;
  readonly setAdminToken: Dispatch<SetStateAction<string>>;
  readonly remember: boolean;
  readonly setRemember: Dispatch<SetStateAction<boolean>>;
  readonly baseUrl: string;
}
function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
export function RestGoConnectionPanel({
  section,
  busy,
  draftSettings,
  settingsError,
  settingsDirty,
  setDraftSettings,
  setSettingsError,
  saveSettings,
  status,
  catalog,
  groups,
  refresh,
  endpointDirty,
  disconnect,
  connect,
  adminToken,
  setAdminToken,
  remember,
  setRemember,
  baseUrl,
}: Props): ReactElement {
  const urlDirty = normalizedBaseUrl(draftSettings.baseUrl) !== baseUrl;
  const developmentDisabledReason = !draftSettings.enabled
    ? 'Enable RestGO and apply the configuration to test an application login.'
    : settingsDirty
      ? 'Apply the application configuration before signing in.'
      : !baseUrl
        ? 'Enter the instance URL and apply the configuration before signing in.'
        : undefined;
  return (
    <div hidden={section !== 'connection'} className="wr-restgo-connection">
      <form
        className="wr-restgo-connection-section wr-restgo-runtime-settings"
        aria-label="Application connection"
        onSubmit={(event) => {
          void saveSettings(event);
        }}
      >
        <div className="wr-restgo-connection-heading">
          <Icon name="globe" />
          <div>
            <h2>Application connection</h2>
            <p>Used by your application in Preview and Build.</p>
          </div>
          <span className="wr-restgo-scope">Project settings</span>
        </div>
        <fieldset disabled={busy} className="wr-restgo-settings-content">
          <RestGoSettingsSection
            settings={draftSettings}
            error={settingsError}
            errorId="wr-restgo-workspace-settings-error"
            onChange={(patch) => {
              setDraftSettings((current) => ({ ...current, ...patch }));
              setSettingsError(null);
            }}
          />
        </fieldset>
        <div className="wr-restgo-application-footer">
          <div className="wr-restgo-form-actions">
            <span
              className={
                settingsDirty
                  ? 'wr-restgo-configuration-state is-dirty'
                  : 'wr-restgo-configuration-state'
              }
              role="status"
            >
              <Icon name={settingsDirty ? 'edit' : 'check-circle'} />
              {settingsDirty ? 'Changes to apply' : 'Up to date'}
            </span>
            <button
              className="wr-restgo-button is-primary"
              type="submit"
              disabled={busy || !settingsDirty}
            >
              <Icon name="save" />
              Apply configuration
            </button>
          </div>
          <small>Save the project (Ctrl+S) to keep applied changes.</small>
        </div>
      </form>
      <aside className="wr-restgo-ide-tools" aria-label="Optional IDE tools">
        <section
          className="wr-restgo-connection-section wr-restgo-admin-settings"
          aria-label="Administrative access"
        >
          <div className="wr-restgo-connection-heading">
            <Icon name="shield" />
            <div>
              <h2>Administrative access</h2>
              <p>Manage endpoints and publish APIs.</p>
            </div>
            <span className="wr-restgo-scope">IDE only</span>
          </div>
          {status?.connected ? (
            <div className="wr-restgo-connected-content">
              <div className="wr-restgo-identity">
                <Icon name="check-circle" />
                <div>
                  <strong>Connected to RestGO</strong>
                  <code>{status.baseUrl}</code>
                  <small>
                    {status.storage === 'encrypted'
                      ? 'Administrative token encrypted on this device.'
                      : 'Administrative token kept for this IDE session.'}
                  </small>
                </div>
              </div>
              <div className="wr-restgo-connection-summary">
                <span>
                  <strong>{catalog.bancos.length}</strong>Databases
                </span>
                <span>
                  <strong>{groups.length}</strong>Endpoints
                </span>
                <span>
                  <strong>{catalog.publications.length}</strong>Publications
                </span>
              </div>
              <div className="wr-restgo-admin-actions">
                <button
                  type="button"
                  className="wr-restgo-button"
                  disabled={busy}
                  onClick={refresh}
                >
                  <Icon name="refresh" />
                  Refresh catalog
                </button>
                <button
                  type="button"
                  className="wr-restgo-button is-quiet"
                  disabled={busy || endpointDirty}
                  title={
                    endpointDirty
                      ? 'Save or discard endpoint changes first.'
                      : 'Disconnect and forget the saved administrative token'
                  }
                  onClick={disconnect}
                >
                  <Icon name="unlink" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                void connect(event);
              }}
            >
              <fieldset disabled={busy} className="wr-restgo-admin-fields">
                <label>
                  <span>Administrative API token</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    maxLength={8192}
                    value={adminToken}
                    placeholder="Administrative token, without Bearer"
                    onChange={(event) => setAdminToken(event.currentTarget.value)}
                  />
                  <small>
                    Use a token with management permission for the application instance URL.
                  </small>
                </label>
                <label className="wr-restgo-toggle">
                  <input
                    type="checkbox"
                    checked={remember}
                    disabled={!status?.encryptionAvailable}
                    onChange={(event) => setRemember(event.currentTarget.checked)}
                  />
                  <span>Remember securely on this device</span>
                </label>
                <small>
                  {status?.encryptionAvailable
                    ? 'Saved with operating system encryption.'
                    : 'Session only; secure storage is unavailable.'}
                </small>
              </fieldset>
              {(urlDirty || !baseUrl) && (
                <p className="wr-restgo-inline-note">
                  {urlDirty
                    ? 'Apply the instance URL in Application connection before connecting.'
                    : 'Enter the instance URL in Application connection and apply it first.'}
                </p>
              )}
              <button
                type="submit"
                className="wr-restgo-button is-primary"
                disabled={busy || !baseUrl || !adminToken.trim() || urlDirty}
              >
                <Icon name="link" />
                Connect admin
              </button>
            </form>
          )}
          <p className="wr-restgo-admin-note">
            This token stays in the IDE. It is never included in your application.
          </p>
        </section>
        <RestGoDevelopmentLogin
          baseUrl={baseUrl}
          disabled={settingsDirty || !draftSettings.enabled}
          disabledReason={developmentDisabledReason}
        />
      </aside>
    </div>
  );
}
