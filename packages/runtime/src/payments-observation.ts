import { RestGoError } from '@webrad/restgo-sdk';
import { WebPaymentsError } from './payments-types.js';

export function paymentMilliseconds(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 2147483647)
    throw new WebPaymentsError(
      'invalid-argument',
      `${name} must be an integer between 1 and 2147483647 ms.`,
    );
  return value;
}

export function paymentAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new WebPaymentsError('aborted', 'Payments observation was stopped.');
}

/** Release callers promptly even if an underlying session restoration is still pending. */
export function paymentAwait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(paymentAbortError(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function paymentDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(paymentAbortError(signal));
    };
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      Math.min(milliseconds, 2147483647),
    );
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function paymentScope(
  external?: AbortSignal,
  timeout?: number,
): {
  readonly controller: AbortController;
  readonly release: () => void;
} {
  const controller = new AbortController();
  const abort = (): void => controller.abort(external?.reason);
  external?.addEventListener('abort', abort, { once: true });
  if (external?.aborted) abort();
  const timer =
    timeout === undefined
      ? undefined
      : setTimeout(() => {
          controller.abort(
            new WebPaymentsError(
              'timeout',
              'Payments observation timed out; the operation remains available for recovery.',
            ),
          );
        }, timeout);
  return {
    controller,
    release: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    },
  };
}

export function paymentTransient(error: unknown): error is RestGoError {
  return (
    error instanceof RestGoError &&
    (error.code === 'NETWORK_ERROR' ||
      error.status === 429 ||
      error.status === 408 ||
      error.status >= 500)
  );
}
