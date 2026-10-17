import type {
  ComponentStyleProperties,
  ComponentStylePropertyDefinition,
  ComponentStyleStateName,
} from '@webrad/project-model';

export type StylePropertyView = 'essential' | 'all' | 'configured';

export interface StylePropertyGroup {
  readonly name: string;
  readonly definitions: readonly ComponentStylePropertyDefinition[];
  readonly configuredCount: number;
}

interface StylePropertyCatalogOptions {
  readonly definitions: readonly ComponentStylePropertyDefinition[];
  readonly componentType: string;
  readonly stateName: ComponentStyleStateName;
  readonly properties: ComponentStyleProperties;
  readonly essentialProperties?: readonly string[];
  readonly view: StylePropertyView;
  readonly search: string;
}

const GROUP_NAMES: Readonly<Record<string, string>> = {
  Colors: 'Appearance',
  Border: 'Appearance',
  Effects: 'Appearance',
  Typography: 'Text',
  Layout: 'Layout & size',
  Dimensions: 'Layout & size',
  Transform: 'Motion',
  Animation: 'Motion',
  'Data Grid Lines': 'Lines',
  'Data Grid Header': 'Header',
  'Data Grid Footer': 'Footer',
  'Data Grid Button': 'Cell button',
  'Data Grid Checkbox': 'Cell checkbox',
};

const GROUP_ORDER = [
  'Appearance',
  'Panel progress',
  'Text',
  'Spacing',
  'Icon',
  'Image',
  'Header',
  'Footer',
  'Lines',
  'Cell button',
  'Cell checkbox',
  'Layout & size',
  'Motion',
  'Interaction',
];

function groupName(definition: ComponentStylePropertyDefinition): string {
  if (definition.name === 'textColor' || definition.name === 'textGradient') return 'Text';
  return GROUP_NAMES[definition.category] ?? definition.category;
}

/** Browsing preferences affect only the Designer projection, never saved style values. */
export function createStylePropertyGroups({
  definitions,
  componentType,
  stateName,
  properties,
  essentialProperties,
  view,
  search,
}: StylePropertyCatalogOptions): readonly StylePropertyGroup[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const essentials = essentialProperties === undefined ? undefined : new Set(essentialProperties);
  const groups = new Map<string, ComponentStylePropertyDefinition[]>();

  for (const definition of definitions) {
    if (
      definition.componentTypes !== undefined &&
      !definition.componentTypes.includes(componentType)
    )
      continue;
    if (definition.stateNames !== undefined && !definition.stateNames.includes(stateName)) continue;
    const name = groupName(definition);
    const configured = properties[definition.name] !== undefined;
    if (normalizedSearch.length > 0) {
      const terms = [
        definition.label,
        definition.name,
        definition.category,
        name,
        definition.description,
      ];
      if (!terms.some((term) => term.toLocaleLowerCase().includes(normalizedSearch))) continue;
    } else if (view === 'configured' && !configured) continue;
    else if (
      view === 'essential' &&
      essentials !== undefined &&
      !essentials.has(definition.name) &&
      !configured
    )
      continue;

    const group = groups.get(name) ?? [];
    group.push(definition);
    groups.set(name, group);
  }

  return [...groups]
    .sort(([first], [second]) => {
      const firstIndex = GROUP_ORDER.indexOf(first);
      const secondIndex = GROUP_ORDER.indexOf(second);
      return (
        (firstIndex < 0 ? GROUP_ORDER.length : firstIndex) -
        (secondIndex < 0 ? GROUP_ORDER.length : secondIndex)
      );
    })
    .map(([name, group]) => ({
      name,
      definitions: group,
      configuredCount: group.filter((definition) => properties[definition.name] !== undefined)
        .length,
    }));
}
