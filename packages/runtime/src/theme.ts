export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedThemeMode = 'light' | 'dark';

export const THEME_COLOR_NAMES = [
  'background',
  'background-end',
  'surface',
  'surface-end',
  'surface-muted',
  'input',
  'input-end',
  'control-thumb',
  'text',
  'text-muted',
  'heading',
  'border',
  'border-accent',
  'primary',
  'primary-hover',
  'primary-active',
  'on-primary',
  'accent',
  'accent-hover',
  'accent-active',
  'on-accent',
  'focus',
  'disabled-surface',
  'disabled-text',
  'success',
  'warning',
  'danger',
  'overlay',
  'scrollbar-track',
  'scrollbar-thumb',
  'scrollbar-thumb-hover',
  'scrollbar-thumb-active',
  'media-background',
  'media-background-end',
  'on-media',
] as const;
export type ThemeColorName = (typeof THEME_COLOR_NAMES)[number];

/** Stable identities for user-defined colors managed in Themes. */
export function customThemeColorId(value: unknown): string | undefined {
  return typeof value === 'string'
    ? /^var\(--wr-theme-custom-([a-z][a-z0-9-]{0,63})\)$/u.exec(value)?.[1]
    : undefined;
}

export function customThemeColorReference(id: string): string {
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(id)) throw new Error('Invalid custom theme color ID.');
  return `var(--wr-theme-custom-${id})`;
}

export function themeColorId(value: unknown): ThemeColorName | undefined {
  if (typeof value !== 'string') return undefined;
  const id = /^var\(--wr-theme-([a-z-]+)\)$/u.exec(value)?.[1];
  return THEME_COLOR_NAMES.find((name) => name === id);
}

export function themeColorReference(name: ThemeColorName): string {
  if (!THEME_COLOR_NAMES.includes(name)) throw new Error('Invalid theme color.');
  return `var(--wr-theme-${name})`;
}

export interface ThemeRuntimeConfiguration {
  readonly initialMode: ThemeMode;
  readonly rememberChoice: boolean;
  /** Unique per project, including when multiple applications share an origin. */
  readonly storageKey: string;
}

export interface ThemeChangeDetail {
  readonly mode: ThemeMode;
  readonly resolvedMode: ResolvedThemeMode;
  readonly previousMode: ThemeMode;
  readonly previousResolvedMode: ResolvedThemeMode;
}
export type ThemeChangeHandler = (sender: WebTheme, event: CustomEvent<ThemeChangeDetail>) => void;

/** Self-contained so this exact initializer can also run in the HTML head before CSS. */
export function initializeTheme(configuration: ThemeRuntimeConfiguration): void {
  const root = document.documentElement;
  let mode = configuration.initialMode;
  if (configuration.rememberChoice) {
    try {
      const saved = window.localStorage.getItem(configuration.storageKey);
      if (saved === 'light' || saved === 'dark' || saved === 'system') mode = saved;
    } catch {
      /* Storage can be unavailable in an embedded or private browser. */
    }
  }
  const dark =
    mode === 'dark' ||
    (mode === 'system' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.webradThemeMode = mode;
  root.dataset.webradTheme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/** Browser-only application service. It owns no component instances or page state. */
export class WebTheme {
  #configuration: ThemeRuntimeConfiguration | null = null;
  #mode: ThemeMode = 'light';
  #resolvedMode: ResolvedThemeMode = 'light';
  #media: MediaQueryList | null = null;
  #subscribers = new Set<ThemeChangeHandler>();
  onChange: ThemeChangeHandler | null = null;

  get mode(): ThemeMode {
    return this.#mode;
  }
  set mode(value: ThemeMode) {
    if (!THEME_MODES.includes(value)) throw new Error('Theme mode must be light, dark or system.');
    this.#ensureConfigured();
    this.#apply(value, true);
  }
  get resolvedMode(): ResolvedThemeMode {
    return this.#resolvedMode;
  }

  configure(configuration: ThemeRuntimeConfiguration): void {
    if (!THEME_MODES.includes(configuration.initialMode) || !configuration.storageKey.trim())
      throw new Error('Invalid theme configuration.');
    this.#detach();
    this.#configuration = { ...configuration };
    initializeTheme(configuration);
    this.#media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    this.#media?.addEventListener('change', this.#systemChanged);
    window.addEventListener('storage', this.#storageChanged);
    const initial = document.documentElement.dataset.webradThemeMode;
    this.#apply(initial === 'dark' || initial === 'system' ? initial : 'light', false);
  }

  toggle(): void {
    this.mode = this.#resolvedMode === 'dark' ? 'light' : 'dark';
  }

  subscribe(handler: ThemeChangeHandler): () => void {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }

  /** Forget the remembered choice and return to the project's initial mode. */
  reset(): void {
    this.#ensureConfigured();
    const configuration = this.#configuration;
    if (configuration === null) return;
    try {
      window.localStorage.removeItem(configuration.storageKey);
    } catch {
      /* Optional storage. */
    }
    this.#apply(configuration.initialMode, false);
  }

  dispose(): void {
    this.#detach();
    this.#configuration = null;
    this.#subscribers.clear();
    this.onChange = null;
  }

  #ensureConfigured(): void {
    if (this.#configuration === null)
      throw new Error('The application theme has not been configured.');
  }

  #systemChanged = (): void => {
    if (this.#mode === 'system') this.#apply('system', false);
  };
  #storageChanged = (event: StorageEvent): void => {
    const configuration = this.#configuration;
    if (
      configuration === null ||
      !configuration.rememberChoice ||
      (event.key !== configuration.storageKey && event.key !== null)
    )
      return;
    const value = event.newValue;
    this.#apply(
      value === 'light' || value === 'dark' || value === 'system'
        ? value
        : configuration.initialMode,
      false,
    );
  };
  #detach(): void {
    this.#media?.removeEventListener('change', this.#systemChanged);
    this.#media = null;
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.#storageChanged);
  }
  #apply(mode: ThemeMode, persist: boolean): void {
    const previousMode = this.#mode;
    const previousResolvedMode = this.#resolvedMode;
    const resolvedMode = mode === 'system' ? (this.#media?.matches ? 'dark' : 'light') : mode;
    this.#mode = mode;
    this.#resolvedMode = resolvedMode;
    const root = document.documentElement;
    root.dataset.webradThemeMode = mode;
    root.dataset.webradTheme = resolvedMode;
    root.style.colorScheme = resolvedMode;
    const configuration = this.#configuration;
    if (persist && configuration?.rememberChoice) {
      try {
        window.localStorage.setItem(configuration.storageKey, mode);
      } catch {
        /* Optional storage. */
      }
    }
    if (mode === previousMode && resolvedMode === previousResolvedMode) return;
    const event = new CustomEvent<ThemeChangeDetail>('themechange', {
      detail: { mode, resolvedMode, previousMode, previousResolvedMode },
    });
    this.onChange?.(this, event);
    for (const handler of [...this.#subscribers]) handler(this, event);
    root.dispatchEvent(
      new CustomEvent<ThemeChangeDetail>('webrad-theme-change', { detail: event.detail }),
    );
  }
}

export const Theme = new WebTheme();

export function themeBootstrapSource(configuration: ThemeRuntimeConfiguration): string {
  const json = JSON.stringify(configuration).replaceAll('<', '\\u003c');
  return `(${initializeTheme.toString()})(${json});`;
}
