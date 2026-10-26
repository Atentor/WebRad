import { setRuntimeLayoutProjection } from './layout.js';
import {
  projectReusableMenuLayout,
  readWebMenuMargins,
  type RuntimeReusableMenuDefinition,
} from './menu-layout.js';
import type { WebMenu } from './menu.js';
import { bindWebMenuEventHost } from './menu-events.js';

/** Keep the reusable shell in sync with the responsive state of its full-height menu. */
export function bindReusableMenuLayout(
  element: HTMLElement,
  definition: RuntimeReusableMenuDefinition,
  menu: WebMenu,
): () => void {
  const unbindEvents = bindWebMenuEventHost(menu.element, element);
  element.dataset.menuManaged = 'true';
  const view = element.ownerDocument.defaultView;
  const update = (): void => {
    const width = view?.innerWidth ?? 1024;
    const height = view?.innerHeight;
    const configuration = menu.configuration;
    const horizontal = element.dataset.webradFloatingHorizontalAnchor;
    const vertical = element.dataset.webradFloatingVerticalAnchor;
    const margins = readWebMenuMargins(element);
    setRuntimeLayoutProjection(element, (node) =>
      projectReusableMenuLayout(
        {
          ...node,
          props: {
            ...node.props,
            ...margins,
            floatingHorizontalAnchor: horizontal ?? node.props?.floatingHorizontalAnchor,
            floatingVerticalAnchor: vertical ?? node.props?.floatingVerticalAnchor,
          },
        },
        definition,
        width,
        configuration,
        height,
      ),
    );
  };
  const onMenuLayout = (event: Event): void => {
    if (event.target === menu.element) update();
  };
  update();
  element.addEventListener('webrad:menu-layout-change', onMenuLayout);
  element.addEventListener('webrad-placement-change', update);
  view?.addEventListener('resize', update);
  const observer =
    typeof view?.MutationObserver === 'undefined' ? undefined : new view.MutationObserver(update);
  observer?.observe(element, { attributes: true, attributeFilter: ['style'] });
  return () => {
    unbindEvents();
    observer?.disconnect();

    delete element.dataset.menuManaged;

    element.removeEventListener('webrad:menu-layout-change', onMenuLayout);
    element.removeEventListener('webrad-placement-change', update);
    view?.removeEventListener('resize', update);
    setRuntimeLayoutProjection(element, null);
  };
}
