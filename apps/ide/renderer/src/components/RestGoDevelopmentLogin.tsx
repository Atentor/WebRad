import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import type { RestGoDevelopmentStatus } from '../../../shared/restgo-development';

interface Props {
  readonly baseUrl: string;
  readonly disabled: boolean;
}

/** Kept outside the project settings form: this session belongs only to the IDE. */
export function RestGoDevelopmentLogin({ baseUrl, disabled }: Props): ReactElement {
  return (
    <RestGoDevelopmentLoginSession
      key={`${baseUrl}:${String(disabled)}`}
      baseUrl={baseUrl}
      disabled={disabled}
    />
  );
}

function RestGoDevelopmentLoginSession({ baseUrl, disabled }: Props): ReactElement {
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
      className="wr-restgo-development-login"
      aria-label="Development login"
      aria-busy={busy}
    >
      <h3>Development login</h3>
      <p>Sign in as an application user to test JWT endpoints in the API Client.</p>
      <small>
        The session stays in this IDE, outside your project, Preview and Build. Your password is
        never saved.
      </small>
      {error && <p role="alert">{error}</p>}
      {status?.connected ? (
        <div className="wr-restgo-connected-content">
          <strong role="status">Signed in as {status.email}</strong>
          <small>
            {status.storage === 'encrypted'
              ? 'Session encrypted on this device.'
              : 'Session kept until this IDE window closes.'}
          </small>
          <button
            type="button"
            className="wr-restgo-button"
            disabled={busy || disabled}
            onClick={() => {
              void logout();
            }}
          >
            Sign out and forget session
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            void login(event);
          }}
        >
          <fieldset className="wr-restgo-admin-fields" disabled={busy || disabled || !baseUrl}>
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
            <button className="wr-restgo-button is-primary" type="submit">
              {busy ? 'Checking login…' : 'Sign in for development'}
            </button>
          </fieldset>
          {disabled && <small>Save the application connection configuration first.</small>}
        </form>
      )}
    </section>
  );
}
