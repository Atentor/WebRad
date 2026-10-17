// @vitest-environment jsdom

import type { RestGoUser } from '@webrad/restgo-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WebPage, WebReusableElementInstance } from '../src/page.js';
import { configureRestGo, RestGO } from '../src/restgo.js';

const configuration = {
  enabled: true,
  baseUrl: 'https://restgo.example.test',
  apiVersion: 1,
  defaultDatabase: '',
  persistSession: false,
  sessionStorage: 'memory' as const,
  storageKey: 'page-event-tests',
};
const user: RestGoUser = {
  id: 'user-1',
  email: 'ana@example.test',
  fullName: 'Ana',
  avatarUrl: null,
  active: true,
  emailConfirmed: true,
};
const session = {
  token: 'access-secret',
  expiresAt: '2099-01-01T00:00:00Z',
  refreshToken: 'refresh-secret',
  refreshExpiresAt: '2099-02-01T00:00:00Z',
  user,
};
const pages: WebPage[] = [];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page(): WebPage {
  const page = new WebPage(document.createElement('main'));
  pages.push(page);
  return page;
}
function listen(page: WebPage) {
  const login = vi.fn();
  const logout = vi.fn();
  const unauthenticated = vi.fn();
  page.bindEvent('OnLogin', (_sender, event) => login((event as CustomEvent).detail));
  page.bindEvent('OnLogout', (_sender, event) => logout((event as CustomEvent).detail));
  page.bindEvent('OnUnauthenticated', unauthenticated);
  return { login, logout, unauthenticated };
}
async function configure(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (url) => {
      const route = new URL(String(url)).pathname;
      return json(
        route === '/auth/token' || route === '/auth/refresh' ? session : { success: true, user },
      );
    }),
  );
  await configureRestGo(configuration)?.auth.ready;
}
afterEach(() => {
  for (const page of pages.splice(0)) page.dispose();
  configureRestGo({ ...configuration, enabled: false });
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RestGO page Interaction events', () => {
  it('reports anonymous entry once and again after a subsequent authenticated session ends', async () => {
    await configure();
    const current = page();
    const { unauthenticated, logout } = listen(current);
    current.show();
    await vi.waitFor(() => expect(unauthenticated).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event('focus'));
    await RestGO.getSession();
    expect(unauthenticated).toHaveBeenCalledOnce();
    expect(logout).not.toHaveBeenCalled();
    await RestGO.login(user.email, 'secret');
    await RestGO.logout();
    await vi.waitFor(() => expect(unauthenticated).toHaveBeenCalledTimes(2));
    expect(logout).toHaveBeenCalledOnce();
    current.hide();
    current.show();
    await vi.waitFor(() => expect(unauthenticated).toHaveBeenCalledTimes(3));
  });

  it('automatically detects server revocation with one shared check and stops after pages hide', async () => {
    vi.useFakeTimers();
    await configure();
    await RestGO.login(user.email, 'secret');
    const first = page();
    const second = page();
    const firstEvents = listen(first);
    const secondEvents = listen(second);
    first.show();
    second.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(firstEvents.unauthenticated).not.toHaveBeenCalled();
    vi.mocked(fetch)
      .mockClear()
      .mockImplementation(async (url) =>
        json({ message: 'revoked' }, new URL(String(url)).pathname === '/auth/token' ? 400 : 401),
      );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(firstEvents.unauthenticated).toHaveBeenCalledOnce();
    expect(secondEvents.unauthenticated).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/auth/session',
      '/auth/refresh',
    ]);
    first.hide();
    second.hide();
    vi.mocked(fetch).mockClear();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(firstEvents.unauthenticated).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not mistake a failed restored-session validation for anonymous entry', async () => {
    await configure();
    const persisted = {
      ...configuration,
      persistSession: true,
      sessionStorage: 'session' as const,
    };
    await configureRestGo(persisted)?.auth.ready;
    await RestGO.login(user.email, 'secret');
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    expect((await configureRestGo(persisted)?.auth.ready)?.error).not.toBeNull();
    const current = page();
    const { unauthenticated, login } = listen(current);
    current.show();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(unauthenticated).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(json({ success: true, user }));
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(login).toHaveBeenCalledOnce());
    expect(unauthenticated).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue(json({ message: 'revoked' }, 401));
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(unauthenticated).toHaveBeenCalledOnce());
  });

  it('allows anonymous-entry navigation and cancels pending checks on disposed pages', async () => {
    await configure();
    const first = page();
    const next = page();
    const nextEvents = listen(next);
    const firstNotification = vi.fn(() => {
      first.close({ remove: true });
      first.dispose();
      next.show();
    });
    first.bindEvent('OnUnauthenticated', firstNotification);
    first.show();
    await vi.waitFor(() => expect(nextEvents.unauthenticated).toHaveBeenCalledOnce());
    expect(firstNotification).toHaveBeenCalledOnce();
    next.dispose();
    window.dispatchEvent(new Event('focus'));
    await RestGO.login(user.email, 'secret');
    await RestGO.logout();
    expect(nextEvents.unauthenticated).toHaveBeenCalledOnce();
  });

  it('delivers login and logout user values without credentials or duplicate refresh events', async () => {
    await configure();
    const current = page();
    const { login, logout } = listen(current);
    current.show();
    await Promise.resolve();
    expect(login).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect((await RestGO.login(user.email, 'secret')).error).toBeNull();
    await vi.waitFor(() =>
      expect(login).toHaveBeenCalledExactlyOnceWith({ user, restored: false }),
    );
    await RestGO.getSession();
    await RestGO.refreshSession();
    expect(login).toHaveBeenCalledOnce();
    await RestGO.logout();
    await vi.waitFor(() => expect(logout).toHaveBeenCalledExactlyOnceWith({ user }));
    expect(JSON.stringify(login.mock.calls)).not.toContain('secret');
  });

  it('restores the current user on a shown page and stops hidden, closed and disposed pages', async () => {
    await configure();
    await RestGO.login(user.email, 'secret');
    const current = page();
    const events = listen(current);
    current.show();
    current.show();
    await vi.waitFor(() =>
      expect(events.login).toHaveBeenCalledExactlyOnceWith({ user, restored: true }),
    );
    current.hide();
    await RestGO.logout();
    expect(events.logout).not.toHaveBeenCalled();
    await RestGO.login(user.email, 'secret');
    current.show();
    await vi.waitFor(() => expect(events.login).toHaveBeenCalledTimes(2));
    current.close({ remove: true });
    await RestGO.logout();
    expect(events.logout).not.toHaveBeenCalled();
    current.show();
    current.dispose();
    await RestGO.login(user.email, 'secret');
    expect(events.login).toHaveBeenCalledTimes(2);
  });

  it('retains auth state through network failures and reports revocation with the last server identity', async () => {
    await configure();
    const current = page();
    const { login, logout } = listen(current);
    current.show();
    await RestGO.login(user.email, 'secret');
    const updatedUser = { ...user, fullName: 'Ana Silva', avatarUrl: '/ana.jpg' };
    vi.mocked(fetch).mockResolvedValueOnce(json({ success: true, user: updatedUser }));
    await RestGO.getUser();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    expect((await RestGO.logout()).error).not.toBeNull();
    expect(logout).not.toHaveBeenCalled();
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ message: 'revoked' }, 401))
      .mockResolvedValueOnce(json({ message: 'revoked' }, 401));
    await RestGO.getSession();
    await vi.waitFor(() => expect(logout).toHaveBeenCalledExactlyOnceWith({ user: updatedUser }));
    expect(login).toHaveBeenCalledOnce();
  });

  it('allows navigation from OnLogin and delivers the shared user to the next page', async () => {
    await configure();
    const first = page();
    const next = page();
    const nextEvents = listen(next);
    first.bindEvent('OnLogin', () => {
      first.close({ remove: true });
      first.dispose();
      next.show();
    });
    first.show();
    await RestGO.login(user.email, 'secret');
    await vi.waitFor(() =>
      expect(nextEvents.login).toHaveBeenCalledExactlyOnceWith({ user, restored: true }),
    );
    await RestGO.logout();
    await vi.waitFor(() => expect(nextEvents.logout).toHaveBeenCalledExactlyOnceWith({ user }));
  });

  it('ignores restored-session notifications queued before disposal and disabled integration', async () => {
    await configure();
    await RestGO.login(user.email, 'secret');
    const current = page();
    const { login } = listen(current);
    current.show();
    current.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(login).not.toHaveBeenCalled();
    configureRestGo({ ...configuration, enabled: false });
    expect(() => page().show()).not.toThrow();
  });

  it('supports authored reusable root bindings and cleans them up on disposal', async () => {
    await configure();
    class AuthCard extends WebReusableElementInstance {
      public readonly login = vi.fn();
      public constructor() {
        super(document.createElement('section'), 'card', new Map(), new Map());
        this.bindGeneratedEvent(this, 'OnLogin', 'onLogin');
      }
      public onLogin(_sender: unknown, event: CustomEvent): void {
        this.login(event.detail);
      }
    }
    const card = new AuthCard();
    try {
      await RestGO.login(user.email, 'secret');
      await vi.waitFor(() =>
        expect(card.login).toHaveBeenCalledExactlyOnceWith({ user, restored: false }),
      );
      card.dispose();
      await RestGO.logout();
      await RestGO.login(user.email, 'secret');
      expect(card.login).toHaveBeenCalledOnce();
    } finally {
      card.dispose();
    }
  });
});
