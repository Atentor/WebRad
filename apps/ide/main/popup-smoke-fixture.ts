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
  'pages/index.ts': `import { indexGenerated } from './index.generated';
import { Theme } from '@webrad/runtime';
export class index extends indexGenerated {
  private popupOpens = 0;
  private get opened(): number { return popupOpens; }
  private showPopup(): void {
    Popup1.show();
    this.element.dataset.barePageOpens = String(opened);
  }
  created(): void {
    this.element.dataset.themeAtCreate = document.documentElement.dataset.webradTheme;
    Theme.subscribe((_sender, event) => {
      this.element.dataset.themeMode = event.detail.mode;
      this.element.dataset.themeResolved = event.detail.resolvedMode;
    });
    document.body.addEventListener('keydown', event => {
      if (event.key === 'F6') Theme.mode = 'dark';
      if (event.key === 'F7') Theme.mode = 'light';
      if (event.key === 'F8') Theme.mode = 'system';
      if (event.key === 'F10') Theme.toggle();
      if (event.key === 'F11') Theme.reset();
    });
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
