import { isRecord } from './errors';
import type {
  RestGoCheckoutInput,
  RestGoPaymentMode,
  RestGoPaymentOperation,
  RestGoPaymentOperationList,
} from './payments-types';

export function isRestGoPaymentUUID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isRestGoPaymentMode(value: unknown): value is RestGoPaymentMode {
  return value === 'payment' || value === 'subscription';
}

export function isRestGoGatewaySlug(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

/** Hosted checkouts must never execute an arbitrary URL scheme or URL credentials. */
export function isRestGoCheckoutURL(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isRestGoCheckoutInput(value: unknown): value is RestGoCheckoutInput {
  return (
    isRecord(value) &&
    typeof value.sourceKey === 'string' &&
    value.sourceKey.length > 0 &&
    value.sourceKey.length <= 1024 &&
    new TextEncoder().encode(value.sourceKey).byteLength <= 1024 &&
    isRestGoPaymentMode(value.mode) &&
    isRestGoPaymentUUID(value.idempotencyKey)
  );
}

export function isRestGoPaymentOperation(value: unknown): value is RestGoPaymentOperation {
  if (!isRecord(value) || !isRecord(value.provider)) return false;
  const provider = value.provider;
  return (
    isRestGoPaymentUUID(value.id) &&
    isRestGoPaymentMode(value.mode) &&
    typeof value.status === 'string' &&
    value.status.length > 0 &&
    typeof value.checkoutState === 'string' &&
    value.checkoutState.length > 0 &&
    (value.providerName === 'stripe' || value.providerName === 'asaas') &&
    (value.checkoutUrl === undefined || isRestGoCheckoutURL(value.checkoutUrl)) &&
    typeof value.synchronizationPending === 'boolean' &&
    (value.synchronizationError === undefined || typeof value.synchronizationError === 'string') &&
    typeof provider.status === 'string' &&
    typeof provider.cancelAtPeriodEnd === 'boolean' &&
    ['paymentId', 'subscriptionId', 'customerId', 'invoiceId', 'eventType'].every(
      (key) => provider[key] === undefined || typeof provider[key] === 'string',
    ) &&
    (provider.everPaid === undefined || typeof provider.everPaid === 'boolean') &&
    (provider.periodEnd === undefined ||
      (typeof provider.periodEnd === 'string' && Number.isFinite(Date.parse(provider.periodEnd))))
  );
}

export function isRestGoPaymentOperationList(value: unknown): value is RestGoPaymentOperationList {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.length <= 50 &&
    value.data.every(isRestGoPaymentOperation) &&
    (value.nextCursor === '' || isRestGoPaymentUUID(value.nextCursor))
  );
}
