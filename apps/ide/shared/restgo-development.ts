import type { RestGoAdminStatus, RestGoAdminTarget } from './restgo-admin';

/** IDE-only user session. No password or refresh token crosses back to the renderer. */
export interface RestGoDevelopmentStatus extends RestGoAdminStatus {
  readonly email: string | null;
}

export interface RestGoDevelopmentLogin extends RestGoAdminTarget {
  readonly email: string;
  readonly password: string;
  readonly remember: boolean;
}

export interface RestGoDevelopmentBridge {
  status(request: RestGoAdminTarget): Promise<RestGoDevelopmentStatus>;
  login(request: RestGoDevelopmentLogin): Promise<RestGoDevelopmentStatus>;
  logout(request: RestGoAdminTarget): Promise<void>;
  /** Validates/renews the saved session before a design-time JWT request. */
  token(request: RestGoAdminTarget): Promise<string>;
}
