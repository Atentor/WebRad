import { z } from 'zod';
import { parseWebMenuConfiguration, type WebMenuConfiguration } from '@webrad/runtime/menu-model';
import type { WebRadProject } from './types.js';
/** One contract for the saved model, editor and generated browser runtime. */
export const MenuConfigurationSchema = z
  .unknown()
  .transform((value, context): WebMenuConfiguration => {
    try {
      return parseWebMenuConfiguration(value);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid Menu configuration.',
      });
      return z.NEVER;
    }
  });
export function validateMenuPageReferences(project: WebRadProject, context: z.RefinementCtx): void {
  const pageIds = new Set(project.pages.map((page) => page.id));
  for (const collection of ['pages', 'reusableElements'] as const)
    project[collection].forEach((document, documentIndex) => {
      document.components.forEach((component, componentIndex) => {
        if (component.type !== 'WebMenu' || component.props.configuration === undefined) return;
        const parsed = MenuConfigurationSchema.safeParse(component.props.configuration);
        if (!parsed.success) return;
        const base = [
          collection,
          documentIndex,
          'components',
          componentIndex,
          'props',
          'configuration',
        ];
        const check = (page: string | undefined, path: (string | number)[]): void => {
          if (page && !pageIds.has(page))
            context.addIssue({
              code: 'custom',
              message: `Menu references unknown page ID "${page}".`,
              path,
            });
        };
        check(parsed.data.brand.page, [...base, 'brand', 'page']);
        const visit = (items: WebMenuConfiguration['items'], path: (string | number)[]): void =>
          items.forEach((item, index) => {
            check(item.page, [...path, index, 'page']);
            visit(item.children ?? [], [...path, index, 'children']);
          });
        visit(parsed.data.items, [...base, 'items']);
      });
    });
}
export function materializeLegacyMenuTemplate(input: unknown): unknown {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!isRecord(input) || !Array.isArray(input.components)) return input;
  const components: unknown[] = input.components;
  const root = components.find((node) => isRecord(node) && node.id === input.rootComponentId);
  if (
    !isRecord(root) ||
    root.type !== 'WebPanel' ||
    root.parentId !== null ||
    !isRecord(root.props) ||
    root.props.borderWidth !== 0 ||
    root.props.borderColor !== 'transparent' ||
    !Array.isArray(root.children) ||
    root.children.length !== 1
  )
    return input;
  const childId = root.children[0];
  const child = components.find((node) => isRecord(node) && node.id === childId);
  if (!isRecord(child) || child.type !== 'WebMenu' || child.parentId !== root.id) return input;
  const props = Object.fromEntries(
    Object.entries(root.props).filter(([name]) => name !== 'borderWidth'),
  );
  return {
    ...input,
    components: components.map((node) => (node === root ? { ...root, props } : node)),
  };
}
