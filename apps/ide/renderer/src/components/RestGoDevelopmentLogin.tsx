import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import type { RestGoDevelopmentStatus } from '../../../shared/restgo-development';
import { Icon } from './Icon';

interface Props {
  readonly baseUrl: string;
  readonly disabled: boolean;
  readonly disabledReason?: string;
}

/** Kept outside the project settings form: this session belongs only to the IDE. */
export function RestGoDevelopmentLogin({ baseUrl, disabled, disabledReason }: Props): ReactElement {
  return (
    <RestGoDevelopmentLoginSession
      key={`${baseUrl}:${String(disabled)}`}
      baseUrl={baseUrl}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}

function RestGoDevelopmentLoginSession({ baseUrl, disabled, disabledReason }: Props): ReactElement {
  const [status, setStatus] = useState<RestGoDevelopmentStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(Boolean(baseUrl && !disabled));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (baseUrl && !disabled) {
      void window.webrad.restgoDevelopment
        .status({ baseUrl })
        .then((next) => {
          if (active) setStatus(next);
        })
        .catch(() => {
          if (active)
            setError('Could not check the saved development login. You can sign in again.');
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [baseUrl, disabled]);

  const login = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    const suppliedPassword = password;
    setPassword('');
    try {
      setStatus(
        await window.webrad.restgoDevelopment.login({
          baseUrl,
          email: email.trim(),
          password: suppliedPassword,
          remember,
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Development login failed.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await window.webrad.restgoDevelopment.logout({ baseUrl });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign out.');
    } finally {
      setStatus((current) =>
        current ? { ...current, connected: false, storage: 'none', email: null } : null,
      );
      setBusy(false);
    }
  };

  return (
    <section
      className="wr-restgo-connection-section wr-restgo-development-login"
      aria-label="Development login"
      aria-busy={busy}
    >
      <div className="wr-restgo-connection-heading">
        <Icon name="user" />
        <div>
          <h3>Development login</h3>
          <p>Test JWT endpoints as an application user.</p>
        </div>
        <span className="wr-restgo-scope">IDE only</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {(disabled || !baseUrl) && (
        <p className="wr-restgo-inline-note">
          {disabledReason ?? 'Apply the application connection settings first.'}
        </p>
      )}
      {status?.connected ? (
        <div className="wr-restgo-connected-content">
          <div className="wr-restgo-identity">
            <Icon name="check-circle" />
            <div>
              <strong role="status">Signed in as {status.email}</strong>
              <small>
                {status.storage === 'encrypted'
                  ? 'Session encrypted on this device.'
                  : 'Session kept until this IDE window closes.'}
              </small>
            </div>
          </div>
          <button
            type="button"
            className="wr-restgo-button"
            title="Sign out and forget the saved development session"
            disabled={busy || disabled}
            onClick={() => {
              void logout();
            }}
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      ) : (
        <details className="wr-restgo-development-form">
          <summary>
            <span>Sign in for development</span>
            <Icon name="chevron-down" />
          </summary>
          <form
            onSubmit={(event) => {
              void login(event);
            }}
          >
            <fieldset className="wr-restgo-admin-fields" disabled={busy || disabled || !baseUrl}>
              <div className="wr-restgo-login-fields">
                <label>
                  <span>User email</span>
                  <input
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={320}
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>User password</span>
                  <input
                    type="password"
                    autoComplete="off"
                    required
                    maxLength={4096}
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                  />
                </label>
              </div>
              <label className="wr-restgo-toggle">
                <input
                  type="checkbox"
                  checked={remember}
                  disabled={status?.encryptionAvailable !== true}
                  onChange={(event) => setRemember(event.currentTarget.checked)}
                />
                <span>Remember development login on this device</span>
              </label>
              <small>
                {status?.encryptionAvailable
                  ? 'Saved with operating system encryption.'
                  : 'Secure storage unavailable: the session will stay in memory only.'}
              </small>
              <small>Your password is never saved.</small>
              <button className="wr-restgo-button is-primary" type="submit">
                <Icon name="login" />
                {busy ? 'Checking login…' : 'Sign in'}
              </button>
            </fieldset>
          </form>
        </details>
      )}
      <p className="wr-restgo-admin-note">
        For API Client tests only. Preview and Build use their own login.
      </p>
    </section>
  );
}
