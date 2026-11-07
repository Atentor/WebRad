import {
  isRestGoCheckoutInput,
  isRestGoCheckoutURL,
  isRestGoGatewaySlug,
  isRestGoPaymentMode,
  isRestGoPaymentUUID,
  type RestGoCheckoutInput,
  type RestGoClient,
  type RestGoPaymentGatewayClient,
  type RestGoPaymentListOptions,
  type RestGoPaymentMode,
  type RestGoPaymentOperation,
  type RestGoPaymentOperationList,
  type RestGoPaymentRequestOptions,
  type RestGoResult,
} from '@webrad/restgo-sdk';
import { WebNonvisualComponent, type WebComponentEventHandler } from './component.js';
import { getRestGoClient, subscribeRestGoClient } from './restgo.js';
import { parsePaymentsCheckpoint } from './payments-checkpoint.js';
import { PaymentAttemptStore, type PaymentStoreIdentity } from './payments-storage.js';
import {
  executePaymentCheckout,
  paymentConfirmed,
  paymentFailed,
  paymentNeedsMonitoring,
  type PaymentCheckoutActions,
} from './payments-actions.js';
import {
  paymentAbortError,
  paymentAwait,
  paymentDelay,
  paymentMilliseconds,
  paymentScope,
  paymentTransient,
} from './payments-observation.js';
import {
  WebPaymentsError,
  type WebPaymentsAction,
  type WebPaymentsCheckpoint,
  type WebPaymentsCheckoutEventDetail,
  type WebPaymentsConfiguration,
  type WebPaymentsErrorEventDetail,
  type WebPaymentsObservationOptions,
  type WebPaymentsOperationEventDetail,
  type WebPaymentsRequestEventDetail,
  type WebPaymentsSynchronizationEventDetail,
  type WebPaymentsCheckoutOptions,
  type WebPaymentsResumeOptions,
  type WebPaymentsConfirmationOptions,
  type WebPaymentsState,
  type WebPaymentsStateEventDetail,
  type WebPaymentsHistoryEventDetail,
  type WebPaymentsResumeEventDetail,
} from './payments-types.js';

interface PaymentWorkflowContext {
  readonly token: symbol;
  readonly client: RestGoClient;
  readonly identity: PaymentStoreIdentity;
  readonly signal: AbortSignal;
  readonly check: () => void;
}
interface PaymentWorkflow {
  readonly key: string;
  readonly token: symbol;
  readonly controller: AbortController;
  readonly promise: Promise<unknown>;
  readonly automatic: boolean;
}

/** Customer payment coordinator, owned by one page or reusable placement. */
export class WebPayments extends WebNonvisualComponent {
  #gatewaySlug = '';
  #mode: RestGoPaymentMode = 'payment';
  #enabled = true;
  #pollInterval = 2000;
  #pollTimeout = 60000;
  #disposed = false;
  #version = 0;
  #client: RestGoClient | null = null;
  #ownerId: string | null = null;
  #unsubscribeAuth: (() => void) | undefined;
  readonly #unsubscribeClient: () => void;
  #checkpoint: WebPaymentsCheckpoint | null = null;
  #operation: RestGoPaymentOperation | null = null;
  #error: Error | null = null;
  #requestController: AbortController | null = null;
  #observation: AbortController | null = null;
  #observationGoal: 'checkout' | 'confirmation' | 'watch' | null = null;
  readonly #store: PaymentAttemptStore;
  #autoResume = true;
  #autoWatch = true;
  #persistAttempts = true;
  #initialized = false;
  #resumeScheduled = false;
  #workflow: PaymentWorkflow | null = null;
  #state: WebPaymentsState = 'idle';
  #history: readonly RestGoPaymentOperation[] = Object.freeze([]);
  #nextCursor = '';
  readonly #notified = new Set<string>();

  public constructor(configuration: WebPaymentsConfiguration = {}) {
    super(configuration);
    this.#store = new PaymentAttemptStore(
      configuration.storage,
      this.id || this.name || 'Payments',
    );
    this.gatewaySlug = configuration.gatewaySlug ?? '';
    this.mode = configuration.mode ?? 'payment';
    this.pollInterval = configuration.pollInterval ?? 2000;
    this.pollTimeout = configuration.pollTimeout ?? 60000;
    this.enabled = configuration.enabled ?? true;
    this.persistAttempts = configuration.persistAttempts ?? true;
    this.autoWatch = configuration.autoWatch ?? true;
    this.autoResume = configuration.autoResume ?? true;
    this.#unsubscribeClient = subscribeRestGoClient((client) => this.#attachClient(client));
    this.#initialized = true;
    this.#scheduleResume();
  }

  public get gatewaySlug(): string {
    return this.#gatewaySlug;
  }
  public set gatewaySlug(value: string) {
    if (value !== '' && !isRestGoGatewaySlug(value))
      throw new WebPaymentsError(
        'invalid-argument',
        'Use a lowercase gateway slug with digits and hyphens.',
      );
    if (value === this.#gatewaySlug) return;
    if (this.busy || this.watching || this.#checkpoint || this.#operation)
      throw new WebPaymentsError(
        'attempt-conflict',
        'Save the current checkpoint and Clear Payments before changing gateway.',
      );
    this.#gatewaySlug = value;
    this.#scheduleResume();
  }
  public get mode(): RestGoPaymentMode {
    return this.#mode;
  }
  /** Changes only the default for a future prepared attempt. */
  public set mode(value: RestGoPaymentMode) {
    if (!isRestGoPaymentMode(value))
      throw new WebPaymentsError('invalid-argument', 'Invalid payment mode.');
    this.#mode = value;
  }
  public get enabled(): boolean {
    return this.#enabled;
  }
  public set enabled(value: boolean) {
    if (typeof value !== 'boolean')
      throw new WebPaymentsError('invalid-argument', 'Enabled must be boolean.');
    this.#enabled = value;
    if (!value) this.#invalidate(false);
    else this.#scheduleResume();
  }
  public get pollInterval(): number {
    return this.#pollInterval;
  }
  public set pollInterval(value: number) {
    this.#pollInterval = paymentMilliseconds(value, 'Poll interval');
  }
  public get pollTimeout(): number {
    return this.#pollTimeout;
  }
  public set pollTimeout(value: number) {
    this.#pollTimeout = paymentMilliseconds(value, 'Poll timeout');
  }
  public get busy(): boolean {
    return this.#requestController !== null || this.#workflow !== null;
  }
  public get autoResume(): boolean {
    return this.#autoResume;
  }
  public set autoResume(value: boolean) {
    this.#boolean(value);
    this.#autoResume = value;
    if (value) this.#scheduleResume();
  }
  public get autoWatch(): boolean {
    return this.#autoWatch;
  }
  public set autoWatch(value: boolean) {
    this.#boolean(value);
    this.#autoWatch = value;
    if (!value && this.#observationGoal === 'watch') this.StopWatching();
  }
  public get persistAttempts(): boolean {
    return this.#persistAttempts;
  }
  public set persistAttempts(value: boolean) {
    this.#boolean(value);
    if (this.busy)
      throw new WebPaymentsError('busy', 'Finish the payment action before changing persistence.');
    this.#persistAttempts = value;
    if (value) this.#saveCheckpoint();
  }
  public get state(): WebPaymentsState {
    return this.#state;
  }
  public get status(): string | null {
    return this.#operation?.status ?? null;
  }
  public get checkoutState(): string | null {
    return this.#operation?.checkoutState ?? null;
  }
  public get synchronizationPending(): boolean {
    return this.#operation?.synchronizationPending ?? false;
  }
  public get synchronizationError(): string | null {
    return this.#operation?.synchronizationError ?? null;
  }
  public get canOpenCheckout(): boolean {
    return (
      this.#operation?.checkoutState === 'completed' &&
      this.#operation.status === 'pending' &&
      isRestGoCheckoutURL(this.#operation.checkoutUrl)
    );
  }
  public get canCancelSubscription(): boolean {
    return (
      this.#operation?.mode === 'subscription' &&
      !!this.#operation.provider.subscriptionId &&
      !this.#operation.provider.cancelAtPeriodEnd &&
      this.#operation.status !== 'canceled'
    );
  }
  public get history(): readonly RestGoPaymentOperation[] {
    return this.#history;
  }
  public get nextCursor(): string {
    return this.#nextCursor;
  }
  public get hasMore(): boolean {
    return this.#nextCursor !== '';
  }
  public get watching(): boolean {
    return this.#observation !== null;
  }
  public get operation(): RestGoPaymentOperation | null {
    return this.#operation;
  }
  public get checkoutUrl(): string | null {
    return this.#operation?.checkoutUrl ?? null;
  }
  public get error(): Error | null {
    return this.#error;
  }
  public get attempt(): RestGoCheckoutInput | null {
    const checkpoint = this.#checkpoint;
    return checkpoint === null
      ? null
      : Object.freeze({
          sourceKey: checkpoint.sourceKey,
          mode: checkpoint.mode,
          idempotencyKey: checkpoint.idempotencyKey,
        });
  }

  /** Prepare/recover the purchase, persist its key, wait for checkout and open it. */
  public Pay(
    sourceKey: string,
    options: WebPaymentsCheckoutOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#checkout('pay', sourceKey, 'payment', options);
  }
  /** Subscribe through the hosted checkout with the same automatic recovery flow. */
  public Subscribe(
    sourceKey: string,
    options: WebPaymentsCheckoutOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#checkout('subscribe', sourceKey, 'subscription', options);
  }
  /** Use the mode selected in the Inspector. Opens checkout by default. */
  public Checkout(
    sourceKey: string,
    options: WebPaymentsCheckoutOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#checkout('checkout', sourceKey, this.mode, options);
  }
  /** Recover a purchase or the last saved attempt; never redirects back to checkout. */
  public Resume(
    sourceKey?: string,
    options: WebPaymentsResumeOptions = {},
  ): Promise<RestGoPaymentOperation | null> {
    return this.#resume(sourceKey, options, false);
  }
  /** Refresh the selected/saved operation without creating a charge. */
  public Refresh(
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoPaymentOperation | null> {
    return this.#runWorkflow('refresh', 'refresh', options, async (context) => {
      this.#setState('refreshing');
      const id = this.#resolveOperationId(context);
      return id ? this.#get(id, { signal: context.signal }, context) : null;
    });
  }
  /** Load customer history and expose its cursor without changing selection. */
  public LoadHistory(
    options: RestGoPaymentListOptions = {},
  ): Promise<readonly RestGoPaymentOperation[]> {
    return this.#runWorkflow(
      'history',
      `history:${options.before ?? ''}`,
      options,
      async (context) => {
        this.#setState('loading-history');
        const page = await this.#request(
          'list',
          context.signal,
          (gateway, signal) => gateway.listOperations({ before: options.before, signal }),
          undefined,
          undefined,
          undefined,
          context.token,
        );
        this.#updateHistory(page, false);
        return this.#history;
      },
    );
  }
  /** Append the next page, deduplicating operations. Last page is a harmless no-op. */
  public LoadMore(
    options: RestGoPaymentRequestOptions = {},
  ): Promise<readonly RestGoPaymentOperation[]> {
    if (!this.hasMore) return Promise.resolve(this.#history);
    const cursor = this.#nextCursor;
    return this.#runWorkflow('load-more', `more:${cursor}`, options, async (context) => {
      this.#setState('loading-history');
      const page = await this.#request(
        'list',
        context.signal,
        (gateway, signal) => gateway.listOperations({ before: cursor, signal }),
        undefined,
        undefined,
        undefined,
        context.token,
      );
      this.#updateHistory(page, true);
      return this.#history;
    });
  }
  /** Await payment success or subscription activation, optionally including source synchronization. */
  public WaitForConfirmation(
    options: WebPaymentsConfirmationOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#runWorkflow(
      'confirm',
      JSON.stringify([
        'confirm',
        options.operationId,
        options.waitForSynchronization === true,
        options.interval ?? this.pollInterval,
        options.timeout ?? this.pollTimeout,
      ]),
      options,
      async (context) => {
        const id = options.operationId ?? this.#resolveOperationId(context);
        if (!id)
          throw new WebPaymentsError(
            'attempt-required',
            'Start or resume a payment before waiting for confirmation.',
          );
        if (!isRestGoPaymentUUID(id))
          throw new WebPaymentsError('invalid-argument', 'A payment operation UUID is required.');
        if (this.#checkpoint && this.#checkpoint.operationId?.toLowerCase() !== id.toLowerCase())
          this.#switchCheckpoint(null, context);
        return this.#observe(
          id,
          options,
          'confirmation',
          context,
          options.waitForSynchronization === true,
        );
      },
    );
  }

  /** Advanced preparation without HTTP. Default persistence saves its recovery checkpoint. */
  public PrepareCheckout(
    sourceKey: string,
    mode: RestGoPaymentMode = this.mode,
  ): WebPaymentsCheckpoint {
    return this.#prepare(sourceKey, mode);
  }

  #prepare(sourceKey: string, mode: RestGoPaymentMode, token?: symbol): WebPaymentsCheckpoint {
    const { client, userId } = this.#identity();
    if (!token) this.#supersedeAutomaticResume();
    this.#assertIdle(undefined, token);
    if (this.#checkpoint) {
      if (this.#checkpoint.sourceKey === sourceKey && this.#checkpoint.mode === mode)
        return this.ExportCheckpoint();
      throw new WebPaymentsError(
        'attempt-conflict',
        'Recover the existing attempt or explicitly Clear it before preparing another.',
      );
    }
    if (this.#operation)
      throw new WebPaymentsError(
        'attempt-conflict',
        'Clear the selected operation before preparing a new attempt.',
      );
    if (this.persistAttempts) {
      const saved = this.#store.read(
        { baseUrl: client.baseUrl, gatewaySlug: this.gatewaySlug, userId },
        sourceKey,
        mode,
      );
      if (saved) {
        this.#checkpoint = saved;
        this.#error = null;
        return saved;
      }
    }
    if (typeof globalThis.crypto?.randomUUID !== 'function')
      throw new WebPaymentsError(
        'not-configured',
        'Payments requires a secure browser context with crypto.randomUUID.',
      );
    const input = { sourceKey, mode, idempotencyKey: globalThis.crypto.randomUUID() };
    if (!isRestGoCheckoutInput(input))
      throw new WebPaymentsError(
        'invalid-argument',
        'Provide a nonempty source key up to 1024 UTF-8 bytes and a valid mode.',
      );
    this.#checkpoint = Object.freeze({
      version: 1,
      baseUrl: client.baseUrl,
      gatewaySlug: this.gatewaySlug,
      userId,
      ...input,
    });
    this.#error = null;
    this.#saveCheckpoint();
    return this.#checkpoint;
  }

  public CreateCheckout(
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#create(options);
  }

  #create(
    options: RestGoPaymentRequestOptions,
    context?: PaymentWorkflowContext,
  ): Promise<RestGoPaymentOperation> {
    return this.#request(
      'create',
      options.signal,
      async (gateway, signal) => {
        const input = this.attempt;
        if (!input)
          throw new WebPaymentsError(
            'attempt-required',
            'Prepare or restore a saved checkout attempt first.',
          );
        this.#saveCheckpoint();
        this.#setState('creating');
        return gateway.createCheckout(input, { signal });
      },
      (operation) => {
        if (!this.#checkpoint)
          throw new WebPaymentsError(
            'context-changed',
            'The prepared attempt is no longer active.',
          );
        if (
          this.#checkpoint.operationId &&
          this.#checkpoint.operationId.toLowerCase() !== operation.id.toLowerCase()
        )
          throw new WebPaymentsError(
            'attempt-conflict',
            'The checkout retry returned a different operation. Retain the original checkpoint for support.',
          );
        this.#checkpoint = Object.freeze({ ...this.#checkpoint, operationId: operation.id });
        this.#saveCheckpoint();
        this.#select(operation);
        if (this.#operation === operation)
          this.emit('OnCheckoutCreated', { operation } satisfies WebPaymentsCheckoutEventDetail);
      },
      undefined,
      undefined,
      context?.token,
    );
  }

  public GetOperation(
    id: string,
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#runWorkflow('get', `get:${id}`, options, async (context) => {
      if (!isRestGoPaymentUUID(id))
        throw new WebPaymentsError('invalid-argument', 'A payment operation UUID is required.');
      if (this.#checkpoint && this.#checkpoint.operationId?.toLowerCase() !== id.toLowerCase())
        this.#switchCheckpoint(null, context);
      return this.#get(id, { signal: context.signal }, context);
    });
  }

  #get(
    id: string,
    options: RestGoPaymentRequestOptions,
    context?: PaymentWorkflowContext,
  ): Promise<RestGoPaymentOperation> {
    return this.#request(
      'get',
      options.signal,
      (gateway, signal) => {
        this.#assertTarget(id);
        return gateway.getOperation(id, { signal });
      },
      (operation) => this.#select(operation),
      undefined,
      id,
      context?.token,
    );
  }

  public ListOperations(
    options: RestGoPaymentListOptions = {},
  ): Promise<RestGoPaymentOperationList> {
    return this.#request('list', options.signal, (gateway, signal) =>
      gateway.listOperations({ before: options.before, signal }),
    );
  }

  public CancelSubscription(options?: RestGoPaymentRequestOptions): Promise<RestGoPaymentOperation>;
  public CancelSubscription(
    id: string,
    options?: RestGoPaymentRequestOptions,
  ): Promise<RestGoPaymentOperation>;
  public CancelSubscription(
    idOrOptions?: string | RestGoPaymentRequestOptions,
    options: RestGoPaymentRequestOptions = {},
  ): Promise<RestGoPaymentOperation> {
    const explicitId = typeof idOrOptions === 'string' ? idOrOptions : undefined;
    const requestOptions = typeof idOrOptions === 'object' ? idOrOptions : options;
    return this.#runWorkflow(
      'cancel',
      `cancel:${explicitId ?? ''}`,
      requestOptions,
      async (context) => {
        const id = explicitId ?? this.#resolveOperationId(context);
        if (!id)
          throw new WebPaymentsError(
            'attempt-required',
            'Select or resume a subscription before canceling it.',
          );
        if (!isRestGoPaymentUUID(id))
          throw new WebPaymentsError(
            'invalid-argument',
            'A subscription operation UUID is required.',
          );
        if (this.#checkpoint && this.#checkpoint.operationId !== id)
          this.#switchCheckpoint(null, context);
        this.#setState('canceling');
        return this.#request(
          'cancel',
          context.signal,
          (gateway, signal) => gateway.cancelSubscription(id, { signal }),
          (operation) => this.#select(operation),
          undefined,
          id,
          context.token,
        );
      },
    );
  }

  public WaitForCheckout(
    id: string = this.#selectedId(),
    options: WebPaymentsObservationOptions = {},
  ): Promise<RestGoPaymentOperation> {
    return this.#observe(id, options, 'checkout');
  }

  /** Starts one bounded loop. Background failures are delivered through OnError. */
  public StartWatching(
    id: string = this.#selectedId(),
    options: WebPaymentsObservationOptions = {},
  ): void {
    if (this.#workflow) {
      this.#report(
        'watch',
        new WebPaymentsError(
          'busy',
          'Finish the current payment action before starting observation.',
        ),
      );
      return;
    }
    this.StopWatching();
    void this.#observe(id, options, 'watch').catch(() => undefined);
  }

  /** Local observation cancellation only; never cancels the backend transaction. */
  public StopWatching(): void {
    const observation = this.#observation;
    if (!observation) return;
    observation.abort(new WebPaymentsError('aborted', 'Payments observation was stopped.'));
    this.#workflow?.controller.abort(
      new WebPaymentsError('aborted', 'Payments observation was stopped.'),
    );
    if (this.#requestController?.signal.aborted) this.#requestController = null;
    if (this.#observation === observation) {
      this.#observation = null;
      this.#observationGoal = null;
    }
  }

  public OpenCheckout(): void {
    this.#identity();
    const operation = this.#operation;
    if (
      !operation ||
      operation.checkoutState !== 'completed' ||
      operation.status !== 'pending' ||
      !isRestGoCheckoutURL(operation.checkoutUrl)
    )
      throw new WebPaymentsError(
        'checkout-unavailable',
        'Query an open checkout before opening its URL.',
      );
    if (typeof window === 'undefined')
      throw new WebPaymentsError(
        'not-configured',
        'Checkout navigation requires a browser window.',
      );
    window.location.assign(operation.checkoutUrl);
    this.emit('OnCheckoutOpened', { operation } satisfies WebPaymentsCheckoutEventDetail);
  }

  public ExportCheckpoint(): WebPaymentsCheckpoint {
    this.#identity();
    if (!this.#checkpoint)
      throw new WebPaymentsError('attempt-required', 'There is no prepared Payments checkpoint.');
    return this.#checkpoint;
  }

  /** Validates recovery data against this API, gateway and customer. Performs no HTTP. */
  public RestoreCheckpoint(value: unknown): WebPaymentsCheckpoint {
    const { client, userId } = this.#identity();
    this.#assertIdle();
    const checkpoint = parsePaymentsCheckpoint(value);
    if (
      checkpoint.baseUrl !== client.baseUrl ||
      checkpoint.gatewaySlug !== this.gatewaySlug ||
      checkpoint.userId !== userId
    )
      throw new WebPaymentsError(
        'context-changed',
        'The checkpoint belongs to another API, gateway or customer.',
      );
    if (
      (this.#checkpoint && JSON.stringify(this.#checkpoint) !== JSON.stringify(checkpoint)) ||
      this.#operation
    )
      throw new WebPaymentsError(
        'attempt-conflict',
        'Clear the current local state before restoring another checkpoint.',
      );
    this.#checkpoint = checkpoint;
    this.#error = null;
    this.#saveCheckpoint();
    return checkpoint;
  }

  /** Save recovery data first. This only clears local state and never cancels a charge. */
  public Clear(): void {
    this.#invalidate(true);
  }

  public set onCheckoutCreated(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnCheckoutCreated', handler);
  }
  public set onCheckoutReady(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnCheckoutReady', handler);
  }
  public set onOperationChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnOperationChange', handler);
  }
  public set onSynchronizationChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnSynchronizationChange', handler);
  }
  public set onError(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnError', handler);
  }
  public set onRequestComplete(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnRequestComplete', handler);
  }
  public set onPaymentSucceeded(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnPaymentSucceeded', handler);
  }
  public set onSubscriptionActivated(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnSubscriptionActivated', handler);
  }
  public set onSubscriptionCanceled(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnSubscriptionCanceled', handler);
  }
  public set onCheckoutOpened(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnCheckoutOpened', handler);
  }
  public set onHistoryChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnHistoryChange', handler);
  }
  public set onStateChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnStateChange', handler);
  }
  public set onRestored(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnRestored', handler);
  }

  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeClient();
    this.#unsubscribeAuth?.();
    this.#unsubscribeAuth = undefined;
    this.#invalidate(true);
    this.#client = null;
    super.dispose();
  }

  #boolean(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new WebPaymentsError('invalid-argument', 'The Payments setting must be boolean.');
  }

  #selectedId(): string {
    return this.#operation?.id ?? this.#checkpoint?.operationId ?? '';
  }

  #saveCheckpoint(): void {
    if (this.#persistAttempts && this.#checkpoint) this.#store.save(this.#checkpoint);
  }

  #setState(state: WebPaymentsState): void {
    if (this.#disposed || state === this.#state) return;
    const previous = this.#state;
    this.#state = state;
    this.emit('OnStateChange', { previous, state } satisfies WebPaymentsStateEventDetail);
  }

  #operationState(): WebPaymentsState {
    const operation = this.#operation;
    if (!operation) return 'idle';
    if (paymentConfirmed(operation)) return 'confirmed';
    if (operation.checkoutState === 'uncertain') return 'uncertain';
    if (operation.status === 'canceled') return 'canceled';
    if (paymentFailed(operation)) return 'failed';
    return this.canOpenCheckout ? 'ready' : 'waiting';
  }

  #updateHistory(page: RestGoPaymentOperationList, append: boolean): void {
    const items = new Map(
      (append ? this.#history : []).map((operation) => [operation.id, operation]),
    );
    for (const operation of page.data) items.set(operation.id, operation);
    this.#history = Object.freeze([...items.values()]);
    this.#nextCursor = page.nextCursor;
    this.emit('OnHistoryChange', {
      items: this.#history,
      nextCursor: this.#nextCursor,
      hasMore: this.hasMore,
    } satisfies WebPaymentsHistoryEventDetail);
  }

  #switchCheckpoint(
    checkpoint: WebPaymentsCheckpoint | null,
    context: PaymentWorkflowContext,
  ): void {
    context.check();
    this.#assertIdle(undefined, context.token);
    const current = this.#checkpoint;
    if (current && current.idempotencyKey !== checkpoint?.idempotencyKey) {
      if (!this.persistAttempts)
        throw new WebPaymentsError(
          'attempt-conflict',
          'Clear the current attempt explicitly when durable recovery is disabled.',
        );
      this.#saveCheckpoint();
    }
    if (
      checkpoint &&
      (checkpoint.baseUrl !== context.identity.baseUrl ||
        checkpoint.gatewaySlug !== context.identity.gatewaySlug ||
        checkpoint.userId !== context.identity.userId)
    )
      throw new WebPaymentsError(
        'context-changed',
        'The saved payment belongs to another customer or gateway.',
      );
    const previous = this.#operation;
    this.#checkpoint = checkpoint;
    if (previous && previous.id !== checkpoint?.operationId) {
      this.#operation = null;
      this.emit('OnOperationChange', {
        previous,
        operation: null,
      } satisfies WebPaymentsOperationEventDetail);
    }
    context.check();
  }

  #checkout(
    action: 'pay' | 'subscribe' | 'checkout',
    sourceKey: string,
    mode: RestGoPaymentMode,
    options: WebPaymentsCheckoutOptions,
  ): Promise<RestGoPaymentOperation> {
    if (
      typeof sourceKey !== 'string' ||
      !sourceKey ||
      new TextEncoder().encode(sourceKey).byteLength > 1024 ||
      !isRestGoPaymentMode(mode)
    ) {
      const error = new WebPaymentsError(
        'invalid-argument',
        'Provide the purchase source key as a string and a valid payment mode.',
      );
      this.#report(action, error);
      return Promise.reject(error);
    }
    const key = JSON.stringify([
      'checkout',
      sourceKey,
      mode,
      options.openCheckout !== false,
      options.interval ?? this.pollInterval,
      options.timeout ?? this.pollTimeout,
    ]);
    return this.#runWorkflow(action, key, options, (context) => {
      const actions: PaymentCheckoutActions = {
        identity: context.identity,
        signal: context.signal,
        store: this.persistAttempts ? this.#store : null,
        checkpoint: () => this.#checkpoint,
        selectCheckpoint: (checkpoint) => this.#switchCheckpoint(checkpoint, context),
        prepare: (source, selectedMode) => {
          if (
            this.#checkpoint?.sourceKey !== source ||
            this.#checkpoint.mode !== selectedMode ||
            (this.#operation && !this.#checkpoint)
          )
            this.#switchCheckpoint(null, context);
          return this.#prepare(source, selectedMode, context.token);
        },
        create: () => this.#create({ signal: context.signal }, context),
        get: (id) => this.#get(id, { signal: context.signal }, context),
        wait: async (id) => {
          try {
            return await this.#observe(id, options, 'checkout', context);
          } catch (error) {
            if (
              error instanceof WebPaymentsError &&
              error.kind === 'checkout-unavailable' &&
              this.#operation &&
              (paymentConfirmed(this.#operation) || paymentFailed(this.#operation))
            )
              return this.#operation;
            throw error;
          }
        },
        open: () => {
          context.check();
          this.OpenCheckout();
          context.check();
        },
        check: context.check,
        state: (state) => {
          context.check();
          this.#setState(state);
          context.check();
        },
      };
      return executePaymentCheckout(actions, sourceKey, mode, options);
    });
  }

  #resume(
    sourceKey: string | undefined,
    options: WebPaymentsResumeOptions,
    automatic: boolean,
  ): Promise<RestGoPaymentOperation | null> {
    const selectedMode = options.mode ?? this.mode;
    return this.#runWorkflow(
      'resume',
      JSON.stringify([
        'resume',
        sourceKey,
        selectedMode,
        options.watch,
        options.interval ?? this.pollInterval,
        options.timeout ?? this.pollTimeout,
        automatic,
      ]),
      options,
      async (context) => {
        this.#setState('restoring');
        let checkpoint =
          sourceKey === undefined
            ? this.#checkpoint
            : this.#checkpoint?.sourceKey === sourceKey && this.#checkpoint.mode === selectedMode
              ? this.#checkpoint
              : null;
        if (this.persistAttempts)
          checkpoint =
            (sourceKey === undefined
              ? (checkpoint ?? this.#store.latest(context.identity, !automatic))
              : this.#store.read(context.identity, sourceKey, selectedMode)) ?? checkpoint;
        if (!checkpoint) return null;
        const saved = checkpoint;
        const restore = async (): Promise<RestGoPaymentOperation | null> => {
          context.check();
          const latest = this.persistAttempts
            ? (this.#store.read(context.identity, saved.sourceKey, saved.mode) ?? saved)
            : saved;
          this.#switchCheckpoint(latest, context);
          this.#saveCheckpoint();
          const operation = latest.operationId
            ? await this.#get(latest.operationId, { signal: context.signal }, context)
            : automatic
              ? null
              : await this.#create({ signal: context.signal }, context);
          context.check();
          this.emit('OnRestored', {
            checkpoint: this.#checkpoint ?? latest,
            operation,
            automatic,
          } satisfies WebPaymentsResumeEventDetail);
          return operation;
        };
        return this.persistAttempts
          ? this.#store.withLock(
              context.identity,
              saved.sourceKey,
              saved.mode,
              restore,
              context.signal,
            )
          : restore();
      },
      options.watch,
      automatic,
    );
  }

  #resolveOperationId(context: PaymentWorkflowContext): string | null {
    if (this.#selectedId()) return this.#selectedId();
    if (!this.persistAttempts) return null;
    const checkpoint = this.#store.latest(context.identity, true);
    if (checkpoint) this.#switchCheckpoint(checkpoint, context);
    return checkpoint?.operationId ?? null;
  }

  #scheduleResume(): void {
    if (
      !this.#initialized ||
      this.#disposed ||
      !this.autoResume ||
      !this.persistAttempts ||
      !this.enabled ||
      !isRestGoGatewaySlug(this.gatewaySlug) ||
      this.#resumeScheduled
    )
      return;
    this.#resumeScheduled = true;
    queueMicrotask(() => {
      this.#resumeScheduled = false;
      if (this.#disposed || !this.enabled || !this.autoResume || this.busy || this.watching) return;
      try {
        getRestGoClient();
      } catch {
        return;
      }
      void this.#resume(undefined, {}, true).catch(() => undefined);
    });
  }

  #supersedeAutomaticResume(): void {
    if (!this.#workflow?.automatic) return;
    this.#workflow.controller.abort(
      new WebPaymentsError(
        'aborted',
        'Automatic recovery yielded to the requested payment action.',
      ),
    );
    this.StopWatching();
    this.#workflow = null;
    if (this.#requestController?.signal.aborted) this.#requestController = null;
  }

  #runWorkflow<T>(
    action: WebPaymentsAction,
    key: string,
    options: WebPaymentsObservationOptions,
    run: (context: PaymentWorkflowContext) => Promise<T>,
    monitor: boolean | undefined = undefined,
    automatic = false,
  ): Promise<T> {
    try {
      const client = this.#available();
      if (!automatic) this.#supersedeAutomaticResume();
      if (this.#workflow) {
        if (this.#workflow.key === key) return this.#workflow.promise as Promise<T>;
        throw new WebPaymentsError('busy', 'Another payment action is already in progress.');
      }
      this.StopWatching();
      this.#assertIdle();
      const version = this.#version;
      const scope = paymentScope(
        options.signal,
        paymentMilliseconds(options.timeout ?? this.pollTimeout, 'Payment timeout'),
      );
      const token = Symbol(action);
      let ownerId: string | null = null;
      const check = (): void => {
        if (scope.controller.signal.aborted) throw paymentAbortError(scope.controller.signal);
        if (
          this.#disposed ||
          version !== this.#version ||
          client !== this.#client ||
          (ownerId !== null && client.CurrentUser?.id !== ownerId)
        )
          throw new WebPaymentsError(
            'context-changed',
            'The payment action belongs to an obsolete connection or customer.',
          );
      };
      let failure: Error | null = null;
      const workflow: PaymentWorkflow = {
        key,
        automatic,
        token,
        controller: scope.controller,
        promise: Promise.resolve()
          .then(async () => {
            check();
            this.#error = null;
            const session = await paymentAwait(client.getSession(), scope.controller.signal);
            check();
            if (session.error) throw session.error;
            if (!session.data) {
              if (automatic) return null as T;
              throw new WebPaymentsError(
                'auth-required',
                'Sign in to RestGO before paying or managing payments.',
              );
            }
            ownerId = session.data.user.id;
            const result = await paymentAwait(
              run({
                token,
                client,
                identity: {
                  baseUrl: client.baseUrl,
                  gatewaySlug: this.gatewaySlug,
                  userId: ownerId,
                },
                signal: scope.controller.signal,
                check,
              }),
              scope.controller.signal,
            );
            check();
            return result;
          })
          .catch((value: unknown) => {
            failure = value instanceof Error ? value : new Error(String(value));
            if (
              version === this.#version &&
              !this.#disposed &&
              !(
                scope.controller.signal.aborted &&
                !(failure instanceof WebPaymentsError && failure.kind === 'timeout')
              )
            ) {
              this.#setState(
                failure instanceof WebPaymentsError && failure.kind === 'checkout-uncertain'
                  ? 'uncertain'
                  : 'error',
              );
              this.#report(action, failure, this.#selectedId() || null);
            }
            throw failure;
          })
          .finally(() => {
            scope.release();
            if (this.#workflow !== workflow) return;
            this.#workflow = null;
            if (version !== this.#version || this.#disposed) return;
            if (
              !failure ||
              (scope.controller.signal.aborted &&
                !(failure instanceof WebPaymentsError && failure.kind === 'timeout'))
            )
              this.#setState(this.#operationState());
            this.emit('OnRequestComplete', {
              action,
              operationId: this.#selectedId() || null,
              error: failure,
            } satisfies WebPaymentsRequestEventDetail);
            if (
              !failure &&
              (monitor ?? this.autoWatch) &&
              this.#operation &&
              paymentNeedsMonitoring(this.#operation) &&
              !this.#workflow &&
              !this.#observation
            )
              this.StartWatching(this.#operation.id);
          }),
      };
      this.#workflow = workflow;
      return workflow.promise as Promise<T>;
    } catch (value) {
      const error = value instanceof Error ? value : new Error(String(value));
      this.#report(action, error);
      return Promise.reject(error);
    }
  }

  #available(): RestGoClient {
    if (this.#disposed) throw new WebPaymentsError('disposed', 'Payments has been disposed.');
    if (!this.enabled) throw new WebPaymentsError('disabled', 'Payments is disabled.');
    if (!isRestGoGatewaySlug(this.gatewaySlug))
      throw new WebPaymentsError(
        'not-configured',
        'Set the Payments gateway slug in the Inspector.',
      );
    let client: RestGoClient;
    try {
      client = getRestGoClient();
    } catch {
      throw new WebPaymentsError(
        'not-configured',
        'Enable and configure the project RestGO connection.',
      );
    }
    this.#attachClient(client);
    return client;
  }

  #identity(): { client: RestGoClient; userId: string } {
    const client = this.#available();
    const userId = client.CurrentUser?.id;
    if (!userId)
      throw new WebPaymentsError(
        'auth-required',
        'Sign in or await RestGO.getSession() before preparing or restoring Payments.',
      );
    if (this.#checkpoint && this.#checkpoint.userId !== userId)
      throw new WebPaymentsError(
        'context-changed',
        'The Payments attempt belongs to another customer.',
      );
    return { client, userId };
  }

  #assertIdle(observer?: AbortController, token?: symbol): void {
    if (
      this.#requestController !== null ||
      (this.#workflow !== null && this.#workflow.token !== token) ||
      (this.#observation !== null && this.#observation !== observer)
    )
      throw new WebPaymentsError('busy', 'Payments is busy with another action.');
  }

  #assertTarget(id: string): void {
    if (!isRestGoPaymentUUID(id))
      throw new WebPaymentsError('invalid-argument', 'A payment operation UUID is required.');
    if (this.#checkpoint && this.#checkpoint.operationId?.toLowerCase() !== id.toLowerCase())
      throw new WebPaymentsError(
        'attempt-conflict',
        'Recover the prepared attempt before selecting a different operation.',
      );
  }

  #attachClient(client: RestGoClient | null): void {
    if (client === this.#client || this.#disposed) return;
    this.#unsubscribeAuth?.();
    this.#unsubscribeAuth = undefined;
    this.#client = client;
    this.#ownerId = client?.CurrentUser?.id ?? null;
    this.#invalidate(true);
    this.#notified.clear();
    if (client)
      this.#unsubscribeAuth = client.onAuthStateChange((_event, session) => {
        const nextOwner = session?.user.id ?? null;
        if (this.#ownerId !== null && this.#ownerId !== nextOwner) {
          this.#notified.clear();
          this.#invalidate(true);
        }
        this.#ownerId = nextOwner;
        if (session && (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION'))
          this.#scheduleResume();
      }).unsubscribe;
    this.#scheduleResume();
  }

  #invalidate(clear: boolean): void {
    this.#version++;
    const reason = new WebPaymentsError(
      'context-changed',
      'The Payments context changed; retain saved recovery data.',
    );
    this.#requestController?.abort(reason);
    this.#requestController = null;
    this.#observation?.abort(reason);
    this.#observation = null;
    this.#observationGoal = null;
    this.#workflow?.controller.abort(reason);
    this.#workflow = null;
    if (!clear) {
      this.#setState('idle');
      return;
    }
    const previous = this.#operation;
    this.#checkpoint = null;
    this.#operation = null;
    this.#error = null;
    const hadHistory = this.#history.length > 0 || this.#nextCursor !== '';
    this.#history = Object.freeze([]);
    this.#nextCursor = '';
    this.#setState('idle');
    if (hadHistory && !this.#disposed)
      this.emit('OnHistoryChange', {
        items: this.#history,
        nextCursor: '',
        hasMore: false,
      } satisfies WebPaymentsHistoryEventDetail);
    if (previous && !this.#disposed)
      this.emit('OnOperationChange', {
        previous,
        operation: null,
      } satisfies WebPaymentsOperationEventDetail);
  }

  #select(operation: RestGoPaymentOperation): void {
    if (this.#checkpoint && this.#checkpoint.mode !== operation.mode)
      throw new WebPaymentsError(
        'attempt-conflict',
        'The operation mode differs from the prepared attempt.',
      );
    const previous = this.#operation;
    this.#operation = operation;
    const version = this.#version;
    if (JSON.stringify(previous) !== JSON.stringify(operation))
      this.emit('OnOperationChange', {
        previous,
        operation,
      } satisfies WebPaymentsOperationEventDetail);
    if (version !== this.#version || this.#disposed) return;
    if (
      !previous ||
      previous.id !== operation.id ||
      previous.synchronizationPending !== operation.synchronizationPending ||
      previous.synchronizationError !== operation.synchronizationError
    )
      this.emit('OnSynchronizationChange', {
        operation,
        pending: operation.synchronizationPending,
        error: operation.synchronizationError ?? null,
      } satisfies WebPaymentsSynchronizationEventDetail);
    if (version !== this.#version || this.#disposed) return;
    if (
      operation.checkoutUrl &&
      operation.checkoutState === 'completed' &&
      operation.status === 'pending' &&
      (previous?.id !== operation.id || previous.checkoutUrl !== operation.checkoutUrl)
    )
      this.emit('OnCheckoutReady', { operation } satisfies WebPaymentsCheckoutEventDetail);
    if (version !== this.#version || this.#disposed) return;
    const events: string[] = [];
    if (operation.mode === 'payment' && operation.status === 'succeeded')
      events.push('OnPaymentSucceeded');
    if (operation.mode === 'subscription' && ['active', 'trialing'].includes(operation.status))
      events.push('OnSubscriptionActivated');
    if (
      operation.mode === 'subscription' &&
      (operation.status === 'canceled' || operation.provider.cancelAtPeriodEnd)
    )
      events.push('OnSubscriptionCanceled');
    for (const event of events) {
      if (version !== this.#version || this.#disposed) return;
      if (!this.#notified.has(`${operation.id}:${event}`)) {
        this.#notified.add(`${operation.id}:${event}`);
        this.emit(event, { operation } satisfies WebPaymentsCheckoutEventDetail);
      }
    }
    if (!this.#workflow && !this.#observation) this.#setState(this.#operationState());
  }

  #report(
    action: WebPaymentsAction,
    error: Error,
    operationId = this.#operation?.id ?? null,
  ): void {
    if (this.#disposed) return;
    this.#error = error;
    this.emit('OnError', { action, operationId, error } satisfies WebPaymentsErrorEventDetail);
  }

  async #request<T>(
    action: WebPaymentsAction,
    external: AbortSignal | undefined,
    request: (gateway: RestGoPaymentGatewayClient, signal: AbortSignal) => Promise<RestGoResult<T>>,
    apply?: (data: T) => void,
    observer?: AbortController,
    operationId?: string,
    token?: symbol,
  ): Promise<T> {
    let scope: ReturnType<typeof paymentScope> | undefined;
    let version = this.#version;
    let failure: Error | null = null;
    const quiet = observer !== undefined || token !== undefined;
    let restoreWatch = false;
    try {
      const client = this.#available();
      version = this.#version;
      if (!quiet) this.#supersedeAutomaticResume();
      if (!quiet && !this.#workflow) {
        restoreWatch = this.watching;
        this.StopWatching();
      }
      this.#assertIdle(observer, token);
      scope = paymentScope(external);
      const signal = scope.controller.signal;
      this.#requestController = scope.controller;
      this.#error = null;
      const check = (): void => {
        if (signal.aborted) throw paymentAbortError(signal);
        if (version !== this.#version || client !== this.#client)
          throw new WebPaymentsError(
            'context-changed',
            'The Payments request belongs to an obsolete context.',
          );
      };
      check();
      const session = await paymentAwait(client.getSession(), signal);
      check();
      if (session.error) throw session.error;
      if (!session.data)
        throw new WebPaymentsError(
          'auth-required',
          'A customer Authentication session is required.',
        );
      const ownerId = session.data.user.id;
      if (this.#checkpoint && this.#checkpoint.userId !== ownerId)
        throw new WebPaymentsError(
          'context-changed',
          'The saved attempt belongs to another customer.',
        );
      const result = await paymentAwait(
        request(client.payments.gateway(this.gatewaySlug), signal),
        signal,
      );
      check();
      if (client.CurrentUser?.id !== ownerId)
        throw new WebPaymentsError(
          'context-changed',
          'The customer changed while Payments was requesting data.',
        );
      if (result.error) throw result.error;
      apply?.(result.data);
      check();
      return result.data;
    } catch (value) {
      failure = value instanceof Error ? value : new Error(String(value));
      if (!quiet && version === this.#version && !scope?.controller.signal.aborted)
        this.#report(action, failure, operationId ?? this.#operation?.id ?? null);
      throw failure;
    } finally {
      scope?.release();
      if (scope && this.#requestController === scope.controller) this.#requestController = null;
      if (!quiet && !this.#disposed && version === this.#version)
        this.emit('OnRequestComplete', {
          action,
          operationId: operationId ?? this.#operation?.id ?? null,
          error: failure,
        } satisfies WebPaymentsRequestEventDetail);
      if (
        restoreWatch &&
        version === this.#version &&
        !this.#disposed &&
        this.#operation &&
        paymentNeedsMonitoring(this.#operation) &&
        !this.#workflow
      )
        this.StartWatching(this.#operation.id);
    }
  }

  async #observe(
    id: string,
    options: WebPaymentsObservationOptions,
    goal: 'checkout' | 'confirmation' | 'watch',
    context?: PaymentWorkflowContext,
    waitForSynchronization = false,
  ): Promise<RestGoPaymentOperation> {
    const action = goal === 'checkout' ? 'wait' : goal === 'confirmation' ? 'confirm' : 'watch';
    let scope: ReturnType<typeof paymentScope> | undefined;
    let version = this.#version;
    let failure: Error | null = null;
    try {
      context?.check();
      this.#available();
      context?.check();
      version = this.#version;
      if (!context && !this.#workflow) this.StopWatching();
      this.#assertIdle(undefined, context?.token);
      this.#assertTarget(id);
      const interval = paymentMilliseconds(options.interval ?? this.pollInterval, 'Poll interval');
      const timeout = paymentMilliseconds(options.timeout ?? this.pollTimeout, 'Poll timeout');
      scope = paymentScope(context?.signal ?? options.signal, timeout);
      const observer = scope.controller;
      this.#observation = observer;
      this.#observationGoal = goal;
      this.#setState(goal === 'watch' ? 'watching' : 'waiting');
      context?.check();
      let failures = 0;
      for (;;) {
        if (observer.signal.aborted) throw paymentAbortError(observer.signal);
        try {
          const operation = await this.#request(
            'get',
            observer.signal,
            (gateway, signal) => gateway.getOperation(id, { signal }),
            (value) => this.#select(value),
            observer,
            id,
            context?.token,
          );
          failures = 0;
          if (goal === 'confirmation') {
            if (
              paymentConfirmed(operation) &&
              (!waitForSynchronization ||
                (!operation.synchronizationPending && !operation.synchronizationError))
            )
              return operation;
            if (waitForSynchronization && operation.synchronizationError)
              throw new WebPaymentsError(
                'synchronization-failed',
                'The payment result could not be synchronized to the purchase source.',
              );
            if (paymentFailed(operation))
              throw new WebPaymentsError(
                'payment-failed',
                `The operation is ${operation.status}; no new charge was created.`,
              );
          }
          if (goal === 'watch' && !paymentNeedsMonitoring(operation)) return operation;
          if (goal === 'checkout') {
            if (operation.checkoutState === 'uncertain')
              throw new WebPaymentsError(
                'checkout-uncertain',
                'Checkout preparation is uncertain. Keep this operation and contact support.',
              );
            if (
              operation.checkoutUrl &&
              operation.checkoutState === 'completed' &&
              operation.status === 'pending'
            )
              return operation;
            if (
              !['pending', 'processing', 'completed'].includes(operation.checkoutState) ||
              (operation.mode === 'payment' &&
                ['succeeded', 'failed', 'expired', 'refunded', 'partially_refunded'].includes(
                  operation.status,
                )) ||
              (operation.mode === 'subscription' && operation.provider.subscriptionId)
            )
              throw new WebPaymentsError(
                'checkout-unavailable',
                'The checkout is closed or unavailable. Consult the operation financial state.',
              );
          }
        } catch (error) {
          if (!paymentTransient(error) || observer.signal.aborted) throw error;
          failures++;
          const delay = Math.max(
            interval,
            Math.min(30000, interval * 2 ** Math.min(failures, 5)),
            error.retryAfterMs ?? 0,
          );
          await paymentDelay(delay, observer.signal);
          continue;
        }
        await paymentDelay(interval, observer.signal);
      }
    } catch (value) {
      failure = value instanceof Error ? value : new Error(String(value));
      const stopped =
        scope?.controller.signal.aborted &&
        !(failure instanceof WebPaymentsError && failure.kind === 'timeout');
      if (!context && !stopped && version === this.#version) this.#report(action, failure, id);
      throw failure;
    } finally {
      scope?.release();
      if (scope && this.#observation === scope.controller) {
        this.#observation = null;
        this.#observationGoal = null;
      }
      if (!context && !this.#disposed && version === this.#version)
        this.emit('OnRequestComplete', {
          action,
          operationId: id,
          error: failure,
        } satisfies WebPaymentsRequestEventDetail);
      if (
        !context &&
        !this.#disposed &&
        version === this.#version &&
        !this.#workflow &&
        !this.#observation
      )
        this.#setState(
          failure &&
            (!scope?.controller.signal.aborted ||
              (failure instanceof WebPaymentsError && failure.kind === 'timeout'))
            ? 'error'
            : this.#operationState(),
        );
    }
  }
}
