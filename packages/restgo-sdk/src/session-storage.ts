import { failure, isRecord, type RestGoResult } from './errors';
import type { RestGoClientOptions, RestGoSessionStorageAdapter } from './types';

export interface StoredSession {
  token: string;
  expiresAt: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
}

export function isStoredSession(value: unknown): value is StoredSession {
  return (
    isRecord(value) &&
    typeof value.token === 'string' &&
    value.token.trim() !== '' &&
    typeof value.expiresAt === 'string' &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    ((value.refreshToken === undefined && value.refreshExpiresAt === undefined) ||
      (typeof value.refreshToken === 'string' &&
        value.refreshToken.trim() !== '' &&
        typeof value.refreshExpiresAt === 'string' &&
        Number.isFinite(Date.parse(value.refreshExpiresAt))))
  );
}

export function credentials(value: StoredSession): StoredSession {
  return {
    token: value.token,
    expiresAt: value.expiresAt,
    ...(value.refreshToken
      ? { refreshToken: value.refreshToken, refreshExpiresAt: value.refreshExpiresAt }
      : {}),
  };
}

const queues = new Map<string, Promise<void>>();

/** Storage is optional: browser privacy/security settings may deny all access. */
export class RestGoSessionStore {
  private storage: RestGoSessionStorageAdapter | undefined;
  private readonly key: string;
  private readonly shared: boolean;

  constructor(
    private readonly baseUrl: string,
    options: RestGoClientOptions,
  ) {
    this.key = options.storageKey ?? `webrad-restgo:${baseUrl}`;
    this.shared = options.sessionStorage !== 'session';
    if (options.persistSession === false || options.sessionStorage === 'memory') return;
    if (options.storage && options.sessionStorage !== 'session') {
      this.storage = options.storage;
      return;
    }
    try {
      this.storage =
        options.sessionStorage === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    } catch {
      // Continue in memory when storage is unavailable or denied.
    }
  }

  get persistent(): boolean {
    return this.storage !== undefined;
  }

  /** Browser locks serialize single-use rotation across tabs; queues cover one realm. */
  async exclusive<T>(
    operation: () => Promise<RestGoResult<T>>,
    requireCrossTab = true,
  ): Promise<RestGoResult<T>> {
    const name = `webrad-restgo-refresh:${this.baseUrl}:${this.key}`;
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (this.storage && this.shared && locks) {
      try {
        return await locks.request(name, operation);
      } catch (error) {
        return failure(
          'Unable to coordinate refresh token rotation with the browser.',
          'REFRESH_LOCK_UNAVAILABLE',
          0,
          error,
        );
      }
    }
    if (requireCrossTab && this.storage && this.shared && typeof window !== 'undefined') {
      return failure(
        'Shared local sessions require the Web Locks API in a secure context. Use HTTPS, session storage or memory storage.',
        'REFRESH_LOCK_UNAVAILABLE',
      );
    }
    const previous = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => waiting);
    queues.set(name, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(name) === tail) queues.delete(name);
    }
  }

  subscribe(callback: () => void): () => void {
    if (this.storage?.subscribe) return this.storage.subscribe(callback);
    if (!this.storage || typeof window === 'undefined' || !window.addEventListener) return () => {};
    const listener = (event: StorageEvent): void => {
      if (event.storageArea === this.storage && (event.key === this.key || event.key === null))
        callback();
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  read(): StoredSession | null {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (isRecord(value) && typeof value.baseUrl === 'string' && value.baseUrl !== this.baseUrl)
        return null;
      if (isRecord(value) && value.baseUrl === this.baseUrl && isStoredSession(value)) {
        return credentials(value);
      }
      this.write(null);
    } catch {
      // Corrupt or inaccessible persisted data must never become a trusted session.
      this.write(null);
    }
    return null;
  }

  write(session: StoredSession | null, expectedToken?: string): void {
    try {
      if (session)
        this.storage?.setItem(
          this.key,
          JSON.stringify({
            baseUrl: this.baseUrl,
            ...credentials(session),
          }),
        );
      else {
        const raw = this.storage?.getItem(this.key);
        if (raw) {
          try {
            const existing: unknown = JSON.parse(raw);
            if (isStoredSession(existing) && expectedToken && existing.token !== expectedToken)
              return;
            if (
              isRecord(existing) &&
              typeof existing.baseUrl === 'string' &&
              existing.baseUrl !== this.baseUrl
            )
              return;
          } catch {
            // Malformed persisted data is safe to discard.
          }
        }
        this.storage?.removeItem(this.key);
      }
    } catch {
      // A blocked/quota-exceeded storage provider does not break authentication.
      this.storage = undefined;
    }
  }
}
