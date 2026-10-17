import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, RestGoError, type RestGoSession, type RestGoUser } from '../src/index';

const user: RestGoUser = {
  id: 'user-1',
  email: 'ana@example.test',
  fullName: 'Ana',
  avatarUrl: null,
  active: true,
  emailConfirmed: false,
};
const session: RestGoSession = {
  token: 'jwt-user-1',
  expiresAt: '2099-01-01T00:00:00Z',
  user,
};
const baseUrl = 'https://restgo.example.test';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fetchMock() {
  return vi.fn<typeof fetch>();
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    key: (index) => [...entries.keys()][index] ?? null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RestGo authentication', () => {
  it('projects a readonly local identity and follows validation, network failures and revocation', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json({
          success: true,
          user: { ...user, fullName: 'Ana Silva', emailConfirmed: true, active: false },
        }),
      )
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json({ error: 'revoked' }, 401));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    try {
      await client.auth.ready;
      expect(client.CurrentUser).toBeNull();
      await client.login(user.email, 'secret');
      const identity = client.CurrentUser;
      expect(identity).toEqual({
        nome: 'Ana',
        email: user.email,
        id: user.id,
        emailconfirmed: false,
        ativo: true,
      });
      expect(Object.isFrozen(identity)).toBe(true);
      const calls = fetch.mock.calls.length;
      expect(client.CurrentUser).toEqual(identity);
      expect(fetch).toHaveBeenCalledTimes(calls);
      await client.getUser();
      expect(client.CurrentUser).toMatchObject({
        nome: 'Ana Silva',
        emailconfirmed: true,
        ativo: false,
      });
      expect(identity?.nome).toBe('Ana');
      await client.getUser();
      expect(client.CurrentUser?.nome).toBe('Ana Silva');
      await client.getUser();
      expect(client.CurrentUser).toBeNull();
    } finally {
      client.dispose();
    }
  });

  it('uses direct positional helpers and shares the session with the auth service', async () => {
    const fetch = fetchMock().mockImplementation(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/token') {
        expect(JSON.parse(String(options?.body))).toEqual({
          email: user.email,
          password: 'secret',
          remember: false,
        });
        expect(new Headers(options?.headers).has('Authorization')).toBe(false);
        return json(session);
      }
      expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer ${session.token}`);
      return path === '/auth/logout' ? json({ success: true }) : json({ success: true, user });
    });
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    const events: string[] = [];
    const subscription = client.onAuthStateChange((event) => events.push(event));
    const login = await client.login(user.email, 'secret');
    expect(login).toEqual({ sucess: true, data: session, error: null });
    if (!login.sucess) throw login.error;
    expect(login.data.user.fullName).toBe(user.fullName);
    expect(client.CurrentUser?.nome).toBe(user.fullName);
    expect((await client.auth.getUser()).data).toEqual(user);
    expect((await client.getUser()).data).toEqual(user);
    expect((await client.getSession()).data).toEqual(session);
    expect((await client.logout()).error).toBeNull();
    expect(client.CurrentUser).toBeNull();
    expect((await client.getSession()).data).toBeNull();
    expect(events).toContain('SIGNED_IN');
    expect(events).toContain('SIGNED_OUT');
    subscription.unsubscribe();
    client.dispose();
  });

  it.each([
    {
      reason: 'rejected credentials',
      respond: async () => json({ error: 'Invalid credentials' }, 401),
      code: 'HTTP_ERROR',
    },
    {
      reason: 'an invalid session response',
      respond: async () => json({ success: true }),
      code: 'INVALID_RESPONSE',
    },
    {
      reason: 'a network failure',
      respond: async (): Promise<Response> => {
        throw new TypeError('offline');
      },
      code: 'NETWORK_ERROR',
    },
  ])(
    'returns sucess false for $reason even when a previous session exists',
    async ({ respond, code }) => {
      const fetch = fetchMock()
        .mockResolvedValueOnce(json(session))
        .mockImplementationOnce(respond)
        .mockResolvedValue(json({ success: true, user }));
      const client = createClient(baseUrl, { fetch, persistSession: false });
      try {
        await client.auth.ready;
        expect((await client.login(user.email, 'secret')).sucess).toBe(true);
        const login = await client.login(user.email, 'wrong');
        expect(login.sucess).toBe(false);
        expect(login.data).toBeNull();
        if (login.sucess) throw new Error('Failed login unexpectedly succeeded.');
        expect(login.error).toBeInstanceOf(RestGoError);
        expect(login.error.code).toBe(code);
        expect((await client.auth.getSession()).data).toEqual(session);
      } finally {
        client.dispose();
      }
    },
  );

  it('returns sucess false when login is cancelled after client disposal', async () => {
    const fetch = fetchMock();
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    client.dispose();
    const login = await client.login(user.email, 'secret');
    expect(login).toMatchObject({
      sucess: false,
      data: null,
      error: { code: 'AUTH_OPERATION_CANCELLED' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signs in using the documented public route and validates the current user on the server', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ success: true, user: { ...user, fullName: 'Ana Silva' } }));
    const client = createClient(baseUrl, { fetch, sessionStorage: 'memory' });
    await client.auth.ready;
    const login = await client.auth.signInWithPassword({
      email: user.email,
      password: 'secret',
      remember: true,
    });
    expect(login.error).toBeNull();
    expect(fetch.mock.calls[0]?.[0]).toBe(`${baseUrl}/auth/token`);
    const loginOptions = fetch.mock.calls[0]?.[1];
    expect(new Headers(loginOptions?.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(String(loginOptions?.body))).toEqual({
      email: user.email,
      password: 'secret',
      remember: true,
    });
    expect((await client.auth.getUser()).data?.fullName).toBe('Ana Silva');
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${session.token}`,
    );
    expect(fetch.mock.calls[1]?.[0]).toBe(`${baseUrl}/auth/session`);
  });

  it('persists only credentials bound to the server and validates them on startup', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ success: true, user }));
    const first = createClient(baseUrl, { fetch, storageKey: 'demo' });
    await first.auth.ready;
    await first.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect(JSON.parse(storage.getItem('demo') ?? '')).toEqual({
      baseUrl,
      token: session.token,
      expiresAt: session.expiresAt,
    });
    const second = createClient(baseUrl, { fetch, storageKey: 'demo' });
    expect((await second.auth.ready).data?.user).toEqual(user);
    expect(fetch.mock.calls[1]?.[0]).toBe(`${baseUrl}/auth/session`);
  });

  it('never forwards cached credentials to a different RestGo server', async () => {
    const storage = memoryStorage();
    storage.setItem(
      'demo',
      JSON.stringify({ baseUrl, token: session.token, expiresAt: session.expiresAt }),
    );
    vi.stubGlobal('localStorage', storage);
    const fetch = fetchMock();
    const client = createClient('https://other.example.test', { fetch, storageKey: 'demo' });
    expect(await client.auth.ready).toEqual({ data: null, error: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem('demo') ?? '')).toEqual({
      baseUrl,
      token: session.token,
      expiresAt: session.expiresAt,
    });
    await client.auth.signOut();
    expect(storage.getItem('demo')).not.toBeNull();
  });

  it('checks even expired persisted metadata with the server and clears rejected sessions', async () => {
    const storage = memoryStorage();
    storage.setItem(
      'demo',
      JSON.stringify({ baseUrl, token: 'expired', expiresAt: '2000-01-01T00:00:00Z' }),
    );
    vi.stubGlobal('localStorage', storage);
    const fetch = fetchMock().mockResolvedValue(json({ error: 'authentication required' }, 401));
    const client = createClient(baseUrl, { fetch, storageKey: 'demo' });
    expect((await client.auth.ready).error?.status).toBe(401);
    expect((await client.auth.getSession()).data).toBeNull();
    expect(storage.getItem('demo')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retains sessions on transient failures and failed public authentication', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json({ error: 'internal server error' }, 503))
      .mockResolvedValueOnce(json({ error: 'wrong password' }, 401))
      .mockResolvedValueOnce(json({ error: 'invalid token' }, 400))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect((await client.auth.getSession()).error?.code).toBe('NETWORK_ERROR');
    expect((await client.auth.getSession()).error?.status).toBe(503);
    expect(
      (await client.auth.signInWithPassword({ email: user.email, password: 'wrong' })).error
        ?.status,
    ).toBe(401);
    await client.auth.confirmEmail('bad-public-token');
    expect((await client.auth.getSession()).data?.token).toBe(session.token);
  });

  it.each([false, true])(
    'registers without Authorization and without starting a session (configured API token: %s)',
    async (configuredToken) => {
      const created = {
        ...user,
        createdAt: '2026-10-04T00:00:00Z',
        updatedAt: '2026-10-04T00:00:00Z',
      };
      const fetch = fetchMock().mockResolvedValueOnce(json(created, 201));
      const client = createClient(baseUrl, {
        fetch,
        persistSession: false,
        apiToken: configuredToken ? 'rgo.application-token' : undefined,
      });
      await client.auth.ready;
      const events: string[] = [];
      const subscription = client.onAuthStateChange((event) => events.push(event));
      const input = { email: user.email, password: 'secret', fullName: 'Ana', active: true };
      expect(await client.auth.signUp(input)).toEqual({ data: created, error: null });
      expect(fetch).toHaveBeenCalledWith(
        baseUrl + '/auth/users',
        expect.objectContaining({ method: 'POST', credentials: 'omit' }),
      );
      const options = fetch.mock.calls[0]?.[1];
      expect(new Headers(options?.headers).get('Authorization')).toBeNull();
      expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json');
      expect(JSON.parse(String(options?.body))).toEqual(input);
      expect((await client.getSession()).data).toBeNull();
      expect(events).not.toContain('SIGNED_IN');
      subscription.unsubscribe();
      client.dispose();
    },
  );

  it('does not clear a valid user session when public registration is rejected', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ error: 'registration requires server configuration' }, 401))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, apiToken: 'invalid', persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    await client.auth.signUp({ email: 'new@example.test', password: 'secret' });
    expect((await client.auth.getSession()).data?.token).toBe(session.token);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('isolates returned snapshots and subscriber exceptions', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    const events: string[] = [];
    const subscription = client.auth.onAuthStateChange((event, value) => {
      events.push(event);
      if (value) value.token = 'modified';
      throw new Error('consumer error');
    });
    const login = await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    if (login.data) login.data.token = 'changed';
    expect((await client.auth.getSession()).data?.token).toBe(session.token);
    expect(events).toContain('INITIAL_SESSION');
    expect(events).toContain('SIGNED_IN');
    subscription.unsubscribe();
  });

  it('a pending login cannot resurrect a session after logout', async () => {
    const response = deferred<Response>();
    const fetch = fetchMock().mockReturnValueOnce(response.promise);
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    const login = client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    await client.auth.signOut();
    response.resolve(json(session));
    expect((await login).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect((await client.auth.getSession()).data).toBeNull();
  });

  it('a stale session response cannot replace a more recent login', async () => {
    const response = deferred<Response>();
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockReturnValueOnce(response.promise)
      .mockResolvedValueOnce(json({ ...session, token: 'new-token' }))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    const checking = client.auth.getSession();
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    response.resolve(json({ success: true, user: { ...user, fullName: 'Old snapshot' } }));
    expect((await checking).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect((await client.auth.getSession()).data?.token).toBe('new-token');
  });

  it('rejection of an old session cannot cancel a newer login in progress', async () => {
    const rejectedStorage = deferred<Response>();
    const newLogin = deferred<Response>();
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockReturnValueOnce(rejectedStorage.promise)
      .mockReturnValueOnce(newLogin.promise)
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    const storageRequest = client.storage.usage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const login = client.auth.signInWithPassword({ email: user.email, password: 'new-password' });
    rejectedStorage.resolve(json({ error: 'authentication required' }, 401));
    await storageRequest;
    newLogin.resolve(json({ ...session, token: 'new-token' }));
    expect((await login).error).toBeNull();
    expect((await client.auth.getSession()).data?.token).toBe('new-token');
  });

  it('logout revokes only the current token and preserves it on server failure', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ error: 'internal server error' }, 500))
      .mockResolvedValueOnce(json({ success: true, user }))
      .mockResolvedValueOnce(json({ success: true }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect((await client.auth.signOut()).error?.status).toBe(500);
    expect((await client.auth.getSession()).data?.token).toBe(session.token);
    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.getSession()).data).toBeNull();
    expect(fetch.mock.calls[3]?.[0]).toBe(`${baseUrl}/auth/logout`);
    expect(fetch.mock.calls[3]?.[1]?.body).toBeUndefined();
  });

  it('validates setSession credentials before replacing a valid session', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ error: 'authentication required' }, 401))
      .mockResolvedValueOnce(json({ success: true, user }))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect(
      (await client.auth.setSession({ token: 'invalid', expiresAt: session.expiresAt })).error
        ?.status,
    ).toBe(401);
    expect((await client.auth.getSession()).data?.token).toBe(session.token);
    expect(
      (await client.auth.setSession({ token: 'valid-replacement', expiresAt: session.expiresAt }))
        .data?.token,
    ).toBe('valid-replacement');
  });

  it('maps password reset and email confirmation without sending user credentials', async () => {
    const fetch = fetchMock().mockResolvedValue(json({ success: true }, 202));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.resetPasswordForEmail(user.email, { url: 'https://app.example.test/reset' });
    await client.auth.confirmPasswordReset({ token: 'one-use', password: 'new-secret' });
    await client.auth.confirmEmail('one-use');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${baseUrl}/auth/password-reset/request`,
      `${baseUrl}/auth/password-reset/confirm`,
      `${baseUrl}/auth/email-confirmation/confirm`,
    ]);
    expect(
      fetch.mock.calls.every(([, options]) => !new Headers(options?.headers).has('Authorization')),
    ).toBe(true);
  });

  it('never sends Authorization during login and preserves the current JWT when another login fails', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ error: 'wrong password' }, 401))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, {
      fetch,
      apiToken: 'rgo.application-token',
      persistSession: false,
    });
    await client.auth.ready;
    expect((await client.login(user.email, 'secret')).data).toEqual(session);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBeNull();
    expect((await client.login(user.email, 'wrong')).error?.status).toBe(401);
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await client.getSession()).data?.token).toBe(session.token);
    expect(fetch).toHaveBeenCalledTimes(3);
    client.dispose();
  });

  it('registers another account without forwarding the existing JWT or API token', async () => {
    const created = {
      ...user,
      id: 'new-user',
      email: 'new@example.test',
      createdAt: '',
      updatedAt: '',
    };
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(created, 201))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, {
      fetch,
      apiToken: 'rgo.application-token',
      persistSession: false,
    });
    await client.auth.ready;
    await client.login(user.email, 'secret');
    expect((await client.auth.signUp({ email: created.email, password: 'secret' })).data?.id).toBe(
      created.id,
    );
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Authorization')).toBeNull();
    expect((await client.getSession()).data?.token).toBe(session.token);
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer ' + session.token,
    );
    client.dispose();
  });
});

describe('RestGo storage and avatar', () => {
  it('uses multipart for upload/update/avatar and keeps false metadata', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ id: 'file-1' }, 201))
      .mockResolvedValueOnce(json({ id: 'file-1' }))
      .mockResolvedValueOnce(json({ avatarUrl: '/storage/files/avatar-1/download' }))
      .mockResolvedValueOnce(json({ avatarUrl: null }));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    const file = new Blob(['hello'], { type: 'text/plain' });
    await client.storage.upload(file, { name: 'hello.txt', isPublic: false });
    await client.storage.update('file-1', { name: 'updated.txt', isPublic: true });
    await client.auth.uploadAvatar(new Blob(['image']), { name: 'avatar.png' });
    await client.auth.deleteAvatar();
    const upload = fetch.mock.calls[1]?.[1];
    expect(new Headers(upload?.headers).has('Content-Type')).toBe(false);
    expect(upload?.body).toBeInstanceOf(FormData);
    expect((upload?.body as FormData).get('isPublic')).toBe('false');
    expect((upload?.body as FormData).get('name')).toBe('hello.txt');
    expect((fetch.mock.calls[2]?.[1]?.body as FormData).get('file')).toBeNull();
    expect([...(fetch.mock.calls[3]?.[1]?.body as FormData).keys()]).toEqual(['file']);
    expect(fetch.mock.calls[4]?.[1]?.method).toBe('DELETE');
  });

  it('preserves list envelopes, binary downloads, public URLs and 204 deletion', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ data: [], page: 2, page_size: 20, has_more: false }))
      .mockResolvedValueOnce(new Response('file bytes', { status: 206 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createClient(`${baseUrl}/service/`, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect((await client.storage.list({ page: 2, pageSize: 20, q: 'á & b' })).data).toEqual({
      data: [],
      page: 2,
      page_size: 20,
      has_more: false,
    });
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get('q')).toBe('á & b');
    expect(
      await (await client.storage.download('file-1', { range: 'bytes=0-9' })).data?.text(),
    ).toBe('file bytes');
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Range')).toBe('bytes=0-9');
    expect(client.storage.getPublicUrl('file-1').data?.publicUrl).toBe(
      `${baseUrl}/service/storage/files/file-1/download`,
    );
    expect(await client.storage.remove('file-1')).toEqual({ data: null, error: null });
    expect(client.storage.getPublicUrl('../secrets').error?.code).toBe('INVALID_ARGUMENT');
  });

  it('downloads public files without a session and requires JWT for private metadata', async () => {
    const fetch = fetchMock().mockResolvedValueOnce(new Response('public file'));
    const client = createClient(baseUrl, { fetch, apiToken: 'api-token', persistSession: false });
    await client.auth.ready;
    expect((await client.storage.get('file-1')).error?.code).toBe('AUTH_REQUIRED');
    expect(await (await client.storage.download('file-1')).data?.text()).toBe('public file');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it('clears only the rejected session when storage returns 401', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ error: 'authentication required' }, 401));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect((await client.storage.usage()).error?.status).toBe(401);
    expect((await client.auth.getSession()).data).toBeNull();
  });
});

describe('RestGo published endpoints', () => {
  it('unwraps dynamic data and preserves typed exact/simple/cursor metadata', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(
        json({ success: true, error: null, data: [{ id: 1 }], page: 1, total_pages: 2 }),
      )
      .mockResolvedValueOnce(json({ success: true, data: [], page: 2, has_more: false }))
      .mockResolvedValueOnce(
        json({ success: true, data: [{ id: 2 }], has_more: true, next_cursor: 'next+cursor' }),
      );
    const client = createClient(baseUrl, {
      fetch,
      apiToken: 'rgo.token',
      apiVersion: 3,
      defaultDatabase: 'demo',
      persistSession: false,
    });
    await client.auth.ready;
    const exact = await client
      .from<{ id: number }[]>('list')
      .get({ query: { filter: 'ana', active: true }, page: 1 });
    expect(exact).toEqual({ data: [{ id: 1 }], error: null, page: 1, total_pages: 2 });
    expect(exact.data?.[0]?.id).toBe(1);
    await client.api.from('demo').endpoint('list').get({ pagination: 'simple', page: 2 });
    const cursor = await client.api.from('demo').endpoint('list').post(
      { filter: 'ana' },
      {
        pagination: 'cursor',
        cursorColumn: 'id',
        cursor: 'previous+cursor',
        auth: 'apiToken',
      },
    );
    expect(cursor.next_cursor).toBe('next+cursor');
    const headers = new Headers(fetch.mock.calls[2]?.[1]?.headers);
    expect(headers.get('X-RestGo-Pagination')).toBe('cursor');
    expect(headers.get('X-RestGo-Cursor-Column')).toBe('id');
    expect(headers.get('X-RestGo-Cursor')).toBe('previous+cursor');
    expect(headers.get('Authorization')).toBe('rgo.token');
    expect(fetch.mock.calls[0]?.[0]).toBe(`${baseUrl}/v3/demo/list?filter=ana&active=true&page=1`);
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({ filter: 'ana' });
  });

  it('supports every documented HTTP method and endpoint version override', async () => {
    const fetch = fetchMock().mockImplementation(async (_url, init) =>
      init?.method === 'HEAD'
        ? new Response(null)
        : json({ success: true, error: null, data: { rows_affected: 1 } }),
    );
    const client = createClient(baseUrl, { fetch, defaultDatabase: 'demo', persistSession: false });
    await client.auth.ready;
    const endpoint = client.from('change', { version: 2 });
    await endpoint.put({ id: 1 });
    await endpoint.patch({ id: 1 });
    await endpoint.delete({ id: 1 });
    await endpoint.head();
    await endpoint.options({ version: 4 });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ]);
    expect(fetch.mock.calls[4]?.[0]).toBe(`${baseUrl}/v4/demo/change`);
  });

  it('verifies a rejected JWT before clearing it because non-JWT endpoints require API tokens', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ success: false, error: 'authorization token required' }, 401))
      .mockResolvedValueOnce(json({ success: true, user }))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = createClient(baseUrl, { fetch, apiToken: 'api-token', persistSession: false });
    await client.auth.ready;
    await client.auth.signInWithPassword({ email: user.email, password: 'secret' });
    expect((await client.api.from('demo').endpoint('list').get()).error?.status).toBe(401);
    expect(fetch.mock.calls[2]?.[0]).toBe(`${baseUrl}/auth/session`);
    expect((await client.auth.getSession()).data?.token).toBe(session.token);
  });

  it('rejects path traversal, invalid cursor options and manual authorization headers', async () => {
    const fetch = fetchMock();
    const client = createClient(baseUrl, { fetch, persistSession: false });
    await client.auth.ready;
    expect((await client.api.from('../admin').endpoint('list').get()).error?.code).toBe(
      'INVALID_ARGUMENT',
    );
    expect(
      (
        await client.api
          .from('demo')
          .endpoint('list')
          .get({ pagination: 'cursor', page: 2, cursorColumn: 'id' })
      ).error?.code,
    ).toBe('INVALID_ARGUMENT');
    expect(
      (
        await client.api
          .from('demo')
          .endpoint('list')
          .get({ headers: { Authorization: 'master-secret' } })
      ).error?.code,
    ).toBe('INVALID_ARGUMENT');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('normalizes malformed JSON, application errors, network failures and cancellation', async () => {
    const fetch = fetchMock()
      .mockResolvedValueOnce(new Response('broken json'))
      .mockResolvedValueOnce(json({ success: false, error: 'operation failed' }))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const client = createClient(baseUrl, { fetch, defaultDatabase: 'demo', persistSession: false });
    await client.auth.ready;
    expect((await client.from('list').get()).error?.code).toBe('INVALID_RESPONSE');
    const application = await client.from('list').get();
    expect(application.error).toBeInstanceOf(RestGoError);
    expect(application.error?.message).toBe('operation failed');
    expect((await client.from('list').get()).error?.code).toBe('NETWORK_ERROR');
    expect((await client.from('list').get()).error?.code).toBe('ABORTED');
  });

  it('requires an HTTP URL without embedded credentials and a valid API version', () => {
    expect(() => createClient('file:///secrets')).toThrow(TypeError);
    expect(() => createClient('https://user:password@example.test')).toThrow(TypeError);
    expect(() => createClient(`${baseUrl}?token=secret`)).toThrow(TypeError);
    expect(() => createClient(baseUrl, { apiVersion: 1.5 })).toThrow(TypeError);
  });
});
