import { isRecord } from './errors';
import type { RestGoClientOptions, RestGoSession } from './types';

export interface StoredSession {
  token: string;
  expiresAt: string;
}

/** Storage is optional: browser privacy/security settings may deny all access. */
export class RestGoSessionStore {
  private readonly storage: Storage | undefined;
  private readonly key: string;

  constructor(
    private readonly baseUrl: string,
    options: RestGoClientOptions,
  ) {
    this.key = options.storageKey ?? `webrad-restgo:${baseUrl}`;
    if (options.persistSession === false || options.sessionStorage === 'memory') return;
    try {
      this.storage =
        options.sessionStorage === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    } catch {
      // Continue in memory when storage is unavailable or denied.
    }
  }

  read(): StoredSession | null {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (isRecord(value) && typeof value.baseUrl === 'string' && value.baseUrl !== this.baseUrl)
        return null;
      if (
        isRecord(value) &&
        value.baseUrl === this.baseUrl &&
        typeof value.token === 'string' &&
        value.token.trim() !== '' &&
        typeof value.expiresAt === 'string' &&
        Number.isFinite(Date.parse(value.expiresAt))
      ) {
        return { token: value.token, expiresAt: value.expiresAt };
      }
      this.write(null);
    } catch {
      // Corrupt or inaccessible persisted data must never become a trusted session.
      this.write(null);
    }
    return null;
  }

  write(session: RestGoSession | null): void {
    try {
      if (session)
        this.storage?.setItem(
          this.key,
          JSON.stringify({
            baseUrl: this.baseUrl,
            token: session.token,
            expiresAt: session.expiresAt,
          }),
        );
      else {
        const raw = this.storage?.getItem(this.key);
        if (raw) {
          try {
            const existing: unknown = JSON.parse(raw);
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
    }
  }
}
