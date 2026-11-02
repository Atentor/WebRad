import { themeColorReference } from './theme.js';

export const WEB_LOGIN_STYLE_SLOTS = [
  { name: 'panel', label: 'Panel', componentType: 'WebPanel' },
  { name: 'popup', label: 'Popup', componentType: 'WebPopup' },
  { name: 'title', label: 'Title', componentType: 'WebLabel' },
  { name: 'subtitle', label: 'Subtitle', componentType: 'WebLabel' },
  { name: 'fullNameLabel', label: 'Full name label', componentType: 'WebLabel' },
  { name: 'fullName', label: 'Full name input', componentType: 'WebEdit' },
  { name: 'emailLabel', label: 'Email label', componentType: 'WebLabel' },
  { name: 'email', label: 'Email input', componentType: 'WebEdit' },
  { name: 'passwordLabel', label: 'Password label', componentType: 'WebLabel' },
  { name: 'password', label: 'Password input', componentType: 'WebEdit' },
  {
    name: 'passwordConfirmationLabel',
    label: 'Password confirmation label',
    componentType: 'WebLabel',
  },
  { name: 'passwordConfirmation', label: 'Password confirmation input', componentType: 'WebEdit' },
  { name: 'remember', label: 'Remember me', componentType: 'WebCheckBox' },
  { name: 'submit', label: 'Submit button', componentType: 'WebButton' },
  {
    name: 'passwordToggle',
    label: 'Show password button',
    componentType: 'WebButton',
    defaultStyle: 'none',
  },
  {
    name: 'registerLink',
    label: 'Registration link',
    componentType: 'WebButton',
    defaultStyle: 'none',
  },
  {
    name: 'loginLink',
    label: 'Return to login link',
    componentType: 'WebButton',
    defaultStyle: 'none',
  },
  {
    name: 'recoveryLink',
    label: 'Recovery link',
    componentType: 'WebButton',
    defaultStyle: 'none',
  },
  { name: 'close', label: 'Close button', componentType: 'WebButton', defaultStyle: 'none' },
  { name: 'feedback', label: 'Success / status message', componentType: 'WebLabel' },
  {
    name: 'errorFeedback',
    label: 'Error message',
    componentType: 'WebLabel',
    defaultStyle: 'none',
  },
] as const;

export type WebLoginStyleSlot = (typeof WEB_LOGIN_STYLE_SLOTS)[number]['name'];
/** Omitted entries follow the compatible default style; null explicitly selects None. */
export type WebLoginStyleBindings = Readonly<Partial<Record<WebLoginStyleSlot, string | null>>>;

export type WebLoginView = 'login' | 'register' | 'recovery' | 'reset';
export type WebLoginPresentation = 'panel' | 'popup';

export interface WebLoginField {
  readonly label: string;
  readonly placeholder: string;
}

export interface WebLoginAppearance {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly background: string;
  readonly backgroundEnd?: string;
  readonly foreground: string;
  readonly heading?: string;
  readonly muted: string;
  readonly border: string;
  readonly borderEnd?: string;
  readonly inputBackground: string;
  readonly inputBackgroundEnd?: string;
  readonly primary: string;
  readonly primaryEnd?: string;
  readonly focus?: string;
  readonly onPrimary: string;
  readonly error: string;
  readonly borderRadius: number;
  readonly padding: number;
  readonly gap: number;
  readonly maxWidth: number;
  readonly fieldHeight: number;
}

export interface WebLoginTexts {
  readonly loginTitle: string;
  readonly loginSubtitle: string;
  readonly registerTitle: string;
  readonly registerSubtitle: string;
  readonly loginButton: string;
  readonly registerButton: string;
  readonly switchToRegister: string;
  readonly switchToLogin: string;
  readonly remember: string;
  readonly showPassword: string;
  readonly hidePassword: string;
  readonly close: string;
  readonly busy: string;
  readonly registered: string;
  readonly authenticated: string;
  readonly passwordMismatch: string;
  readonly unavailable: string;
  readonly requestFailed: string;
}

export interface WebLoginRecoveryConfiguration {
  readonly enabled: boolean;
  readonly automaticLinks: boolean;
  /** Blank returns to the current application route. Otherwise use an absolute HTTP(S) URL. */
  readonly returnUrl: string;
  readonly texts: {
    readonly forgotPassword: string;
    readonly requestTitle: string;
    readonly requestSubtitle: string;
    readonly requestButton: string;
    readonly requestSent: string;
    readonly resetTitle: string;
    readonly resetSubtitle: string;
    readonly resetButton: string;
    readonly passwordChanged: string;
    readonly invalidLink: string;
    readonly backToLogin: string;
  };
}

export function createDefaultWebLoginRecoveryConfiguration(
  language: 'en' | 'pt-BR' = 'en',
): WebLoginRecoveryConfiguration {
  const pt = language === 'pt-BR';
  return {
    enabled: true,
    automaticLinks: true,
    returnUrl: '',
    texts: {
      forgotPassword: pt ? 'Esqueci minha senha' : 'Forgot your password?',
      requestTitle: pt ? 'Recupere sua conta' : 'Recover your account',
      requestSubtitle: pt
        ? 'Informe seu e-mail para receber o link de recuperação.'
        : 'Enter your email to receive a password reset link.',
      requestButton: pt ? 'Enviar link' : 'Send reset link',
      requestSent: pt
        ? 'Se a conta estiver disponível para recuperação, você receberá um e-mail com as instruções.'
        : 'If the account is eligible for recovery, you will receive an email with instructions.',
      resetTitle: pt ? 'Defina uma nova senha' : 'Set a new password',
      resetSubtitle: pt
        ? 'Digite e confirme sua nova senha.'
        : 'Enter and confirm your new password.',
      resetButton: pt ? 'Salvar nova senha' : 'Save new password',
      passwordChanged: pt
        ? 'Senha alterada. Entre com sua nova senha.'
        : 'Password changed. Sign in with your new password.',
      invalidLink: pt
        ? 'O link de recuperação é inválido ou expirou. Solicite um novo link.'
        : 'The recovery link is invalid or expired. Request a new link.',
      backToLogin: pt ? 'Voltar para entrar' : 'Back to sign in',
    },
  };
}

/** Credentials and transient runtime state are never part of this saved configuration. */
export interface WebLoginConfiguration {
  readonly version: 1;
  readonly presentation: WebLoginPresentation;
  readonly initialView: Exclude<WebLoginView, 'reset'>;
  readonly allowRegistration: boolean;
  readonly showFullName: boolean;
  readonly requireFullName: boolean;
  readonly confirmPassword: boolean;
  readonly showRemember: boolean;
  readonly rememberDefault: boolean;
  readonly showPasswordToggle: boolean;
  readonly autoLoginAfterRegistration: boolean;
  readonly closeOnLogin: boolean;
  readonly openOnShow: boolean;
  readonly dismissible: boolean;
  readonly language: 'en' | 'pt-BR';
  readonly email: WebLoginField;
  readonly password: WebLoginField;
  readonly fullName: WebLoginField;
  readonly passwordConfirmation: WebLoginField;
  readonly texts: WebLoginTexts;
  /** Layout defaults and compatibility for earlier saved paint values. New paint comes from styles. */
  readonly appearance: WebLoginAppearance;
  readonly recovery?: WebLoginRecoveryConfiguration;
  readonly styles?: WebLoginStyleBindings;
}

export function createDefaultWebLoginConfiguration(
  language: 'en' | 'pt-BR' = 'en',
): WebLoginConfiguration {
  const pt = language === 'pt-BR';
  return {
    version: 1,
    presentation: 'panel',
    initialView: 'login',
    allowRegistration: true,
    showFullName: true,
    requireFullName: true,
    confirmPassword: true,
    showRemember: true,
    rememberDefault: false,
    showPasswordToggle: true,
    autoLoginAfterRegistration: false,
    closeOnLogin: true,
    openOnShow: true,
    dismissible: true,
    language,
    recovery: createDefaultWebLoginRecoveryConfiguration(language),
    styles: {},
    email: { label: pt ? 'E-mail' : 'Email', placeholder: 'name@example.com' },
    password: { label: pt ? 'Senha' : 'Password', placeholder: '' },
    fullName: { label: pt ? 'Nome completo' : 'Full name', placeholder: '' },
    passwordConfirmation: { label: pt ? 'Confirmar senha' : 'Confirm password', placeholder: '' },
    texts: {
      loginTitle: pt ? 'Entre na sua conta' : 'Welcome back',
      loginSubtitle: pt
        ? 'Use seu e-mail e senha para continuar.'
        : 'Sign in with your email and password.',
      registerTitle: pt ? 'Crie sua conta' : 'Create your account',
      registerSubtitle: pt
        ? 'Preencha seus dados para começar.'
        : 'Enter your details to get started.',
      loginButton: pt ? 'Entrar' : 'Sign in',
      registerButton: pt ? 'Criar conta' : 'Create account',
      switchToRegister: pt ? 'Ainda não tem conta? Cadastre-se' : 'New here? Create an account',
      switchToLogin: pt ? 'Já tem uma conta? Entrar' : 'Already have an account? Sign in',
      remember: pt ? 'Lembrar de mim' : 'Remember me',
      showPassword: pt ? 'Mostrar senha' : 'Show password',
      hidePassword: pt ? 'Ocultar senha' : 'Hide password',
      close: pt ? 'Fechar' : 'Close',
      busy: pt ? 'Aguarde…' : 'Please wait…',
      registered: pt
        ? 'Conta criada. Entre com seu e-mail e senha.'
        : 'Account created. Sign in with your email and password.',
      authenticated: pt ? 'Você está conectado.' : 'You are signed in.',
      passwordMismatch: pt ? 'As senhas não coincidem.' : 'Passwords do not match.',
      unavailable: pt
        ? 'Configure a conexão RestGo no projeto.'
        : 'Configure the project RestGo connection.',
      requestFailed: pt
        ? 'Não foi possível concluir. Tente novamente.'
        : 'Could not complete the request. Please try again.',
    },
    appearance: {
      fontFamily: 'Roboto, sans-serif',
      fontSize: 14,
      background: themeColorReference('surface'),
      foreground: themeColorReference('text'),
      backgroundEnd: themeColorReference('surface-end'),
      heading: themeColorReference('heading'),
      muted: themeColorReference('text-muted'),
      border: themeColorReference('border'),
      borderEnd: themeColorReference('border-accent'),
      inputBackground: themeColorReference('input'),
      primary: themeColorReference('primary'),
      inputBackgroundEnd: themeColorReference('input-end'),
      primaryEnd: themeColorReference('accent'),
      focus: themeColorReference('focus'),
      onPrimary: themeColorReference('on-primary'),
      error: themeColorReference('danger'),
      borderRadius: 12,
      padding: 20,
      gap: 8,
      maxWidth: 420,
      fieldHeight: 36,
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate saved values without accepting unknown fields, credentials or future versions. */
export function parseWebLoginConfiguration(value: unknown): WebLoginConfiguration {
  if (!record(value)) throw new TypeError('Login configuration must be an object.');
  const defaults = createDefaultWebLoginConfiguration(value.language === 'pt-BR' ? 'pt-BR' : 'en');
  const parse = (
    input: Record<string, unknown>,
    base: Record<string, unknown>,
    path: string,
  ): Record<string, unknown> => {
    for (const key of Object.keys(input))
      if (!Object.hasOwn(base, key)) throw new TypeError(`Unknown Login setting: ${path}${key}.`);
    return Object.fromEntries(
      Object.entries(base).map(([key, fallback]) => {
        if (key === 'styles' && path === '') {
          if (input.styles === undefined) return [key, undefined];
          if (!record(input.styles)) throw new TypeError('Login styles must be an object.');
          for (const [slot, id] of Object.entries(input.styles)) {
            if (
              !WEB_LOGIN_STYLE_SLOTS.some((entry) => entry.name === slot) ||
              (id !== null && (typeof id !== 'string' || id.length === 0 || id.length > 1024))
            )
              throw new TypeError(`Invalid Login style binding: ${slot}.`);
          }
          return [key, { ...input.styles }];
        }
        const item = input[key] ?? fallback;
        if (record(fallback)) {
          if (!record(item)) throw new TypeError(`Invalid Login setting: ${path}${key}.`);
          return [key, parse(item, fallback, `${path}${key}.`)];
        }
        if (typeof item !== typeof fallback || (typeof item === 'number' && !Number.isFinite(item)))
          throw new TypeError(`Invalid Login setting: ${path}${key}.`);
        if (typeof item === 'string' && item.length > 4000)
          throw new RangeError('Login text is too long.');
        return [key, item];
      }),
    );
  };
  const config = parse(value, { ...defaults }, '') as unknown as WebLoginConfiguration;
  // An absent map preserves the original saved appearance until its editor is saved with style bindings.
  if (config.styles === undefined) delete (config as { styles?: WebLoginStyleBindings }).styles;
  // Upgrade only the complete original spacing preset; independently authored sizes stay intact.
  const originalSpacing = {
    fontSize: 16,
    borderRadius: 16,
    padding: 28,
    gap: 16,
    maxWidth: 440,
    fieldHeight: 44,
  } as const;
  if (
    record(value.appearance) &&
    Object.entries(originalSpacing).every(
      ([key, number]) => (value.appearance as Record<string, unknown>)[key] === number,
    )
  ) {
    const appearance = config.appearance as unknown as Record<string, unknown>;
    for (const key of Object.keys(originalSpacing) as (keyof typeof originalSpacing)[])
      appearance[key] = defaults.appearance[key];
  }
  const previousCompactSpacing = {
    fontSize: 14,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    maxWidth: 420,
    fieldHeight: 36,
  } as const;
  if (
    record(value.appearance) &&
    Object.entries(previousCompactSpacing).every(
      ([key, number]) => (value.appearance as Record<string, unknown>)[key] === number,
    )
  ) {
    (config.appearance as unknown as Record<string, unknown>).padding = defaults.appearance.padding;
  }
  // Older custom solid colors keep their appearance instead of acquiring an unrelated end color.
  if (record(value.appearance)) {
    const appearance = config.appearance as unknown as Record<string, unknown>;
    for (const [base, related] of [
      ['background', 'backgroundEnd'],
      ['foreground', 'heading'],
      ['border', 'borderEnd'],
      ['inputBackground', 'inputBackgroundEnd'],
      ['primary', 'primaryEnd'],
      ['primary', 'focus'],
    ] as const) {
      if (
        !Object.hasOwn(value.appearance, related) &&
        typeof value.appearance[base] === 'string' &&
        value.appearance[base] !== defaults.appearance[base]
      )
        appearance[related] = value.appearance[base];
    }
  }
  if (
    config.version !== 1 ||
    !['panel', 'popup'].includes(config.presentation) ||
    !['login', 'register', 'recovery'].includes(config.initialView) ||
    !['en', 'pt-BR'].includes(config.language)
  )
    throw new TypeError('Invalid Login version, presentation, view or language.');
  if (!config.allowRegistration && config.initialView === 'register')
    throw new TypeError('Enable registration before selecting the registration view.');
  if (config.initialView === 'recovery' && config.recovery?.enabled === false)
    throw new TypeError('Enable recovery before selecting the recovery view.');
  if (config.recovery?.returnUrl) {
    let url: URL;
    try {
      url = new URL(config.recovery.returnUrl);
    } catch {
      throw new TypeError('Recovery return URL must be an absolute HTTP or HTTPS URL.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new TypeError(
        'Recovery return URL must be an absolute HTTP or HTTPS URL without credentials.',
      );
    const fragment = url.hash.slice(1);
    const queryIndex = fragment.startsWith('/') ? fragment.indexOf('?') : -1;
    const fragmentParameters = new URLSearchParams(
      queryIndex >= 0 ? fragment.slice(queryIndex + 1) : fragment,
    );
    if (url.searchParams.has('reset_token') || fragmentParameters.has('reset_token'))
      throw new TypeError('Recovery tokens cannot be saved in a return URL.');
  }
  for (const [key, number] of Object.entries(config.appearance)) {
    if (typeof number !== 'number') continue;
    const minimum =
      key === 'maxWidth' ? 240 : key === 'fieldHeight' ? 36 : key === 'fontSize' ? 12 : 0;
    if (number < minimum || number > 1200)
      throw new RangeError(`Invalid Login appearance: ${key}.`);
  }
  return config;
}
