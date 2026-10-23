import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';

export function panelFloatingProject() {
  const project = createProject('PanelFloatingExample');
  let page = project.pages[0]!;
  const root = page.components[0]!;
  page = {
    ...page,
    components: [
      {
        ...root,
        layout: { ...root.layout, container: { ...root.layout.container, mode: 'column' } },
      },
    ],
  };
  const parent = defaultComponentRegistry.createComponent('WebPanel', {
    id: 'parent',
    name: 'ParentPanel',
    parentId: page.rootComponentId,
    x: 70,
    y: 80,
    width: 360,
    height: 120,
  });
  page = addComponent(page, parent, page.rootComponentId);
  const panel = defaultComponentRegistry.createComponent('WebPanel', {
    id: 'floating-panel',
    name: 'FloatingPanel',
    parentId: parent.id,
    x: 24,
    y: 32,
    width: 220,
    height: 140,
    props: { placement: 'floating', floatingZIndex: 200 },
  });
  page = addComponent(page, panel, parent.id);
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'child',
      name: 'ChildButton',
      parentId: panel.id,
      x: 10,
      y: 10,
      props: { caption: 'Anchor right' },
    }),
    panel.id,
  );
  page = bindComponentEvent(page, 'child', 'OnClick', 'anchorRight');
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'toggle',
      name: 'ToggleButton',
      parentId: page.rootComponentId,
      x: 0,
      y: 180,
      props: { caption: 'Toggle floating' },
    }),
    page.rootComponentId,
  );
  page = bindComponentEvent(page, 'toggle', 'OnClick', 'toggleFloating');
  return updatePage(project, page.id, page);
}

export const panelFloatingUserSources = {
  'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  anchorRight(): void {
    FloatingPanel.floatingHorizontalAnchor = 'right';
    this.FloatingPanel.floatingVerticalAnchor = 'bottom';
    FloatingPanel.floatingZIndex = 300;
    ChildButton.caption = 'Anchored';
  }
  toggleFloating(): void {
    this.FloatingPanel.placement = FloatingPanel.placement === 'floating' ? 'in-flow' : 'floating';
  }
}`,
};
