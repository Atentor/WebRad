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
export function panelProgressProject(reusable = false, value = 0) {
  let project = createProject('PanelProgressExample');
  let page = project.pages[0]!;
  let document = reusable
    ? createReusableElement('ProgressCard', { width: 360, height: 240 })
    : page;
  const panel = applyDefaultComponentStyle(
    defaultComponentRegistry.createComponent('WebPanel', {
      id: 'panel',
      name: 'Panel1',
      parentId: document.rootComponentId,
      x: 20,
      y: 20,
      width: 280,
      height: 160,
      props: { progressEnabled: true, progressValue: value },
    }),
    project.styles,
  );
  document = addComponent(document, panel, document.rootComponentId);
  document = addComponent(
    document,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'advance',
      name: 'Advance1',
      parentId: panel.id,
      x: 20,
      y: 20,
      props: { caption: 'Advance' },
    }),
    panel.id,
  );
  document = bindComponentEvent(document, 'advance', 'OnClick', 'advance');
  if (!reusable) return updatePage(project, page.id, document);
  project = addReusableElement(project, document);
  for (const [index, name] of ['FirstCard', 'SecondCard'].entries()) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: name,
        name,
        parentId: page.rootComponentId,
        x: 20 + index * 380,
        y: 20,
        width: 360,
        height: 240,
        props: { reusableElementId: document.id },
      }),
      page.rootComponentId,
    );
  }
  return updatePage(project, page.id, page);
}
const methods = `
  advance(): void {
    Panel1.progressEnabled = true;
    this.Panel1.progressValue += 25;
    Advance1.caption = Panel1.progressVisible ? 'Progress ' + Panel1.progressValue : 'Hidden';
  }
`;
export function panelProgressUserSources(reusable = false): Record<string, string> {
  return {
    'pages/index.ts': `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated { ${reusable ? '' : methods} }`,
    ...(reusable
      ? {
          'reusables/ProgressCard.ts': `import { ProgressCardGenerated } from './ProgressCard.generated';
export class ProgressCard extends ProgressCardGenerated { ${methods} }`,
        }
      : {}),
  };
}
