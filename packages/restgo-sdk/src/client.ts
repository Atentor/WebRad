import { RestGoApiClient, type RestGoEndpoint, type RestGoEndpointOptions } from './api';
import { RestGoAuthClient } from './auth';
import { RestGoStorageClient } from './storage';
import { RestGoVideosClient } from './videos';
import { RestGoTransport } from './transport';
import type { RestGoResult } from './errors';
import type {
  RestGoAuthEvent,
  RestGoClientOptions,
  RestGoCurrentUser,
  RestGoLoginResult,
  RestGoSession,
  RestGoSuccess,
  RestGoUser,
} from './types';

export class RestGoClient {
  readonly auth: RestGoAuthClient;
  readonly storage: RestGoStorageClient;
  readonly videos: RestGoVideosClient;
  readonly api: RestGoApiClient;
  readonly baseUrl: string;

  constructor(baseUrl: string, options: RestGoClientOptions = {}) {
    const transport = new RestGoTransport(baseUrl, options);
    this.baseUrl = transport.baseUrl;
    this.auth = new RestGoAuthClient(transport, options);
    this.storage = new RestGoStorageClient(transport);
    this.videos = new RestGoVideosClient(transport);
    this.api = new RestGoApiClient(transport);
  }

  from<T = unknown>(endpoint: string, options: RestGoEndpointOptions = {}): RestGoEndpoint<T> {
    return this.api.endpoint<T>(endpoint, options);
  }

  /** Sign in with positional parameters and report whether this login succeeded. */
  async login(email: string, password: string, remember = false): Promise<RestGoLoginResult> {
    const result = await this.auth.signInWithPassword({ email, password, remember });
    return result.error === null ? { ...result, sucess: true } : { ...result, sucess: false };
  }

  logout(): Promise<RestGoResult<RestGoSuccess>> {
    return this.auth.signOut();
  }

  getSession(): Promise<RestGoResult<RestGoSession | null>> {
    return this.auth.getSession();
  }

  getUser(): Promise<RestGoResult<RestGoUser | null>> {
    return this.auth.getUser();
  }

  /** Last server-confirmed identity, or null before authentication/restoration. */
  get CurrentUser(): RestGoCurrentUser | null {
    return this.auth.CurrentUser;
  }

  refreshSession(): Promise<RestGoResult<RestGoSession>> {
    return this.auth.refreshSession();
  }

  onAuthStateChange(callback: (event: RestGoAuthEvent, session: RestGoSession | null) => void): {
    unsubscribe: () => void;
  } {
    return this.auth.onAuthStateChange(callback);
  }

  /** Release browser listeners and automatic renewal without logging the user out. */
  dispose(): void {
    this.auth.dispose();
  }
}

export function createClient(baseUrl: string, options: RestGoClientOptions = {}): RestGoClient {
  return new RestGoClient(baseUrl, options);
}
