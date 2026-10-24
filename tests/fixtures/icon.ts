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
export function iconProject(reusable = false) {
  let project = createProject('LucideExample');
  let page = project.pages[0]!;
  let document = reusable ? createReusableElement('IconCard', { width: 260, height: 160 }) : page;
  for (const [index, mode] of ['icon', 'button'].entries()) {
    document = addComponent(
      document,
      applyDefaultComponentStyle(
        defaultComponentRegistry.createComponent('WebIcon', {
          id: mode!,
          name: mode === 'icon' ? 'Icon1' : 'Action1',
          parentId: document.rootComponentId,
          x: 20 + index * 100,
          y: 20,
          width: 48,
          height: 48,
          props: {
            icon: mode === 'icon' ? 'camera' : 'save',
            mode,
            accessibleLabel: mode === 'icon' ? 'Camera' : 'Save',
            strokeWidth: 2,
          },
        }),
        project.styles,
      ),
      document.rootComponentId,
    );
    document = bindComponentEvent(document, mode!, 'OnClick', 'activate');
  }
  document = addComponent(
    document,
    applyDefaultComponentStyle(
      defaultComponentRegistry.createComponent('WebButton', {
        id: 'text-button',
        name: 'Button1',
        parentId: document.rootComponentId,
        x: 20,
        y: 90,
        props: { caption: 'Save changes', icon: 'save' },
      }),
      project.styles,
    ),
    document.rootComponentId,
  );
  document = bindComponentEvent(document, 'text-button', 'OnClick', 'activateButton');
  if (!reusable) return updatePage(project, page.id, document);
  project = addReusableElement(project, document);
  for (const [index, name] of ['FirstCard', 'SecondCard'].entries()) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: name,
        name,
        parentId: page.rootComponentId,
        x: 20 + index * 300,
        y: 20,
        width: 260,
        height: 160,
        props: { reusableElementId: document.id },
      }),
      page.rootComponentId,
    );
  }
  return updatePage(project, page.id, page);
}
const methods = `activate(sender: WebIcon): void {
  Icon1.icon = 'check';
  this.Button1.icon = 'check';
  this.Icon1.strokeWidth = 3;
  this.element.dataset.activations = String(Number(this.element.dataset.activations ?? '0') + 1);
  sender.accessibleLabel = 'Saved';
}
activateButton(): void {
  Button1.icon = 'save';
  this.Icon1.icon = 'camera';
}`;
export function iconUserSources(reusable = false): Record<string, string> {
  return {
    'pages/index.ts': `import type { WebIcon } from '@webrad/runtime';
import { indexGenerated } from "./index.generated";
export class index extends indexGenerated { ${reusable ? '' : methods} }`,
    ...(reusable
      ? {
          'reusables/IconCard.ts': `import type { WebIcon } from '@webrad/runtime';
import { IconCardGenerated } from './IconCard.generated';
export class IconCard extends IconCardGenerated { ${methods} }`,
        }
      : {}),
  };
}
