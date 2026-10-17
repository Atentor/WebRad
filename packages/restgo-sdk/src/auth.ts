import { failure, isRecord, success, type RestGoError, type RestGoResult } from './errors';
import {
  credentials,
  isStoredSession,
  RestGoSessionStore,
  type StoredSession,
} from './session-storage';
import { type RestGoTransport } from './transport';
import type {
  RestGoAuthEvent,
  RestGoClientOptions,
  RestGoCurrentUser,
  RestGoManagedUser,
  RestGoRequestOptions,
  RestGoSession,
  RestGoSignInInput,
  RestGoSignUpInput,
  RestGoSuccess,
  RestGoUser,
} from './types';

type AuthListener = (event: RestGoAuthEvent, session: RestGoSession | null) => void;

function isUser(value: unknown): value is RestGoUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.fullName === 'string' &&
    (value.avatarUrl === null || typeof value.avatarUrl === 'string') &&
    typeof value.active === 'boolean' &&
    typeof value.emailConfirmed === 'boolean'
  );
}

function cloneSession(value: RestGoSession | null): RestGoSession | null {
  return value ? { ...value, user: { ...value.user } } : null;
}

function isSession(value: unknown): value is RestGoSession {
  return isStoredSession(value) && isRecord(value) && isUser(value.user);
}

interface RefreshWork {
  generation: number;
  promise: Promise<RestGoResult<RestGoSession>>;
  rotated?: RestGoSession;
}

export class RestGoAuthClient {
  /** Startup checks persisted credentials with GET /auth/session. */
  readonly ready: Promise<RestGoResult<RestGoSession | null>>;
  private readonly store: RestGoSessionStore;
  private current: RestGoSession | null = null;
  private restored: StoredSession | null;
  private generation = 0;
  private readonly automatic: boolean;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private refresh: RefreshWork | undefined;
  private retryAt = 0;
  private retryDelay = 1000;
  private retryError: RestGoError | undefined;
  private closing = false;
  private disposed = false;
  private readonly unsubscribeStorage: () => void;
  private readonly listeners = new Set<AuthListener>();
  private validation:
    | {
        token: string;
        generation: number;
        promise: Promise<RestGoResult<RestGoSession | null>>;
      }
    | undefined;

  constructor(
    private readonly transport: RestGoTransport,
    options: RestGoClientOptions,
  ) {
    this.store = new RestGoSessionStore(transport.baseUrl, options);
    this.automatic = options.autoRefreshToken !== false;
    this.restored = this.store.read();
    transport.sessionVersion = () => this.generation;
    transport.session = () =>
      this.current ??
      (this.restored
        ? {
            ...this.restored,
            // The cached identity is never used as identity evidence.
            user: {
              id: '',
              email: '',
              fullName: '',
              avatarUrl: null,
              active: false,
              emailConfirmed: false,
            },
          }
        : null);
    transport.prepareSession = async () => {
      if (this.disposed || this.closing) return this.cancelled();
      await this.synchronize();
      const value = this.current ?? this.restored;
      if (this.automatic && value?.refreshToken && Date.parse(value.expiresAt) <= Date.now()) {
        const result = await this.refreshSession();
        if (result.error) return result;
      }
      return success(null);
    };
    transport.unauthorized = async (token, authoritative) => {
      if (this.disposed || this.closing) return this.cancelled();
      if (this.token() !== token) return success(cloneSession(this.current));
      if (!authoritative) return this.getSession();
      if (this.automatic && (this.current ?? this.restored)?.refreshToken)
        return this.refreshSession();
      this.clear(token);
      return success(null);
    };
    this.unsubscribeStorage = this.store.subscribe(() => {
      void this.synchronize();
    });
    this.ready = Promise.resolve().then(() => this.getSession());
  }

  /** Stop timers/listeners without revoking or deleting persisted credentials. */
  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.stopTimer();
    this.unsubscribeStorage();
    this.listeners.clear();
  }

  /** Local snapshot; reading it does not issue a request or validate the session. */
  get CurrentUser(): RestGoCurrentUser | null {
    const user = this.disposed || this.closing ? undefined : this.current?.user;
    return user
      ? Object.freeze({
          nome: user.fullName,
          email: user.email,
          id: user.id,
          emailconfirmed: user.emailConfirmed,
          ativo: user.active,
        })
      : null;
  }

  private stopTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delay?: number): void {
    this.stopTimer();
    const value = this.current ?? this.restored;
    if (
      !this.automatic ||
      !value?.refreshToken ||
      this.disposed ||
      this.closing ||
      typeof window === 'undefined'
    )
      return;
    const remaining = Date.parse(value.expiresAt) - Date.now();
    const margin = Math.min(60_000, Math.max(0, remaining * 0.1));
    const wait =
      delay ??
      (this.retryError ? Math.max(0, this.retryAt - Date.now()) : Math.max(0, remaining - margin));
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.refreshSession();
      },
      Math.min(2_147_483_647, Math.max(0, wait)),
    );
  }

  private async synchronize(): Promise<void> {
    if (!this.store.persistent || this.disposed || this.closing || this.refresh) return;
    const stored = this.store.read();
    const local = this.current ?? this.restored;
    if (stored?.token === local?.token && stored?.refreshToken === local?.refreshToken) return;
    if (!stored) {
      if (this.token()) this.clear();
      return;
    }
    this.generation++;
    this.current = null;
    this.restored = stored;
    this.retryAt = 0;
    this.retryError = undefined;
    await this.getSession();
  }

  /** POST /auth/refresh, with single-use rotation serialized across callers and tabs. */
  refreshSession(): Promise<RestGoResult<RestGoSession>> {
    if (this.disposed || this.closing) return Promise.resolve(this.cancelled());
    if (this.refresh?.generation === this.generation) return this.refresh.promise;
    if (this.retryError && Date.now() < this.retryAt)
      return Promise.resolve({ data: null, error: this.retryError });
    const value = this.current ?? this.restored;
    if (!value?.refreshToken)
      return Promise.resolve(
        failure('Sign in again to obtain a refresh token.', 'AUTH_REQUIRED', 401),
      );
    const work: RefreshWork = {
      generation: this.generation,
      promise: Promise.resolve(this.cancelled()),
    };
    this.refresh = work;
    work.promise = this.store
      .exclusive(() => this.rotate(value, work))
      .then((result) => {
        if (this.refresh === work) this.refresh = undefined;
        if (work.generation === this.generation && result.error) {
          if (
            result.error.code === 'NETWORK_ERROR' ||
            result.error.status === 429 ||
            result.error.status >= 500
          ) {
            const wait = Math.max(this.retryDelay, result.error.retryAfterMs ?? 0);
            this.retryError = result.error;
            this.retryAt = Date.now() + wait;
            this.retryDelay = Math.min(60_000, this.retryDelay * 2);
            this.schedule(wait);
          } else this.stopTimer();
        }
        return result;
      });
    return work.promise;
  }

  private async rotate(
    value: StoredSession,
    work: RefreshWork,
  ): Promise<RestGoResult<RestGoSession>> {
    if (work.generation !== this.generation || this.disposed) return this.cancelled();
    // Another tab may have already rotated, logged in, or logged out while we waited.
    const stored = this.store.read();
    if (this.store.persistent && !stored) {
      this.clear(value.token);
      return this.cancelled();
    }
    if (stored && (stored.token !== value.token || stored.refreshToken !== value.refreshToken)) {
      const checked = await this.transport.request<unknown>('/auth/session', {
        token: stored.token,
        skipUnauthorized: true,
      });
      if (work.generation !== this.generation) return this.cancelled();
      if (!checked.error) {
        if (!isRecord(checked.data) || checked.data.success !== true || !isUser(checked.data.user))
          return failure('RestGo returned an invalid session response.', 'INVALID_RESPONSE');
        const session = { ...stored, user: checked.data.user };
        if (this.current && this.current.user.id !== session.user.id) {
          this.generation++;
          this.apply(session, 'SIGNED_IN');
          return this.cancelled();
        }
        this.apply(session, 'TOKEN_REFRESHED');
        return success(cloneSession(session) as RestGoSession);
      }
      if (checked.error.status !== 401) return checked;
      value = stored;
    }
    if (!value.refreshToken)
      return failure('Sign in again to obtain a refresh token.', 'AUTH_REQUIRED', 401);
    const result = await this.transport.request<unknown>('/auth/refresh', {
      method: 'POST',
      auth: 'none',
      body: { refreshToken: value.refreshToken },
    });
    if (
      !result.error &&
      isSession(result.data) &&
      result.data.refreshToken &&
      result.data.refreshToken !== value.refreshToken &&
      Date.parse(result.data.expiresAt) > Date.now() &&
      Date.parse(result.data.refreshExpiresAt!) > Date.now()
    )
      work.rotated = result.data;
    const latest = this.store.read();
    if (
      this.disposed &&
      work.rotated &&
      this.store.persistent &&
      latest?.token === value.token &&
      latest.refreshToken === value.refreshToken
    ) {
      // Rotation may already have consumed the old token when a preview/client is disposed.
      this.store.write(work.rotated);
    }
    if (work.generation !== this.generation || this.disposed) return this.cancelled();
    if (
      this.store.persistent &&
      (latest?.token !== value.token || latest?.refreshToken !== value.refreshToken)
    )
      return this.cancelled();
    if (result.error) {
      if (result.error.status === 401) this.clear();
      return result;
    }
    if (!work.rotated)
      return failure('RestGo returned an invalid refresh response.', 'INVALID_RESPONSE');
    this.apply(work.rotated, 'TOKEN_REFRESHED');
    return success(cloneSession(work.rotated) as RestGoSession);
  }

  private token(): string | undefined {
    return this.current?.token ?? this.restored?.token;
  }

  private emit(event: RestGoAuthEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event, cloneSession(this.current));
      } catch {
        // Consumer listeners must not change the outcome of a server operation.
      }
    }
  }

  private apply(session: RestGoSession, event: RestGoAuthEvent): void {
    const previous = this.current ?? this.restored;
    const changed =
      previous?.token !== session.token || previous?.refreshToken !== session.refreshToken;
    this.current = { ...session, user: { ...session.user } };
    this.restored = null;
    this.store.write(this.current);
    if (changed || event === 'SIGNED_IN') {
      this.retryAt = 0;
      this.retryDelay = 1000;
      this.retryError = undefined;
    }
    this.schedule();
    this.emit(event);
  }

  private clear(token?: string): void {
    if (token && token !== this.token()) return;
    const expectedToken = this.token();
    this.stopTimer();
    this.current = null;
    this.restored = null;
    this.retryAt = 0;
    this.retryError = undefined;
    this.store.write(null, expectedToken);
    this.emit('SIGNED_OUT');
  }

  onAuthStateChange(callback: AuthListener): { unsubscribe: () => void } {
    this.listeners.add(callback);
    void this.ready.then(() => {
      if (this.listeners.has(callback)) {
        try {
          callback('INITIAL_SESSION', cloneSession(this.current));
        } catch {
          // Isolate subscriber exceptions from initialization.
        }
      }
    });
    return {
      unsubscribe: () => {
        this.listeners.delete(callback);
      },
    };
  }

  async signInWithPassword(input: RestGoSignInInput): Promise<RestGoResult<RestGoSession>> {
    if (this.disposed) return this.cancelled();
    const pending = this.refresh;
    const generation = ++this.generation;
    this.closing = false;
    this.stopTimer();
    const result = await this.transport.request<unknown>('/auth/token', {
      method: 'POST',
      body: input,
      auth: 'none',
    });
    if (generation !== this.generation) return this.cancelled();
    if (result.error) {
      await this.restoreAfterFailure(generation, pending);
      return generation === this.generation ? result : this.cancelled();
    }
    if (!isSession(result.data)) {
      await this.restoreAfterFailure(generation, pending);
      if (generation !== this.generation) return this.cancelled();
      return failure('RestGo returned an invalid login response.', 'INVALID_RESPONSE');
    }
    const session: RestGoSession = {
      ...credentials(result.data),
      user: result.data.user,
    };
    this.apply(session, 'SIGNED_IN');
    return success(cloneSession(session) as RestGoSession);
  }

  private async restoreAfterFailure(generation: number, pending?: RefreshWork): Promise<void> {
    if (pending) await pending.promise;
    if (generation !== this.generation || this.disposed) return;
    const local = this.current ?? this.restored;
    const stored = this.store.read();
    if (
      pending?.rotated &&
      (!this.store.persistent ||
        (stored?.token === local?.token && stored?.refreshToken === local?.refreshToken))
    ) {
      this.apply(pending.rotated, 'TOKEN_REFRESHED');
    } else this.schedule();
  }

  /** Public registration. The server must allow anonymous signup. Does not start a session. */
  signUp(input: RestGoSignUpInput): Promise<RestGoResult<RestGoManagedUser>> {
    return this.transport.request('/auth/users', { method: 'POST', body: input, auth: 'none' });
  }

  async signOut(): Promise<RestGoResult<RestGoSuccess>> {
    if (this.disposed) return this.cancelled();
    const pending = this.refresh;
    const previousGeneration = this.generation;
    if (
      !pending &&
      (this.current ?? this.restored)?.refreshToken &&
      Date.parse((this.current ?? this.restored)!.expiresAt) <= Date.now()
    ) {
      const renewed = await this.refreshSession();
      if (previousGeneration !== this.generation) return this.cancelled();
      if (renewed.error && renewed.error.status !== 401) return renewed;
    }
    const generation = ++this.generation;
    this.closing = true;
    this.stopTimer();
    if (pending) {
      await pending.promise;
      if (generation !== this.generation) return this.cancelled();
    }
    return this.store.exclusive(async () => {
      if (generation !== this.generation) return this.cancelled();
      const stored = this.store.read();
      const local = this.current ?? this.restored;
      if (
        pending?.rotated &&
        (!this.store.persistent ||
          (stored?.token === local?.token && stored?.refreshToken === local?.refreshToken))
      ) {
        this.apply(pending.rotated, 'TOKEN_REFRESHED');
      } else if (this.store.persistent) {
        this.current = null;
        this.restored = stored;
      }
      const token = this.token();
      if (!token) {
        this.clear();
        this.closing = false;
        return success({ success: true });
      }
      const result = await this.transport.request<RestGoSuccess>('/auth/logout', {
        method: 'POST',
        token,
        skipUnauthorized: true,
      });
      if (generation !== this.generation) return this.cancelled();
      if (!result.error || result.error.status === 401) this.clear(token);
      this.closing = false;
      if (result.error && result.error.status !== 401) this.schedule();
      return result;
    }, false);
  }

  /** Always asks the server; JWT expiry metadata is not proof of an active session. */
  getSession(): Promise<RestGoResult<RestGoSession | null>> {
    if (this.disposed || this.closing) return Promise.resolve(this.cancelled());
    const token = this.token();
    if (!token) return Promise.resolve(success(null));
    if (this.validation?.token === token && this.validation.generation === this.generation) {
      return this.validation.promise;
    }
    const generation = this.generation;
    const promise = this.validate(token, generation);
    this.validation = { token, generation, promise };
    void promise.then(() => {
      if (this.validation?.promise === promise) this.validation = undefined;
    });
    return promise;
  }

  private async validate(
    token: string,
    generation: number,
  ): Promise<RestGoResult<RestGoSession | null>> {
    const value = this.current ?? this.restored;
    if (this.automatic && value?.refreshToken && Date.parse(value.expiresAt) <= Date.now())
      return this.refreshSession();
    const result = await this.transport.request<unknown>('/auth/session', {
      token,
      skipUnauthorized: true,
    });
    if (generation !== this.generation || this.token() !== token) return this.cancelled();
    const stored = this.store.read();
    if (
      this.store.persistent &&
      (stored?.token !== value?.token || stored?.refreshToken !== value?.refreshToken)
    ) {
      if (
        this.current &&
        stored?.token === this.current.token &&
        stored?.refreshToken === this.current.refreshToken
      )
        return success(cloneSession(this.current));
      await this.synchronize();
      return this.getSession();
    }
    if (result.error) {
      if (result.error.status === 401) {
        if (this.automatic && value?.refreshToken) return this.refreshSession();
        this.clear(token);
      } else this.schedule();
      return result;
    }
    if (!isRecord(result.data) || result.data.success !== true || !isUser(result.data.user)) {
      return failure('RestGo returned an invalid session response.', 'INVALID_RESPONSE');
    }
    const expiresAt = this.current?.expiresAt ?? this.restored?.expiresAt;
    if (!expiresAt) return failure('Session expiry metadata is missing.', 'INVALID_RESPONSE');
    const session = { ...credentials(value ?? { token, expiresAt }), user: result.data.user };
    this.apply(session, 'SESSION_VALIDATED');
    return success(cloneSession(session));
  }

  async getUser(): Promise<RestGoResult<RestGoUser | null>> {
    const result = await this.getSession();
    return result.error ? result : success(result.data?.user ?? null);
  }

  async setSession(input: StoredSession): Promise<RestGoResult<RestGoSession>> {
    if (this.disposed) return this.cancelled();
    if (!isStoredSession(input)) {
      return failure('A token and valid expiresAt are required.', 'INVALID_ARGUMENT');
    }
    const generation = ++this.generation;
    this.closing = false;
    let result = await this.transport.request<unknown>('/auth/session', {
      token: input.token,
      skipUnauthorized: true,
    });
    if (generation !== this.generation) return this.cancelled();
    if (result.error?.status === 401 && input.refreshToken) {
      result = await this.store.exclusive(() => {
        if (generation !== this.generation) return Promise.resolve(this.cancelled());
        return this.transport.request<unknown>('/auth/refresh', {
          method: 'POST',
          auth: 'none',
          body: { refreshToken: input.refreshToken },
        });
      });
      if (generation !== this.generation) return this.cancelled();
      if (result.error) return result;
      if (!isSession(result.data) || !result.data.refreshToken)
        return failure('RestGo returned an invalid refresh response.', 'INVALID_RESPONSE');
      this.apply(result.data, 'SIGNED_IN');
      return success(cloneSession(result.data) as RestGoSession);
    }
    if (result.error) return result;
    if (!isRecord(result.data) || result.data.success !== true || !isUser(result.data.user)) {
      return failure('RestGo returned an invalid session response.', 'INVALID_RESPONSE');
    }
    const session = { ...credentials(input), user: result.data.user };
    this.apply(session, 'SIGNED_IN');
    return success(cloneSession(session) as RestGoSession);
  }

  resetPasswordForEmail(
    email: string,
    options: { url?: string } = {},
  ): Promise<RestGoResult<RestGoSuccess>> {
    return this.transport.request('/auth/password-reset/request', {
      method: 'POST',
      body: { email, ...options },
      auth: 'none',
    });
  }

  confirmPasswordReset(input: {
    token: string;
    password: string;
  }): Promise<RestGoResult<RestGoSuccess>> {
    return this.transport.request('/auth/password-reset/confirm', {
      method: 'POST',
      body: input,
      auth: 'none',
    });
  }

  confirmEmail(token: string): Promise<RestGoResult<RestGoSuccess>> {
    return this.transport.request('/auth/email-confirmation/confirm', {
      method: 'POST',
      body: { token },
      auth: 'none',
    });
  }

  async uploadAvatar(
    file: Blob,
    options: { name?: string; signal?: AbortSignal } = {},
  ): Promise<RestGoResult<{ avatarUrl: string | null }>> {
    const body = new FormData();
    body.append(
      'file',
      file,
      options.name ?? (typeof File !== 'undefined' && file instanceof File ? file.name : 'avatar'),
    );
    return this.avatarRequest('PUT', { body, signal: options.signal });
  }

  deleteAvatar(
    options: RestGoRequestOptions = {},
  ): Promise<RestGoResult<{ avatarUrl: string | null }>> {
    return this.avatarRequest('DELETE', options);
  }

  private async avatarRequest(
    method: string,
    options: RestGoRequestOptions & { body?: FormData },
  ): Promise<RestGoResult<{ avatarUrl: string | null }>> {
    const generation = this.generation;
    const result = await this.transport.request<{ avatarUrl: string | null }>('/auth/avatar', {
      ...options,
      method,
      auth: 'session',
      sessionAuthority: true,
    });
    if (!result.error && this.current && this.generation === generation) {
      this.apply(
        { ...this.current, user: { ...this.current.user, avatarUrl: result.data.avatarUrl } },
        'USER_UPDATED',
      );
    }
    return result;
  }

  private cancelled<T>(): RestGoResult<T> {
    return failure(
      'A newer authentication operation superseded this request.',
      'AUTH_OPERATION_CANCELLED',
    );
  }
}
