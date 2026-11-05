import type { RestGoCurrentUser } from '@webrad/restgo-sdk';
import { WebComponent } from './component.js';
import { WebButton, WebCheckBox, WebEdit, WebLabel, WebPanel, WebPopup } from './controls.js';
import { getRestGoClient } from './restgo.js';
import {
  createDefaultWebLoginConfiguration,
  createDefaultWebLoginRecoveryConfiguration,
  parseWebLoginConfiguration,
  WEB_LOGIN_STYLE_SLOTS,
  type WebLoginConfiguration,
  type WebLoginRecoveryConfiguration,
  type WebLoginView,
  type WebLoginStyleSlot,
} from './login-model.js';
import { tokenizeTailwindClasses, type RuntimeComponentStyle } from './visual.js';
import {
  claimLoginRecovery,
  loginRecoveryReturnUrl,
  registerLoginRecovery,
} from './login-recovery.js';

export interface WebLoginOptions {
  /** Designer and configuration previews never contact RestGo. */
  readonly interactive?: boolean;
}

export interface WebLoginUserEvent {
  readonly user: RestGoCurrentUser;
  readonly restored: boolean;
}

export interface WebLoginViewEvent {
  readonly view: WebLoginView;
}

export interface WebLoginRecoveryEvent {
  readonly email: string;
}

export interface WebLoginErrorEvent {
  readonly operation: WebLoginView | 'restore';
  readonly message: string;
  readonly code: string;
  readonly status: number;
}

export interface WebLoginControls {
  readonly panel: WebPanel;
  readonly title: WebLabel;
  readonly subtitle: WebLabel;
  readonly email: WebEdit;
  readonly password: WebEdit;
  readonly fullName: WebEdit;
  readonly passwordConfirmation: WebEdit;
  readonly remember: WebCheckBox;
  readonly submit: WebButton;
}

let sequence = 0;
const instances = new WeakMap<HTMLElement, WebLogin>();

/** A ready-to-use authentication template composed from the ordinary runtime controls. */
export class WebLogin extends WebComponent<HTMLElement> {
  #configuration = createDefaultWebLoginConfiguration();
  #view: WebLoginView = 'login';
  #controls!: WebLoginControls;
  #form!: HTMLFormElement;
  #fields!: HTMLFieldSetElement;
  #feedback!: HTMLElement;
  #popup: WebPopup | undefined;
  #busy = false;
  #disposed = false;
  #revision = 0;
  #authenticated = false;
  #restoredUserId = '';
  #unsubscribe: (() => void) | undefined;
  #visibilityObserver: MutationObserver | undefined;
  #restoreFocus: HTMLElement | null = null;
  #recoveryToken = '';
  #unsubscribeRecovery: (() => void) | undefined;
  #styleCatalog: readonly RuntimeComponentStyle[] = [];
  readonly #appliedStyles = new WeakMap<HTMLElement, readonly string[]>();
  readonly #interactive!: boolean;
  readonly #prefix = `wr-login-${++sequence}`;

  public constructor(element: HTMLElement, options: WebLoginOptions = {}) {
    super(element);
    const existing = instances.get(element);
    if (existing) return existing;
    instances.set(element, this);
    this.#interactive = options.interactive !== false;
    this.element.classList.add('wr-weblogin');
    this.#render();
    if (this.#interactive) {
      this.#unsubscribeRecovery = registerLoginRecovery({
        element,
        eligible: () => {
          if (
            this.#disposed ||
            this.#busy ||
            !this.enabled ||
            !this.#recovery.enabled ||
            !this.#recovery.automaticLinks
          )
            return false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement)
            if (parent.hidden || parent.dataset.webradVisible === 'false') return false;
          return true;
        },
        receive: (token) => this.#receiveRecoveryLink(token),
      });
      this.#visibilityObserver = new MutationObserver((records) => {
        if (
          records.some(
            ({ target }) => target instanceof HTMLElement && target.contains(this.element),
          )
        )
          this.#syncVisibility();
      });
      this.#visibilityObserver.observe(element.ownerDocument, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'data-webrad-visible'],
      });
      queueMicrotask(() => {
        if (!this.#disposed) void this.#bindSession();
      });
    }
  }

  public get configuration(): WebLoginConfiguration {
    return structuredClone(this.#configuration);
  }
  public set configuration(value: WebLoginConfiguration) {
    const configuration = parseWebLoginConfiguration(value);
    this.#validateStyles(configuration, this.#styleCatalog);
    this.#revision++;
    this.#busy = false;
    this.#recoveryToken = '';
    this.#configuration = configuration;
    this.#view = configuration.initialView;
    this.#render();
  }
  public get controls(): WebLoginControls {
    return this.#controls;
  }
  /** The compiler/Designer supplies project style classes; configuration stores only stable IDs. */
  public get styleCatalog(): readonly RuntimeComponentStyle[] {
    return this.#styleCatalog;
  }
  public set styleCatalog(value: readonly RuntimeComponentStyle[]) {
    this.#validateStyles(this.#configuration, value);
    this.#styleCatalog = Object.freeze(value.map((style) => Object.freeze({ ...style })));
    this.#applyStyles();
  }
  #validateStyles(
    configuration: WebLoginConfiguration,
    catalog: readonly RuntimeComponentStyle[],
  ): void {
    for (const slot of WEB_LOGIN_STYLE_SLOTS) {
      const id = configuration.styles?.[slot.name];
      if (
        typeof id === 'string' &&
        !catalog.some((style) => style.id === id && style.componentType === slot.componentType)
      )
        throw new Error(`Login ${slot.label} requires a compatible ${slot.componentType} style.`);
    }
  }
  #applyStyle(element: HTMLElement, name: WebLoginStyleSlot): void {
    element.dataset.loginStyleSlot = name;
    for (const className of this.#appliedStyles.get(element) ?? [])
      element.classList.remove(className);
    this.#appliedStyles.delete(element);
    delete element.dataset.loginStyleId;
    delete element.dataset.loginStyled;
    if (this.#configuration.styles === undefined) return;
    const slot = WEB_LOGIN_STYLE_SLOTS.find((candidate) => candidate.name === name);
    if (!slot) return;
    element.classList.add(`wr-${slot.componentType.toLowerCase()}`);
    const id = this.#configuration.styles[name];
    const style =
      id === null
        ? undefined
        : this.#styleCatalog.find(
            (candidate) =>
              candidate.componentType === slot.componentType &&
              (typeof id === 'string'
                ? candidate.id === id
                : !('defaultStyle' in slot) && candidate.preset === 'default'),
          );
    if (style) {
      const classes = tokenizeTailwindClasses(style.className);
      element.classList.add(...classes);
      element.dataset.loginStyleId = style.id;
      element.dataset.loginStyled = 'true';
      this.#appliedStyles.set(element, classes);
    }
  }
  #applyStyles(): void {
    for (const element of this.element.querySelectorAll<HTMLElement>('[data-login-style-slot]')) {
      const name = WEB_LOGIN_STYLE_SLOTS.find(
        (slot) => slot.name === element.dataset.loginStyleSlot,
      )?.name;
      if (name) this.#applyStyle(element, name);
    }
  }
  public get view(): WebLoginView {
    return this.#view;
  }
  public set view(value: WebLoginView) {
    if (!['login', 'register', 'recovery', 'reset'].includes(value))
      throw new TypeError('Invalid Login view.');
    if (value === 'register' && !this.#configuration.allowRegistration)
      throw new Error('Registration is disabled.');
    if ((value === 'recovery' || value === 'reset') && !this.#recovery.enabled)
      throw new Error('Account recovery is disabled.');
    if (value === 'reset' && this.#interactive && !this.#recoveryToken)
      throw new Error(this.#recovery.texts.invalidLink);
    if (this.#busy || this.#disposed || value === this.#view) return;
    const email = this.#controls.email.value;
    if (value !== 'reset') this.#recoveryToken = '';
    this.#view = value;
    this.#render(email);
    this.emit('OnViewChange', { view: value });
    this.#focus();
  }
  public get busy(): boolean {
    return this.#busy;
  }
  public get open(): boolean {
    return this.#popup?.open ?? this.visible;
  }
  public get email(): string {
    return this.#controls.email.value;
  }
  public set email(value: string) {
    this.#controls.email.value = value;
  }
  public get remember(): boolean {
    return this.#controls.remember.checked;
  }
  public set remember(value: boolean) {
    this.#controls.remember.checked = value;
  }
  public get hasRecoveryToken(): boolean {
    return this.#recoveryToken.length > 0;
  }
  get #recovery(): WebLoginRecoveryConfiguration {
    return (
      this.#configuration.recovery ??
      createDefaultWebLoginRecoveryConfiguration(this.#configuration.language)
    );
  }
  #isRecoveryView(): boolean {
    return this.#view === 'recovery' || this.#view === 'reset';
  }

  public override get enabled(): boolean {
    return super.enabled;
  }
  public override set enabled(value: boolean) {
    super.enabled = value;
    if (this.#fields) this.#lock(this.#busy);
  }
  public override get visible(): boolean {
    return super.visible;
  }
  public override set visible(value: boolean) {
    super.visible = value;
    if (!value) {
      if (this.#isRecoveryView() && this.#busy) {
        this.#revision++;
        this.#busy = false;
      }
      this.#clearPasswords();
      this.#recoveryToken = '';
      if (this.#view === 'reset') {
        this.#view = 'recovery';
        this.#render(this.email);
      }
      this.#popup?.hide();
      this.#lock(this.#busy);
    } else if (this.#configuration.openOnShow) this.#syncVisibility();
  }
  public override show(): void {
    if (this.#disposed) return;
    super.show();
    this.#syncVisibility(true);
  }
  public override hide(): void {
    super.hide();
  }
  public close(): void {
    if (this.#busy && (!this.#authenticated || this.#isRecoveryView())) return;
    this.hide();
    this.emit('OnClose');
  }
  public showLogin(): void {
    this.view = 'login';
    this.show();
  }
  public showRegistration(): void {
    this.view = 'register';
    this.show();
  }
  public showRecovery(): void {
    this.view = 'recovery';
    this.show();
  }
  /** Claims a pending email link without exposing its token to authored code. */
  public openRecoveryLink(): boolean {
    if (this.#disposed || this.#busy || !this.enabled || !this.#recovery.enabled) return false;
    return claimLoginRecovery(this.element, (token) => this.#receiveRecoveryLink(token));
  }
  #receiveRecoveryLink(token: string): void {
    if (token) this.showPasswordReset(token);
    else {
      this.showRecovery();
      this.#failure(
        { message: this.#recovery.texts.invalidLink, code: 'INVALID_RECOVERY_LINK', status: 400 },
        'reset',
      );
    }
  }
  /** The token remains private and is cleared on completion, replacement, hiding or disposal. */
  public showPasswordReset(token: string): void {
    if (this.#busy || this.#disposed) return;
    if (!this.#recovery.enabled) throw new Error('Account recovery is disabled.');
    if (
      !token ||
      token.length > 4096 ||
      [...token].some(
        (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      )
    )
      throw new TypeError(this.#recovery.texts.invalidLink);
    this.#recoveryToken = token;
    if (this.#view === 'reset') this.#render(this.email);
    else this.view = 'reset';
    this.show();
    this.#focus();
  }

  #isPageVisible(): boolean {
    for (let node: HTMLElement | null = this.element; node; node = node.parentElement)
      if (node.hidden || node.dataset.webradVisible === 'false') return false;
    return true;
  }
  #syncVisibility(force = false): void {
    if (this.#disposed || !this.#popup || !this.#interactive) return;
    if (!this.element.isConnected || !this.#isPageVisible()) {
      this.#popup.hide();
      return;
    }
    if ((force || this.#configuration.openOnShow) && !this.#popup.visible) {
      this.#restoreFocus =
        this.element.ownerDocument.activeElement instanceof HTMLElement
          ? this.element.ownerDocument.activeElement
          : null;
      this.#popup.show();
    }
  }
  #focus(): void {
    if (this.#interactive)
      (this.#view === 'reset' ? this.#controls.password : this.#controls.email).element.focus();
  }
  #clearPasswords(): void {
    this.#controls.password.value = '';
    this.#controls.passwordConfirmation.value = '';
  }
  #message(text: string, error = false): void {
    this.#feedback.textContent = text;
    this.#feedback.hidden = !text;
    this.#feedback.dataset.error = String(error);
    this.#feedback.setAttribute('role', error ? 'alert' : 'status');
    this.#applyStyle(this.#feedback, error ? 'errorFeedback' : 'feedback');
  }
  #lock(busy: boolean): void {
    this.#busy = busy;
    this.#fields.disabled =
      busy || !this.enabled || (this.#authenticated && !this.#isRecoveryView());
    this.element.setAttribute('aria-busy', String(busy));
    this.#controls.submit.caption = busy
      ? this.#configuration.texts.busy
      : this.#view === 'recovery'
        ? this.#recovery.texts.requestButton
        : this.#view === 'reset'
          ? this.#recovery.texts.resetButton
          : this.#view === 'register'
            ? this.#configuration.texts.registerButton
            : this.#configuration.texts.loginButton;
  }
  #failure(
    error: { readonly message: string; readonly code: string; readonly status: number },
    operation: WebLoginErrorEvent['operation'],
  ): void {
    const secrets = [
      this.#recoveryToken,
      this.#controls.password.value,
      this.#controls.passwordConfirmation.value,
    ];
    const message = secrets.reduce(
      (value, secret) => (secret ? value.replaceAll(secret, '[redacted]') : value),
      error.message,
    );
    this.#message(message, true);
    this.emit('OnError', {
      operation,
      message,
      code: error.code,
      status: error.status,
    } satisfies WebLoginErrorEvent);
  }
  async #bindSession(): Promise<void> {
    try {
      const client = getRestGoClient();
      this.#unsubscribe = client.auth.onAuthStateChange((event) => {
        if (this.#disposed) return;
        if (event === 'SIGNED_OUT') {
          this.#authenticated = false;
          this.#restoredUserId = '';
          this.#lock(this.#busy);
          if (!this.#isRecoveryView() && !this.#busy) this.#message('');
        } else if (
          !this.#busy &&
          !this.#isRecoveryView() &&
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
        ) {
          const user = client.CurrentUser;
          if (user && user.id !== this.#restoredUserId) {
            this.#restoredUserId = user.id;
            this.#loggedIn(user, event === 'INITIAL_SESSION');
            this.#lock(false);
          }
        }
      }).unsubscribe;
      const result = await client.auth.ready;
      if (this.#disposed) return;
      if (result.error) {
        if (!this.#isRecoveryView()) this.#failure(result.error, 'restore');
        return;
      }
      const user = client.CurrentUser;
      if (user && user.id !== this.#restoredUserId && !this.#busy && !this.#isRecoveryView()) {
        this.#restoredUserId = user.id;
        this.#loggedIn(user, true);
      }
    } catch {
      if (!this.#disposed) this.#message(this.#configuration.texts.unavailable, true);
    }
  }
  #loggedIn(user: RestGoCurrentUser, restored: boolean): void {
    this.#authenticated = true;
    this.#restoredUserId = user.id;
    this.email = user.email;
    this.#clearPasswords();
    this.#message(this.#configuration.texts.authenticated);
    this.emit('OnLogin', { user: { ...user }, restored } satisfies WebLoginUserEvent);
    if (!this.#disposed && this.#configuration.closeOnLogin) this.hide();
  }

  /** Runs the current form through the shared project RestGo client. Never exposes tokens. */
  public async submit(): Promise<void> {
    if (
      !this.#interactive ||
      this.#busy ||
      this.#disposed ||
      !this.enabled ||
      (this.#authenticated && !this.#isRecoveryView())
    )
      return;
    if (!this.#form.reportValidity()) return;
    const config = this.#configuration;
    const operation = this.#view;
    if (
      (operation === 'reset' || (operation === 'register' && config.confirmPassword)) &&
      this.#controls.password.value !== this.#controls.passwordConfirmation.value
    ) {
      this.#message(config.texts.passwordMismatch, true);
      this.#controls.passwordConfirmation.element.focus();
      return;
    }
    const revision = this.#revision;
    const input = { email: this.email.trim(), password: this.#controls.password.value };
    const remember = config.showRemember ? this.remember : config.rememberDefault;
    const fullName = config.showFullName ? this.#controls.fullName.value.trim() : '';
    let completed: (() => void) | undefined;
    this.#lock(true);
    this.#message('');
    try {
      const client = getRestGoClient();
      if (operation === 'recovery') {
        const view = this.element.ownerDocument.defaultView;
        if (!view) throw new Error('No application window.');
        const url = loginRecoveryReturnUrl(
          this.#recovery.returnUrl || view.location.href,
          this.#recovery.returnUrl ? '' : this.id,
        );
        const result = await client.auth.resetPasswordForEmail(input.email, { url });
        if (this.#disposed || revision !== this.#revision) return;
        if (result.error) {
          this.#failure(result.error, operation);
          return;
        }
        if (!result.data.success) throw new Error('Recovery request was not accepted.');
        this.#message(this.#recovery.texts.requestSent);
        completed = () =>
          this.emit('OnRecoveryRequested', { email: input.email } satisfies WebLoginRecoveryEvent);
        return;
      }
      if (operation === 'reset') {
        if (!this.#recoveryToken) {
          this.#failure(
            {
              message: this.#recovery.texts.invalidLink,
              code: 'INVALID_RECOVERY_LINK',
              status: 400,
            },
            operation,
          );
          return;
        }
        const result = await client.auth.confirmPasswordReset({
          token: this.#recoveryToken,
          password: input.password,
        });
        if (this.#disposed || revision !== this.#revision) return;
        if (result.error) {
          this.#failure(result.error, operation);
          return;
        }
        if (!result.data.success) throw new Error('Password reset was not accepted.');
        this.#recoveryToken = '';
        // Revalidate any existing identity; a reset never creates a session.
        if (client.CurrentUser) await client.auth.getSession();
        if (this.#disposed || revision !== this.#revision) return;
        this.#authenticated = false;
        this.#restoredUserId = '';
        this.#view = 'login';
        this.#render(input.email);
        this.#message(this.#recovery.texts.passwordChanged);
        completed = () => {
          this.emit('OnPasswordReset');
          if (!this.#disposed && revision === this.#revision)
            this.emit('OnViewChange', { view: 'login' });
        };
        return;
      }
      await client.auth.ready;
      if (this.#disposed || revision !== this.#revision) return;
      if (operation === 'register') {
        const registered = await client.auth.signUp({
          ...input,
          ...(config.showFullName ? { fullName } : {}),
        });
        if (this.#disposed || revision !== this.#revision) return;
        if (registered.error) {
          this.#failure(registered.error, operation);
          return;
        }
        const user = registered.data;
        this.emit('OnRegister', {
          user: {
            nome: user.fullName,
            email: user.email,
            id: user.id,
            emailconfirmed: user.emailConfirmed,
            ativo: user.active,
          },
          restored: false,
        } satisfies WebLoginUserEvent);
        if (this.#disposed || revision !== this.#revision) return;
        if (!config.autoLoginAfterRegistration) {
          this.#view = 'login';
          this.#render(input.email);
          this.#message(config.texts.registered);
          this.emit('OnViewChange', { view: 'login' });
          this.#controls.password.element.focus();
          return;
        }
      }
      const result = await client.auth.signInWithPassword({ ...input, remember });
      if (this.#disposed || revision !== this.#revision) return;
      if (result.error) {
        this.#failure(result.error, 'login');
        return;
      }
      const user = client.CurrentUser;
      if (user) this.#loggedIn(user, false);
    } catch (error) {
      if (!this.#disposed && revision === this.#revision)
        this.#failure(
          {
            message:
              error instanceof Error && error.name === 'RestGoNotConfiguredError'
                ? config.texts.unavailable
                : config.texts.requestFailed,
            code: 'LOGIN_UNAVAILABLE',
            status: 0,
          },
          operation,
        );
    } finally {
      input.password = '';
      if (!this.#disposed && revision === this.#revision) {
        this.#clearPasswords();
        this.#lock(false);
        completed?.();
      }
    }
  }

  #disposeControls(): void {
    if (this.#controls) for (const control of Object.values(this.#controls)) control.dispose();
    this.#popup?.dispose();
    this.#popup = undefined;
  }
  #render(email = ''): void {
    this.#disposeControls();
    const doc = this.element.ownerDocument;
    const config = this.#configuration;
    const register = this.#view === 'register';
    const recovering = this.#view === 'recovery';
    const resetting = this.#view === 'reset';
    const element = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      className: string,
      slot?: WebLoginStyleSlot,
    ): HTMLElementTagNameMap[K] => {
      const node = doc.createElement(tag);
      node.className = className;
      if (slot) node.dataset.loginStyleSlot = slot;
      return node;
    };
    this.element.replaceChildren();
    this.element.lang = config.language;
    this.element.dataset.loginPresentation = config.presentation;
    this.element.dataset.loginView = this.#view;
    this.element.dataset.loginDesign = String(!this.#interactive);
    this.element.dataset.loginStyling = config.styles === undefined ? 'legacy' : 'styles';
    const panelElement = element('div', 'wr-login-panel', 'panel');
    const panel = new WebPanel(panelElement);
    const title = new WebLabel(element('h2', 'wr-login-title', 'title'));
    title.element.id = `${this.#prefix}-title`;
    title.caption = recovering
      ? this.#recovery.texts.requestTitle
      : resetting
        ? this.#recovery.texts.resetTitle
        : register
          ? config.texts.registerTitle
          : config.texts.loginTitle;
    const subtitle = new WebLabel(element('p', 'wr-login-subtitle', 'subtitle'));
    subtitle.caption = recovering
      ? this.#recovery.texts.requestSubtitle
      : resetting
        ? this.#recovery.texts.resetSubtitle
        : register
          ? config.texts.registerSubtitle
          : config.texts.loginSubtitle;
    subtitle.element.hidden = !subtitle.caption;
    const form = element('form', 'wr-login-form');
    form.setAttribute('aria-labelledby', title.element.id);
    const fields = element('fieldset', 'wr-login-fields');
    form.append(fields);
    const field = (
      key: 'email' | 'password' | 'fullName' | 'passwordConfirmation',
      type: string,
      autocomplete: string,
      shown: boolean,
      required: boolean,
    ): WebEdit => {
      const label = element('label', 'wr-login-field');
      const caption = new WebLabel(
        element('span', 'wr-login-label', `${key}Label` as WebLoginStyleSlot),
      );
      caption.caption = config[key].label;
      const input = element('input', 'wr-login-input', key);
      input.type = type;
      input.name = key;
      input.autocomplete = autocomplete as AutoFill;
      input.id = `${this.#prefix}-${key}`;
      input.required = required && shown;
      input.disabled = !shown;
      input.placeholder = config[key].placeholder;
      input.setAttribute('aria-label', config[key].label || key);
      const edit = new WebEdit(input);
      label.htmlFor = input.id;
      label.append(caption.element, input);
      label.hidden = !shown;
      fields.append(label);
      return edit;
    };
    const fullName = field(
      'fullName',
      'text',
      'name',
      register && config.showFullName,
      config.requireFullName,
    );
    const emailInput = field(
      'email',
      'email',
      resetting ? 'off' : 'username',
      !resetting,
      !resetting,
    );
    emailInput.value = email;
    const password = field(
      'password',
      'password',
      register || resetting ? 'new-password' : 'current-password',
      !recovering,
      !recovering,
    );
    const confirmation = field(
      'passwordConfirmation',
      'password',
      'new-password',
      resetting || (register && config.confirmPassword),
      true,
    );
    const rememberElement = element('label', 'wr-login-remember', 'remember');
    const checkbox = element('input', '');
    checkbox.type = 'checkbox';
    const rememberCaption = new WebLabel(element('span', ''));
    rememberCaption.element.dataset.webradCheckboxCaption = '';
    rememberCaption.caption = config.texts.remember;
    rememberElement.append(checkbox, rememberCaption.element);
    rememberElement.hidden = this.#view !== 'login' || !config.showRemember;
    const remember = new WebCheckBox(rememberElement);
    remember.checked = config.rememberDefault;
    const options = element('div', 'wr-login-options');
    options.hidden =
      recovering || ((register || resetting || !config.showRemember) && !config.showPasswordToggle);
    options.append(rememberElement);
    fields.append(options);
    if (config.showPasswordToggle) {
      const toggle = new WebButton(element('button', 'wr-login-link', 'passwordToggle'));
      toggle.element.dataset.loginAction = 'toggle-password';
      toggle.element.type = 'button';
      toggle.caption = config.texts.showPassword;
      toggle.element.setAttribute('aria-pressed', 'false');
      toggle.element.addEventListener('click', () => {
        const show = password.inputType === 'password';
        password.inputType = show ? 'text' : 'password';
        confirmation.inputType = show ? 'text' : 'password';
        toggle.caption = show ? config.texts.hidePassword : config.texts.showPassword;
        toggle.element.setAttribute('aria-pressed', String(show));
      });
      options.append(toggle.element);
    }
    const submit = new WebButton(element('button', 'wr-login-submit', 'submit'));
    // The template owns the primary action's content-sized, centered placement.
    submit.element.style.setProperty('width', 'fit-content', 'important');
    submit.element.style.setProperty('max-width', '100%', 'important');
    submit.element.style.setProperty('align-self', 'center', 'important');
    submit.element.style.setProperty('margin-inline', 'auto', 'important');
    submit.element.type = 'submit';
    fields.append(submit.element);
    this.#feedback = new WebLabel(element('p', 'wr-login-feedback', 'feedback')).element;
    this.#feedback.setAttribute('aria-live', 'polite');
    this.#feedback.hidden = true;
    fields.append(this.#feedback);
    if (this.#view === 'login' && this.#recovery.enabled) {
      const recover = new WebButton(
        element('button', 'wr-login-link wr-login-recovery-link', 'recoveryLink'),
      );
      recover.element.dataset.loginAction = 'recovery';
      recover.element.type = 'button';
      recover.caption = this.#recovery.texts.forgotPassword;
      recover.element.addEventListener('click', () => this.showRecovery());
      fields.append(recover.element);
    }
    if (recovering || resetting) {
      const back = new WebButton(element('button', 'wr-login-link', 'loginLink'));
      back.element.dataset.loginAction = 'login';
      back.element.type = 'button';
      back.caption = this.#recovery.texts.backToLogin;
      back.element.addEventListener('click', () => this.showLogin());
      fields.append(back.element);
    } else if (config.allowRegistration) {
      const changeView = new WebButton(
        element('button', 'wr-login-link', register ? 'loginLink' : 'registerLink'),
      );
      changeView.element.dataset.loginAction = register ? 'login' : 'register';
      changeView.element.type = 'button';
      changeView.caption = register ? config.texts.switchToLogin : config.texts.switchToRegister;
      changeView.element.addEventListener('click', () => {
        this.view = register ? 'login' : 'register';
      });
      fields.append(changeView.element);
    }
    panelElement.append(title.element, subtitle.element, form);
    this.#controls = Object.freeze({
      panel,
      title,
      subtitle,
      email: emailInput,
      password,
      fullName,
      passwordConfirmation: confirmation,
      remember,
      submit,
    });
    this.#form = form;
    this.#fields = fields;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    if (config.presentation === 'popup') {
      const close = new WebButton(element('button', 'wr-login-close', 'close'));
      close.caption = config.texts.close;
      close.element.type = 'button';
      close.element.hidden = !config.dismissible;
      close.element.addEventListener('click', () => this.close());
      panelElement.prepend(close.element);
    }
    if (config.presentation === 'popup' && this.#interactive) {
      const dialog = element('dialog', 'wr-login-dialog', 'popup');
      dialog.setAttribute('aria-labelledby', title.element.id);
      const popup = new WebPopup(dialog);
      popup.visible = false;
      this.#popup = popup;
      dialog.querySelector('[data-webrad-popup-children]')?.append(panelElement);
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (config.dismissible) this.close();
      });
      dialog.addEventListener('close', () => {
        if (this.#restoreFocus?.isConnected) this.#restoreFocus.focus();
      });
      this.element.append(dialog);
    } else if (config.presentation === 'popup') {
      const preview = element('div', 'wr-login-dialog wr-login-static-popup', 'popup');
      const children = element('div', 'wr-popup-children');
      children.dataset.webradPopupChildren = '';
      children.append(panelElement);
      preview.append(children);
      this.element.append(preview);
    } else this.element.append(panelElement);
    const appearanceOwner = this.#popup?.element ?? this.element;
    for (const [name, value] of Object.entries(config.appearance))
      appearanceOwner.style.setProperty(
        `--wr-login-${name}`,
        typeof value === 'number' ? `${value}px` : value,
      );
    this.#applyStyles();
    this.#lock(this.#busy);
    if (this.#authenticated && !this.#isRecoveryView()) this.#message(config.texts.authenticated);
    queueMicrotask(() => {
      if (!this.#disposed) this.#syncVisibility();
    });
  }

  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    instances.delete(this.element);
    this.#revision++;
    this.#clearPasswords();
    this.#recoveryToken = '';
    this.#unsubscribeRecovery?.();
    this.#unsubscribe?.();
    this.#visibilityObserver?.disconnect();
    this.#disposeControls();
    super.dispose();
  }
}
