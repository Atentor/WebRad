import {
  projectWebMenuLayout,
  projectReusableMenuLayout,
  reusableMenuNode,
  type RuntimeReusableMenuDefinition,
} from '@webrad/runtime/menu-layout';
import {
  createDefaultWebMenuConfiguration,
  parseWebMenuConfiguration,
} from '@webrad/runtime/menu-model';
import type { RuntimeLayoutNode } from '@webrad/runtime';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Menus own their placement policy; legacy layout combinations are no longer user settings. */
export function materializeManagedMenuLayouts(input: unknown): unknown {
  if (!record(input) || !Array.isArray(input.reusableElements) || !Array.isArray(input.pages))
    return input;
  const definitions = input.reusableElements.filter(record);
  const configurationFor = (props: Readonly<Record<string, unknown>>): unknown => {
    // Shared orientation is a projection. Keep the stored placement canonical
    // independently so editing a definition cannot reset page command history.
    return typeof props.menuDefinitionId === 'string'
      ? { ...createDefaultWebMenuConfiguration(), orientation: 'horizontal' }
      : props.configuration;
  };
  const documents = (values: unknown[], embedded: boolean): unknown[] =>
    values.map((value) => {
      if (!record(value) || !Array.isArray(value.components)) return value;
      const definition = value as unknown as RuntimeReusableMenuDefinition;
      const composite = reusableMenuNode(definition);
      const horizontalDefaultHeight =
        composite?.props?.menuDefinitionId === undefined &&
        composite?.bounds?.height === 640 &&
        composite.layout?.item?.height !== 'fixed' &&
        (configurationFor(composite.props ?? {}) as { orientation?: unknown } | undefined)
          ?.orientation === 'horizontal';

      return {
        ...value,
        ...(horizontalDefaultHeight && value.height === 640 ? { height: 80 } : {}),
        components: value.components.map((component: unknown) => {
          if (
            !record(component) ||
            !record(component.bounds) ||
            !record(component.layout) ||
            !record(component.props) ||
            !record(component.layout.item) ||
            !record(component.layout.container)
          )
            return component;
          const node = component as unknown as RuntimeLayoutNode;
          const reusableElementId = component.props.reusableElementId;
          const owner = definitions.find((item) => item.id === reusableElementId) as unknown as
            RuntimeReusableMenuDefinition | undefined;
          if (component.type === 'WebMenu') {
            let configuration;
            try {
              configuration = parseWebMenuConfiguration(configurationFor(component.props));
            } catch {
              return component;
            }
            return projectWebMenuLayout(
              {
                ...component,
                props:
                  component.props.menuDefinitionId === undefined
                    ? { ...component.props, configuration }
                    : component.props,
              } as unknown as RuntimeLayoutNode,
              Number.POSITIVE_INFINITY,
              { ...configuration, collapsed: false },
              embedded && composite?.id === component.id,
            );
          }
          if (component.type === 'WebReusableElement' && reusableMenuNode(owner)) {
            const config = configurationFor(reusableMenuNode(owner)?.props ?? {});
            try {
              return projectReusableMenuLayout(node, owner, Number.POSITIVE_INFINITY, {
                ...parseWebMenuConfiguration(config),
                collapsed: false,
              });
            } catch {
              return component;
            }
          }
          if (composite && component.id === value.rootComponentId)
            return {
              ...component,
              ...(horizontalDefaultHeight && component.bounds.height === 640
                ? { bounds: { ...component.bounds, height: 80 } }
                : {}),
              layout: {
                ...component.layout,
                container: {
                  ...(component.layout.container as Record<string, unknown>),
                  mode: 'column',
                  paddingTop: 0,
                  paddingRight: 0,
                  paddingBottom: 0,
                  paddingLeft: 0,
                  gap: 0,
                },
                item: {
                  ...(component.layout.item as Record<string, unknown>),
                  width: 'stretch',
                  height: 'stretch',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                },
              },
            };
          return component;
        }),
      };
    });
  return {
    ...input,
    reusableElements: documents(input.reusableElements, true),
    pages: documents(input.pages, false),
  };
}
