import { isRestGoPaymentMode, type RestGoPaymentMode } from '@webrad/restgo-sdk';
import { parsePaymentsCheckpoint } from './payments-checkpoint.js';
import {
  WebPaymentsError,
  type WebPaymentsCheckpoint,
  type WebPaymentsStorageAdapter,
} from './payments-types.js';

/** Canonical API identity from the configured project client and customer session. */
export interface PaymentStoreIdentity {
  readonly baseUrl: string;
  readonly gatewaySlug: string;
  readonly userId: string;
}

function paymentAttemptKey(
  identity: PaymentStoreIdentity,
  sourceKey: string,
  mode: RestGoPaymentMode,
): string {
  return `webrad:payments:v1:${JSON.stringify([
    'attempt',
    identity.baseUrl,
    identity.gatewaySlug,
    identity.userId,
    sourceKey,
    mode,
  ])}`;
}

function paymentRecentKey(identity: PaymentStoreIdentity, scope: string): string {
  return `webrad:payments:v1:${JSON.stringify([
    'recent',
    identity.baseUrl,
    identity.gatewaySlug,
    identity.userId,
    scope,
  ])}`;
}

function paymentSharedRecentKey(identity: PaymentStoreIdentity): string {
  return `webrad:payments:v1:${JSON.stringify(['recent-shared', identity.baseUrl, identity.gatewaySlug, identity.userId])}`;
}

function paymentStorageUnavailable(): WebPaymentsError {
  return new WebPaymentsError(
    'storage-unavailable',
    'Durable payment recovery storage is unavailable. Enable browser storage or provide a Payments storage adapter before creating a charge.',
  );
}

function paymentStorageCorrupt(): WebPaymentsError {
  return new WebPaymentsError(
    'storage-corrupt',
    'Saved payment recovery data is invalid or belongs to another context. Preserve the saved data and contact support before starting another attempt.',
  );
}

function paymentStoredCheckpoint(value: string): WebPaymentsCheckpoint {
  try {
    return parsePaymentsCheckpoint(JSON.parse(value));
  } catch {
    throw paymentStorageCorrupt();
  }
}

/** Browser-only durable attempts. No credential data and no silent memory fallback. */
export class PaymentAttemptStore {
  readonly #adapter: WebPaymentsStorageAdapter | undefined;
  readonly #scope: string;

  public constructor(adapter?: WebPaymentsStorageAdapter, scope = '') {
    this.#adapter = adapter;
    this.#scope = scope;
  }

  public read(
    identity: PaymentStoreIdentity,
    sourceKey: string,
    mode: RestGoPaymentMode,
  ): WebPaymentsCheckpoint | null {
    const saved = this.#get(paymentAttemptKey(identity, sourceKey, mode));
    if (saved === null) return null;
    const checkpoint = paymentStoredCheckpoint(saved);
    if (
      checkpoint.baseUrl !== identity.baseUrl ||
      checkpoint.gatewaySlug !== identity.gatewaySlug ||
      checkpoint.userId !== identity.userId ||
      checkpoint.sourceKey !== sourceKey ||
      checkpoint.mode !== mode
    )
      throw paymentStorageCorrupt();
    return checkpoint;
  }

  public latest(
    identity: PaymentStoreIdentity,
    includeOtherScopes = false,
  ): WebPaymentsCheckpoint | null {
    const saved =
      this.#get(paymentRecentKey(identity, this.#scope)) ??
      (includeOtherScopes ? this.#get(paymentSharedRecentKey(identity)) : null);
    if (saved === null) return null;
    let pointer: unknown;
    try {
      pointer = JSON.parse(saved);
    } catch {
      throw paymentStorageCorrupt();
    }
    if (typeof pointer !== 'object' || pointer === null || Array.isArray(pointer))
      throw paymentStorageCorrupt();
    const record = pointer as Record<string, unknown>;
    if (
      record.version !== 1 ||
      typeof record.sourceKey !== 'string' ||
      record.sourceKey.length === 0 ||
      record.sourceKey.length > 1024 ||
      !isRestGoPaymentMode(record.mode) ||
      Object.keys(record).some((key) => !['version', 'sourceKey', 'mode'].includes(key))
    )
      throw paymentStorageCorrupt();
    const checkpoint = this.read(identity, record.sourceKey, record.mode);
    if (checkpoint === null) throw paymentStorageCorrupt();
    return checkpoint;
  }

  /** Save the attempt first so a failed recent-pointer write cannot lose its key. */
  public save(checkpoint: WebPaymentsCheckpoint): void {
    let parsed: WebPaymentsCheckpoint;
    try {
      parsed = parsePaymentsCheckpoint(checkpoint);
    } catch {
      throw paymentStorageCorrupt();
    }
    const existing = this.read(parsed, parsed.sourceKey, parsed.mode);
    if (
      existing &&
      (existing.idempotencyKey !== parsed.idempotencyKey ||
        (existing.operationId && parsed.operationId && existing.operationId !== parsed.operationId))
    )
      throw new WebPaymentsError(
        'attempt-conflict',
        'This purchase already has another saved attempt or operation. Preserve its original recovery data.',
      );
    if (existing?.operationId && !parsed.operationId)
      parsed = Object.freeze({ ...parsed, operationId: existing.operationId });
    this.#set(paymentAttemptKey(parsed, parsed.sourceKey, parsed.mode), JSON.stringify(parsed));
    this.#set(
      paymentRecentKey(parsed, this.#scope),
      JSON.stringify({ version: 1, sourceKey: parsed.sourceKey, mode: parsed.mode }),
    );
    this.#set(
      paymentSharedRecentKey(parsed),
      JSON.stringify({ version: 1, sourceKey: parsed.sourceKey, mode: parsed.mode }),
    );
  }

  /** Serialize read/prepare/save/POST/recovery for the same purchase across tabs. */
  public async withLock<T>(
    identity: PaymentStoreIdentity,
    sourceKey: string,
    mode: RestGoPaymentMode,
    action: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw signal.reason;
    const name = paymentAttemptKey(identity, sourceKey, mode);
    if (this.#adapter?.withLock) return this.#adapter.withLock<T>(name, action, signal);

    let locks: LockManager | undefined;
    try {
      locks = globalThis.navigator?.locks;
    } catch {
      throw new WebPaymentsError(
        'storage-unavailable',
        'Browser payment locking is unavailable. Provide a Payments storage adapter with withLock support.',
      );
    }
    if (!locks || typeof locks.request !== 'function')
      throw new WebPaymentsError(
        'storage-unavailable',
        'Browser payment locking is unavailable. Provide a Payments storage adapter with withLock support.',
      );
    let acquired = false;
    try {
      return await locks.request(name, { mode: 'exclusive', signal }, async (lock) => {
        acquired = true;
        if (!lock)
          throw new WebPaymentsError(
            'storage-unavailable',
            'The payment recovery lock could not be acquired.',
          );
        if (signal?.aborted) throw signal.reason;
        return action();
      });
    } catch (error) {
      // Preserve cancellation and domain errors thrown by the protected action.
      if (acquired || signal?.aborted) throw error;
      throw new WebPaymentsError(
        'storage-unavailable',
        'The payment recovery lock could not be acquired. Retry when browser storage and locking are available.',
      );
    }
  }

  #storage(): WebPaymentsStorageAdapter {
    try {
      const storage = this.#adapter ?? globalThis.localStorage;
      if (
        !storage ||
        typeof storage.getItem !== 'function' ||
        typeof storage.setItem !== 'function' ||
        typeof storage.removeItem !== 'function'
      )
        throw paymentStorageUnavailable();
      return storage;
    } catch {
      throw paymentStorageUnavailable();
    }
  }

  #get(key: string): string | null {
    try {
      const value = this.#storage().getItem(key);
      if (value !== null && typeof value !== 'string') throw paymentStorageCorrupt();
      return value;
    } catch (error) {
      if (error instanceof WebPaymentsError) throw error;
      throw paymentStorageUnavailable();
    }
  }

  #set(key: string, value: string): void {
    try {
      const storage = this.#storage();
      storage.setItem(key, value);
      if (storage.getItem(key) !== value) throw paymentStorageUnavailable();
    } catch (error) {
      if (error instanceof WebPaymentsError) throw error;
      throw paymentStorageUnavailable();
    }
  }
}
