import type { ComponentPropertyDefinition } from './types.js';

/** Shared presentation metadata; component behavior and saved properties stay unchanged. */
export function organizeInspectorProperty(
  property: ComponentPropertyDefinition,
): ComponentPropertyDefinition {
  if (property.source === 'bounds') {
    return { ...property, category: 'Size & position', editorLayout: 'compact' };
  }
  if (property.name === 'margin') return { ...property, category: 'Spacing' };
  if (['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].includes(property.name)) {
    return {
      ...property,
      category: 'Spacing',
      inspectorGroup: 'Individual sides',
      editorLayout: 'compact',
    };
  }
  if (property.source === 'layout-item') {
    const anchors = ['itemHorizontalAnchor', 'itemVerticalAnchor'];
    const offsets = ['itemLeft', 'itemRight', 'itemTop', 'itemBottom'];
    const limits = ['itemMinWidth', 'itemMaxWidth', 'itemMinHeight', 'itemMaxHeight'];
    return {
      ...property,
      category:
        anchors.includes(property.name) || offsets.includes(property.name)
          ? 'Anchors & offsets'
          : 'Responsive size',
      inspectorGroup: anchors.includes(property.name)
        ? 'Anchors'
        : offsets.includes(property.name)
          ? 'Offsets'
          : limits.includes(property.name)
            ? 'Limits'
            : ['itemGrow', 'itemShrink'].includes(property.name)
              ? 'Flex'
              : 'Sizing',
      editorLayout: 'compact',
    };
  }
  if (property.source === 'layout-container') {
    return {
      ...property,
      category: 'Children layout',
      inspectorGroup: property.name.startsWith('containerPadding')
        ? 'Padding'
        : ['containerGap', 'containerWrap'].includes(property.name)
          ? 'Flow'
          : ['containerJustifyContent', 'containerAlignItems'].includes(property.name)
            ? 'Alignment'
            : undefined,
      editorLayout: property.name === 'containerMode' ? undefined : 'compact',
    };
  }
  return property.category === 'Layout' ? { ...property, category: 'Size & position' } : property;
}
