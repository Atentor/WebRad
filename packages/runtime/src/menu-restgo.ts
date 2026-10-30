import { isWebMenuLink, type WebMenuUser } from './menu-model.js';
import { getRestGoClient, RestGoNotConfiguredError } from './restgo.js';

/** Uses the application session, never an IDE development/admin identity. */
export function bindWebMenuRestGoUser(update: (user: WebMenuUser | null) => void): () => void {
  let client: ReturnType<typeof getRestGoClient>;
  try {
    client = getRestGoClient();
  } catch (error) {
    if (!(error instanceof RestGoNotConfiguredError)) throw error;
    update(null);
    return () => {};
  }
  const current = client.CurrentUser;
  update(current ? profile(current.nome, current.email, '') : null);
  let active = true;
  const subscription = client.onAuthStateChange((_event, session) => {
    // Leave the SDK's notification before updating mounted component DOM.
    queueMicrotask(() => {
      if (!active) return;
      update(
        session
          ? profile(
              session.user.fullName,
              session.user.email,
              session.user.avatarUrl && isWebMenuLink(session.user.avatarUrl, true)
                ? new URL(session.user.avatarUrl, client.baseUrl + '/').href
                : '',
            )
          : null,
      );
    });
  });
  return () => {
    active = false;
    subscription.unsubscribe();
  };
}

function profile(name: string, email: string, avatar: string): WebMenuUser {
  return {
    visible: true,
    bindToCurrentUser: true,
    name: name || email,
    description: email,
    avatar: isWebMenuLink(avatar, true) ? avatar : '',
    status: 'online',
  };
}
