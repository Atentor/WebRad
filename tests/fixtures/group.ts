import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';

export function groupProject() {
  const project = createProject('GroupExample');
  let page = project.pages[0]!;
  const group = defaultComponentRegistry.createComponent('WebGroup', {
    id: 'group',
    name: 'Group1',
    parentId: page.rootComponentId,
    x: 20,
    y: 30,
    width: 280,
    height: 160,
  });
  page = addComponent(page, group, page.rootComponentId);
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'child',
      name: 'Button1',
      parentId: group.id,
      x: 10,
      y: 10,
      props: { caption: 'Inside Group' },
    }),
    group.id,
  );
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'created');
  page = bindComponentEvent(page, 'group', 'OnClick', 'clicked');
  return updatePage(project, page.id, page);
}

export const groupUserSources = {
  'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  created(): void { Group1.caption = 'Ready'; this.Group1.width = 280; }
  clicked(): void { this.Button1.caption = Group1.caption; }
}`,
};
