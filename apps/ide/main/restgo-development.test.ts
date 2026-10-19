import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestGoAdminCredentials } from './restgo-admin-credentials';
import { RestGoDevelopmentService } from './restgo-development';

const encryption = vi.hoisted(() => ({ available: vi.fn(() => true) }));
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: encryption.available,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (value: string) => Buffer.from(Buffer.from(value).toString('base64')),
    decryptString: (value: Buffer) => Buffer.from(value.toString(), 'base64').toString(),
  },
}));

const baseUrl = 'https://restgo.example.test/backend';
const user = {
  id: 'user-1',
  email: 'developer@example.test',
  fullName: 'Developer',
  avatarUrl: null,
  active: true,
  emailConfirmed: true,
};
const target = { baseUrl };
const login = { ...target, email: user.email, password: 'secret-password', remember: true };
const namespace = 'restgo-development-credentials';
const session = (rotation = 0) => ({
  token: `user-jwt-${rotation}`,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  refreshToken: `refresh-${rotation}`,
  refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
  user,
});
const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('IDE development login', () => {
  let directory: string;
  let vault: RestGoAdminCredentials;
  let service: RestGoDevelopmentService;
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(async () => {
    encryption.available.mockReturnValue(true);
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-development-'));
    vault = new RestGoAdminCredentials(directory, namespace);
    service = new RestGoDevelopmentService(vault);
    fetcher.mockReset();
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/auth/token')) {
        expect(init?.headers).not.toHaveProperty('Authorization');
        expect(new Headers(init?.headers).get('Authorization')).toBeNull();
        expect(JSON.parse(String(init?.body))).toEqual({
          email: user.email,
          password: login.password,
          remember: true,
        });
        return json(session());
      }
      if (String(input).endsWith('/auth/logout')) return json({ success: true });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer user-jwt-0');
      return json({ success: true, user });
    });
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('encrypts only session credentials, restores on restart, and keeps administration isolated', async () => {
    const status = await service.login(1, login);
    expect(status).toMatchObject({ connected: true, storage: 'encrypted', email: user.email });
    expect(JSON.stringify(status)).not.toContain('user-jwt');
    const names = await fs.readdir(path.join(directory, namespace));
    const bytes = await fs.readFile(path.join(directory, namespace, names[0]!));
    expect(bytes.toString()).not.toContain(login.password);
    expect(bytes.toString()).not.toContain('user-jwt');
    const saved = await vault.get(1, baseUrl);
    expect(JSON.parse(saved!.token)).toEqual({
      token: session().token,
      expiresAt: expect.any(String),
      refreshToken: session().refreshToken,
      refreshExpiresAt: expect.any(String),
    });
    const reopened = new RestGoDevelopmentService(new RestGoAdminCredentials(directory, namespace));
    expect(await reopened.status(2, { baseUrl: `${baseUrl}/` })).toMatchObject({
      email: user.email,
      storage: 'encrypted',
    });
    expect(await reopened.token(2, target)).toBe('user-jwt-0');
    expect(await new RestGoAdminCredentials(directory).get(1, baseUrl)).toBeUndefined();
    expect(await reopened.status(2, { baseUrl: 'https://other.example.test' })).toMatchObject({
      connected: false,
    });
    expect(
      fetcher.mock.calls.every(
        ([, init]) => init?.redirect === 'error' && init.credentials === 'omit',
      ),
    ).toBe(true);
  });

  it('serializes single-use refresh across windows and persists the rotated credentials', async () => {
    await service.login(1, login);
    let rotations = 0;
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/auth/refresh')) {
        expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-0' });
        expect(new Headers(init?.headers).has('Authorization')).toBe(false);
        rotations++;
        return json(session(rotations));
      }
      return new Headers(init?.headers).get('Authorization') === 'Bearer user-jwt-0'
        ? json({ error: 'expired' }, 401)
        : json({ success: true, user });
    });
    expect(await Promise.all([service.token(1, target), service.token(2, target)])).toEqual([
      'user-jwt-1',
      'user-jwt-1',
    ]);
    expect(rotations).toBe(1);
    expect(JSON.parse((await vault.get(2, baseUrl))!.token)).toMatchObject({
      token: 'user-jwt-1',
      refreshToken: 'refresh-1',
    });
  });

  it('retains credentials on network failure and removes a definitively rejected session', async () => {
    await service.login(1, login);
    fetcher.mockRejectedValue(new Error('offline'));
    await expect(service.token(1, target)).rejects.toThrow('Could not validate');
    expect(await vault.get(1, baseUrl)).toBeDefined();
    fetcher.mockImplementation(async () => json({ error: 'expired' }, 401));
    await expect(service.token(1, target)).rejects.toThrow('Development login');
    expect(await vault.get(1, baseUrl)).toBeUndefined();
    expect(await fs.readdir(path.join(directory, namespace))).toEqual([]);
  });

  it('falls back to window memory without secure storage and releases it when the window closes', async () => {
    encryption.available.mockReturnValue(false);
    expect(await service.login(1, login)).toMatchObject({
      storage: 'session',
      encryptionAvailable: false,
    });
    expect(await service.status(2, target)).toMatchObject({ connected: false });
    expect(await service.token(1, target)).toBe('user-jwt-0');
    vault.release(1);
    await expect(service.token(1, target)).rejects.toThrow('Development login');
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it('forgets locally even when revocation is offline', async () => {
    await service.login(1, login);
    fetcher.mockRejectedValue(new Error('offline'));
    await expect(service.logout(1, target)).rejects.toThrow('removed from this device');
    expect(await service.status(1, target)).toMatchObject({ connected: false });
  });

  it('rejects unexpected IPC fields and unsafe targets before any network request', async () => {
    for (const url of [
      'file:///secret',
      'https://user:pass@example.test',
      `${baseUrl}?a=1`,
      `${baseUrl}#a`,
      'https://restgo.example.test\\other',
    ]) {
      await expect(service.status(1, { baseUrl: url })).rejects.toThrow();
    }
    await expect(
      service.login(1, { ...login, token: 'administrative' } as typeof login),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
