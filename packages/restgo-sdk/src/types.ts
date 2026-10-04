export type RestGoSessionStorage = 'local' | 'session' | 'memory';

export interface RestGoClientOptions {
  persistSession?: boolean;
  sessionStorage?: RestGoSessionStorage;
  storageKey?: string;
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

export interface RestGoManagedUser extends Omit<RestGoUser, 'avatarUrl'> {
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RestGoSession {
  token: string;
  /** Display metadata only. GET /auth/session remains the authority. */
  expiresAt: string;
  user: RestGoUser;
}

export type RestGoAuthEvent =
  'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'SESSION_VALIDATED' | 'USER_UPDATED';

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
}

export interface RestGoFileUpdate extends RestGoFileOptions {
  file?: Blob;
}

export interface RestGoStorageUsage {
  usedBytes: number;
  capacityBytes: number;
  availableBytes: number;
}
