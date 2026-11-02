const tokenKey = 'reset_token';
const routeKey = 'webrad_recovery_route';
const ownerKey = 'webrad_recovery_owner';

interface RecoveryLink {
  readonly token: string;
  readonly owner: string;
}

interface RecoveryReceiver {
  readonly element: HTMLElement;
  readonly eligible: () => boolean;
  readonly receive: (token: string) => void;
}

interface RecoveryState {
  readonly receivers: Set<RecoveryReceiver>;
  pending: RecoveryLink | undefined;
  readonly consume: () => void;
  readonly deliver: () => void;
  readonly dispose: () => void;
}

const states = new WeakMap<Window, RecoveryState>();

function fragment(url: URL): { route: string; parameters: URLSearchParams } {
  const hash = url.hash.slice(1);
  const query = hash.startsWith('/') ? hash.indexOf('?') : -1;
  return {
    route: hash.startsWith('/') ? (query < 0 ? hash : hash.slice(0, query)) : '',
    parameters: new URLSearchParams(
      query >= 0 ? hash.slice(query + 1) : hash.startsWith('/') ? '' : hash,
    ),
  };
}

function cleanFragment(url: URL, route: string, parameters: URLSearchParams): void {
  const query = parameters.toString();
  url.hash = route ? route + (query ? '?' + query : '') : query;
}

/** RestGo replaces the fragment with its token; retain Hash routes in a non-secret query marker. */
export function loginRecoveryReturnUrl(href: string, owner: string): string {
  const url = new URL(href);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new TypeError('Account recovery requires an HTTP or HTTPS application URL.');
  const hash = fragment(url);
  hash.parameters.delete(tokenKey);
  hash.parameters.delete('email_confirmation_token');
  url.searchParams.delete(tokenKey);
  url.searchParams.delete('email_confirmation_token');
  url.searchParams.delete(routeKey);
  url.searchParams.delete(ownerKey);
  if (hash.route) {
    const query = hash.parameters.toString();
    url.searchParams.set(routeKey, hash.route + (query ? '?' + query : ''));
  }
  if (owner) url.searchParams.set(ownerKey, owner);
  url.hash = '';
  return url.href;
}

function stateFor(view: Window): RecoveryState {
  const existing = states.get(view);
  if (existing) return existing;
  const receivers = new Set<RecoveryReceiver>();
  const deliver = (): void => {
    const link = state.pending;
    if (!link) return;
    for (const receiver of receivers) {
      if (link.owner && receiver.element.dataset.webradId !== link.owner) continue;
      if (!receiver.element.isConnected || !receiver.eligible()) continue;
      state.pending = undefined;
      receiver.receive(link.token);
      break;
    }
  };
  const consume = (): void => {
    const url = new URL(view.location.href);
    const hash = fragment(url);
    const tokens = [...url.searchParams.getAll(tokenKey), ...hash.parameters.getAll(tokenKey)];
    if (tokens.length === 0) return;
    const owners = url.searchParams.getAll(ownerKey);
    const routes = url.searchParams.getAll(routeKey);
    const token = tokens[0] ?? '';
    const valid =
      token.length > 0 &&
      token.length <= 4096 &&
      tokens.every((value) => value === token) &&
      ![...token].some(
        (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
      ) &&
      owners.length <= 1 &&
      (owners[0]?.length ?? 0) <= 1024 &&
      routes.length <= 1;
    const owner = owners[0] ?? '';
    const route = routes[0] ?? '';
    url.searchParams.delete(tokenKey);
    url.searchParams.delete(ownerKey);
    url.searchParams.delete(routeKey);
    hash.parameters.delete(tokenKey);
    cleanFragment(url, hash.route, hash.parameters);
    if (!hash.route && route.startsWith('/') && !route.startsWith('//') && route.length <= 4096) {
      // Only restore the application's own hash, never an external navigation target.
      url.hash = route;
      const restored = fragment(url);
      restored.parameters.delete(tokenKey);
      cleanFragment(url, restored.route, restored.parameters);
    }
    // Remove the secret synchronously, before authored page construction or callbacks.
    view.history.replaceState(view.history.state, '', url.href);
    state.pending = { token: valid ? token : '', owner: owner.length <= 1024 ? owner : '' };
    queueMicrotask(deliver);
  };
  const observer = new MutationObserver(() => {
    if (state.pending) deliver();
  });
  const state: RecoveryState = {
    receivers,
    pending: undefined,
    consume,
    deliver,
    dispose: () => {
      observer.disconnect();
      view.removeEventListener('hashchange', consume);
      view.removeEventListener('popstate', consume);
      view.removeEventListener('webrad:route-change', consume);
      receivers.clear();
      state.pending = undefined;
      states.delete(view);
    },
  };
  states.set(view, state);
  view.addEventListener('hashchange', consume);
  view.addEventListener('popstate', consume);
  view.addEventListener('webrad:route-change', consume);
  observer.observe(view.document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'data-webrad-visible', 'aria-busy'],
  });
  consume();
  return state;
}

/** Installed before the router starts; tokens stay in memory until one eligible placement claims them. */
export function bindLoginRecoveryLinks(view: Window): () => void {
  return stateFor(view).dispose;
}

export function registerLoginRecovery(receiver: RecoveryReceiver): () => void {
  const view = receiver.element.ownerDocument.defaultView;
  if (!view) return () => undefined;
  const state = stateFor(view);
  state.receivers.add(receiver);
  queueMicrotask(() => {
    state.consume();
    state.deliver();
  });
  return () => {
    state.receivers.delete(receiver);
  };
}

/** Explicit claim supports components with automatic link opening disabled. */
export function claimLoginRecovery(
  element: HTMLElement,
  receive: (token: string) => void,
): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const state = stateFor(view);
  state.consume();
  const link = state.pending;
  if (!link || (link.owner && link.owner !== element.dataset.webradId)) return false;
  state.pending = undefined;
  receive(link.token);
  return true;
}
