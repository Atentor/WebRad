import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';

export function popupSmokeProject() {
  const project = createProject('PopupLayout');
  let page = project.pages[0]!;
  for (const [id, type, parentId, caption] of [
    ['popup', 'WebPopup', page.rootComponentId, ''],
    ['message', 'WebLabel', 'popup', 'Você tem certeza que deseja EXCLUIR?'],
    ['actions', 'WebGroup', 'popup', ''],
    ['yes', 'WebButton', 'actions', 'Sim'],
    ['no', 'WebButton', 'actions', 'Não'],
  ]) {
    if (!id || !type || !parentId) throw new Error('Invalid popup fixture');
    let node = defaultComponentRegistry.createComponent(type, {
      id,
      name: id === 'popup' ? 'Popup1' : `Control${id}`,
      parentId,
      x: 0,
      y: 0,
      width: id === 'popup' ? 296 : id === 'message' ? 260 : 96,
      height: id === 'popup' ? 200 : 36,
      props: { ...(caption ? { caption } : {}), visible: id !== 'popup' },
    });
    if (id === 'popup' || id === 'actions')
      node = {
        ...node,
        layout: {
          container: {
            ...node.layout.container,
            mode: id === 'popup' ? 'column' : 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
          },
          item: {
            ...node.layout.item,
            ...(id === 'actions' ? { width: 'fit-content', height: 'fit-content' } : {}),
          },
        },
      };
    page = addComponent(page, node, parentId);
  }
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'created');
  return updatePage(project, page.id, page);
}

export const popupSmokeSources = {
  'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  private popupOpens = 0;
  private get opened(): number { return popupOpens; }
  private showPopup(): void {
    Popup1.show();
    this.element.dataset.barePageOpens = String(opened);
  }
  created(): void {
    document.body.addEventListener('click', () => { popupOpens += 1; showPopup(); });
  }
}`,
};

export const popupLayoutEvidence = `(() => {
  const dialog = document.querySelector('dialog');
  const actions = document.querySelector('[data-webrad-id="actions"]');
  const buttons = [...document.querySelectorAll('dialog button')];
  if (!dialog?.open || !actions || buttons.length !== 2) return null;
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right }; };
  return { dialog: box(dialog), actions: box(actions), buttons: buttons.map(box),
    overflow: buttons.some(b => b.scrollWidth > b.clientWidth),
    viewport: innerWidth,
    barePageOpens: document.querySelector('[data-bare-page-opens]')?.dataset.barePageOpens };
})()`;
