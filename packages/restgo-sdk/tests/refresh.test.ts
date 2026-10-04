import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, type RestGoClient, type RestGoSession } from '../src/index';

const baseUrl = 'https://refresh.example.test';
const key = 'refresh-test';
const clients: RestGoClient[] = [];
const user = {
  id: 'user-1',
  email: 'ana@example.test',
  fullName: 'Ana',
  avatarUrl: null,
  active: true,
  emailConfirmed: true,
};

function session(index = 1, ttl = 3600_000): RestGoSession {
  return {
    token: `jwt-${index}`,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
    refreshToken: `rgr_${String(index).padStart(43, '0')}`,
    refreshExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    user: { ...user, fullName: `Ana ${index}` },
  };
}
function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
async function loggedIn(
  fetch: typeof globalThis.fetch,
  options: Parameters<typeof createClient>[1] = {},
) {
  const client = createClient(baseUrl, { persistSession: false, fetch, ...options });
  clients.push(client);
  await client.auth.ready;
  expect(
    (
      await client.auth.signInWithPassword({
        email: user.email,
        password: 'secret',
        remember: true,
      })
    ).error,
  ).toBeNull();
  return client;
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('single-use RestGO refresh tokens', () => {
  it('persists the complete pair atomically, rotates publicly, and publishes the current identity', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    const first = session();
    const second = session(2);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(first))
      .mockResolvedValueOnce(json(second))
      .mockResolvedValueOnce(json({ success: true, user: second.user }));
    const client = await loggedIn(fetch, {
      persistSession: true,
      storageKey: key,
      apiToken: 'api-secret',
    });
    expect(JSON.parse(saved.getItem(key) ?? '')).toEqual({
      baseUrl,
      token: first.token,
      expiresAt: first.expiresAt,
      refreshToken: first.refreshToken,
      refreshExpiresAt: first.refreshExpiresAt,
    });
    const events: string[] = [];
    client.auth.onAuthStateChange((event) => events.push(event));
    const result = await client.auth.refreshSession();
    expect(result.data).toEqual(second);
    const [url, options] = fetch.mock.calls[1]!;
    expect(url).toBe(`${baseUrl}/auth/refresh`);
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ refreshToken: first.refreshToken });
    expect(new Headers(options?.headers).get('Authorization')).toBeNull();
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(saved.getItem(key) ?? '').refreshToken).toBe(second.refreshToken);
    expect(events).toContain('TOKEN_REFRESHED');
    expect((await client.auth.getSession()).data).toEqual(second);
  });

  it('restores an expired JWT by refreshing before exposing the server identity', async () => {
    const saved = storage();
    const expired = session(1, -1000);
    const renewed = session(2);
    saved.setItem(
      key,
      JSON.stringify({ ...expired, baseUrl, user: { ...user, fullName: 'Untrusted cache' } }),
    );
    vi.stubGlobal('localStorage', saved);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(renewed));
    const client = createClient(baseUrl, { fetch, storageKey: key });
    clients.push(client);
    expect((await client.auth.ready).data).toEqual(renewed);
    expect(fetch.mock.calls[0]?.[0]).toBe(`${baseUrl}/auth/refresh`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('renews automatically before expiry, and disposing releases the timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session(1, 10_000)))
      .mockImplementation(async () => json(session(2, 10_000)));
    const client = await loggedIn(fetch);
    await vi.advanceTimersByTimeAsync(8999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe(`${baseUrl}/auth/refresh`);
    client.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent renewal and retries storage with the rotated JWT', async () => {
    const rotated = deferred<Response>();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/auth/token')) return json(session());
      if (String(url).endsWith('/auth/refresh')) return rotated.promise;
      return new Headers(options?.headers).get('Authorization') === 'Bearer jwt-2'
        ? json({ usedBytes: 0, capacityBytes: 10, availableBytes: 10 })
        : json({ error: 'expired JWT' }, 401);
    });
    const client = await loggedIn(fetch);
    const requests = [client.storage.usage(), client.storage.usage(), client.auth.refreshSession()];
    await vi.waitFor(() =>
      expect(
        fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh')),
      ).toHaveLength(1),
    );
    rotated.resolve(json(session(2)));
    const results = await Promise.all(requests);
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(
      1,
    );
  });

  it('renews an expired JWT before protected requests without sending the expired credential', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session(1, 1000)))
      .mockResolvedValueOnce(json(session(2)))
      .mockResolvedValueOnce(json([]));
    const client = await loggedIn(fetch);
    vi.setSystemTime(Date.now() + 2000);
    expect((await client.storage.list()).error).toBeNull();
    expect(fetch.mock.calls[1]?.[0]).toBe(`${baseUrl}/auth/refresh`);
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jwt-2',
    );
  });

  it('revalidates dynamic endpoint rejections and does not refresh for a credential mode mismatch', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json({ error: 'API token required' }, 401))
      .mockResolvedValueOnce(json({ success: true, user }));
    const client = await loggedIn(fetch);
    expect((await client.api.from('demo').endpoint('list').get()).error?.status).toBe(401);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${baseUrl}/auth/token`,
      `${baseUrl}/v1/demo/list`,
      `${baseUrl}/auth/session`,
    ]);
  });

  it('refreshes after authoritative validation rejects a JWT and retries a dynamic operation once', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json({ error: 'expired JWT' }, 401))
      .mockResolvedValueOnce(json({ error: 'expired JWT' }, 401))
      .mockResolvedValueOnce(json(session(2)))
      .mockResolvedValueOnce(json({ success: true, data: 42 }));
    const client = await loggedIn(fetch);
    expect((await client.api.from('demo').endpoint('save').post({ value: 1 })).data).toBe(42);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${baseUrl}/auth/token`,
      `${baseUrl}/v1/demo/save`,
      `${baseUrl}/auth/session`,
      `${baseUrl}/auth/refresh`,
      `${baseUrl}/v1/demo/save`,
    ]);
    expect(fetch.mock.calls[4]?.[1]?.body).toBe(fetch.mock.calls[1]?.[1]?.body);
  });

  it('never loops when the retried protected endpoint rejects the new JWT', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(session(2)))
      .mockResolvedValueOnce(json({}, 401));
    const client = await loggedIn(fetch);
    expect((await client.storage.usage()).error?.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not replay a mutation after a network failure or 503', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json({}, 503));
    const client = await loggedIn(fetch);
    expect((await client.api.from('demo').endpoint('save').post({ value: 1 })).error?.code).toBe(
      'NETWORK_ERROR',
    );
    expect((await client.api.from('demo').endpoint('save').post({ value: 1 })).error?.status).toBe(
      503,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([401, 429, 503, 0])(
    'handles refresh failure %s without discarding recoverable credentials',
    async (status) => {
      vi.useFakeTimers();
      const saved = storage();
      vi.stubGlobal('localStorage', saved);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(session()));
      if (status) fetch.mockResolvedValueOnce(json({ error: 'Refresh failed' }, status));
      else fetch.mockRejectedValueOnce(new TypeError('offline'));
      const client = await loggedIn(fetch, { persistSession: true, storageKey: key });
      expect((await client.auth.refreshSession()).error?.status).toBe(status);
      if (status === 401) {
        expect(saved.getItem(key)).toBeNull();
        expect((await client.auth.getSession()).data).toBeNull();
      } else {
        expect(JSON.parse(saved.getItem(key) ?? '').refreshToken).toBe(session().refreshToken);
        expect((await client.auth.refreshSession()).error?.status).toBe(status);
        expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1000);
        fetch.mockResolvedValueOnce(json(session(2)));
        expect((await client.auth.refreshSession()).data?.token).toBe('jwt-2');
      }
    },
  );

  it.each(['12', 'date'])(
    'honors Retry-After %s even after successful JWT validation',
    async (header) => {
      vi.useFakeTimers();
      vi.stubGlobal('window', {});
      const retryAfter = header === 'date' ? new Date(Date.now() + 12_000).toUTCString() : header;
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json(session()))
        .mockResolvedValueOnce(json({}, 429, { 'Retry-After': retryAfter }))
        .mockResolvedValueOnce(json({ success: true, user }))
        .mockImplementation(async () => json(session(2)));
      const client = await loggedIn(fetch);
      const result = await client.auth.refreshSession();
      expect(result.error?.retryAfterMs).toBeGreaterThanOrEqual(11_000);
      expect((await client.auth.getSession()).error).toBeNull();
      await vi.advanceTimersByTimeAsync(10_999);
      expect(fetch).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1001);
      expect(fetch).toHaveBeenCalledTimes(4);
    },
  );

  it('serializes browser clients with Web Locks and adopts another rotation even when the JWT is unchanged', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    vi.stubGlobal('window', {});
    const tails = new Map<string, Promise<unknown>>();
    const request = vi.fn((name: string, run: () => Promise<unknown>) => {
      const result = (tails.get(name) ?? Promise.resolve()).then(run);
      tails.set(name, result);
      return result;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    let current = session();
    let rotations = 0;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/auth/token')) return json(current);
      if (String(url).endsWith('/auth/session')) return json({ success: true, user: current.user });
      expect(JSON.parse(String(options?.body)).refreshToken).toBe(current.refreshToken);
      rotations++;
      current = { ...session(2), token: current.token };
      return json(current);
    });
    const first = await loggedIn(fetch, { persistSession: true, storageKey: key });
    const second = createClient(baseUrl, { fetch, storageKey: key });
    clients.push(second);
    await second.auth.ready;
    const results = await Promise.all([first.auth.refreshSession(), second.auth.refreshSession()]);
    expect(results.map((result) => result.data?.refreshToken)).toEqual([
      current.refreshToken,
      current.refreshToken,
    ]);
    expect(rotations).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).not.toContain('rgr_');
  });

  it('refuses unsafe cross-tab rotation without Web Locks while preserving the local session', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json(session()));
    const client = await loggedIn(fetch, { persistSession: true, storageKey: key });
    expect((await client.auth.refreshSession()).error?.code).toBe('REFRESH_LOCK_UNAVAILABLE');
    expect(saved.getItem(key)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('supports isolated session storage without Web Locks', async () => {
    vi.stubGlobal('sessionStorage', storage());
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json(session(2)));
    const client = await loggedIn(fetch, { persistSession: true, sessionStorage: 'session' });
    expect((await client.auth.refreshSession()).data?.token).toBe('jwt-2');
  });

  it('does not resurrect a session when logout overlaps rotation and revokes the rotated token', async () => {
    const rotated = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(rotated.promise)
      .mockResolvedValueOnce(json({ success: true }));
    const client = await loggedIn(fetch);
    const renewal = client.auth.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const logout = client.auth.signOut();
    rotated.resolve(json(session(2)));
    expect((await renewal).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect((await logout).error).toBeNull();
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jwt-2',
    );
    expect((await client.auth.getSession()).data).toBeNull();
  });

  it('refreshes an expired JWT before server logout', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session(1, -1)))
      .mockResolvedValueOnce(json(session(2)))
      .mockResolvedValueOnce(json({ success: true }));
    const client = await loggedIn(fetch);
    expect((await client.auth.signOut()).error).toBeNull();
    expect(fetch.mock.calls[1]?.[0]).toBe(`${baseUrl}/auth/refresh`);
    expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jwt-2',
    );
  });

  it('a refresh response cannot replace a newer login', async () => {
    const rotated = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(rotated.promise)
      .mockResolvedValueOnce(json(session(3)))
      .mockResolvedValueOnce(json({ success: true, user: session(3).user }));
    const client = await loggedIn(fetch);
    const renewal = client.auth.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await client.auth.signInWithPassword({ email: user.email, password: 'new' });
    rotated.resolve(json(session(2)));
    expect((await renewal).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect((await client.auth.getSession()).data?.token).toBe('jwt-3');
  });

  it('validates imported pairs and can renew an expired imported JWT', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(session(2)));
    const client = createClient(baseUrl, { fetch, persistSession: false });
    clients.push(client);
    await client.auth.ready;
    expect(
      (
        await client.auth.setSession({
          token: 'x',
          expiresAt: session().expiresAt,
          refreshToken: 'rgr_missing-date',
        })
      ).error?.code,
    ).toBe('INVALID_ARGUMENT');
    expect((await client.auth.setSession(session(1, -1))).data?.token).toBe('jwt-2');
    expect(fetch.mock.calls[1]?.[0]).toBe(`${baseUrl}/auth/refresh`);
  });

  it('rejects incomplete login/refresh pairs and stops automatic retries for malformed responses', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session(1, 1000)))
      .mockResolvedValueOnce(json({ ...session(2), refreshExpiresAt: undefined }));
    const client = await loggedIn(fetch);
    await vi.advanceTimersByTimeAsync(900);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValueOnce(json({ ...session(3), refreshExpiresAt: undefined }));
    expect(
      (await client.auth.signInWithPassword({ email: user.email, password: 'x' })).error?.code,
    ).toBe('INVALID_RESPONSE');
  });

  it('allows manual renewal with automatic renewal disabled', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session(1, 1000)))
      .mockResolvedValueOnce(json(session(2)));
    const client = await loggedIn(fetch, { autoRefreshToken: false });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await client.auth.refreshSession()).data?.token).toBe('jwt-2');
  });

  it('does not refresh for public or API-token failures, or an already aborted request', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}, 401));
    const client = await loggedIn(fetch, { apiToken: 'invalid' });
    await client.auth.confirmEmail('invalid');
    await client.api.from('demo').endpoint('list').get({ auth: 'apiToken' });
    const controller = new AbortController();
    controller.abort();
    expect((await client.storage.list({ signal: controller.signal })).error?.code).toBe('ABORTED');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('replays real multipart and binary downloads after renewal and updates the avatar identity', async () => {
    let current = 1;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/auth/token') return json(session());
      if (path === '/auth/refresh') return json(session(++current));
      const expected = path === '/auth/avatar' ? 2 : 3;
      if (new Headers(options?.headers).get('Authorization') !== `Bearer jwt-${expected}`)
        return json({}, 401);
      if (path === '/auth/avatar') {
        expect(options?.body).toBeInstanceOf(FormData);
        expect(new Headers(options?.headers).has('Content-Type')).toBe(false);
        expect(await (options?.body as FormData).get('file')?.valueOf()).toBeInstanceOf(Blob);
        return json({ avatarUrl: '/storage/avatar' });
      }
      if (path === '/auth/session')
        return json({
          success: true,
          user: { ...session(current).user, avatarUrl: '/storage/avatar' },
        });
      expect(new Headers(options?.headers).get('Range')).toBe('bytes=0-4');
      return new Response('hello', { status: 206 });
    });
    const client = await loggedIn(fetch);
    expect(
      (await client.auth.uploadAvatar(new Blob(['avatar']), { name: 'avatar.png' })).data
        ?.avatarUrl,
    ).toBe('/storage/avatar');
    const avatarEvent = vi.fn();
    client.auth.onAuthStateChange(avatarEvent);
    const result = await client.storage.download('file-1', { range: 'bytes=0-4' });
    expect(await result.data?.text()).toBe('hello');
    expect((await client.auth.getSession()).data?.user.avatarUrl).toBe('/storage/avatar');
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(
      2,
    );
  });

  it('continues renewal in memory when browser persistence is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json(session(2)));
    const client = await loggedIn(fetch, { persistSession: true });
    expect((await client.auth.refreshSession()).data?.token).toBe('jwt-2');
  });

  it('waits for another client rotation before revoking the shared session', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    const rotated = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockResolvedValueOnce(json({ success: true, user }))
      .mockReturnValueOnce(rotated.promise)
      .mockResolvedValueOnce(json({ success: true }));
    const first = await loggedIn(fetch, { persistSession: true, storageKey: key });
    const second = createClient(baseUrl, { fetch, storageKey: key });
    clients.push(second);
    await second.auth.ready;
    const renewal = first.auth.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const logout = second.auth.signOut();
    rotated.resolve(json(session(2)));
    expect((await renewal).error).toBeNull();
    expect((await logout).error).toBeNull();
    expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jwt-2',
    );
    expect(saved.getItem(key)).toBeNull();
  });

  it('never overwrites a remote login with an older validation response', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    const validation = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(validation.promise)
      .mockResolvedValueOnce(json({ success: true, user: session(3).user }))
      .mockResolvedValueOnce(json({ success: true, user: session(3).user }));
    const client = await loggedIn(fetch, { persistSession: true, storageKey: key });
    const checking = client.auth.getSession();
    saved.setItem(key, JSON.stringify({ baseUrl, ...session(3) }));
    validation.resolve(json({ success: true, user }));
    expect((await checking).data?.token).toBe('jwt-3');
    expect(JSON.parse(saved.getItem(key) ?? '').token).toBe('jwt-3');
  });

  it('preserves an already consumed rotation when the client is disposed during the request', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    const rotated = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(rotated.promise);
    const client = await loggedIn(fetch, { persistSession: true, storageKey: key });
    const renewal = client.auth.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    client.dispose();
    rotated.resolve(json(session(2)));
    expect((await renewal).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect(JSON.parse(saved.getItem(key) ?? '').refreshToken).toBe(session(2).refreshToken);
  });

  it('preserves a completed rotation when an overlapping new login fails', async () => {
    const rotated = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(rotated.promise)
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ success: true, user: session(2).user }));
    const client = await loggedIn(fetch);
    const renewal = client.auth.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const login = client.auth.signInWithPassword({ email: user.email, password: 'wrong' });
    rotated.resolve(json(session(2)));
    expect((await login).error?.status).toBe(401);
    expect((await renewal).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect((await client.auth.getSession()).data?.refreshToken).toBe(session(2).refreshToken);
  });

  it('ignores stale validation during rotation even if RestGO issues an identical JWT', async () => {
    const saved = storage();
    vi.stubGlobal('localStorage', saved);
    const validation = deferred<Response>();
    const renewed = { ...session(2), token: session().token };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(validation.promise)
      .mockResolvedValueOnce(json(renewed));
    const client = await loggedIn(fetch, { persistSession: true, storageKey: key });
    const checking = client.auth.getSession();
    await client.auth.refreshSession();
    validation.resolve(json({ success: true, user }));
    expect((await checking).data).toEqual(renewed);
    expect(JSON.parse(saved.getItem(key) ?? '').refreshToken).toBe(renewed.refreshToken);
  });

  it('never replays a rejected mutation under a newer login', async () => {
    const rejected = deferred<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(session()))
      .mockReturnValueOnce(rejected.promise)
      .mockResolvedValueOnce(json({ ...session(3), user: { ...user, id: 'other-user' } }));
    const client = await loggedIn(fetch);
    const mutation = client.api.from('demo').endpoint('save').post({ value: 1 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await client.auth.signInWithPassword({ email: 'other@example.test', password: 'secret' });
    rejected.resolve(json({}, 401));
    expect((await mutation).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
