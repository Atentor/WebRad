import type { RestGoPaymentMode, RestGoPaymentOperation } from '@webrad/restgo-sdk';
import {
  WebPaymentsError,
  type WebPaymentsCheckpoint,
  type WebPaymentsCheckoutOptions,
  type WebPaymentsState,
} from './payments-types.js';
import type { PaymentAttemptStore, PaymentStoreIdentity } from './payments-storage.js';

/** Narrow orchestration contract; network/lifecycle ownership stays with the component. */
export interface PaymentCheckoutActions {
  readonly identity: PaymentStoreIdentity;
  readonly signal: AbortSignal;
  readonly store: PaymentAttemptStore | null;
  checkpoint(): WebPaymentsCheckpoint | null;
  selectCheckpoint(checkpoint: WebPaymentsCheckpoint): void;
  prepare(sourceKey: string, mode: RestGoPaymentMode): WebPaymentsCheckpoint;
  create(): Promise<RestGoPaymentOperation>;
  get(id: string): Promise<RestGoPaymentOperation>;
  wait(id: string): Promise<RestGoPaymentOperation>;
  open(): void;
  check(): void;
  state(state: WebPaymentsState): void;
}

export function paymentConfirmed(operation: RestGoPaymentOperation): boolean {
  return operation.mode === 'payment'
    ? operation.status === 'succeeded'
    : operation.status === 'active' || operation.status === 'trialing';
}

export function paymentFailed(operation: RestGoPaymentOperation): boolean {
  return [
    'failed',
    'expired',
    'canceled',
    'incomplete_expired',
    'refunded',
    'partially_refunded',
  ].includes(operation.status);
}

/** RestGo can expose an Asaas payment link or invoice while settlement is pending or overdue. */
export function paymentCheckoutStatusOpen(operation: RestGoPaymentOperation): boolean {
  return (
    operation.status === 'pending' ||
    (operation.providerName === 'asaas' &&
      operation.mode === 'payment' &&
      (operation.status === 'processing' || operation.status === 'past_due'))
  );
}

export function paymentNeedsMonitoring(operation: RestGoPaymentOperation): boolean {
  if (operation.synchronizationPending && !operation.synchronizationError) return true;
  return !paymentConfirmed(operation) && !paymentFailed(operation);
}

/** One persisted attempt, one original key, one explicit checkout-opening action. */
export async function executePaymentCheckout(
  actions: PaymentCheckoutActions,
  sourceKey: string,
  mode: RestGoPaymentMode,
  options: WebPaymentsCheckoutOptions,
): Promise<RestGoPaymentOperation> {
  const run = async (): Promise<RestGoPaymentOperation> => {
    actions.check();
    const current = actions.checkpoint();
    const stored = actions.store?.read(actions.identity, sourceKey, mode) ?? null;
    if (
      current?.sourceKey === sourceKey &&
      current.mode === mode &&
      stored &&
      current.idempotencyKey !== stored.idempotencyKey
    )
      throw new WebPaymentsError(
        'attempt-conflict',
        'The saved purchase has another attempt. Retain its recovery data before continuing.',
      );
    actions.state('preparing');
    let checkpoint: WebPaymentsCheckpoint;
    if (stored) {
      actions.selectCheckpoint(stored);
      checkpoint = stored;
    } else if (current?.sourceKey === sourceKey && current.mode === mode) checkpoint = current;
    else checkpoint = actions.prepare(sourceKey, mode);
    actions.store?.save(checkpoint);
    actions.check();
    let operation = checkpoint.operationId
      ? await actions.get(checkpoint.operationId)
      : await actions.create();
    actions.check();
    if (operation.checkoutState === 'uncertain' && !paymentConfirmed(operation))
      throw new WebPaymentsError(
        'checkout-uncertain',
        'Checkout is uncertain. The original attempt is saved; contact support instead of creating another charge.',
      );
    if (paymentConfirmed(operation) || paymentFailed(operation)) return operation;
    if (
      paymentCheckoutStatusOpen(operation) &&
      ['pending', 'processing', 'completed'].includes(operation.checkoutState)
    ) {
      actions.state('waiting');
      operation = await actions.wait(operation.id);
      actions.check();
    }
    const latest = actions.checkpoint();
    if (latest) actions.store?.save(latest);
    actions.check();
    if (
      options.openCheckout !== false &&
      operation.checkoutUrl &&
      paymentCheckoutStatusOpen(operation)
    ) {
      actions.state('opening');
      actions.open();
    }
    return operation;
  };
  return actions.store
    ? actions.store.withLock(actions.identity, sourceKey, mode, run, actions.signal)
    : run();
}
