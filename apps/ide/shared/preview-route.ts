/** Preview-only messages never expose an IDE capability to the application. */
export const PREVIEW_ROUTE_REQUEST = 'webrad:preview-route-request';
export const PREVIEW_ROUTE_CHANGED = 'webrad:preview-route-changed';

export function previewPageAddress(url: string | null): string {
  if (url === null) return '';
  const address = new URL(url);
  const route = address.hash.startsWith('#/')
    ? address.hash.slice(1)
    : '/' + address.pathname.split('/').slice(2).join('/') + address.search;
  return route.replace(/\/index\.html(?=\?|$)/u, '/index');
}

export function isPreviewRouteMessage(
  value: unknown,
): value is { type: typeof PREVIEW_ROUTE_CHANGED; path: string } {
  if (typeof value !== 'object' || value === null) return false;
  const type: unknown = Reflect.get(value, 'type');
  const path: unknown = Reflect.get(value, 'path');
  return (
    type === PREVIEW_ROUTE_CHANGED &&
    typeof path === 'string' &&
    path.length <= 8192 &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !Array.from(path).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 || character === '\\';
    })
  );
}

/** Injected only into IDE publications; exported browser applications stay unchanged. */
export function previewRouteScript(): string {
  return `<script>(() => {
    if (parent === window) return;
    let parentOrigin = null;
    const notify = () => {
      if (parentOrigin === null) return;
      const route = location.hash.startsWith('#/') ? location.hash.slice(1)
        : '/' + location.pathname.split('/').slice(2).join('/') + location.search;
      parent.postMessage({ type: '${PREVIEW_ROUTE_CHANGED}', path: route.replace(/\\/index\\.html(?=\\?|$)/u, '/index') }, parentOrigin);
    };
    addEventListener('message', (event) => {
      if (event.source !== parent || event.origin === 'null' || event.data?.type !== '${PREVIEW_ROUTE_REQUEST}') return;
      parentOrigin = event.origin;
      notify();
    });
    for (const name of ['pushState', 'replaceState']) {
      const original = history[name];
      history[name] = function(...args) { const result = original.apply(this, args); notify(); return result; };
    }
    addEventListener('popstate', notify);
    addEventListener('hashchange', notify);
    addEventListener('webrad:route-change', notify);
  })();</script>`;
}
