import type { ComponentNode, MenuDefinitionModel, PageModel, WebRadProject } from './types.js';
import { portableFileNameKey } from './naming.js';
import { projectWebMenuLayout } from '@webrad/runtime/menu-layout';
import { parseWebMenuConfiguration } from '@webrad/runtime/menu-model';
import type { z } from 'zod';

export function menuSourcePath(menu: Pick<MenuDefinitionModel, 'name'>): string {
  return `menus/${menu.name}.ts`;
}

/** Resolve only for rendering/compilation; placements persist a stable reference. */
export function resolveMenuDocument(
  document: PageModel,
  menus: readonly MenuDefinitionModel[] = [],
): PageModel {
  return {
    ...document,
    components: document.components.map((node) => {
      if (node.type !== 'WebMenu' || typeof node.props.menuDefinitionId !== 'string') return node;
      const definition = menus.find((menu) => menu.id === node.props.menuDefinitionId);
      const root = definition?.components.find(
        (component) => component.id === definition.rootComponentId,
      );
      if (!root)
        throw new Error(`Unknown Menu definition "${String(node.props.menuDefinitionId)}".`);
      return projectWebMenuLayout(
        {
          ...node,
          styleId: root.styleId,
          props: { ...node.props, configuration: root.props.configuration },
        },
        Number.POSITIVE_INFINITY,
        { ...parseWebMenuConfiguration(root.props.configuration), collapsed: false },
      );
    }),
  };
}

export function linkMenuDefinition(node: ComponentNode, menuId: string): ComponentNode {
  const props = Object.fromEntries(
    Object.entries(node.props).filter(([key]) => key !== 'configuration'),
  );
  const localConfiguration = node.props.configuration;
  const wasHorizontal =
    typeof localConfiguration === 'object' &&
    localConfiguration !== null &&
    Reflect.get(localConfiguration, 'orientation') === 'horizontal';
  return {
    ...node,
    bounds: {
      ...node.bounds,
      height:
        node.bounds.height === 640 && !wasHorizontal && node.props.menuDefinitionId === undefined
          ? 80
          : node.bounds.height,
    },
    props: { ...props, menuDefinitionId: menuId },
  };
}

export function validateMenuDefinitions(
  project: Pick<WebRadProject, 'reusableElements' | 'menus' | 'styles'> & {
    readonly pages: readonly {
      readonly id: string;
      readonly name: string;
      readonly components?: readonly ComponentNode[];
    }[];
  },
  context: z.RefinementCtx,
): void {
  const ids = new Set([...project.pages, ...project.reusableElements].map((document) => document.id));
  const names = new Set(
    [...project.pages, ...project.reusableElements].map((document) =>
      portableFileNameKey(document.name),
    ),
  );
  const menus = project.menus ?? [];
  menus.forEach((menu, index) => {
    if (ids.has(menu.id) || names.has(portableFileNameKey(menu.name)))
      context.addIssue({
        code: 'custom',
        message: 'Menu identity conflicts with another project document.',
        path: ['menus', index],
      });
    ids.add(menu.id);
    names.add(portableFileNameKey(menu.name));
    const root = menu.components.find((node) => node.id === menu.rootComponentId);
    if (
      menu.name === '404' ||
      menu.components.length !== 1 ||
      root?.type !== 'WebMenu' ||
      root.props.menuDefinitionId !== undefined ||
      root.props.configuration === undefined
    )
      context.addIssue({
        code: 'custom',
        message: 'A Menu definition must contain one configured WebMenu root.',
        path: ['menus', index],
      });
    if (
      root?.styleId !== undefined &&
      !project.styles.some((style) => style.id === root.styleId && style.componentType === 'WebMenu')
    )
      context.addIssue({
        code: 'custom',
        message: 'Menu style must reference an existing WebMenu style.',
        path: ['menus', index, 'components', 0, 'styleId'],
      });
  });
  for (const collection of ['pages', 'reusableElements'] as const)
    project[collection].forEach((document, documentIndex) => {
      (document.components ?? []).forEach((node, nodeIndex) => {
        if (node.props.menuDefinitionId === undefined) return;
        if (
          node.type !== 'WebMenu' ||
          !menus.some((menu) => menu.id === node.props.menuDefinitionId) ||
          node.props.configuration !== undefined
        )
          context.addIssue({
            code: 'custom',
            message:
              'A shared Menu must reference an existing definition and cannot store a separate configuration.',
            path: [collection, documentIndex, 'components', nodeIndex, 'props', 'menuDefinitionId'],
          });
      });
    });
}
