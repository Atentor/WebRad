import type { RestGoPaymentOperation } from '@webrad/restgo-sdk';
import type { WebNonvisualComponentOptions } from './component.js';

export interface WebPaymentsConfiguration extends WebNonvisualComponentOptions {
  readonly gatewaySlug?: string;
  readonly mode?: 'payment' | 'subscription';
  readonly enabled?: boolean;
  readonly pollInterval?: number;
  readonly pollTimeout?: number;
  readonly autoResume?: boolean;
  readonly autoWatch?: boolean;
  readonly persistAttempts?: boolean;
  /** Runtime-only durable adapter; never serialized into the Project Model. */
  readonly storage?: WebPaymentsStorageAdapter;
}

export interface WebPaymentsStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  withLock?<T>(name: string, action: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/** Application-owned recovery data. Save before POST and again before navigation. */
export interface WebPaymentsCheckpoint {
  readonly version: 1;
  readonly baseUrl: string;
  readonly gatewaySlug: string;
  readonly userId: string;
  readonly sourceKey: string;
  readonly mode: 'payment' | 'subscription';
  readonly idempotencyKey: string;
  readonly operationId?: string;
}

export interface WebPaymentsObservationOptions {
  readonly signal?: AbortSignal;
  readonly interval?: number;
  readonly timeout?: number;
}

export interface WebPaymentsCheckoutOptions extends WebPaymentsObservationOptions {
  /** Defaults to true. False prepares an open checkout for custom authored UI. */
  readonly openCheckout?: boolean;
}

export interface WebPaymentsResumeOptions extends WebPaymentsObservationOptions {
  readonly mode?: 'payment' | 'subscription';
  /** Defaults to the component's autoWatch setting. Never opens checkout. */
  readonly watch?: boolean;
}

export interface WebPaymentsConfirmationOptions extends WebPaymentsObservationOptions {
  readonly operationId?: string;
  /** Financial confirmation is enough by default; source synchronization is separate. */
  readonly waitForSynchronization?: boolean;
}

export type WebPaymentsState =
  | 'idle'
  | 'restoring'
  | 'preparing'
  | 'creating'
  | 'waiting'
  | 'opening'
  | 'watching'
  | 'refreshing'
  | 'loading-history'
  | 'canceling'
  | 'ready'
  | 'confirmed'
  | 'canceled'
  | 'uncertain'
  | 'failed'
  | 'error';

export interface WebPaymentsStateEventDetail {
  readonly previous: WebPaymentsState;
  readonly state: WebPaymentsState;
}

export interface WebPaymentsHistoryEventDetail {
  readonly items: readonly RestGoPaymentOperation[];
  readonly nextCursor: string;
  readonly hasMore: boolean;
}

export interface WebPaymentsResumeEventDetail {
  readonly checkpoint: WebPaymentsCheckpoint;
  readonly operation: RestGoPaymentOperation | null;
  readonly automatic: boolean;
}

export type WebPaymentsAction =
  | 'pay'
  | 'subscribe'
  | 'checkout'
  | 'resume'
  | 'refresh'
  | 'history'
  | 'load-more'
  | 'confirm'
  | 'create'
  | 'get'
  | 'list'
  | 'cancel'
  | 'wait'
  | 'watch';
export interface WebPaymentsOperationEventDetail {
  readonly previous: RestGoPaymentOperation | null;
  readonly operation: RestGoPaymentOperation | null;
}
export interface WebPaymentsCheckoutEventDetail {
  readonly operation: RestGoPaymentOperation;
}
export interface WebPaymentsSynchronizationEventDetail {
  readonly operation: RestGoPaymentOperation;
  readonly pending: boolean;
  readonly error: string | null;
}
export interface WebPaymentsErrorEventDetail {
  readonly action: WebPaymentsAction;
  readonly operationId: string | null;
  readonly error: Error;
}
export interface WebPaymentsRequestEventDetail {
  readonly action: WebPaymentsAction;
  readonly operationId: string | null;
  readonly error: Error | null;
}

export type WebPaymentsErrorKind =
  | 'invalid-argument'
  | 'not-configured'
  | 'auth-required'
  | 'context-changed'
  | 'disabled'
  | 'disposed'
  | 'busy'
  | 'attempt-required'
  | 'attempt-conflict'
  | 'checkout-uncertain'
  | 'checkout-unavailable'
  | 'timeout'
  | 'storage-unavailable'
  | 'storage-corrupt'
  | 'payment-failed'
  | 'synchronization-failed'
  | 'aborted';

/** Local orchestration errors; HTTP failures retain their original RestGoError. */
export class WebPaymentsError extends Error {
  public constructor(
    public readonly kind: WebPaymentsErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'WebPaymentsError';
  }
}
