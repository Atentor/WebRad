import type { RestGoAuthEvent, RestGoClient, RestGoSession, RestGoUser } from '@webrad/restgo-sdk';

import { getRestGoClient, RestGoNotConfiguredError } from './restgo.js';

export interface WebPageLoginEventDetail {
  readonly user: RestGoUser;
  /** True when an authenticated session is delivered to a newly shown page. */
  readonly restored: boolean;
}

export interface WebPageLogoutEventDetail {
  /** Last authenticated identity before logout or session revocation. */
  readonly user: RestGoUser;
}

interface PageEventTarget {
  readonly element: HTMLElement;
  emit(eventName: string, detail?: unknown): boolean;
}

interface SessionMonitor {
  readonly checks: Set<() => void>;
  readonly dispose: () => void;
}

const monitors = new WeakMap<RestGoClient, SessionMonitor>();

/** One validation cadence per project client, including its mounted reusable scopes. */
function observeSession(client: RestGoClient, document: Document, check: () => void): () => void {
  const view = document.defaultView;
  if (!view) return () => {};
  let monitor = monitors.get(client);
  if (!monitor) {
    const checks = new Set<() => void>();
    const verify = (): void => {
      if (!document.hidden) for (const callback of checks) callback();
    };
    const timer = view.setInterval(verify, 30_000);
    view.addEventListener('focus', verify);
    document.addEventListener('visibilitychange', verify);
    monitor = {
      checks,
      dispose: () => {
        view.clearInterval(timer);
        view.removeEventListener('focus', verify);
        document.removeEventListener('visibilitychange', verify);
      },
    };
    monitors.set(client, monitor);
  }
  monitor.checks.add(check);
  return () => {
    monitor.checks.delete(check);
    if (monitor.checks.size === 0) {
      monitor.dispose();
      monitors.delete(client);
    }
  };
}

/** Internal bridge for shown pages and mounted reusable root event handlers. */
export function bindPageRestGoEvents(page: PageEventTarget): () => void {
  let client: RestGoClient;
  try {
    client = getRestGoClient();
  } catch (error) {
    if (error instanceof RestGoNotConfiguredError) return () => {};
    throw error;
  }
  let active = true;
  let revision = 0;
  let unauthenticated = false;
  let previous: RestGoUser | null = null;
  const notifyUnauthenticated = (): void => {
    if (!active || unauthenticated) return;
    unauthenticated = true;
    page.emit('OnUnauthenticated');
  };
  const checkSession = async (): Promise<void> => {
    if (!active) return;
    const checkedRevision = revision;
    const result = await client.getSession();
    // Do not apply an old anonymous result after a newer login notification.
    if (!active || revision !== checkedRevision) return;
    if (!result.error && result.data === null) notifyUnauthenticated();
  };
  const deliver = (event: RestGoAuthEvent, session: RestGoSession | null): void => {
    if (!active) return;
    if (event === 'SIGNED_OUT') {
      const user = previous;
      previous = null;
      if (user) page.emit('OnLogout', { user: { ...user } } satisfies WebPageLogoutEventDetail);
      notifyUnauthenticated();
      return;
    }
    if (!session) return;
    unauthenticated = false;
    const changedUser = previous !== null && previous.id !== session.user.id;
    const loggedIn = previous === null || changedUser || event === 'SIGNED_IN';
    if (changedUser && previous)
      page.emit('OnLogout', { user: { ...previous } } satisfies WebPageLogoutEventDetail);
    if (!active) return;
    previous = { ...session.user };
    if (loggedIn)
      page.emit('OnLogin', {
        user: { ...session.user },
        restored: event !== 'SIGNED_IN',
      } satisfies WebPageLoginEventDetail);
  };
  const subscription = client.onAuthStateChange((event, session) => {
    revision++;
    // Finish SDK notification before an authored handler can navigate or dispose a page.
    queueMicrotask(() => {
      deliver(event, session);
      if (event === 'INITIAL_SESSION') void checkSession();
    });
  });
  const stopMonitor = observeSession(client, page.element.ownerDocument, () => {
    void checkSession();
  });
  return () => {
    active = false;
    subscription.unsubscribe();
    stopMonitor();
    previous = null;
  };
}
