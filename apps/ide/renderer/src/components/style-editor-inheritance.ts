import {
  COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS,
  type ComponentStyleModel,
  type ComponentStyleProperties,
  type ComponentStylePropertyName,
  type ComponentStyleStateName,
  type ResolvedThemeMode,
  type StylePropertyValue,
} from '@webrad/project-model';

export interface StyleEditorInheritance {
  readonly properties: ComponentStyleProperties;
  readonly sources: Readonly<Partial<Record<ComponentStylePropertyName, string>>>;
}

/** Matches the runtime's theme/state cascade with the edited layer removed. */
export function styleEditorInheritance(
  style: ComponentStyleModel,
  stateName: ComponentStyleStateName,
  editLayer: 'shared' | ResolvedThemeMode,
  previewTheme: ResolvedThemeMode,
): StyleEditorInheritance {
  const properties: Partial<Record<ComponentStylePropertyName, StylePropertyValue>> = {};
  const sources: Partial<Record<ComponentStylePropertyName, string>> = {};
  const apply = (layer: 'shared' | ResolvedThemeMode, state: ComponentStyleStateName): void => {
    if (layer === editLayer && state === stateName) return;
    const values = layer === 'shared' ? style.states[state] : style.themeOverrides?.[layer]?.[state];
    if (values === undefined) return;
    const source = `${layer === 'shared' ? 'Shared' : layer === 'light' ? 'Light' : 'Dark'} / ${state[0]?.toUpperCase()}${state.slice(1)}`;
    for (const name of Object.keys(values) as ComponentStylePropertyName[]) {
      const value = values[name];
      if (value === undefined) continue;
      properties[name] = value;
      sources[name] = source;
      for (const pair of COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS) {
        const exclusive = pair[0] === name ? pair[1] : pair[1] === name ? pair[0] : undefined;
        if (exclusive !== undefined) {
          delete properties[exclusive];
          delete sources[exclusive];
        }
      }
    }
  };
  const mode = editLayer === 'shared' ? previewTheme : editLayer;
  apply('shared', 'base');
  apply(mode, 'base');
  if (stateName !== 'base') {
    apply('shared', stateName);
    apply(mode, stateName);
  }
  return { properties, sources };
}
