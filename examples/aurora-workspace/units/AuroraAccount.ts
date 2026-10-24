import { getRestGoClient, RestGoNotConfiguredError } from '@webrad/runtime';
import type { WebMenu, WebTextArea } from '@webrad/runtime';
import type { RestGoSession, RestGoUser } from '@webrad/restgo-sdk';

export function accountError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function avatarUrl(value: string | null, baseUrl: string): string {
  return value ? new URL(value, baseUrl + '/').href : '';
}

/** Reflect only server-confirmed identity; never render credential values. */
export function bindRestGoMenu(menu: WebMenu): () => void {
  try {
    const client = getRestGoClient();
    let active = true;
    const subscription = client.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      menu.user = {
        ...menu.user,
        visible: true,
        name: user ? user.fullName || user.email : 'Guest',
        description: user?.email ?? 'Sign in to RestGO',
        avatar: avatarUrl(user?.avatarUrl ?? null, client.baseUrl),
        status: 'none',
      };
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  } catch (error) {
    if (!(error instanceof RestGoNotConfiguredError)) throw error;
    return () => {};
  }
}

/** The subscription is owned by the visible page, independently of the SDK session. */
export function bindAuroraAccount(
  summary: WebTextArea,
  events: WebTextArea,
  onUser?: (user: RestGoUser | null) => void,
): () => void {
  const client = getRestGoClient();
  let active = true;
  let revision = 0;
  const history: string[] = [];
  const render = (event: string, session: RestGoSession | null): void => {
    if (!active) return;
    history.push(new Date().toLocaleTimeString() + ' ' + event);
    events.value = history.slice(-12).join('\n');
    const user = session?.user;
    summary.value =
      session && user
        ? 'Name: ' +
          user.fullName +
          '\nEmail: ' +
          user.email +
          '\nID: ' +
          user.id +
          '\nActive: ' +
          user.active +
          ' / Email confirmed: ' +
          user.emailConfirmed +
          '\nSession expires: ' +
          session.expiresAt +
          '\nRefresh available: ' +
          Boolean(session.refreshToken)
        : 'No signed-in session. Register or sign in to continue.';
    onUser?.(user ?? null);
  };
  const subscription = client.onAuthStateChange((event, session) => {
    if (event !== 'INITIAL_SESSION') revision++;
    render(event, session);
  });
  const requestedRevision = revision;
  void client
    .getSession()
    .then((result) => {
      if (!active || revision !== requestedRevision) return;
      if (result.error)
        summary.value = 'Session verification failed: ' + accountError(result.error);
      else render('SESSION_CHECK', result.data);
    })
    .catch((error: unknown) => {
      if (active) summary.value = 'Session verification failed: ' + accountError(error);
    });
  return () => {
    active = false;
    subscription.unsubscribe();
  };
}
