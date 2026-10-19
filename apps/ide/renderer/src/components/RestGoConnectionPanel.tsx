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
  return (
    <div hidden={section !== 'connection'} className="wr-restgo-connection">
      <div>
        <form
          className="wr-restgo-connection-section wr-restgo-runtime-settings"
          onSubmit={(event) => {
            void saveSettings(event);
          }}
        >
          <div className="wr-restgo-connection-heading">
            <div>
              <h2>Application SDK</h2>
              <p>Connection and session settings for your application.</p>
            </div>
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
          <div className="wr-restgo-form-actions">
            <span className="wr-restgo-muted">
              {settingsDirty ? 'Unsaved changes' : 'Configuration saved'}
            </span>
            <button
              className="wr-restgo-button is-primary"
              type="submit"
              disabled={busy || !settingsDirty}
            >
              <Icon name="save" />
              Save configuration
            </button>
          </div>
        </form>
        <RestGoDevelopmentLogin
          baseUrl={baseUrl}
          disabled={settingsDirty || !draftSettings.enabled}
        />
      </div>
      <section
        className="wr-restgo-connection-section wr-restgo-admin-settings"
        aria-label="Administrative access"
      >
        <div className="wr-restgo-connection-heading">
          <div>
            <h2>Administrative access</h2>
            <p>Manage endpoints and publish APIs.</p>
          </div>
        </div>
        {status?.connected ? (
          <div className="wr-restgo-connected-content">
            <div className="wr-restgo-connected-icon">
              <Icon name="check-circle" />
            </div>
            <strong>Connected to RestGO</strong>
            <code>{status.baseUrl}</code>
            <p>
              {status.storage === 'encrypted'
                ? 'The administrative credential is encrypted on this device.'
                : 'The administrative credential is held for this IDE session.'}
            </p>
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
              <button type="button" className="wr-restgo-button" disabled={busy} onClick={refresh}>
                <Icon name="refresh" />
                Refresh catalog
              </button>
              <button
                type="button"
                className="wr-restgo-button"
                disabled={busy || endpointDirty}
                title={endpointDirty ? 'Save or discard endpoint changes first.' : undefined}
                onClick={disconnect}
              >
                <Icon name="unlink" />
                Disconnect and forget token
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
                  placeholder="Raw administrative token, without Bearer"
                  onChange={(event) => setAdminToken(event.currentTarget.value)}
                />
                <small>Use a RestGO token with management permission.</small>
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
            {normalizedBaseUrl(draftSettings.baseUrl) !== baseUrl && (
              <p className="wr-restgo-inline-note">
                Save the instance URL above before connecting administrative access.
              </p>
            )}
            <button
              type="submit"
              className="wr-restgo-button is-primary"
              disabled={
                busy ||
                !baseUrl ||
                !adminToken.trim() ||
                normalizedBaseUrl(draftSettings.baseUrl) !== baseUrl
              }
            >
              <Icon name="link" />
              Connect
            </button>
          </form>
        )}
        <p className="wr-restgo-admin-note">
          This token stays in the IDE and is never included in your project or application.
        </p>
      </section>
    </div>
  );
}
