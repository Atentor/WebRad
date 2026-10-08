import type { ComponentPropertyDefinition } from '@webrad/component-registry';

const SECTION_ORDER = [
  'Identity',
  'Appearance',
  'Data',
  'Reusable component',
  'Connection',
  'API Client',
  'Data Grid',
  'Size & position',
  'Size',
  'Spacing',
  'Responsive size',
  'Anchors & offsets',
  'Children layout',
  'Floating placement',
  'Behavior',
  'Accessibility',
];

export interface InspectorPropertyGroup {
  readonly name: string;
  readonly items: readonly ComponentPropertyDefinition[];
}

export interface InspectorPropertySection {
  readonly name: string;
  readonly groups: readonly InspectorPropertyGroup[];
}

export function inspectorPropertyMatches(
  property: ComponentPropertyDefinition,
  query: string,
): boolean {
  const keywords = [property.name, property.label, property.category, property.inspectorGroup];
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => keywords.some((value) => value?.toLowerCase().includes(word)));
}

/** Uses Registry metadata for every component, including mixed selections. */
export function buildInspectorSections(
  properties: readonly ComponentPropertyDefinition[],
  query: string,
): readonly InspectorPropertySection[] {
  const sections = new Map<string, Map<string, ComponentPropertyDefinition[]>>();
  for (const property of properties) {
    if (!inspectorPropertyMatches(property, query)) continue;
    const category = property.category?.trim() || 'General';
    const groups = sections.get(category) ?? new Map<string, ComponentPropertyDefinition[]>();
    const groupName = property.inspectorGroup?.trim() ?? '';
    const items = groups.get(groupName) ?? [];
    items.push(property);
    groups.set(groupName, items);
    sections.set(category, groups);
  }
  const rank = (name: string): number => {
    const index = SECTION_ORDER.indexOf(name);
    return index < 0 ? SECTION_ORDER.length : index;
  };
  return [...sections]
    .sort(([left], [right]) => rank(left) - rank(right))
    .map(([name, groups]) => ({
      name,
      groups: [...groups].map(([groupName, items]) => ({ name: groupName, items })),
    }));
}
