import type { RestGoError } from './errors';

export type RestGoSessionStorage = 'local' | 'session' | 'memory';

/** Browser-safe durable storage supplied by an embedding host. */
export interface RestGoSessionStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  subscribe?(callback: () => void): () => void;
}

export interface RestGoClientOptions {
  persistSession?: boolean;
  /** Renew before JWT expiry and retry a rejected session request once. Defaults to true. */
  autoRefreshToken?: boolean;
  sessionStorage?: RestGoSessionStorage;
  storageKey?: string;
  /** Used only with persistent local sessions; never changes session/memory semantics. */
  storage?: RestGoSessionStorageAdapter;
  apiVersion?: number;
  defaultDatabase?: string;
  fetch?: typeof fetch;
  /** An active RestGo API token. Never supply RESTGO_AUTHORIZATION here. */
  apiToken?: string;
}

export interface RestGoUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  active: boolean;
  emailConfirmed: boolean;
}

/** Readonly projection of the last server-confirmed user identity. */
export interface RestGoCurrentUser {
  readonly nome: string;
  readonly email: string;
  readonly id: string;
  readonly emailconfirmed: boolean;
  readonly ativo: boolean;
}

export interface RestGoManagedUser extends Omit<RestGoUser, 'avatarUrl'> {
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RestGoSession {
  token: string;
  /** Used to schedule renewal; the server remains the authority on session validity. */
  expiresAt: string;
  /** Both refresh fields are absent for legacy JWT-only sessions. */
  refreshToken?: string;
  refreshExpiresAt?: string;
  user: RestGoUser;
}

/** Result of login; the boolean also narrows data and error in authored code. */
export type RestGoLoginResult =
  | { sucess: true; data: RestGoSession; error: null }
  | { sucess: false; data: null; error: RestGoError };

export type RestGoAuthEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'SESSION_VALIDATED'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';

export interface RestGoSignInInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface RestGoSignUpInput {
  email: string;
  password: string;
  fullName?: string;
  active?: boolean;
}

/** Self-service fields; activation and confirmation remain server-controlled. */
export interface RestGoUpdateUserInput {
  fullName?: string;
  email?: string;
  password?: string;
  /** Required when changing email or password. */
  currentPassword?: string;
  /** Optional absolute HTTP(S) destination for a confirmation email after a profile update. */
  emailConfirmationUrl?: string;
}

export interface RestGoUpdateUserResult {
  user: RestGoUser;
  /** Credential changes revoke all sessions and require a new login. */
  sessionRevoked: boolean;
}

export interface RestGoSuccess {
  success: boolean;
  message?: string;
}

export type RestGoQueryValue = string | number | boolean | null | undefined;
export type RestGoQuery = Record<string, RestGoQueryValue | readonly RestGoQueryValue[]>;
export type RestGoCredentialMode = 'auto' | 'session' | 'apiToken' | 'none';

export interface RestGoRequestOptions {
  query?: RestGoQuery;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export interface RestGoDynamicOptions extends RestGoRequestOptions {
  auth?: RestGoCredentialMode;
  version?: number;
  pagination?: 'exact' | 'simple' | 'cursor';
  cursorColumn?: string;
  cursor?: string;
  page?: number;
}

export interface RestGoDynamicMetadata {
  page?: number;
  total_pages?: number;
  has_more?: boolean;
  next_cursor?: string;
}

export interface RestGoListOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  ownerId?: string;
  signal?: AbortSignal;
}

export interface RestGoListPage<T> {
  data: T[];
  page: number;
  page_size: number;
  has_more: boolean;
}

export type RestGoList<T> = T[] | RestGoListPage<T>;

export interface RestGoStoredFile {
  id: string;
  ownerId?: string;
  ownerEmail?: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
}

export interface RestGoFileOptions {
  name?: string;
  isPublic?: boolean;
  ownerId?: string;
  signal?: AbortSignal;
  /** Actual multipart upload progress. The percentage is null when it cannot be measured. */
  onUploadProgress?: (progress: RestGoUploadProgress) => void;
}

export interface RestGoUploadProgress {
  loaded: number;
  total: number | null;
  percentage: number | null;
  lengthComputable: boolean;
}

export interface RestGoFileUpdate extends RestGoFileOptions {
  file?: Blob;
}

export interface RestGoStorageUsage {
  usedBytes: number;
  capacityBytes: number;
  availableBytes: number;
}
