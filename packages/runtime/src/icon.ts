import { WebComponent, type WebComponentEventHandler } from './component.js';
import {
  LUCIDE_ICON_NAMES,
  LUCIDE_ICON_NODES,
  type LucideIconName,
} from './lucide-icons.generated.js';
export { LUCIDE_ICON_NAMES } from './lucide-icons.generated.js';
export type { LucideIconName } from './lucide-icons.generated.js';

export type WebIconMode = 'icon' | 'button';
const names: ReadonlySet<string> = new Set(LUCIDE_ICON_NAMES);
export function isLucideIconName(value: unknown): value is LucideIconName {
  return typeof value === 'string' && names.has(value);
}

/** Browser-safe projection shared by the Designer and runtime. */
export function projectIcon(props: Readonly<Record<string, unknown>>) {
  const icon = isLucideIconName(props.icon) ? props.icon : 'star';
  return {
    icon,
    mode: props.mode === 'button' ? ('button' as const) : ('icon' as const),
    accessibleLabel: typeof props.accessibleLabel === 'string' ? props.accessibleLabel : '',
    strokeWidth:
      typeof props.strokeWidth === 'number' &&
      Number.isFinite(props.strokeWidth) &&
      props.strokeWidth > 0 &&
      props.strokeWidth <= 24
        ? props.strokeWidth
        : 2,
    nodes: LUCIDE_ICON_NODES[icon] ?? [],
  };
}

export function createLucideIconElement(
  document: Document,
  icon: LucideIconName,
  strokeWidth = 2,
): SVGSVGElement {
  const state = projectIcon({ icon, strokeWidth });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(state.strokeWidth),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'wr-icon-graphic',
  }))
    svg.setAttribute(name, value);
  for (const [tag, attributes] of state.nodes) {
    const child = document.createElementNS(svg.namespaceURI, tag);
    for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, String(value));
    svg.append(child);
  }
  return svg;
}

/** Lucide icon or keyboard-operable icon button, with no visible caption. */
export class WebIcon extends WebComponent<HTMLButtonElement> {
  public constructor(element: HTMLElement) {
    if (element.tagName !== 'BUTTON') throw new TypeError('WebIcon requires a button element.');
    super(element as HTMLButtonElement);
    // Use a native button for activation, retaining one stable element when mode changes.
    this.element.type = 'button';
    this.#render();
  }
  public get icon(): LucideIconName {
    return projectIcon({ icon: this.element.dataset.webradIcon }).icon;
  }
  public set icon(value: LucideIconName) {
    if (!isLucideIconName(value)) throw new RangeError('Unknown Lucide icon.');
    this.element.dataset.webradIcon = value;
    this.#render();
  }
  public get mode(): WebIconMode {
    return this.element.dataset.webradIconMode === 'button' ? 'button' : 'icon';
  }
  public set mode(value: WebIconMode) {
    if (value !== 'icon' && value !== 'button') throw new RangeError('Unknown Icon mode.');
    this.element.dataset.webradIconMode = value;
    this.#render();
  }
  public get accessibleLabel(): string {
    return this.element.dataset.webradIconLabel ?? '';
  }
  public set accessibleLabel(value: string) {
    this.element.dataset.webradIconLabel = value;
    this.#render();
  }
  public get strokeWidth(): number {
    return projectIcon({ strokeWidth: Number(this.element.dataset.webradIconStroke) }).strokeWidth;
  }
  public set strokeWidth(value: number) {
    if (!Number.isFinite(value) || value <= 0 || value > 24)
      throw new RangeError('Icon strokeWidth must be greater than 0 and at most 24.');
    this.element.dataset.webradIconStroke = String(value);
    this.#render();
  }
  public override get tabIndex(): number {
    return Number(this.element.dataset.webradIconTabIndex ?? '0');
  }
  public override set tabIndex(value: number) {
    this.element.dataset.webradIconTabIndex = String(value);
    this.element.tabIndex = this.mode === 'button' ? value : -1;
  }
  public click(): void {
    if (this.mode === 'button' && this.enabled) this.element.click();
  }
  public set onClick(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnClick', handler);
  }
  public override bindEvent(
    eventName: string,
    handler: WebComponentEventHandler<this> | null,
  ): () => void {
    return super.bindEvent(
      eventName,
      handler === null
        ? null
        : (sender, event) => {
            if (
              !this.enabled ||
              ((eventName === 'OnClick' || eventName === 'OnDblClick') && this.mode !== 'button')
            )
              return;
            return handler(sender, event);
          },
    );
  }
  #render(): void {
    const element = this.element;
    element.dataset.webradIcon = this.icon;
    element.dataset.webradIconMode = this.mode;
    element.setAttribute('role', this.mode === 'button' ? 'button' : 'img');
    element.setAttribute('aria-label', this.accessibleLabel || this.name || this.icon);
    element.tabIndex = this.mode === 'button' ? this.tabIndex : -1;
    element.replaceChildren(
      createLucideIconElement(element.ownerDocument, this.icon, this.strokeWidth),
    );
  }
}
