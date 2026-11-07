import { failure, success, type RestGoResult } from './errors';
import type { RestGoTransport, TransportRequest } from './transport';
import {
  isRestGoCheckoutInput,
  isRestGoGatewaySlug,
  isRestGoPaymentOperation,
  isRestGoPaymentOperationList,
  isRestGoPaymentUUID,
} from './payments-validation';
import type {
  RestGoCheckoutInput,
  RestGoPaymentListOptions,
  RestGoPaymentOperation,
  RestGoPaymentOperationList,
  RestGoPaymentRequestOptions,
} from './payments-types';

function immutablePaymentOperation(operation: RestGoPaymentOperation): RestGoPaymentOperation {
  return Object.freeze({ ...operation, provider: Object.freeze({ ...operation.provider }) });
}

/** Customer-only payment routes. Gateway administration stays on the server. */
export class RestGoPaymentGatewayClient {
  constructor(
    private readonly transport: RestGoTransport,
    readonly slug: string,
  ) {}

  createCheckout(
    input: RestGoCheckoutInput,
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoResult<RestGoPaymentOperation>> {
    if (!isRestGoCheckoutInput(input))
      return Promise.resolve(
        failure('Provide a sourceKey, payment mode and UUID idempotencyKey.', 'INVALID_ARGUMENT'),
      );
    // Copy the public contract before any async boundary; retries retain this exact body.
    const body: RestGoCheckoutInput = Object.freeze({
      sourceKey: input.sourceKey,
      mode: input.mode,
      idempotencyKey: input.idempotencyKey,
    });
    return this.operation(
      '/checkouts',
      { signal: options.signal, method: 'POST', body },
      undefined,
      body.mode,
    );
  }

  getOperation(
    id: string,
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoResult<RestGoPaymentOperation>> {
    if (!isRestGoPaymentUUID(id)) return this.invalidId();
    return this.operation(`/operations/${encodeURIComponent(id)}`, { signal: options.signal }, id);
  }

  async listOperations(
    options: RestGoPaymentListOptions = {},
  ): Promise<RestGoResult<RestGoPaymentOperationList>> {
    if (
      options.before !== undefined &&
      options.before !== '' &&
      !isRestGoPaymentUUID(options.before)
    )
      return failure('A valid operation cursor is required.', 'INVALID_ARGUMENT');
    const result = await this.request('/operations', {
      signal: options.signal,
      query: { before: options.before },
    });
    if (result.error) return result;
    if (!isRestGoPaymentOperationList(result.data))
      return failure('RestGO returned invalid payment operation history.', 'INVALID_RESPONSE');
    return success(
      Object.freeze({
        data: Object.freeze(result.data.data.map(immutablePaymentOperation)),
        nextCursor: result.data.nextCursor,
      }),
    );
  }

  cancelSubscription(
    id: string,
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoResult<RestGoPaymentOperation>> {
    if (!isRestGoPaymentUUID(id)) return this.invalidId();
    return this.operation(
      `/operations/${encodeURIComponent(id)}/cancel`,
      {
        signal: options.signal,
        method: 'POST',
        retryUnauthorized: false,
      },
      id,
      'subscription',
    );
  }

  private invalidId(): Promise<RestGoResult<RestGoPaymentOperation>> {
    return Promise.resolve(
      failure('A valid payment operation UUID is required.', 'INVALID_ARGUMENT'),
    );
  }

  private async operation(
    path: string,
    options: TransportRequest,
    id?: string,
    mode?: RestGoCheckoutInput['mode'],
  ): Promise<RestGoResult<RestGoPaymentOperation>> {
    const result = await this.request(path, options);
    if (result.error) return result;
    if (
      !isRestGoPaymentOperation(result.data) ||
      (id !== undefined && result.data.id.toLowerCase() !== id.toLowerCase()) ||
      (mode !== undefined && result.data.mode !== mode)
    )
      return failure('RestGO returned invalid payment operation data.', 'INVALID_RESPONSE');
    return success(immutablePaymentOperation(result.data));
  }

  private request(path: string, options: TransportRequest): Promise<RestGoResult<unknown>> {
    if (!isRestGoGatewaySlug(this.slug))
      return Promise.resolve(
        failure('A valid payment gateway slug is required.', 'INVALID_ARGUMENT'),
      );
    return this.transport.request<unknown>(`/payment/${encodeURIComponent(this.slug)}${path}`, {
      ...options,
      auth: 'session',
    });
  }
}

export class RestGoPaymentsClient {
  constructor(private readonly transport: RestGoTransport) {}

  gateway(slug: string): RestGoPaymentGatewayClient {
    return new RestGoPaymentGatewayClient(this.transport, slug);
  }
}
