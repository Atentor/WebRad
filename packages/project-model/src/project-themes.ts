import {
  THEME_COLOR_NAMES,
  themeColorId,
  themeColorReference,
  customThemeColorId,
  customThemeColorReference,
  type ThemeColorName,
  type ThemeMode,
  type ResolvedThemeMode,
  type ThemeRuntimeConfiguration,
} from '@webrad/runtime/theme';
import { paletteColorId } from '@webrad/runtime/visual';
import type {
  ComponentStyleModel,
  ComponentStyleProperties,
  ComponentStyleStateName,
  ProjectScrollbarStyle,
} from './types.js';

export {
  THEME_COLOR_NAMES,
  themeColorId,
  themeColorReference,
  customThemeColorId,
  customThemeColorReference,
};
export type { ThemeColorName, ThemeMode, ResolvedThemeMode };

export interface ProjectThemeColor {
  readonly light: string;
  readonly dark: string;
}
export interface ProjectCustomThemeColor extends ProjectThemeColor {
  readonly id: string;
  readonly name: string;
}
export interface ProjectThemeSettings {
  readonly initialMode: ThemeMode;
  readonly rememberChoice: boolean;
  readonly colors: Readonly<Record<ThemeColorName, ProjectThemeColor>>;
  readonly customColors: readonly ProjectCustomThemeColor[];
}

const color = (light: string, dark: string): ProjectThemeColor => Object.freeze({ light, dark });
export const DEFAULT_PROJECT_THEMES: ProjectThemeSettings = Object.freeze({
  initialMode: 'light',
  rememberChoice: true,
  customColors: Object.freeze([]),
  colors: Object.freeze({
    background: color('#f8fbff', '#0f172a'),
    'background-end': color('#eef2ff', '#111827'),
    surface: color('#ffffff', '#1e293b'),
    'surface-end': color('#f8fafc', '#172033'),
    'surface-muted': color('#eef2ff', '#253149'),
    input: color('#ffffff', '#172033'),
    'input-end': color('#f8fbff', '#1e293b'),
    'control-thumb': color('#ffffff', '#e2e8f0'),
    text: color('#0f172a', '#f1f5f9'),
    'text-muted': color('#64748b', '#94a3b8'),
    heading: color('#334155', '#e2e8f0'),
    border: color('#dbeafe', '#334155'),
    'border-accent': color('#e9d5ff', '#4c3f6b'),
    primary: color('#2563eb', '#60a5fa'),
    'primary-hover': color('#3b82f6', '#93c5fd'),
    'primary-active': color('#1d4ed8', '#3b82f6'),
    'on-primary': color('#ffffff', '#0f172a'),
    accent: color('#7c3aed', '#a78bfa'),
    'accent-hover': color('#8b5cf6', '#c4b5fd'),
    'accent-active': color('#6d28d9', '#8b5cf6'),
    'on-accent': color('#ffffff', '#0f172a'),
    focus: color('#93c5fd', '#60a5fa'),
    'disabled-surface': color('#f1f5f9', '#263247'),
    'disabled-text': color('#64748b', '#94a3b8'),
    success: color('#22c55e', '#4ade80'),
    warning: color('#f59e0b', '#fbbf24'),
    danger: color('#ef4444', '#f87171'),
    overlay: color('#0f172a', '#020617'),
    'scrollbar-track': color('#f8fbff', '#0f172a'),
    'scrollbar-thumb': color('#bfdbfe', '#475569'),
    'scrollbar-thumb-hover': color('#93c5fd', '#64748b'),
    'scrollbar-thumb-active': color('#60a5fa', '#94a3b8'),
    'media-background': color('#334155', '#334155'),
    'media-background-end': color('#0f172a', '#0f172a'),
    'on-media': color('#ffffff', '#ffffff'),
  }),
});

export function resolveProjectColor(
  value: string,
  themes: ProjectThemeSettings = DEFAULT_PROJECT_THEMES,
  mode: ResolvedThemeMode = 'light',
): string {
  const role = themeColorId(value);
  const resolved = role === undefined ? value : themes.colors[role][mode];
  const id = customThemeColorId(resolved) ?? paletteColorId(resolved);
  return id === undefined
    ? resolved
    : (themes.customColors.find((entry) => entry.id === id)?.[mode] ?? '#000000');
}

/** Scope is generated internally; callers never supply project-authored selectors. */
export function projectThemeCss(
  themes: ProjectThemeSettings,
  options: { readonly layered?: boolean } = {},
): string {
  const declarations = (mode: ResolvedThemeMode): string =>
    THEME_COLOR_NAMES.map((name) => {
      const value = themes.colors[name][mode];
      if (
        !/^#[a-f0-9]{6}$/iu.test(value) &&
        paletteColorId(value) === undefined &&
        customThemeColorId(value) === undefined
      )
        throw new Error('Invalid theme color.');
      return `--wr-theme-${name}: ${value};`;
    })
      .concat(
        themes.customColors.flatMap((entry) => {
          customThemeColorReference(entry.id);
          if (!/^#[a-f0-9]{6}$/iu.test(entry[mode])) throw new Error('Invalid custom theme color.');
          return [
            `--wr-theme-custom-${entry.id}: ${entry[mode]};`,
            `--wr-palette-${entry.id}: var(--wr-theme-custom-${entry.id});`,
          ];
        }),
      )
      .join('\n');
  const darkDefaults = `
    color: var(--wr-theme-text);
    color-scheme: dark;
    --wr-input-bg: var(--wr-theme-input);
    --wr-muted-text: var(--wr-theme-text-muted);
    --wr-accent: var(--wr-theme-primary);
    --wr-control-border: var(--wr-theme-border);
    --wr-control-surface: var(--wr-theme-surface);
    --wr-button-bg: var(--wr-theme-surface-muted);
    --wr-button-hover: var(--wr-theme-disabled-surface);
    --wr-panel-progress-track-color: var(--wr-theme-border);
    --wr-panel-progress-color: var(--wr-theme-primary);
    --wr-progress-track-color: var(--wr-theme-border);
    --wr-progress-color: var(--wr-theme-primary);
    --wr-toggle-checked-color: var(--wr-theme-primary);
    --wr-toggle-thumb-color: var(--wr-theme-control-thumb);
    --wr-data-grid-header-background-color: var(--wr-theme-surface-muted);
    --wr-data-grid-header-text-color: var(--wr-theme-primary);
    --wr-data-grid-header-border-color: var(--wr-theme-border);
    --wr-data-grid-footer-background-color: var(--wr-theme-surface-end);
    --wr-data-grid-footer-text-color: var(--wr-theme-heading);
    --wr-data-grid-footer-border-color: var(--wr-theme-border);
    --wr-data-grid-button-background-color: var(--wr-theme-surface-muted);
    --wr-data-grid-button-text-color: var(--wr-theme-primary);
    --wr-data-grid-button-border-color: var(--wr-theme-border);
    --wr-data-grid-checkbox-text-color: var(--wr-theme-heading);
    --wr-data-grid-checkbox-accent-color: var(--wr-theme-primary);
  `;
  const stylesheet =
    `:root { ${declarations('light')} }\n` +
    `[data-webrad-theme="light"] { color-scheme: light; ${declarations('light')} }\n` +
    `[data-webrad-theme="dark"] { color-scheme: dark; ${declarations('dark')} }\n` +
    `[data-webrad-theme="dark"].wr-project-surface,
    [data-webrad-theme="dark"] :is(.wr-project-surface, .wr-webpage, .wr-panel-floating-layer) { ${darkDefaults} }\n` +
    `[data-webrad-theme="light"].wr-project-surface,
    [data-webrad-theme="light"] :is(.wr-project-surface, .wr-webpage, .wr-panel-floating-layer) { color-scheme: light; }\n` +
    `[data-webrad-theme="dark"].wr-project-surface,
    [data-webrad-theme="dark"] :is(.wr-project-surface, .wr-webpage) { background-color: var(--wr-theme-background); }\n` +
    `html[data-webrad-theme="dark"] body { color: var(--wr-theme-text); background: var(--wr-theme-background); }`;
  return options.layered
    ? `@layer theme, base, components, utilities;\n@layer components {\n${stylesheet}\n}`
    : stylesheet;
}

export function bindScrollbarColorsToTheme(
  scrollbar: ProjectScrollbarStyle,
): ProjectScrollbarStyle {
  return {
    ...scrollbar,
    trackColor: themeColorReference('scrollbar-track'),
    trackBorderColor: themeColorReference('border'),
    thumbColor: themeColorReference('scrollbar-thumb'),
    thumbHoverColor: themeColorReference('scrollbar-thumb-hover'),
    thumbActiveColor: themeColorReference('scrollbar-thumb-active'),
    thumbBorderColor: themeColorReference('surface'),
    cornerColor: themeColorReference('scrollbar-track'),
  };
}

/** Role-aware conversion, used only for new defaults or an explicit user action. */
export function bindStyleColorsToTheme(
  properties: ComponentStyleProperties,
  componentType: string,
  themes: ProjectThemeSettings = DEFAULT_PROJECT_THEMES,
  state: ComponentStyleStateName = 'base',
): ComponentStyleProperties {
  const bind = (value: string, property: string): string => {
    const resolved = resolveProjectColor(value, themes).toLowerCase();
    if (themeColorId(value) !== undefined || customThemeColorId(value) !== undefined) return value;
    let role: ThemeColorName | undefined;
    if (/^#[a-f0-9]{6}$/iu.test(resolved)) {
      if (state === 'disabled' && /text|caption|placeholder/iu.test(property))
        role = 'disabled-text';
      else if (state === 'disabled' && /background/iu.test(property)) role = 'disabled-surface';
      else if (componentType === 'WebVideoPlayer' && property === 'backgroundGradient')
        role = resolved === '#334155' ? 'media-background' : 'media-background-end';
      else if (componentType === 'WebVideoPlayer' && property === 'textColor') role = 'on-media';
      else if (property === 'toggleThumbColor') role = 'control-thumb';
      else if (property === 'ringOffsetColor') role = 'surface';
      else if (property === 'ringColor') role = 'focus';
      else if (/text|caption|placeholder/iu.test(property)) {
        role =
          resolved === '#ffffff'
            ? 'on-primary'
            : ['#64748b', '#94a3b8', '#9ca3af'].includes(resolved)
              ? 'text-muted'
              : ['#2563eb', '#1d4ed8', '#1e3a8a', '#7c3aed'].includes(resolved)
                ? 'primary'
                : resolved === '#334155'
                  ? 'heading'
                  : 'text';
      } else if (/border|track/iu.test(property)) {
        role = ['#e9d5ff', '#ddd6fe', '#c4b5fd'].includes(resolved) ? 'border-accent' : 'border';
      } else if (['#2563eb', '#3b82f6', '#60a5fa', '#0284c7'].includes(resolved))
        role = state === 'hover' ? 'primary-hover' : 'primary';
      else if (['#1d4ed8', '#1e40af'].includes(resolved)) role = 'primary-active';
      else if (['#7c3aed', '#a78bfa', '#8b5cf6'].includes(resolved))
        role = state === 'hover' ? 'accent-hover' : 'accent';
      else if (resolved === '#6d28d9') role = 'accent-active';
      else if (resolved === '#93c5fd') role = 'focus';
      else if (resolved === '#f1f5f9') role = 'disabled-surface';
      else if (['#0f172a', '#334155', '#1e293b'].includes(resolved)) role = 'text';
      else if (
        [
          '#ffffff',
          '#f8fafc',
          '#f8fbff',
          '#eef2ff',
          '#e0e7ff',
          '#e2e8f0',
          '#cbd5e1',
          '#dbeafe',
          '#bfdbfe',
          '#eff6ff',
          '#f5f3ff',
        ].includes(resolved)
      ) {
        const page = componentType === 'WebPage';
        const field = ['WebEdit', 'WebTextArea', 'WebComboBox', 'WebListBox'].includes(
          componentType,
        );
        role = page
          ? resolved === '#eef2ff'
            ? 'background-end'
            : 'background'
          : field
            ? resolved === '#ffffff'
              ? 'input'
              : 'input-end'
            : resolved === '#ffffff'
              ? 'surface'
              : ['#f8fafc', '#eff6ff'].includes(resolved)
                ? 'surface-end'
                : 'surface-muted';
      }
    }
    return role === undefined ? value : themeColorReference(role);
  };
  const result: ComponentStyleProperties = Object.fromEntries(
    Object.entries(properties).map(([property, value]) => {
      if (typeof value === 'string' && /color$/iu.test(property))
        return [property, bind(value, property)];
      if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'linear')
        return [
          property,
          { ...value, from: bind(value.from, property), to: bind(value.to, property) },
        ];
      return [property, value];
    }),
  );
  return state === 'disabled' &&
    (result.backgroundColor !== undefined || result.backgroundGradient !== undefined) &&
    result.textColor === undefined
    ? { ...result, textColor: themeColorReference('disabled-text') }
    : result;
}

export function bindDefaultStylesToTheme(
  styles: readonly ComponentStyleModel[],
  themes: ProjectThemeSettings = DEFAULT_PROJECT_THEMES,
): readonly ComponentStyleModel[] {
  return styles.map((style) =>
    style.preset !== 'default'
      ? style
      : {
          ...style,
          states: Object.fromEntries(
            Object.entries(style.states).map(([state, properties]) => [
              state,
              bindStyleColorsToTheme(
                properties,
                style.componentType,
                themes,
                state as ComponentStyleStateName,
              ),
            ]),
          ) as ComponentStyleModel['states'],
        },
  );
}

export function projectThemeStorageKey(projectId: string): string {
  return `webrad:${projectId}:theme`;
}

/** Legacy palette references remain aliases of the same custom theme identities. */
export function detachRemovedThemeColors(
  value: unknown,
  removed: ReadonlyMap<string, ProjectThemeColor>,
  mode?: ResolvedThemeMode,
): unknown {
  const id = customThemeColorId(value) ?? paletteColorId(value);
  const color = id === undefined ? undefined : removed.get(id);
  if (color !== undefined) {
    if (mode !== undefined) return color[mode];
    if (color.light.toLowerCase() === color.dark.toLowerCase()) return color.light;
    // A shared reference to an adaptive color must be unlinked explicitly.
    // Retaining it lets integrity validation reject deletion without losing either appearance.
    return value;
  }
  if (Array.isArray(value))
    return value.map((entry) => detachRemovedThemeColors(entry, removed, mode));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        detachRemovedThemeColors(entry, removed, key === 'light' || key === 'dark' ? key : mode),
      ]),
    );
  return value;
}

export function projectThemeRuntimeConfiguration(
  themes: ProjectThemeSettings,
  projectId: string,
): ThemeRuntimeConfiguration {
  return {
    initialMode: themes.initialMode,
    rememberChoice: themes.rememberChoice,
    storageKey: projectThemeStorageKey(projectId),
  };
}
