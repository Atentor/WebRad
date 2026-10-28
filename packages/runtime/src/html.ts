import { WebComponent, type WebComponentEventHandler } from './component.js';
import {
  getRuntimeLayoutAspectRatio,
  setRuntimeLayoutAspectRatio,
  type WebAspectRatio,
} from './layout.js';

function htmlFrame(element: HTMLElement): HTMLIFrameElement {
  if (element.tagName !== 'IFRAME') throw new TypeError('WebHtml requires an iframe element.');
  return element as HTMLIFrameElement;
}

const htmlSources = new WeakMap<HTMLIFrameElement, string>();
const EMBED_SANDBOX = ['allow-scripts', 'allow-same-origin', 'allow-presentation'] as const;

/** Recognize a standalone cross-origin HTTPS embed without executing its markup. */
function externalFrame(html: string, document: Document): HTMLIFrameElement | undefined {
  const template = document.createElement('template');
  template.innerHTML = html;
  const nodes = [...template.content.childNodes].filter(
    (node) => node.nodeType !== 8 && !(node.nodeType === 3 && node.textContent?.trim() === ''),
  );
  const frame = template.content.firstElementChild;
  if (nodes.length !== 1 || frame?.tagName !== 'IFRAME' || frame.hasAttribute('srcdoc'))
    return undefined;
  const source = frame.getAttribute('src');
  if (source === null) return undefined;
  try {
    const url = new URL(source, document.baseURI);
    if (url.protocol !== 'https:' || url.origin === document.location.origin) return undefined;
    return frame as HTMLIFrameElement;
  } catch {
    return undefined;
  }
}

/** Isolated markup or a standalone external iframe, with the original HTML preserved. */
export class WebHtml extends WebComponent<HTMLIFrameElement> {
  public constructor(element: HTMLElement) {
    super(htmlFrame(element));
    if (!htmlSources.has(this.element)) {
      this.element.setAttribute('sandbox', '');
      this.element.referrerPolicy = 'no-referrer';
    }
  }

  /** A fixed ratio derives height from width; none restores the saved height rules. */
  public get aspectRatio(): WebAspectRatio {
    return getRuntimeLayoutAspectRatio(this.element);
  }

  public set aspectRatio(value: WebAspectRatio) {
    setRuntimeLayoutAspectRatio(this.element, value);
  }

  /** A fragment or complete HTML document, preserved exactly as authored. */
  public get html(): string {
    return htmlSources.get(this.element) ?? this.element.srcdoc;
  }

  public set html(value: string) {
    if (htmlSources.get(this.element) === value) return;
    const embed = externalFrame(value, this.element.ownerDocument);
    htmlSources.set(this.element, value);
    // Replacements first return to the restrictive empty-document state. Never
    // grant scripts/same-origin to an authored inline srcdoc document.
    this.element.setAttribute('sandbox', '');
    this.element.removeAttribute('src');
    this.element.removeAttribute('srcdoc');
    this.element.removeAttribute('allow');
    this.element.allowFullscreen = false;
    this.element.removeAttribute('loading');
    if (embed === undefined) {
      this.element.referrerPolicy = 'no-referrer';
      this.element.srcdoc = value;
      return;
    }
    // A remote document keeps its actual origin and referrer, which embedded
    // players require. Authored sandbox tokens may further restrict this set.
    const sandbox = embed.hasAttribute('sandbox')
      ? EMBED_SANDBOX.filter((token) => embed.sandbox.contains(token))
      : EMBED_SANDBOX;
    this.element.setAttribute('sandbox', sandbox.join(' '));
    this.element.setAttribute('allow', embed.getAttribute('allow') ?? '');
    this.element.allowFullscreen = embed.allowFullscreen;
    this.element.referrerPolicy = embed.referrerPolicy || 'strict-origin-when-cross-origin';
    this.element.loading = embed.loading === 'lazy' ? 'lazy' : 'eager';
    this.element.src = new URL(
      embed.getAttribute('src') ?? '',
      this.element.ownerDocument.baseURI,
    ).href;
  }

  /** Accessible name for the embedded document. */
  public get title(): string {
    return this.element.title;
  }

  public set title(value: string) {
    this.element.title = value;
  }

  public override get enabled(): boolean {
    return super.enabled;
  }

  public override set enabled(value: boolean) {
    super.enabled = value;
    this.element.inert = !value;
  }

  public clear(): void {
    this.html = '';
  }

  public set onLoad(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnLoad', handler);
  }
}
