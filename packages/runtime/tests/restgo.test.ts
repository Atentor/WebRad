// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureRestGo,
  getRestGoClient,
  RestGO,
  RestGoNotConfiguredError,
  type RestGoRuntimeConfiguration,
} from '../src/restgo.js';

const configuration: RestGoRuntimeConfiguration = {
  enabled: true,
  baseUrl: 'https://restgo.example.test',
  apiVersion: 2,
  defaultDatabase: 'clientes',
  persistSession: false,
  sessionStorage: 'memory',
  storageKey: 'runtime-restgo-test',
};

afterEach(() => {
  configureRestGo({ ...configuration, enabled: false });
});

describe('native RestGO project client', () => {
  it('shares SDK service instances across imported and global facade access', () => {
    const client = configureRestGo(configuration);
    expect(getRestGoClient()).toBe(client);
    expect(RestGO.auth).toBe(client?.auth);
    expect(RestGO.storage).toBe(client?.storage);
    expect(RestGO.auth).toBe(RestGO.auth);
  });

  it('reports disabled integration before any service operation can run', () => {
    expect(configureRestGo({ ...configuration, enabled: false })).toBeNull();
    expect(() => getRestGoClient()).toThrow(RestGoNotConfiguredError);
    expect(() => RestGO.auth).toThrow('Project Settings > RestGo integration');
  });

  it('reconfigures the stable facade without retaining the previous services', () => {
    const firstClient = configureRestGo(configuration);
    const dispose = vi.spyOn(firstClient!, 'dispose');
    const nextClient = configureRestGo({ ...configuration, baseUrl: 'https://next.example.test' });
    expect(nextClient).not.toBe(firstClient);
    expect(dispose).toHaveBeenCalledOnce();
    expect(RestGO.auth).toBe(nextClient?.auth);
    expect(RestGO.storage).not.toBe(firstClient?.storage);
  });

  it('uses the raw token for anonymous APIs, no token for public auth, and Bearer JWT for authenticated APIs', async () => {
    const user = {
      id: 'user-1',
      email: 'ana@example.test',
      fullName: 'Ana',
      avatarUrl: null,
      active: true,
      emailConfirmed: true,
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      const pathname = new URL(String(url)).pathname;
      const body =
        pathname === '/auth/users'
          ? { ...user, createdAt: '', updatedAt: '' }
          : pathname === '/auth/token'
            ? { token: 'runtime-jwt', expiresAt: '2099-01-01T00:00:00Z', user }
            : pathname === '/auth/logout'
              ? { success: true }
              : { success: true, data: [] };
      return new Response(JSON.stringify(body));
    });
    vi.stubGlobal('fetch', fetch);
    try {
      configureRestGo({ ...configuration, apiToken: 'rgo.runtime-token' });
      await RestGO.auth.ready;
      expect((await RestGO.from('list').get()).error).toBeNull();
      expect(
        (await RestGO.auth.signUp({ email: user.email, password: 'secret' })).error,
      ).toBeNull();
      const login = await RestGO.login(user.email, 'secret');
      expect(login).toMatchObject({ sucess: true, error: null, data: { user } });
      if (!login.sucess) throw login.error;
      expect(login.data.user.fullName).toBe(user.fullName);
      expect((await RestGO.from('list').get()).error).toBeNull();
      expect((await RestGO.logout()).error).toBeNull();
      expect((await RestGO.from('list').get()).error).toBeNull();
      expect(
        fetch.mock.calls.map(([, options]) => new Headers(options?.headers).get('Authorization')),
      ).toEqual([
        'rgo.runtime-token',
        null,
        null,
        'Bearer runtime-jwt',
        'Bearer runtime-jwt',
        'rgo.runtime-token',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
