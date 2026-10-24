import { WEBRAD_COMPONENT_CSS, WEBRAD_PROJECT_CSS } from '@webrad/runtime/visual';
import type { ReactElement } from 'react';

export { WEBRAD_COMPONENT_CSS };

export function SharedComponentStyles(): ReactElement {
  return <style>{`@layer components {\n${WEBRAD_COMPONENT_CSS}\n${WEBRAD_PROJECT_CSS}\n}`}</style>;
}
