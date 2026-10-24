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
export function progressBarProject(reusable = false) {
  let project = createProject('ProgressBarExample');
  let page = project.pages[0]!;
  let document = reusable
    ? createReusableElement('ProgressCard', { width: 360, height: 240 })
    : page;
  for (const [index, format] of ['bars', 'dunnet', 'circus'].entries()) {
    const node = applyDefaultComponentStyle(
      defaultComponentRegistry.createComponent('WebProgressBar', {
        id: format!,
        name: `${format![0]!.toUpperCase()}${format!.slice(1)}1`,
        parentId: document.rootComponentId,
        x: index === 2 ? 160 : 20,
        y: index === 0 ? 20 : 70,
        width: index === 0 ? 260 : 120,
        height: index === 0 ? 32 : 120,
        props: { format, min: 0, max: 200, value: 50 },
      }),
      project.styles,
    );
    document = addComponent(document, node, document.rootComponentId);
  }
  document = addComponent(
    document,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'advance',
      name: 'Advance1',
      parentId: document.rootComponentId,
      x: 20,
      y: 200,
      props: { caption: 'Advance' },
    }),
    document.rootComponentId,
  );
  document = bindComponentEvent(document, 'advance', 'OnClick', 'advance');
  document = bindComponentEvent(document, 'bars', 'OnChange', 'changed');
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
    Bars1.increment(50);
    this.Dunnet1.value = Bars1.value;
    Circus1.value = this.Bars1.value;
  }
  changed(sender: WebProgressBar): void {
    this.element.dataset.progress = String(sender.percentage);
    this.element.dataset.changes = String(Number(this.element.dataset.changes ?? '0') + 1);
  }
`;
export function progressBarUserSources(reusable = false): Record<string, string> {
  return {
    'pages/index.ts': `import type { WebProgressBar } from '@webrad/runtime';
import { indexGenerated } from "./index.generated";
export class index extends indexGenerated { ${reusable ? '' : methods} }`,
    ...(reusable
      ? {
          'reusables/ProgressCard.ts': `import type { WebProgressBar } from '@webrad/runtime';
import { ProgressCardGenerated } from './ProgressCard.generated';
export class ProgressCard extends ProgressCardGenerated { ${methods} }`,
        }
      : {}),
  };
}
