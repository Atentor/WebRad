import { WEBRAD_COMPONENT_CSS } from '@webrad/runtime/visual';
import type { ReactElement } from 'react';

export { WEBRAD_COMPONENT_CSS };

export function SharedComponentStyles(): ReactElement {
  return <style>{WEBRAD_COMPONENT_CSS}</style>;
}
