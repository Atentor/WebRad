import type {
  ComponentPropertyDefinition,
  RegisteredComponentNode,
  RegisteredContainerLayout,
} from './types.js';

/** Bind an offset editor to the coordinate actually used by the active layout. */
export function resolveInspectorLayoutProperty(
  property: ComponentPropertyDefinition,
  node: RegisteredComponentNode,
  parentMode: RegisteredContainerLayout['mode'] = 'fixed',
): ComponentPropertyDefinition {
  const resolved = { ...property, layoutCoordinate: undefined };
  const offset = (
    { itemLeft: 'left', itemRight: 'right', itemTop: 'top', itemBottom: 'bottom' } as Readonly<
      Record<string, string>
    >
  )[property.name];
  const anchor = property.name === 'itemHorizontalAnchor' || property.name === 'itemVerticalAnchor';
  const position = property.source === 'bounds' && (property.name === 'x' || property.name === 'y');
  const floatingProperty = property.name === 'placement' || property.name.startsWith('floating');
  const disabled = (description: string): ComponentPropertyDefinition => ({
    ...resolved,
    readOnly: true,
    description,
  });
  if (node.parentId === null && (offset || anchor || position || floatingProperty))
    return disabled(
      'The root fills its editing surface. Configure position and offsets on its placement in the parent document.',
    );
  if (position && node.props.placement !== 'floating' && parentMode !== 'fixed')
    return disabled(
      'The parent layout controls position. Use its active anchors, offsets or flow alignment.',
    );
  if (
    position &&
    node.props.placement === 'floating' &&
    node.props.floatingAlignment !== undefined &&
    node.props.floatingAlignment !== 'none'
  )
    return disabled('Floating alignment controls this position. Use the edge insets.');
  if (!offset && !anchor) return resolved;
  const floating = node.props.placement === 'floating';
  if (floating) {
    if (anchor)
      return disabled(
        'Use Floating horizontal anchor and Floating vertical anchor for this placement.',
      );
    const alignment = node.props.floatingAlignment ?? 'none';
    if (alignment !== 'none') return resolved;
    const horizontal = node.props.floatingHorizontalAnchor ?? 'left';
    const vertical = node.props.floatingVerticalAnchor ?? 'top';
    if (offset === horizontal) return { ...resolved, layoutCoordinate: 'x' };
    if (offset === vertical) return { ...resolved, layoutCoordinate: 'y' };
    const sizing =
      offset === 'left' || offset === 'right' ? node.layout.item.width : node.layout.item.height;
    if (
      sizing === 'stretch' ||
      (offset === 'left' || offset === 'right' ? horizontal : vertical) === 'center'
    )
      return resolved;
    return disabled('This edge is controlled by the active floating anchor and item size.');
  }
  if (parentMode === 'row' || parentMode === 'column')
    return disabled(
      'The parent flow controls position. Use spacing, item alignment and responsive size.',
    );
  if (parentMode === 'align-to-parent') {
    if (anchor) return resolved;
    const horizontal = offset === 'left' || offset === 'right';
    const sizing = horizontal ? node.layout.item.width : node.layout.item.height;
    const edge = horizontal ? node.layout.item.horizontalAnchor : node.layout.item.verticalAnchor;
    if (sizing === 'stretch' || edge === 'stretch') return resolved;
    const active = edge === 'end' ? (horizontal ? 'right' : 'bottom') : horizontal ? 'left' : 'top';
    return offset === active
      ? resolved
      : disabled('This inset is inactive for the selected anchor and responsive size.');
  }
  if (anchor) return disabled('Anchors apply when the parent uses align-to-parent layout.');
  if (offset === 'left') return { ...resolved, layoutCoordinate: 'x' };
  if (offset === 'top') return { ...resolved, layoutCoordinate: 'y' };
  if ((offset === 'right' ? node.layout.item.width : node.layout.item.height) === 'stretch')
    return resolved;
  return disabled('This inset applies when the corresponding responsive size is Stretch.');
}
