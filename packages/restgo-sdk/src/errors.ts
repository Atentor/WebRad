export type RestGoErrorCode =
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'ABORTED'
  | 'INVALID_RESPONSE'
  | 'INVALID_ARGUMENT'
  | 'AUTH_REQUIRED'
  | 'API_TOKEN_REQUIRED'
  | 'REFRESH_LOCK_UNAVAILABLE'
  | 'AUTH_OPERATION_CANCELLED';

export class RestGoError extends Error {
  readonly status: number;
  readonly code: RestGoErrorCode;
  readonly details: unknown;
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    code: RestGoErrorCode,
    status = 0,
    details?: unknown,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RestGoError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfterMs = retryAfterMs;
  }
}

export type RestGoResult<T> = { data: T; error: null } | { data: null; error: RestGoError };

export function success<T>(data: T): RestGoResult<T> {
  return { data, error: null };
}

export function failure(
  message: string,
  code: RestGoErrorCode,
  status = 0,
  details?: unknown,
  retryAfterMs?: number,
): { data: null; error: RestGoError } {
  return { data: null, error: new RestGoError(message, code, status, details, retryAfterMs) };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
