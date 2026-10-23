import { isWebRadIconName, type WebRadIconName } from '@webrad/runtime/icons';
import { isLucideIconName } from '@webrad/runtime/icon';
import type { ReactElement } from 'react';
import { Icon } from './Icon';

/** Registry metadata aliases keep component glyphs consistent throughout the IDE. */
const COMPONENT_ICON_ALIASES: Readonly<Record<string, WebRadIconName>> = {
  'component-page': 'page',
  'component-panel': 'layout',
  'component-label': 'text',
  'component-edit': 'edit',
  'component-text-area': 'align-left',
  'component-button': 'square',
  'component-check-box': 'check-square',
  'component-combo-box': 'chevron-down',
  'component-image': 'image',
  'component-file-upload': 'upload',
  'component-list-box': 'list',
  'component-popup': 'panel-top',
  'component-api-client': 'globe',
  'component-report-builder': 'page',
  'component-toggle': 'toggle-right',
};

interface ComponentIconProps {
  readonly icon?: string;
}

export function ComponentIcon({ icon }: ComponentIconProps): ReactElement {
  const name =
    icon !== undefined && (isLucideIconName(icon) || isWebRadIconName(icon))
      ? icon
      : (COMPONENT_ICON_ALIASES[icon ?? ''] ?? 'layers');
  return <Icon name={name} />;
}
