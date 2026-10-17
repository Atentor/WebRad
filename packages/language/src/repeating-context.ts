import {
  RepeatingGroupConfigurationSchema,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';

/** The closest row template owns the component's row context. */
export function repeatingGroupForComponent(
  document: PageModel,
  componentId: string,
): ComponentNode | undefined {
  const components = new Map(document.components.map((component) => [component.id, component]));
  let component = components.get(componentId);
  const visited = new Set<string>();
  while (component?.parentId != null && !visited.has(component.id)) {
    visited.add(component.id);
    component = components.get(component.parentId);
    if (component?.type === 'WebRepeatingGroup') return component;
  }
  return undefined;
}

/** Exported from the document's generated module and imported by authored handlers. */
export function currentRowHandlerType(
  document: PageModel,
  componentId: string,
): string | undefined {
  const group = repeatingGroupForComponent(document, componentId);
  return group === undefined ? undefined : `${group.name}CurrentRow`;
}

export function repeatingGroupConfiguration(component: ComponentNode) {
  return RepeatingGroupConfigurationSchema.safeParse(component.props.repeatingGroupConfig);
}
