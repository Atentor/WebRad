import {
  createReusableElement,
  createDefaultComponentLayout,
  type ReusableElementModel,
} from '@webrad/project-model';
import { defaultComponentRegistry } from './mvp-components.js';
export interface ReusableComponentTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly create: (name: string) => ReusableElementModel;
  /** Initial source for a new document only; never applied to an existing file. */
  readonly createSource?: (document: ReusableElementModel) => string;
}
/** Project templates compose registered components and retain independent authored TypeScript. */
export const REUSABLE_COMPONENT_TEMPLATES: readonly ReusableComponentTemplate[] = [
  {
    id: 'blank',
    label: 'Blank component',
    description: 'Start with an empty visual container.',
    create: (name) => createReusableElement(name),
  },
  {
    id: 'navigation-menu',
    label: 'Responsive menu',
    description:
      'Sidebar, mobile drawer, nested items and a separate TypeScript class for shared behavior.',
    createSource: (document) => {
      const menu = document.components.find((component) => component.type === 'WebMenu');
      if (!menu) throw new Error('Responsive menu template has no Menu instance.');
      return `import type { WebMenuItem, WebMenuUser } from '@webrad/runtime';
import { ${document.name}Generated } from './${document.name}.generated';

export class ${document.name} extends ${document.name}Generated {
  // This class owns the shared menu logic. Each placement has its own state.
  // Use the ${menu.name} Interact tab to create typed item, brand and profile handlers.

  public setUser(user: WebMenuUser): void {
    this.${menu.name}.user = user;
  }

  public setItems(items: readonly WebMenuItem[]): void {
    this.${menu.name}.items = items;
  }

  public selectItem(itemId: string): void {
    this.${menu.name}.selectedItemId = itemId;
  }
}
`;
    },
    create: (name) => {
      const reusable = createReusableElement(name, { width: 288, height: 640 });
      const root = reusable.components[0];
      if (!root) throw new Error('Reusable root is missing.');
      const menu = defaultComponentRegistry.createComponent('WebMenu', {
        parentId: root.id,
        existingNames: reusable.components,
      });
      return {
        ...reusable,
        components: [
          {
            ...root,
            layout: {
              ...root.layout,
              container: { ...root.layout.container, mode: 'column' },
              item: { ...root.layout.item, width: 'fit-content', height: 'fit-content' },
            },
            props: { ...root.props, borderColor: 'transparent' },
            children: [menu.id],
          },
          {
            ...menu,
            layout: {
              ...createDefaultComponentLayout(),
              item: { ...menu.layout.item },
            },
          },
        ],
      };
    },
  },
];
