import { WEBRAD_COMPONENT_CSS, WEBRAD_PROJECT_CSS } from '@webrad/runtime/visual';
import type { ReactElement } from 'react';

export { WEBRAD_COMPONENT_CSS };

// Designer wrappers project the same responsive footprint as the browser class.
const DESIGNER_MENU_CSS = `
.wr-runtime-node:has(> .wr-webmenu[data-menu-mobile='true']) { width: 100% !important; height: 48px !important; min-height: 0 !important; }
.wr-runtime-node:has(> .wr-webmenu[data-menu-collapsed='true']) { width: var(--wr-menu-designer-collapsed-width, 72px) !important; }
`;

export function SharedComponentStyles(): ReactElement {
  return (
    <style>{`@layer components {\n${WEBRAD_COMPONENT_CSS}\n${WEBRAD_PROJECT_CSS}\n${DESIGNER_MENU_CSS}\n}`}</style>
  );
}
