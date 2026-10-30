import type { RestGoClient } from '@webrad/restgo-sdk';

const tokenParameter = 'email_confirmation_token';

interface ConfirmationLink {
  readonly token: string;
  readonly cleanUrl: string;
}

/** Capture only the email-confirmation token, preserving unrelated query/route data. */
function readConfirmationLink(href: string): ConfirmationLink | null {
  const url = new URL(href);
  const fragment = url.hash.slice(1);
  const queryIndex = fragment.startsWith('/') ? fragment.indexOf('?') : -1;
  const route = queryIndex >= 0 ? fragment.slice(0, queryIndex) : '';
  const parameters = new URLSearchParams(
    queryIndex >= 0 ? fragment.slice(queryIndex + 1) : fragment,
  );
  const queryTokens = url.searchParams.getAll(tokenParameter);
  const fragmentTokens = parameters.getAll(tokenParameter);
  if (queryTokens.length === 0 && fragmentTokens.length === 0) return null;
  const tokens = [...queryTokens, ...fragmentTokens];
  url.searchParams.delete(tokenParameter);
  if (fragmentTokens.length) {
    parameters.delete(tokenParameter);
    const remaining = parameters.toString();
    url.hash = route ? route + (remaining ? '?' + remaining : '') : remaining;
  }
  // Conflicting values are rejected instead of selecting an arbitrary account token.
  const token = tokens[0] ?? '';
  return {
    token: tokens.every((value) => value === token) && token.length <= 4096 ? token : '',
    cleanUrl: url.href,
  };
}

/** Owns automatic email-link handling for the configured browser application. */
export function bindRestGoEmailConfirmation(client: RestGoClient, view: Window): () => void {
  let active = true;
  let revision = 0;
  const consumed = new Set<string>();
  const portuguese = view.document.documentElement.lang.toLowerCase().startsWith('pt');
  const text = {
    success: portuguese ? 'E-mail confirmado com sucesso.' : 'Email confirmed successfully.',
    invalid: portuguese
      ? 'O link de confirmação é inválido ou expirou. Solicite um novo e-mail de confirmação.'
      : 'The confirmation link is invalid or expired. Request a new confirmation email.',
    unavailable: portuguese
      ? 'Não foi possível confirmar o e-mail agora. Confira sua conexão e abra novamente o link recebido.'
      : 'Could not confirm your email now. Check your connection and reopen the email link.',
  };
  const confirm = async (token: string, currentRevision: number): Promise<void> => {
    try {
      if (!active) return;
      const result = await client.auth.confirmEmail(token);
      if (!active || currentRevision !== revision) return;
      if (result.error || !result.data.success) {
        view.alert(result.error?.status === 400 ? text.invalid : text.unavailable);
        return;
      }
      // Refresh only an existing identity; confirming a link never signs a user in.
      await client.auth.ready;
      if (!active || currentRevision !== revision) return;
      if (client.CurrentUser !== null) await client.getUser();
      if (active && currentRevision === revision) view.alert(text.success);
    } catch {
      if (active && currentRevision === revision) view.alert(text.unavailable);
    }
  };
  const consume = (): void => {
    if (!active) return;
    const link = readConfirmationLink(view.location.href);
    if (link === null) return;
    // Replace in place without navigation or a new history entry, before page code runs.
    view.history.replaceState(view.history.state, '', link.cleanUrl);
    if (consumed.has(link.token)) return;
    consumed.add(link.token);
    const currentRevision = ++revision;
    queueMicrotask(() => {
      if (!active || currentRevision !== revision) return;
      if (!link.token) view.alert(text.invalid);
      else void confirm(link.token, currentRevision);
    });
  };
  consume();
  view.addEventListener('hashchange', consume);
  view.addEventListener('popstate', consume);
  view.addEventListener('webrad:route-change', consume);
  return () => {
    active = false;
    revision++;
    consumed.clear();
    view.removeEventListener('hashchange', consume);
    view.removeEventListener('popstate', consume);
    view.removeEventListener('webrad:route-change', consume);
  };
}
