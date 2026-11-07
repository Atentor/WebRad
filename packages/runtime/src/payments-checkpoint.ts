import {
  isRestGoCheckoutInput,
  isRestGoGatewaySlug,
  isRestGoPaymentUUID,
} from '@webrad/restgo-sdk';
import { WebPaymentsError, type WebPaymentsCheckpoint } from './payments-types.js';

export function parsePaymentsCheckpoint(value: unknown): WebPaymentsCheckpoint {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new WebPaymentsError('invalid-argument', 'Invalid Payments checkpoint.');
  const record = value as Record<string, unknown>;
  const keys = [
    'version',
    'baseUrl',
    'gatewaySlug',
    'userId',
    'sourceKey',
    'mode',
    'idempotencyKey',
    'operationId',
  ];
  if (
    record.version !== 1 ||
    !isRestGoCheckoutInput(record) ||
    !isRestGoGatewaySlug(record.gatewaySlug) ||
    !isRestGoPaymentUUID(record.userId) ||
    typeof record.baseUrl !== 'string' ||
    (record.operationId !== undefined && !isRestGoPaymentUUID(record.operationId)) ||
    Object.keys(record).some((key) => !keys.includes(key))
  )
    throw new WebPaymentsError(
      'invalid-argument',
      'Invalid Payments checkpoint fields or version.',
    );
  let baseUrl: string;
  try {
    const url = new URL(record.baseUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[\\?#]/.test(record.baseUrl)
    )
      throw new Error('Invalid API identity.');
    baseUrl = url.href.replace(/\/+$/, '');
  } catch {
    throw new WebPaymentsError('invalid-argument', 'Invalid Payments checkpoint API identity.');
  }
  return Object.freeze({
    version: 1,
    baseUrl,
    gatewaySlug: record.gatewaySlug,
    userId: record.userId,
    sourceKey: record.sourceKey,
    mode: record.mode,
    idempotencyKey: record.idempotencyKey,
    ...(record.operationId === undefined ? {} : { operationId: record.operationId }),
  });
}
