import { failure, isRecord, success, type RestGoResult } from './errors';
import { RestGoSessionStore, type StoredSession } from './session-storage';
import { type RestGoTransport } from './transport';
import type {
  RestGoAuthEvent,
  RestGoClientOptions,
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

export class RestGoAuthClient {
  /** Startup checks persisted credentials with GET /auth/session. */
  readonly ready: Promise<RestGoResult<RestGoSession | null>>;
  private readonly store: RestGoSessionStore;
  private current: RestGoSession | null = null;
  private restored: StoredSession | null;
  private generation = 0;
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
    this.restored = this.store.read();
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
    transport.unauthorized = async (token, authoritative) => {
      if (this.token() !== token) return;
      if (authoritative) this.clear(token);
      else await this.getSession();
    };
    this.ready = Promise.resolve().then(() => this.getSession());
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
    this.current = { ...session, user: { ...session.user } };
    this.restored = null;
    this.store.write(this.current);
    this.emit(event);
  }

  private clear(token?: string): void {
    if (token && token !== this.token()) return;
    this.current = null;
    this.restored = null;
    this.store.write(null);
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
    const generation = ++this.generation;
    const result = await this.transport.request<unknown>('/auth/token', {
      method: 'POST',
      body: input,
      auth: 'none',
    });
    if (generation !== this.generation) return this.cancelled();
    if (result.error) return result;
    if (
      !isRecord(result.data) ||
      typeof result.data.token !== 'string' ||
      !result.data.token ||
      typeof result.data.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(result.data.expiresAt)) ||
      !isUser(result.data.user)
    ) {
      return failure('RestGo returned an invalid login response.', 'INVALID_RESPONSE');
    }
    const session: RestGoSession = {
      token: result.data.token,
      expiresAt: result.data.expiresAt,
      user: result.data.user,
    };
    this.apply(session, 'SIGNED_IN');
    return success(cloneSession(session) as RestGoSession);
  }

  /** RestGo requires an API token to create a common user. Does not log the user in. */
  signUp(input: RestGoSignUpInput): Promise<RestGoResult<RestGoManagedUser>> {
    return this.transport.request('/auth/users', { method: 'POST', body: input, auth: 'apiToken' });
  }

  async signOut(): Promise<RestGoResult<RestGoSuccess>> {
    const generation = ++this.generation;
    const token = this.token();
    if (!token) {
      this.clear();
      return success({ success: true });
    }
    const result = await this.transport.request<RestGoSuccess>('/auth/logout', {
      method: 'POST',
      token,
      skipUnauthorized: true,
    });
    if (generation !== this.generation) return this.cancelled();
    if (!result.error || result.error.status === 401) this.clear(token);
    return result;
  }

  /** Always asks the server; JWT expiry metadata is not proof of an active session. */
  getSession(): Promise<RestGoResult<RestGoSession | null>> {
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
    const result = await this.transport.request<unknown>('/auth/session', {
      token,
      skipUnauthorized: true,
    });
    if (generation !== this.generation || this.token() !== token) return this.cancelled();
    if (result.error) {
      if (result.error.status === 401) this.clear(token);
      return result;
    }
    if (!isRecord(result.data) || result.data.success !== true || !isUser(result.data.user)) {
      return failure('RestGo returned an invalid session response.', 'INVALID_RESPONSE');
    }
    const expiresAt = this.current?.expiresAt ?? this.restored?.expiresAt;
    if (!expiresAt) return failure('Session expiry metadata is missing.', 'INVALID_RESPONSE');
    const session = { token, expiresAt, user: result.data.user };
    this.apply(session, 'SESSION_VALIDATED');
    return success(cloneSession(session));
  }

  async getUser(): Promise<RestGoResult<RestGoUser | null>> {
    const result = await this.getSession();
    return result.error ? result : success(result.data?.user ?? null);
  }

  async setSession(input: StoredSession): Promise<RestGoResult<RestGoSession>> {
    if (!input.token.trim() || !Number.isFinite(Date.parse(input.expiresAt))) {
      return failure('A token and valid expiresAt are required.', 'INVALID_ARGUMENT');
    }
    const generation = ++this.generation;
    const result = await this.transport.request<unknown>('/auth/session', {
      token: input.token,
      skipUnauthorized: true,
    });
    if (generation !== this.generation) return this.cancelled();
    if (result.error) return result;
    if (!isRecord(result.data) || result.data.success !== true || !isUser(result.data.user)) {
      return failure('RestGo returned an invalid session response.', 'INVALID_RESPONSE');
    }
    const session = { token: input.token, expiresAt: input.expiresAt, user: result.data.user };
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
    const token = this.token();
    const result = await this.transport.request<{ avatarUrl: string | null }>('/auth/avatar', {
      ...options,
      method,
      auth: 'session',
      sessionAuthority: true,
    });
    if (!result.error && this.current && this.current.token === token) {
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
