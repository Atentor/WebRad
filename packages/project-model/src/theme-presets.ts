import {
  DEFAULT_PROJECT_THEMES,
  themeColorReference,
  customThemeColorReference,
  type ProjectThemeColor,
  type ProjectThemeSettings,
  type ResolvedThemeMode,
} from './project-themes.js';
import { parseProject } from './schemas.js';
import {
  COMPONENT_STYLE_STATE_NAMES,
  type ComponentStyleModel,
  type ComponentStyleProperties,
  type ComponentStyleStateName,
  type WebRadProject,
} from './types.js';

export const PROJECT_THEME_PRESET_IDS = ['aurora', 'prism', 'flat', 'webrad'] as const;
export type ProjectThemePresetId = (typeof PROJECT_THEME_PRESET_IDS)[number];

const pair = (light: string, dark: string): ProjectThemeColor => ({ light, dark });

const PRISM_THEMES: ProjectThemeSettings = {
  ...DEFAULT_PROJECT_THEMES,
  colors: {
    background: pair('#faf5ff', '#171225'),
    'background-end': pair('#fff1f2', '#25172c'),
    surface: pair('#ffffff', '#261e38'),
    'surface-end': pair('#fdf2f8', '#30233e'),
    'surface-muted': pair('#f3e8ff', '#392a50'),
    input: pair('#ffffff', '#211a30'),
    'input-end': pair('#faf5ff', '#2b203c'),
    'control-thumb': pair('#ffffff', '#ffffff'),
    text: pair('#281b3d', '#faf5ff'),
    'text-muted': pair('#746382', '#c4b5d4'),
    heading: pair('#4c1d95', '#e9d5ff'),
    border: pair('#e9d5ff', '#504063'),
    'border-accent': pair('#fecdd3', '#72445f'),
    primary: pair('#7c3aed', '#c4b5fd'),
    'primary-hover': pair('#6d28d9', '#ddd6fe'),
    'primary-active': pair('#5b21b6', '#a78bfa'),
    'on-primary': pair('#ffffff', '#231238'),
    accent: pair('#be185d', '#fda4af'),
    'accent-hover': pair('#9d174d', '#fecdd3'),
    'accent-active': pair('#831843', '#fb7185'),
    'on-accent': pair('#ffffff', '#361421'),
    focus: pair('#a78bfa', '#c4b5fd'),
    'disabled-surface': pair('#f3edf7', '#362c43'),
    'disabled-text': pair('#7c6e88', '#b7a7c7'),
    success: pair('#047857', '#6ee7b7'),
    warning: pair('#a16207', '#fcd34d'),
    danger: pair('#be123c', '#fda4af'),
    overlay: pair('#281b3d', '#100c1a'),
    'scrollbar-track': pair('#faf5ff', '#171225'),
    'scrollbar-thumb': pair('#d8b4fe', '#665080'),
    'scrollbar-thumb-hover': pair('#c084fc', '#8666a3'),
    'scrollbar-thumb-active': pair('#a855f7', '#c4b5fd'),
    'media-background': pair('#4c1d95', '#302044'),
    'media-background-end': pair('#281b3d', '#171225'),
    'on-media': pair('#ffffff', '#faf5ff'),
  },
  customColors: [
    { id: 'prism-coral', name: 'Coral', ...pair('#be185d', '#fda4af') },
    { id: 'prism-mint', name: 'Mint', ...pair('#047857', '#6ee7b7') },
    { id: 'prism-sunshine', name: 'Sunshine', ...pair('#a16207', '#fcd34d') },
  ],
};

const FLAT_THEMES: ProjectThemeSettings = {
  ...DEFAULT_PROJECT_THEMES,
  colors: {
    background: pair('#f5f7f8', '#111819'),
    'background-end': pair('#f5f7f8', '#111819'),
    surface: pair('#ffffff', '#1b2527'),
    'surface-end': pair('#ffffff', '#1b2527'),
    'surface-muted': pair('#ccdadd', '#3a4d51'),
    input: pair('#ffffff', '#182123'),
    'input-end': pair('#ffffff', '#182123'),
    'control-thumb': pair('#ffffff', '#f0fdfa'),
    text: pair('#182c30', '#edf5f5'),
    'text-muted': pair('#52696e', '#adc1c4'),
    heading: pair('#183f43', '#d5e7e8'),
    border: pair('#ccdadd', '#3a4d51'),
    'border-accent': pair('#ccdadd', '#3a4d51'),
    primary: pair('#0f766e', '#5eead4'),
    'primary-hover': pair('#115e59', '#99f6e4'),
    'primary-active': pair('#134e4a', '#2dd4bf'),
    'on-primary': pair('#ffffff', '#102d2b'),
    accent: pair('#0369a1', '#7dd3fc'),
    'accent-hover': pair('#075985', '#bae6fd'),
    'accent-active': pair('#0c4a6e', '#38bdf8'),
    'on-accent': pair('#ffffff', '#112b39'),
    focus: pair('#0d9488', '#5eead4'),
    'disabled-surface': pair('#e8eff0', '#2b373a'),
    'disabled-text': pair('#61767a', '#a2b8bc'),
    success: pair('#15803d', '#86efac'),
    warning: pair('#a16207', '#fde047'),
    danger: pair('#b91c1c', '#fca5a5'),
    overlay: pair('#182c30', '#090f10'),
    'scrollbar-track': pair('#f5f7f8', '#111819'),
    'scrollbar-thumb': pair('#b5c9cc', '#486267'),
    'scrollbar-thumb-hover': pair('#8caaae', '#648489'),
    'scrollbar-thumb-active': pair('#0f766e', '#5eead4'),
    'media-background': pair('#263f44', '#263f44'),
    'media-background-end': pair('#263f44', '#263f44'),
    'on-media': pair('#ffffff', '#ffffff'),
  },
};

/** Matches the Light/Dark IDE palette in apps/ide/renderer/src/theme.css. */
const WEBRAD_THEMES: ProjectThemeSettings = {
  ...DEFAULT_PROJECT_THEMES,
  colors: {
    background: pair('#eef1f5', '#1e1e1e'),
    'background-end': pair('#eef1f5', '#1e1e1e'),
    surface: pair('#f9fafc', '#252526'),
    'surface-end': pair('#f1f3f7', '#2d2d2d'),
    'surface-muted': pair('#edf1f6', '#333333'),
    input: pair('#ffffff', '#3c3c3c'),
    'input-end': pair('#ffffff', '#3c3c3c'),
    'control-thumb': pair('#ffffff', '#cccccc'),
    text: pair('#202936', '#cccccc'),
    'text-muted': pair('#657184', '#a6a6a6'),
    heading: pair('#202936', '#cccccc'),
    border: pair('#cbd2dc', '#333333'),
    'border-accent': pair('#9da9b8', '#6b6b6b'),
    primary: pair('#1479d3', '#007acc'),
    'primary-hover': pair('#1479d3', '#007acc'),
    'primary-active': pair('#1479d3', '#007acc'),
    'on-primary': pair('#ffffff', '#ffffff'),
    accent: pair('#1479d3', '#007acc'),
    'accent-hover': pair('#1479d3', '#007acc'),
    'accent-active': pair('#1479d3', '#007acc'),
    'on-accent': pair('#ffffff', '#ffffff'),
    focus: pair('#1479d3', '#007acc'),
    'disabled-surface': pair('#edf1f6', '#333333'),
    'disabled-text': pair('#657184', '#a6a6a6'),
    success: pair('#188656', '#66d19e'),
    warning: pair('#a66a00', '#f0bd56'),
    danger: pair('#c93748', '#ff6b78'),
    overlay: pair('#1f2a39', '#000000'),
    'scrollbar-track': pair('#eef1f5', '#1e1e1e'),
    'scrollbar-thumb': pair('#b1b8c2', '#656565'),
    'scrollbar-thumb-hover': pair('#9da9b8', '#6b6b6b'),
    'scrollbar-thumb-active': pair('#1479d3', '#007acc'),
    'media-background': pair('#f1f3f7', '#252526'),
    'media-background-end': pair('#f1f3f7', '#252526'),
    'on-media': pair('#202936', '#cccccc'),
  },
  customColors: [
    { id: 'webrad-button-hover', name: 'Button hover', ...pair('#dfe6ef', '#454545') },
    { id: 'webrad-selection', name: 'Selection', ...pair('#d6e6f5', '#094771') },
  ],
};

export const PROJECT_THEME_PRESETS: readonly {
  readonly id: ProjectThemePresetId;
  readonly label: string;
  readonly description: string;
  readonly themes: ProjectThemeSettings;
}[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Soft blue and violet gradients.',
    themes: DEFAULT_PROJECT_THEMES,
  },
  {
    id: 'prism',
    label: 'Prism',
    description: 'Vibrant violet, coral and mint.',
    themes: PRISM_THEMES,
  },
  {
    id: 'flat',
    label: 'Flat',
    description: 'Clean solid surfaces and teal accents.',
    themes: FLAT_THEMES,
  },
  {
    id: 'webrad',
    label: 'WebRAD',
    description: 'The IDE palette, solid surfaces and square corners.',
    themes: WEBRAD_THEMES,
  },
];

function presetProperties(
  properties: ComponentStyleProperties,
  preset: ProjectThemePresetId,
  componentType: string,
  state: ComponentStyleStateName,
): ComponentStyleProperties {
  if (preset === 'aurora') return properties;
  if (preset === 'prism') {
    return {
      ...properties,
      ...(properties.borderRadius === undefined ? {} : { borderRadius: { value: 12, unit: 'px' } }),
      ...(properties.dataGridButtonBorderRadius === undefined
        ? {}
        : { dataGridButtonBorderRadius: { value: 8, unit: 'px' } }),
    };
  }
  const { backgroundGradient, borderGradient, textGradient, ...solid } = properties;
  const square = preset === 'webrad';
  const radius = square ? 0 : 4;
  return {
    ...solid,
    ...(typeof backgroundGradient === 'object' && 'from' in backgroundGradient
      ? { backgroundColor: backgroundGradient.from }
      : {}),
    ...(typeof borderGradient === 'object' && 'from' in borderGradient
      ? { borderColor: borderGradient.from }
      : {}),
    ...(typeof textGradient === 'object' && 'from' in textGradient
      ? { textColor: textGradient.from }
      : {}),
    ...(properties.borderRadius === undefined
      ? {}
      : { borderRadius: { value: radius, unit: 'px' } }),
    ...(properties.dataGridButtonBorderRadius === undefined
      ? {}
      : { dataGridButtonBorderRadius: { value: radius, unit: 'px' } }),
    ...(properties.boxShadow === undefined ? {} : { boxShadow: 'none' }),
    ...(properties.scale === undefined ? {} : { scale: 100 }),
    ...(square && componentType === 'WebButton' && properties.textColor !== undefined
      ? { textColor: themeColorReference(state === 'disabled' ? 'disabled-text' : 'text') }
      : {}),
    ...(square && componentType === 'WebButton' && backgroundGradient !== undefined
      ? {
          backgroundColor:
            state === 'hover' || state === 'active'
              ? customThemeColorReference('webrad-button-hover')
              : themeColorReference('surface-muted'),
        }
      : {}),
    ...(square &&
    borderGradient !== undefined &&
    ['WebButton', 'WebEdit', 'WebTextArea', 'WebComboBox', 'WebListBox'].includes(componentType)
      ? { borderColor: themeColorReference('border-accent') }
      : {}),
  };
}

/** Materialize a new project's preset as editable settings and styles, with stable IDs. */
export function applyProjectThemePreset(
  project: WebRadProject,
  presetId: ProjectThemePresetId,
): WebRadProject {
  const preset = PROJECT_THEME_PRESETS.find((entry) => entry.id === presetId);
  if (preset === undefined) throw new Error('Unknown project theme preset: ' + String(presetId));
  if (presetId === 'aurora') return project;
  const styleForPreset = (style: ComponentStyleModel): ComponentStyleModel => {
    const overrides: Partial<
      Record<ResolvedThemeMode, Partial<Record<ComponentStyleStateName, ComponentStyleProperties>>>
    > = {};
    for (const mode of ['light', 'dark'] as const) {
      const source = style.themeOverrides?.[mode];
      if (source !== undefined) {
        const states: Partial<Record<ComponentStyleStateName, ComponentStyleProperties>> = {};
        for (const state of COMPONENT_STYLE_STATE_NAMES) {
          const properties = source[state];
          if (properties !== undefined)
            states[state] = presetProperties(properties, presetId, style.componentType, state);
        }
        overrides[mode] = states;
      }
    }
    return {
      ...style,
      states: Object.fromEntries(
        COMPONENT_STYLE_STATE_NAMES.map((state) => [
          state,
          presetProperties(style.states[state], presetId, style.componentType, state),
        ]),
      ) as ComponentStyleModel['states'],
      ...(Object.keys(overrides).length === 0 ? {} : { themeOverrides: overrides }),
    };
  };
  return parseProject({
    ...project,
    settings: {
      ...project.settings,
      themes: structuredClone(preset.themes),
      ...(presetId === 'webrad'
        ? {
            scrollbar: {
              ...project.settings.scrollbar,
              trackBorderRadius: 0,
              thumbBorderRadius: 0,
            },
          }
        : {}),
    },
    styles: project.styles.map(styleForPreset),
  });
}
