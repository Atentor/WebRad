export type RestGoPaymentMode = 'payment' | 'subscription';
export type RestGoPaymentProvider = 'stripe' | 'asaas';

export interface RestGoCheckoutInput {
  /** Keep database identifiers as strings, including PostgreSQL int8 values. */
  readonly sourceKey: string;
  readonly mode: RestGoPaymentMode;
  /** Persist before the first POST and reuse for every retry of this attempt. */
  readonly idempotencyKey: string;
}

export interface RestGoPaymentProviderState {
  readonly status: string;
  readonly paymentId?: string;
  readonly subscriptionId?: string;
  readonly customerId?: string;
  readonly invoiceId?: string;
  readonly periodEnd?: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly everPaid?: boolean;
  readonly eventType?: string;
}

/** Asaas boleto details, available after issuance and webhook processing. */
export interface RestGoPaymentBoleto {
  /** Calendar date in YYYY-MM-DD format, without a time zone. */
  readonly dueDate?: string;
  readonly invoiceUrl?: string;
  readonly bankSlipUrl?: string;
}

export interface RestGoPaymentOperation {
  readonly id: string;
  readonly mode: RestGoPaymentMode;
  /** Financial state. Unknown future states are preserved, never treated as success. */
  readonly status: string;
  /** Preparation state, independent of financial confirmation. */
  readonly checkoutState: string;
  readonly checkoutUrl?: string;
  readonly boleto?: RestGoPaymentBoleto;
  readonly synchronizationPending: boolean;
  readonly synchronizationError?: string;
  readonly providerName: RestGoPaymentProvider;
  readonly provider: RestGoPaymentProviderState;
}

export interface RestGoPaymentOperationList {
  readonly data: readonly RestGoPaymentOperation[];
  /** Empty string means the last page. Ordering is by UUID, not creation time. */
  readonly nextCursor: string;
}

export interface RestGoPaymentRequestOptions {
  readonly signal?: AbortSignal;
}

export interface RestGoPaymentListOptions extends RestGoPaymentRequestOptions {
  readonly before?: string;
}
