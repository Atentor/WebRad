import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestGoAdminCredentials } from './restgo-admin-credentials';

const encryption = vi.hoisted(() => ({
  available: vi.fn(() => true),
  encrypt: vi.fn((token: string) =>
    Buffer.from(`encrypted:${Buffer.from(token).toString('base64')}`),
  ),
  decrypt: vi.fn((data: Buffer) =>
    Buffer.from(data.toString().slice('encrypted:'.length), 'base64').toString(),
  ),
}));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: encryption.available,
    getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
    encryptString: encryption.encrypt,
    decryptString: encryption.decrypt,
  },
}));

describe('RestGo administrative credential vault', () => {
  let userDataPath: string;
  const baseUrl = 'https://restgo.example.test/backend';
  const token = 'rgo.sensitive-administrative-token';

  beforeEach(async () => {
    encryption.available.mockReturnValue(true);
    encryption.encrypt.mockClear();
    encryption.decrypt.mockClear();
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-restgo-credentials-'));
  });

  afterEach(async () => {
    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  it('persists only OS-encrypted bytes and restores them without exposing the credential in status', async () => {
    const vault = new RestGoAdminCredentials(userDataPath);
    const status = await vault.set(1, baseUrl, token, true);
    expect(status).toMatchObject({ connected: true, storage: 'encrypted' });
    expect(JSON.stringify(status)).not.toContain(token);
    expect(encryption.encrypt).toHaveBeenCalledWith(token);
    const key = createHash('sha256').update(baseUrl).digest('hex');
    const bytes = await fs.readFile(
      path.join(userDataPath, 'restgo-admin-credentials', `${key}.bin`),
    );
    expect(bytes.toString()).not.toContain(token);
    const reopened = new RestGoAdminCredentials(userDataPath);
    expect(await reopened.get(2, baseUrl)).toMatchObject({ token, storage: 'encrypted' });
    expect(encryption.decrypt).toHaveBeenCalledWith(bytes);
  });

  it('uses session-only access when encryption is unavailable and removes previous remembered data', async () => {
    const vault = new RestGoAdminCredentials(userDataPath);
    await vault.set(1, baseUrl, token, true);
    encryption.available.mockReturnValue(false);
    const replacement = await vault.set(1, baseUrl, 'rgo.replacement-token', true);
    expect(replacement).toMatchObject({ storage: 'session', encryptionAvailable: false });
    expect(await fs.readdir(path.join(userDataPath, 'restgo-admin-credentials'))).toEqual([]);
    expect(await vault.get(2, baseUrl)).toBeUndefined();
    await vault.forget(baseUrl);
    expect(await vault.get(1, baseUrl)).toBeUndefined();
  });

  it('blocks rejected remembered credentials across windows until a verified replacement is saved', async () => {
    const vault = new RestGoAdminCredentials(userDataPath);
    await vault.set(1, baseUrl, token, true);
    expect(await vault.get(2, baseUrl)).toMatchObject({ token });
    vault.reject(baseUrl, token);
    expect(await vault.get(1, baseUrl)).toBeUndefined();
    expect(await vault.get(2, baseUrl)).toBeUndefined();
    expect(await vault.get(3, baseUrl)).toBeUndefined();
    await vault.set(1, baseUrl, 'rgo.verified-replacement', true);
    vault.reject(baseUrl, token);
    expect(await vault.get(1, baseUrl)).toMatchObject({ token: 'rgo.verified-replacement' });
    expect(await vault.get(3, baseUrl)).toMatchObject({ token: 'rgo.verified-replacement' });
  });
});
