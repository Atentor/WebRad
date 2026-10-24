import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  applyDefaultComponentStyle,
  bindComponentEvent,
  createProject,
  updatePage,
} from '@webrad/project-model';
export const panelImage = 'assets/imported/panel image.svg';
export const panelAsset = {
  id: 'panel-image',
  fileName: 'panel image.svg',
  mediaType: 'image/svg+xml',
  base64: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="#ff6600" d="M0 0h32v16H0z"/></svg>',
  ).toString('base64'),
};
export function panelBackgroundProject() {
  const project = { ...createProject('PanelBackground'), assets: [panelAsset] };
  let page = project.pages[0]!;
  const panel = defaultComponentRegistry.createComponent('WebPanel', {
    id: 'panel',
    name: 'Panel1',
    parentId: page.rootComponentId,
    x: 20,
    y: 30,
    width: 280,
    height: 160,
    props: { backgroundImage: panelImage },
  });
  page = addComponent(
    page,
    applyDefaultComponentStyle(panel, project.styles),
    page.rootComponentId,
  );
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'child',
      name: 'Button1',
      parentId: panel.id,
      x: 10,
      y: 10,
      props: { caption: 'Change background' },
    }),
    panel.id,
  );
  page = bindComponentEvent(page, 'child', 'OnClick', 'changeBackground');
  return updatePage(project, page.id, page);
}
export const panelBackgroundUserSources = {
  'pages/index.ts': `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {
  changeBackground(): void {
    if (Panel1.backgroundSize === 'cover') {
      Panel1.backgroundSize = 'contain'; this.Panel1.backgroundPosition = 'right bottom';
      Panel1.backgroundRepeat = 'repeat-x';
    } else { this.Panel1.backgroundImage = ''; }
    this.Button1.caption = Panel1.backgroundImage === '' ? 'Cleared' : 'Image';
  }
}`,
};
