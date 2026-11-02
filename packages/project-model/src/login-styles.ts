import { WEB_LOGIN_STYLE_SLOTS } from '@webrad/runtime/login-model';
import type { z } from 'zod';
import type { ComponentNode, WebRadProject } from './types.js';

function bindings(component: ComponentNode): Record<string, unknown> | undefined {
  if (component.type !== 'WebLogin') return undefined;
  const configuration = component.props.configuration;
  if (typeof configuration !== 'object' || configuration === null) return undefined;
  const styles: unknown = Reflect.get(configuration, 'styles');
  return typeof styles === 'object' && styles !== null && !Array.isArray(styles)
    ? (styles as Record<string, unknown>)
    : undefined;
}

export function validateLoginStyleReferences(
  project: WebRadProject,
  context: z.RefinementCtx,
): void {
  const library = new Map(project.styles.map((style) => [style.id, style]));
  for (const collection of ['pages', 'reusableElements', 'menus'] as const) {
    project[collection]?.forEach((document, index) => {
      document.components.forEach((node, componentIndex) => {
        const styles = bindings(node);
        if (!styles) return;
        for (const slot of WEB_LOGIN_STYLE_SLOTS) {
          const id = styles[slot.name];
          if (typeof id !== 'string') continue;
          const style = library.get(id);
          if (style?.componentType === slot.componentType) continue;
          context.addIssue({
            code: 'custom',
            path: [
              collection,
              index,
              'components',
              componentIndex,
              'props',
              'configuration',
              'styles',
              slot.name,
            ],
            message: style
              ? `Login ${slot.label} requires a ${slot.componentType} style, not ${style.componentType}.`
              : `Unknown Login component style ID "${id}".`,
          });
        }
      });
    });
  }
}

/** Deletion uses the same explicit None result as the ordinary Inspector style binding. */
export function detachLoginStyle(component: ComponentNode, styleId: string): ComponentNode {
  const styles = bindings(component);
  if (!styles || !Object.values(styles).includes(styleId)) return component;
  const configuration = component.props.configuration;
  if (typeof configuration !== 'object' || configuration === null) return component;
  return {
    ...component,
    props: {
      ...component.props,
      configuration: {
        ...configuration,
        styles: Object.fromEntries(
          Object.entries(styles).map(([key, id]) => [key, id === styleId ? null : id]),
        ),
      },
    },
  };
}
