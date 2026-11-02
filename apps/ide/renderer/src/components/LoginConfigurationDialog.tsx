import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ProjectStylesContext, SharedComponentStyles } from '@webrad/components';
import {
  defaultComponentRegistry,
  embeddedComponentStyleCatalog,
} from '@webrad/component-registry';
import type { ComponentNode } from '@webrad/project-model';
import { WebLogin } from '@webrad/runtime/login';
import {
  createDefaultWebLoginConfiguration,
  createDefaultWebLoginRecoveryConfiguration,
  parseWebLoginConfiguration,
  type WebLoginStyleBindings,
  type WebLoginStyleSlot,
  type WebLoginConfiguration,
  type WebLoginRecoveryConfiguration,
  type WebLoginTexts,
  type WebLoginView,
} from '@webrad/runtime/login-model';
import { ProjectThemeContext } from '../project-theme';
import { Icon } from './Icon';
import './MenuConfigurationDialog.css';
import './LoginConfigurationDialog.css';

const behaviorLabels = {
  allowRegistration: 'Allow account registration',
  showFullName: 'Show full name on registration',
  requireFullName: 'Require full name',
  confirmPassword: 'Confirm password on registration',
  showRemember: 'Show Remember me',
  rememberDefault: 'Remember me by default',
  showPasswordToggle: 'Allow showing the password',
  autoLoginAfterRegistration: 'Sign in after registration',
  closeOnLogin: 'Hide after successful login',
  openOnShow: 'Open Popup when the component is shown',
  dismissible: 'Allow closing Popup',
} as const;
const textLabels: Readonly<Record<keyof WebLoginTexts, string>> = {
  loginTitle: 'Login title',
  loginSubtitle: 'Login subtitle',
  registerTitle: 'Registration title',
  registerSubtitle: 'Registration subtitle',
  loginButton: 'Login button',
  registerButton: 'Registration button',
  switchToRegister: 'Link to registration',
  switchToLogin: 'Link to login',
  remember: 'Remember me',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  close: 'Close Popup',
  busy: 'Working',
  registered: 'Account created',
  authenticated: 'Signed in',
  passwordMismatch: 'Password mismatch',
  unavailable: 'Connection unavailable',
  requestFailed: 'Request failed',
};
const recoveryTextLabels: Readonly<Record<keyof WebLoginRecoveryConfiguration['texts'], string>> = {
  forgotPassword: 'Forgot password link',
  requestTitle: 'Recovery title',
  requestSubtitle: 'Recovery subtitle',
  requestButton: 'Send link button',
  requestSent: 'Recovery email requested',
  resetTitle: 'New password title',
  resetSubtitle: 'New password subtitle',
  resetButton: 'Save password button',
  passwordChanged: 'Password changed',
  invalidLink: 'Invalid recovery link',
  backToLogin: 'Return to login',
};

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className="wr-menu-editor-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Preview({
  configuration,
  mobile,
  view,
}: {
  readonly configuration: WebLoginConfiguration;
  readonly mobile: boolean;
  readonly view: WebLoginView;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const { mode } = useContext(ProjectThemeContext);
  const styles = useContext(ProjectStylesContext);
  useEffect(() => {
    if (!ref.current) return;
    const login = new WebLogin(ref.current, { interactive: false });
    login.styleCatalog =
      embeddedComponentStyleCatalog(
        defaultComponentRegistry.require('WebLogin'),
        { props: { configuration } },
        styles,
      ) ?? [];
    const selected =
      (view === 'register' && !configuration.allowRegistration) ||
      ((view === 'recovery' || view === 'reset') && configuration.recovery?.enabled === false)
        ? 'login'
        : view;
    login.configuration = {
      ...configuration,
      initialView: selected === 'reset' ? 'login' : selected,
    };
    if (selected === 'reset') login.view = 'reset';
    return () => login.dispose();
  }, [configuration, view, styles]);
  return (
    <div
      className="wr-login-editor-preview-surface wr-project-surface"
      data-webrad-theme={mode}
      data-mobile={mobile}
    >
      <div ref={ref} />
    </div>
  );
}

export function LoginConfigurationDialog({
  component,
  restGoEnabled,
  onSave,
  onClose,
}: {
  readonly component: ComponentNode;
  readonly restGoEnabled: boolean;
  readonly onSave: (configuration: WebLoginConfiguration) => void;
  readonly onClose: () => void;
}): ReactElement {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const styles = useContext(ProjectStylesContext);
  const slots = defaultComponentRegistry.require(component.type).embeddedStyles?.slots ?? [];
  const [draft, setDraft] = useState(() => {
    const config =
      component.props.configuration === undefined
        ? createDefaultWebLoginConfiguration()
        : parseWebLoginConfiguration(component.props.configuration);
    const bindings: Partial<Record<WebLoginStyleSlot, string | null>> = {};
    for (const slot of slots) {
      const key = slot.name as WebLoginStyleSlot;
      const selected = config.styles?.[key];
      bindings[key] =
        selected !== undefined
          ? selected
          : slot.defaultStyle === 'none'
            ? null
            : (styles.find(
                (style) => style.componentType === slot.componentType && style.preset === 'default',
              )?.id ?? null);
    }
    return { ...config, styles: bindings as WebLoginStyleBindings };
  });
  const [section, setSection] = useState<'Behavior' | 'Fields' | 'Texts' | 'Styles' | 'Recovery'>(
    'Behavior',
  );
  const [mobile, setMobile] = useState(false);
  const [previewView, setPreviewView] = useState<WebLoginView>('login');
  const recovery = draft.recovery ?? createDefaultWebLoginRecoveryConfiguration(draft.language);
  const setRecovery = (patch: Partial<WebLoginRecoveryConfiguration>): void => {
    setDraft((current) => ({
      ...current,
      recovery: {
        ...(current.recovery ?? createDefaultWebLoginRecoveryConfiguration(current.language)),
        ...patch,
      },
      ...(patch.enabled === false && current.initialView === 'recovery'
        ? { initialView: 'login' as const }
        : {}),
    }));
  };
  let error: string | null = null;
  try {
    parseWebLoginConfiguration(draft);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'Invalid Login configuration.';
  }
  for (const slot of slots) {
    const id = draft.styles?.[slot.name as WebLoginStyleSlot];
    if (
      typeof id === 'string' &&
      !styles.some((style) => style.id === id && style.componentType === slot.componentType)
    )
      error = `Choose a compatible style for ${slot.label}.`;
  }
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const previous = returnFocus.current;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ].filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  const set = <K extends keyof WebLoginConfiguration>(
    key: K,
    value: WebLoginConfiguration[K],
  ): void => {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === 'allowRegistration' && value === false ? { initialView: 'login' as const } : {}),
    }));
  };
  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={keyDown}>
      <SharedComponentStyles />
      <section
        ref={ref}
        className="wr-modal wr-menu-configuration-dialog wr-login-configuration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <h2 id={titleId}>Configure Login</h2>
            <p>{component.name}</p>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close Login configuration"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="wr-menu-editor-body">
          <div className="wr-menu-editor-main">
            <nav className="wr-menu-editor-tabs" aria-label="Login configuration sections">
              {(['Behavior', 'Fields', 'Texts', 'Styles', 'Recovery'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={tab === section}
                  onClick={() => setSection(tab)}
                >
                  {tab}
                </button>
              ))}
            </nav>
            <div className="wr-menu-editor-content wr-login-editor-fields" data-section={section}>
              {section === 'Behavior' && (
                <>
                  <Field label="Presentation">
                    <select
                      value={draft.presentation}
                      onChange={(event) =>
                        set('presentation', event.target.value === 'popup' ? 'popup' : 'panel')
                      }
                    >
                      <option value="panel">Panel</option>
                      <option value="popup">Popup</option>
                    </select>
                  </Field>
                  <Field label="Initial view">
                    <select
                      value={draft.initialView}
                      onChange={(event) =>
                        set(
                          'initialView',
                          event.target.value === 'register'
                            ? 'register'
                            : event.target.value === 'recovery'
                              ? 'recovery'
                              : 'login',
                        )
                      }
                    >
                      <option value="login">Login</option>
                      <option value="register" disabled={!draft.allowRegistration}>
                        Registration
                      </option>
                      <option value="recovery" disabled={!recovery.enabled}>
                        Recovery
                      </option>
                    </select>
                  </Field>
                  {(Object.keys(behaviorLabels) as (keyof typeof behaviorLabels)[]).map((key) => (
                    <label className="wr-login-editor-check" key={key}>
                      <input
                        type="checkbox"
                        checked={draft[key]}
                        disabled={
                          (['openOnShow', 'dismissible'].includes(key) &&
                            draft.presentation !== 'popup') ||
                          ([
                            'showFullName',
                            'confirmPassword',
                            'autoLoginAfterRegistration',
                          ].includes(key) &&
                            !draft.allowRegistration) ||
                          (key === 'requireFullName' &&
                            (!draft.allowRegistration || !draft.showFullName))
                        }
                        onChange={(event) => set(key, event.target.checked)}
                      />
                      <span>{behaviorLabels[key]}</span>
                    </label>
                  ))}
                  {!restGoEnabled && (
                    <p className="wr-login-editor-hint">
                      Enable RestGo integration and configure Connection to authenticate in Preview
                      and generated applications.
                    </p>
                  )}
                </>
              )}
              {section === 'Fields' && (
                <>
                  {(['fullName', 'email', 'password', 'passwordConfirmation'] as const).map(
                    (key) => (
                      <fieldset key={key}>
                        <legend>
                          {
                            {
                              fullName: 'Full name',
                              email: 'Email',
                              password: 'Password',
                              passwordConfirmation: 'Password confirmation',
                            }[key]
                          }
                        </legend>
                        <Field label="Label">
                          <input
                            value={draft[key].label}
                            onChange={(event) =>
                              set(key, { ...draft[key], label: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="Placeholder">
                          <input
                            value={draft[key].placeholder}
                            onChange={(event) =>
                              set(key, { ...draft[key], placeholder: event.target.value })
                            }
                          />
                        </Field>
                      </fieldset>
                    ),
                  )}
                </>
              )}
              {section === 'Texts' && (
                <>
                  <Field label="Language preset">
                    <select
                      value={draft.language}
                      onChange={(event) => {
                        const language = event.target.value === 'pt-BR' ? 'pt-BR' : 'en';
                        const defaults = createDefaultWebLoginConfiguration(language);
                        setDraft((current) => ({
                          ...current,
                          language,
                          texts: defaults.texts,
                          email: defaults.email,
                          password: defaults.password,
                          fullName: defaults.fullName,
                          passwordConfirmation: defaults.passwordConfirmation,
                          recovery: {
                            ...(current.recovery ??
                              createDefaultWebLoginRecoveryConfiguration(language)),
                            texts: createDefaultWebLoginRecoveryConfiguration(language).texts,
                          },
                        }));
                      }}
                    >
                      <option value="en">English</option>
                      <option value="pt-BR">Português (Brasil)</option>
                    </select>
                  </Field>
                  {(Object.keys(textLabels) as (keyof WebLoginTexts)[]).map((key) => (
                    <Field label={textLabels[key]} key={key}>
                      <textarea
                        rows={2}
                        value={draft.texts[key]}
                        onChange={(event) =>
                          set('texts', { ...draft.texts, [key]: event.target.value })
                        }
                      />
                    </Field>
                  ))}
                </>
              )}
              {section === 'Recovery' && (
                <>
                  <label className="wr-login-editor-check">
                    <input
                      type="checkbox"
                      checked={recovery.enabled}
                      onChange={(event) => setRecovery({ enabled: event.target.checked })}
                    />
                    <span>Enable account recovery</span>
                  </label>
                  <label className="wr-login-editor-check">
                    <input
                      type="checkbox"
                      checked={recovery.automaticLinks}
                      disabled={!recovery.enabled}
                      onChange={(event) => setRecovery({ automaticLinks: event.target.checked })}
                    />
                    <span>Open recovery links automatically</span>
                  </label>
                  <Field label="Recovery return URL">
                    <input
                      type="url"
                      value={recovery.returnUrl}
                      placeholder="Current application route"
                      onChange={(event) => setRecovery({ returnUrl: event.target.value })}
                    />
                  </Field>
                  <p className="wr-login-editor-hint">
                    Leave the URL empty to return to this application route. Email delivery uses the
                    RestGo server's SMTP configuration.
                  </p>
                  {(
                    Object.keys(
                      recoveryTextLabels,
                    ) as (keyof WebLoginRecoveryConfiguration['texts'])[]
                  ).map((key) => (
                    <Field label={recoveryTextLabels[key]} key={key}>
                      <textarea
                        rows={2}
                        value={recovery.texts[key]}
                        onChange={(event) =>
                          setRecovery({ texts: { ...recovery.texts, [key]: event.target.value } })
                        }
                      />
                    </Field>
                  ))}
                </>
              )}
              {section === 'Styles' && (
                <>
                  <p className="wr-login-editor-hint">
                    Link each element to a compatible project Style. Create and edit Styles in the
                    Styles workspace.
                  </p>
                  {slots.map((slot) => {
                    const key = slot.name as WebLoginStyleSlot;
                    return (
                      <Field label={slot.label} key={key}>
                        <select
                          aria-label={`Style for Login ${slot.label}`}
                          value={draft.styles?.[key] ?? ''}
                          onChange={(event) =>
                            set('styles', { ...draft.styles, [key]: event.target.value || null })
                          }
                        >
                          <option value="">None</option>
                          {styles
                            .filter((style) => style.componentType === slot.componentType)
                            .map((style) => (
                              <option key={style.id} value={style.id}>
                                {style.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    );
                  })}
                </>
              )}
            </div>
          </div>
          <aside className="wr-menu-editor-preview wr-login-editor-preview">
            <header>
              <strong>Preview</strong>
              <div>
                <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>
                  Desktop
                </button>
                <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>
                  Mobile
                </button>
                <select
                  aria-label="Login preview view"
                  value={previewView}
                  onChange={(event) =>
                    setPreviewView(
                      (['login', 'register', 'recovery', 'reset'] as const).find(
                        (value) => value === event.target.value,
                      ) ?? 'login',
                    )
                  }
                >
                  <option value="login">Login</option>
                  <option value="register" disabled={!draft.allowRegistration}>
                    Registration
                  </option>
                  <option value="recovery" disabled={!recovery.enabled}>
                    Recovery
                  </option>
                  <option value="reset" disabled={!recovery.enabled}>
                    New password
                  </option>
                </select>
              </div>
            </header>
            <div className="wr-login-editor-preview-canvas" inert>
              <Preview
                configuration={error === null ? draft : createDefaultWebLoginConfiguration()}
                mobile={mobile}
                view={previewView}
              />
            </div>
          </aside>
        </div>
        {error && (
          <p className="wr-form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="wr-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={error !== null}
            onClick={() => onSave(parseWebLoginConfiguration(draft))}
          >
            Save Login
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
