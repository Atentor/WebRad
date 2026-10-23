import { isLucideIconName, type LucideIconName } from '@webrad/runtime/icon';
import type { WebRadIconName } from '@webrad/runtime/icons';

export type IdeIconName = LucideIconName | WebRadIconName;

/** Semantic IDE action/registry names resolved to upstream Lucide IDs. */
export const IDE_ICON_ALIASES = {
  add: 'plus',
  close: 'x',
  delete: 'trash',
  page: 'file-text',
  style: 'paintbrush',
  'more-horizontal': 'ellipsis',
  'more-vertical': 'ellipsis-vertical',
  home: 'house',
  'check-circle': 'circle-check',
  'check-square': 'square-check',
  'minus-circle': 'circle-minus',
  'plus-circle': 'circle-plus',
  edit: 'pencil',
  cut: 'scissors',
  refresh: 'refresh-cw',
  unlock: 'lock-open',
  filter: 'funnel',
  'sort-asc': 'arrow-up-a-z',
  'sort-desc': 'arrow-down-z-a',
  warning: 'triangle-alert',
  'alert-circle': 'circle-alert',
  'help-circle': 'circle-question-mark',
  text: 'type',
  grid: 'grid-2x2',
  'upload-cloud': 'cloud-upload',
  'download-cloud': 'cloud-download',
  stop: 'square',
  login: 'log-in',
  logout: 'log-out',
  'sign-in': 'log-in',
  'sign-out': 'log-out',
  'door-in': 'log-in',
  'door-out': 'log-out',
  fingerprint: 'fingerprint-pattern',
  password: 'key-round',
  'sidebar-left': 'panel-left',
  'sidebar-right': 'panel-right',
  layout: 'layout-dashboard',
  columns: 'columns-2',
  rows: 'rows-2',
  'align-left': 'text-align-start',
  'align-center': 'text-align-center',
  'align-right': 'text-align-end',
  'align-justify': 'text-align-justify',
  'file-video': 'file-video-camera',
  'file-audio': 'file-music',
  'file-copy': 'files',
  'message-plus': 'message-square-plus',
  'message-x': 'message-square-x',
  outbox: 'send',
  'forward-mail': 'forward',
  attachment: 'paperclip',
  microphone: 'mic',
  'microphone-off': 'mic-off',
  sms: 'message-square-text',
  cart: 'shopping-cart',
} as const satisfies Readonly<
  Record<Exclude<WebRadIconName, LucideIconName>, LucideIconName> &
    Partial<Record<IdeIconName, LucideIconName>>
>;

export function resolveIdeIcon(name: IdeIconName): LucideIconName {
  if (name === 'delete') return IDE_ICON_ALIASES.delete;
  if (isLucideIconName(name)) return name;
  return IDE_ICON_ALIASES[name];
}
