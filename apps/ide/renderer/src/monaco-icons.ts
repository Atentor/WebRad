import { projectIcon, type LucideIconName } from '@webrad/runtime/icon';

/** Monaco contribution IDs retain their behavior and accessible labels; only artwork changes. */
export const MONACO_LUCIDE_ICONS = {
  'symbol-array': 'brackets',
  'symbol-boolean': 'toggle-left',
  'symbol-class': 'box',
  'symbol-color': 'palette',
  'symbol-constant': 'square-pi',
  'symbol-constructor': 'wrench',
  'symbol-enum': 'list-ordered',
  'symbol-enum-member': 'list-start',
  'symbol-event': 'zap',
  'symbol-field': 'rectangle-ellipsis',
  'symbol-file': 'file-code',
  'symbol-folder': 'folder',
  'symbol-function': 'square-function',
  'symbol-interface': 'blocks',
  'symbol-key': 'key-round',
  'symbol-keyword': 'key-round',
  'symbol-method': 'square-function',
  'symbol-misc': 'shapes',
  'symbol-module': 'package',
  'symbol-namespace': 'boxes',
  'symbol-null': 'circle-slash',
  'symbol-number': 'hash',
  'symbol-numeric': 'hash',
  'symbol-object': 'braces',
  'symbol-operator': 'equal',
  'symbol-package': 'package',
  'symbol-parameter': 'variable',
  'symbol-property': 'settings-2',
  'symbol-reference': 'link',
  'symbol-ruler': 'ruler',
  'symbol-snippet': 'square-code',
  'symbol-string': 'text-cursor-input',
  'symbol-struct': 'boxes',
  'symbol-structure': 'boxes',
  'symbol-text': 'type',
  'symbol-type-parameter': 'between-horizontal-start',
  'symbol-unit': 'ruler',
  'symbol-value': 'variable',
  'symbol-variable': 'variable',
  close: 'x',
  'widget-close': 'x',
  'suggest-details-close': 'x',
  'suggest-more-info': 'info',
  'suggest-details': 'info',
  'suggest-details-back': 'arrow-left',
  'suggest-details-forward': 'arrow-right',
  'suggest-details-previous': 'arrow-up',
  'suggest-details-next': 'arrow-down',
  'parameter-hints-next': 'chevron-down',
  'parameter-hints-previous': 'chevron-up',
  'chevron-right': 'chevron-right',
  'chevron-left': 'chevron-left',
  'chevron-up': 'chevron-up',
  'chevron-down': 'chevron-down',
  'folding-expanded': 'chevron-down',
  'folding-collapsed': 'chevron-right',
  'folding-manual-expanded': 'chevron-down',
  'folding-manual-collapsed': 'chevron-right',
  'folding-controls': 'chevron-down',
  'goto-next-location': 'arrow-down',
  'goto-previous-location': 'arrow-up',
  'goto-next': 'arrow-down',
  'goto-previous': 'arrow-up',
  'arrow-left': 'arrow-left',
  'arrow-right': 'arrow-right',
  'arrow-up': 'arrow-up',
  'arrow-down': 'arrow-down',
  'arrow-small-up': 'arrow-up',
  'arrow-small-down': 'arrow-down',
  'light-bulb': 'lightbulb',
  lightbulb: 'lightbulb',
  'lightbulb-autofix': 'lightbulb',
  'lightbulb-sparkle': 'lightbulb',
  'lightbulb-sparkle-autofix': 'lightbulb',
  'sparkle-filled': 'sparkles',
  sparkle: 'sparkles',
  'quick-fix': 'lightbulb',
  'refactor-preview': 'file-search',
  'menu-submenu': 'chevron-right',
  'menu-selection': 'check',
  check: 'check',
  error: 'circle-x',
  warning: 'triangle-alert',
  info: 'info',
  'error-small': 'circle-x',
  'warning-small': 'triangle-alert',
  'info-small': 'info',
  'marker-navigation-next': 'arrow-down',
  'marker-navigation-previous': 'arrow-up',
  'marker-navigation-close': 'x',
  'marker-navigation-error': 'circle-x',
  'marker-navigation-warning': 'triangle-alert',
  'marker-navigation-info': 'info',
  'find-collapsed': 'chevron-right',
  'find-expanded': 'chevron-down',
  'find-next-match': 'arrow-down',
  'find-previous-match': 'arrow-up',
  'find-selection': 'text-cursor',
  'find-replace': 'replace',
  'find-replace-all': 'replace-all',
  'find-close': 'x',
  'find-case-sensitive': 'case-sensitive',
  'find-whole-word': 'whole-word',
  'find-regex': 'regex',
  'case-sensitive': 'case-sensitive',
  'whole-word': 'whole-word',
  regex: 'regex',
  replace: 'replace',
  'replace-all': 'replace-all',
  'preserve-case': 'case-sensitive',
  selection: 'text-cursor',
  search: 'search',
  'search-stop': 'square',
  loading: 'loader-circle',
  sync: 'refresh-cw',
  'more-horizontal': 'ellipsis',
  'more-vertical': 'ellipsis-vertical',
  ellipsis: 'ellipsis',
  'tree-item-expanded': 'chevron-down',
  'tree-filter-on-type-on': 'funnel',
  'tree-filter-on-type-off': 'list-filter',
  'tree-filter-clear': 'x',
  'tree-filter-grab': 'grip-vertical',
  'tree-item-loading': 'loader-circle',
  'tree-filter': 'funnel',
  'clear-all': 'list-x',
  'debug-stackframe': 'arrow-right',
  'debug-stackframe-focused': 'arrow-right',
  'inline-suggest-hints-next': 'chevron-right',
  'inline-suggest-hints-previous': 'chevron-left',
  'inline-suggest-hints-more': 'ellipsis',
  'inline-suggest-hints-close': 'x',
  'inline-suggest-hints-accept': 'check',
  'inline-suggest-hints-accept-word': 'arrow-right-to-line',
} as const satisfies Readonly<Record<string, LucideIconName>>;

export function lucideMask(icon: LucideIconName): string {
  const { nodes } = projectIcon({ icon });
  const content = nodes
    .map(
      ([tag, attributes]) =>
        `<${tag} ${Object.entries(attributes)
          .map(([key, value]) => `${key}="${String(value)}"`)
          .join(' ')} />`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function installMonacoLucideIcons(document: Document): void {
  if (document.getElementById('wr-monaco-lucide-icons')) return;
  const style = document.createElement('style');
  style.id = 'wr-monaco-lucide-icons';
  const groups = new Map<LucideIconName, string[]>();
  for (const [name, icon] of Object.entries(MONACO_LUCIDE_ICONS)) {
    const selectors = groups.get(icon) ?? [];
    selectors.push(`body .codicon.codicon-${name}::before`);
    groups.set(icon, selectors);
  }
  style.textContent = [...groups]
    .map(
      ([icon, selectors]) => `${selectors.join(',')} {
    content: '';
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: middle;
    background-color: currentColor;
    mask: ${lucideMask(icon)} center / contain no-repeat;
    --wr-lucide-icon: ${icon};
  }`,
    )
    .join('\n');
  style.textContent += `
    .monaco-editor .wr-debug-breakpoint::before {
      mask: ${lucideMask('circle-dot')} center / contain no-repeat;
      border: 0; border-radius: 0;
    }
    .monaco-editor .wr-debug-breakpoint-pending::before {
      background: #e54949;
      mask-image: ${lucideMask('circle')};
    }
    .monaco-editor .wr-debug-breakpoint-conditional::before {
      mask-image: ${lucideMask('diamond')}; transform: none;
    }
    .monaco-editor .wr-debug-execution-arrow::after {
      width: 12px; height: 12px; border: 0; background: #e8b236;
      mask: ${lucideMask('arrow-right')} center / contain no-repeat;
    }`;
  document.head.append(style);
}
