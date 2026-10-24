import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addReusableElement,
  applyDefaultComponentStyle,
  bindComponentEvent,
  createProject,
  createReusableElement,
  updatePage,
} from '@webrad/project-model';
export function toggleProject(reusable = false) {
  let project = createProject('ToggleExample');
  let page = project.pages[0]!;
  let document = reusable ? createReusableElement('SwitchCard', { width: 180, height: 80 }) : page;
  document = addComponent(
    document,
    applyDefaultComponentStyle(
      defaultComponentRegistry.createComponent('WebToggle', {
        id: 'toggle',
        name: 'Toggle1',
        parentId: document.rootComponentId,
        x: 20,
        y: 20,
      }),
      project.styles,
    ),
    document.rootComponentId,
  );
  document = addComponent(
    document,
    defaultComponentRegistry.createComponent('WebLabel', {
      id: 'status',
      name: 'Status1',
      parentId: document.rootComponentId,
      x: 80,
      y: 20,
      props: { caption: 'Off' },
    }),
    document.rootComponentId,
  );
  document = bindComponentEvent(document, 'toggle', 'OnChange', 'changed');
  document = bindComponentEvent(document, 'toggle', 'OnFocus', 'focused');
  document = bindComponentEvent(document, 'toggle', 'OnBlur', 'blurred');
  if (!reusable) return updatePage(project, page.id, document);
  project = addReusableElement(project, document);
  for (const [index, name] of ['FirstCard', 'SecondCard'].entries()) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: name,
        name,
        parentId: page.rootComponentId,
        x: index * 200,
        y: 100,
        width: 180,
        height: 80,
        props: { reusableElementId: document.id },
      }),
      page.rootComponentId,
    );
  }
  return updatePage(project, page.id, page);
}
const methods = `
  changed(sender: WebToggle): void {
    this.Status1.caption = Toggle1.checked ? 'On' : 'Off';
    this.element.dataset.changes = String(Number(this.element.dataset.changes ?? '0') + 1);
    this.element.dataset.sameInstanceState = String(sender.checked === this.Toggle1.checked);
  }
  focused(): void { this.element.dataset.focused = 'true'; }
  blurred(): void { this.element.dataset.blurred = 'true'; }
`;
export function toggleUserSources(reusable = false): Record<string, string> {
  return {
    'pages/index.ts': `import type { WebToggle } from '@webrad/runtime';
import { indexGenerated } from "./index.generated";
export class index extends indexGenerated { ${reusable ? '' : methods} }`,
    ...(reusable
      ? {
          'reusables/SwitchCard.ts': `import type { WebToggle } from '@webrad/runtime';
import { SwitchCardGenerated } from './SwitchCard.generated';
export class SwitchCard extends SwitchCardGenerated { ${methods} }`,
        }
      : {}),
  };
}
