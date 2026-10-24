import type { WebGroup, WebReusableElement } from '@webrad/runtime';

/** Keep the content clear of the left sidebar and its native mobile trigger. */
export function bindAuroraSidebar(menu: WebReusableElement, content: WebGroup): () => void {
  const viewport = menu.element.ownerDocument.defaultView;
  const synchronize = (): void => {
    content.marginLeft = (viewport?.innerWidth ?? 1024) < 768 ? 0 : menu.width;
    content.marginTop = (viewport?.innerWidth ?? 1024) < 768 ? 48 : 0;
  };
  synchronize();
  viewport?.addEventListener('resize', synchronize);
  menu.element.addEventListener('webrad:menu-layout-change', synchronize);
  return () => {
    try {
      (() => viewport?.removeEventListener('resize', synchronize))();
    } finally {
      menu.element.removeEventListener('webrad:menu-layout-change', synchronize);
    }
  };
}
