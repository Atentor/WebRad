import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { RestGoAdminStatus } from '../shared/restgo-admin';

interface Credential {
  readonly token: string;
  readonly storage: 'encrypted' | 'session';
}

/** Credentials live in main-process memory or the OS-encrypted user profile, never .wrproj. */
export class RestGoAdminCredentials {
  private readonly sessions = new Map<number, Map<string, Credential>>();

  private readonly rejectedTokens = new Map<string, Set<string>>();

  private tokenKey(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** A server rejection invalidates only that credential, including remembered copies. */
  public reject(baseUrl: string, token: string): void {
    const rejected = this.rejectedTokens.get(baseUrl) ?? new Set<string>();
    rejected.add(this.tokenKey(token));
    this.rejectedTokens.set(baseUrl, rejected);
    for (const sessions of this.sessions.values()) {
      if (sessions.get(baseUrl)?.token === token) sessions.delete(baseUrl);
    }
  }

  public constructor(
    private readonly userDataPath?: string,
    private readonly directory = 'restgo-admin-credentials',
  ) {}

  public encryptionAvailable(): boolean {
    return (
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
    );
  }

  private credentialPath(baseUrl: string): string | undefined {
    if (this.userDataPath === undefined) return undefined;
    const key = createHash('sha256').update(baseUrl).digest('hex');
    return path.join(this.userDataPath, this.directory, `${key}.bin`);
  }

  public async get(ownerId: number, baseUrl: string): Promise<Credential | undefined> {
    const session = this.sessions.get(ownerId)?.get(baseUrl);
    if (
      session !== undefined &&
      !this.rejectedTokens.get(baseUrl)?.has(this.tokenKey(session.token))
    )
      return session;
    const credentialPath = this.credentialPath(baseUrl);
    if (credentialPath === undefined || !this.encryptionAvailable()) return undefined;
    try {
      const file = await fs.readFile(credentialPath);
      if (file.byteLength > 32_768) return undefined;
      const token = safeStorage.decryptString(file);
      if (
        token.length === 0 ||
        token.length > 8_192 ||
        [...token].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      ) {
        return undefined;
      }
      if (this.rejectedTokens.get(baseUrl)?.has(this.tokenKey(token))) return undefined;
      const credential: Credential = { token, storage: 'encrypted' };
      const sessions = this.sessions.get(ownerId) ?? new Map<string, Credential>();
      sessions.set(baseUrl, credential);
      this.sessions.set(ownerId, sessions);
      return credential;
    } catch {
      // Missing, unreadable or undecryptable credentials require a fresh connection.
      return undefined;
    }
  }

  public async status(ownerId: number, baseUrl: string): Promise<RestGoAdminStatus> {
    const credential = await this.get(ownerId, baseUrl);
    return {
      baseUrl,
      connected: credential !== undefined,
      storage: credential?.storage ?? 'none',
      encryptionAvailable: this.userDataPath !== undefined && this.encryptionAvailable(),
    };
  }

  public async set(
    ownerId: number,
    baseUrl: string,
    token: string,
    remember: boolean,
  ): Promise<RestGoAdminStatus> {
    const credentialPath = this.credentialPath(baseUrl);
    let storage: Credential['storage'] = 'session';
    if (remember && credentialPath !== undefined && this.encryptionAvailable()) {
      const temporaryPath = `${credentialPath}.${randomUUID()}.tmp`;
      try {
        const encrypted = safeStorage.encryptString(token);
        await fs.mkdir(path.dirname(credentialPath), { recursive: true, mode: 0o700 });
        await fs.writeFile(temporaryPath, encrypted, { mode: 0o600, flag: 'wx' });
        await fs.rename(temporaryPath, credentialPath);
        storage = 'encrypted';
      } catch {
        // Encryption or profile failures have an explicit session-only result in the UI.
        await fs.unlink(temporaryPath).catch(() => undefined);
      }
    }
    if (storage === 'session' && credentialPath !== undefined) {
      await fs.unlink(credentialPath).catch((error: unknown) => {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw new Error('Could not remove the previous remembered RestGo credential.');
        }
      });
    }
    // Replacing an instance credential invalidates any cached value in another IDE window.
    this.rejectedTokens.get(baseUrl)?.delete(this.tokenKey(token));
    for (const sessions of this.sessions.values()) sessions.delete(baseUrl);
    const sessions = this.sessions.get(ownerId) ?? new Map<string, Credential>();
    sessions.set(baseUrl, { token, storage });
    this.sessions.set(ownerId, sessions);
    return this.status(ownerId, baseUrl);
  }

  public async forget(baseUrl: string): Promise<void> {
    const credentialPath = this.credentialPath(baseUrl);
    if (credentialPath !== undefined) {
      await fs.unlink(credentialPath).catch((error: unknown) => {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw new Error('Could not remove the remembered RestGo credential.');
        }
      });
    }
    for (const sessions of this.sessions.values()) sessions.delete(baseUrl);
  }

  public release(ownerId: number): void {
    this.sessions.delete(ownerId);
  }
}
