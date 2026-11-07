# Payments

`WebPayments` turns a purchase key into a hosted Stripe or Asaas checkout with
one call. Insert **Payments** from **Nonvisual**, set **Gateway slug**, and use
the project's existing RestGO connection and customer Authentication login.

Inside an async button handler, the standard payment flow is:

```typescript
await this.Payments1.Pay(this.Edit1.value);
```

The component restores the session, recovers or prepares the attempt, saves its
idempotency key, creates the checkout when needed, waits for its URL, saves the
operation ID, and opens checkout. Normal use requires no manual checkpoint code
or separate `PrepareCheckout`, `WaitForCheckout`, or `OpenCheckout` calls.

The input is the purchase's **source key**, kept as a string, including PostgreSQL
`int8` identifiers. The trusted application backend creates that purchase.
RestGo reads its price, currency, owner and recurrence from the configured source.
The RestGo dashboard owns gateway activation, provider credentials, payment source
mappings, webhooks, license requirements, and fixed success/cancel destinations.

## Start a payment or subscription

Choose the method for the intended operation:

```typescript
// One-time payment, including opening the provider checkout.
await this.Payments1.Pay(purchaseId);
```

```typescript
// Subscription, including opening the provider checkout.
await this.Payments1.Subscribe(purchaseId);
```

```typescript
// Use payment/subscription from the component's Inspector Mode setting.
await this.Payments1.Checkout(purchaseId);
```

These methods return `Promise<RestGoPaymentOperation>`. Opening checkout does not
mean the customer has paid. If recovery finds an already confirmed payment or
active subscription, the method returns that operation without another checkout
redirect or a new charge. Repeated calls preserve the original attempt. Matching
concurrent calls share the current workflow; a conflicting concurrent action
reports `busy` rather than interleaving purchases.

Bind `OnError` in Interaction or catch a request error directly:

```typescript
try {
  await this.Payments1.Pay(this.Edit1.value);
} catch (error: unknown) {
  Message(error instanceof Error ? error.message : String(error));
}
```

Choose one place for the application's error message to avoid displaying it
twice. An application can prepare a custom checkout UI without redirecting:

```typescript
const operation = await this.Payments1.Pay(purchaseId, { openCheckout: false });
// Use Payments1.checkoutUrl or a later Payments1.OpenCheckout() action.
```

`Pay`, `Subscribe`, and `Checkout` options are
`{ openCheckout?, interval?, timeout?, signal? }`. `openCheckout` defaults to true;
interval/deadline default to the Inspector settings. A transient lost response
never causes the component to generate another idempotency key automatically.

## Inspector defaults

| Property          | Default   | Meaning                                                                                                                    |
| ----------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `gatewaySlug`     | Empty     | Configured lowercase gateway slug; required before use.                                                                    |
| `mode`            | `payment` | Default for `Checkout` and mode-specific recovery.                                                                         |
| `enabled`         | `true`    | Allows operations; enabling never creates a charge.                                                                        |
| `autoResume`      | `true`    | Restores/query-observes a saved operation after customer session restoration. Never POSTs or opens checkout automatically. |
| `autoWatch`       | `true`    | Follows the selected operation's pending confirmation and source synchronization.                                          |
| `persistAttempts` | `true`    | Saves attempt recovery data automatically before sending or navigating.                                                    |
| `pollInterval`    | `2000`    | Default observation interval, in milliseconds.                                                                             |
| `pollTimeout`     | `60000`   | Local workflow/observation deadline, in milliseconds.                                                                      |

Interval/deadline values are integers from 1 through 2147483647. Changing `mode`
affects future attempts and does not reinterpret a saved purchase. Only authoring
settings belong in the Project Model; live attempts, operations, storage adapters,
tokens, checkout URLs, and request state are not component `props`.

The concrete instance is available as both `Payments1` and `this.Payments1`, with
native Monaco completion, signatures and diagnostics. Each page/reusable placement
owns its request state; customer authentication comes from the shared RestGO client.

## Return and recovery

Automatic resumption waits until generated event handlers can bind and the
customer session is available. It restores this instance's saved attempt for the current customer,
GETs an already known operation ID, and observes it when appropriate. Mounting a
page, restoring a login, or returning from a provider **never creates a charge or
redirects back to checkout**. A saved attempt without an operation ID remains
available for an explicit user action to recover.

Recent automatic recovery is scoped to the runtime component ID, including each
reusable placement. Purchase attempts themselves are shared by API, customer,
gateway, source and mode so matching instances reuse the original key. An explicit
`Resume()` on another return page can fall back to the gateway/customer's most
recent attempt; `Resume(purchaseId)` selects that purchase directly.

An application can request recovery explicitly with one call:

```typescript
// Recover the selected or most recent saved attempt for this API/gateway/customer.
const operation = await this.Payments1.Resume();
```

```typescript
// Recover a specific purchase. Resume never opens checkout.
const operation = await this.Payments1.Resume(purchaseId);
```

`Resume(sourceKey?, options?)` returns the operation, or null if none is saved.
Options are `{ mode?, watch?, interval?, timeout?, signal? }`; `mode` defaults to
the Inspector value and `watch` to `autoWatch`. Explicit recovery can safely replay
a saved attempt whose POST response was lost, using its original source, mode,
and idempotency key. Automatic mount-time recovery never performs that POST.

For a read-only update, use:

```typescript
const operation = await this.Payments1.Refresh();
```

`Refresh({ signal? }?)` queries the selected or saved operation ID, returns null
when there is no known ID, and never creates a checkout. High-level actions
coordinate their background observation internally; no manual `StopWatching()`
is required before refreshing, loading history or canceling a subscription.

RestGo uses fixed HTTP(S) success/cancel URLs configured on the gateway, without
URL fragments. A return URL or provider redirect is not proof of payment. The
current history response omits `sourceKey`, so identifying an arbitrary purchase
on another device requires an application-owned durable purchase/operation link.

Preview/F9 has a changing loopback publication address. The configured gateway
return URL does not automatically return into that Preview. Hosted provider
checkout and return navigation remain subject to browser/frame restrictions.
Native custom-scheme returns require a separate server/platform contract.

## Confirmation and events

The default Interaction is `OnPaymentSucceeded`; double-click it to generate a
typed handler. Use `OnSubscriptionActivated` for subscription activation and
`OnSubscriptionCanceled` for cancellation state or scheduling. These events carry
`event.detail.operation` and a concrete `WebPayments` sender.

```typescript
// Inside the generated OnPaymentSucceeded handler:
Message('Payment confirmed: ' + event.detail.operation.id);
```

`checkoutState` describes checkout creation. `status` describes the financial
operation. `synchronizationPending` / `synchronizationError` describe writing the
result back to the application's database. A checkout with `completed` creation
state is not a confirmed payment. A payment may be confirmed before its source
database update finishes. Fulfillment and protected access stay server-authorized.

For code that needs to await confirmation, use:

```typescript
const operation = await this.Payments1.WaitForConfirmation();
```

```typescript
const operation = await this.Payments1.WaitForConfirmation({
  operationId,
  waitForSynchronization: true,
});
```

This method understands payment success versus subscription activation. It uses
the current/saved operation by default and accepts `{ operationId?,
waitForSynchronization?, interval?, timeout?, signal? }`. Financial confirmation
is sufficient by default. Asking for synchronization also waits for the source
update and surfaces synchronization failure separately.

All 13 events are available through Interaction:

| Event                     | Typed detail                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `OnPaymentSucceeded`      | `operation` for a confirmed one-time payment.                                         |
| `OnSubscriptionActivated` | `operation` for an active/trialing subscription.                                      |
| `OnSubscriptionCanceled`  | `operation`; inspect period end and cancellation scheduling.                          |
| `OnCheckoutCreated`       | Accepted `operation`, which can still be preparing.                                   |
| `OnCheckoutReady`         | `operation` with an open checkout URL.                                                |
| `OnCheckoutOpened`        | `operation` whose checkout navigation was requested.                                  |
| `OnOperationChange`       | `previous`, `operation`; current operation can be null after clearing/context change. |
| `OnSynchronizationChange` | `operation`, `pending`, `error`.                                                      |
| `OnHistoryChange`         | `items`, `nextCursor`, `hasMore`.                                                     |
| `OnStateChange`           | `previous`, `state`.                                                                  |
| `OnRestored`              | `checkpoint`, `operation`, `automatic`.                                               |
| `OnError`                 | `action`, `operationId`, `error`.                                                     |
| `OnRequestComplete`       | `action`, `operationId`, `error`, which is null on successful completion.             |

`OnCheckoutOpened` means navigation was requested; `OnRequestComplete` means a
request/workflow settled. Neither means payment succeeded. Events are deduplicated
within an instance where appropriate; they do not promise exactly-once financial
delivery across reloads or devices. Backend webhooks remain authoritative.

## History and cancellation

```typescript
const items = await this.Payments1.LoadHistory();
```

```typescript
const items = await this.Payments1.LoadMore();
```

`LoadHistory({ before?, signal? }?)` replaces the component's history with one
cursor page. `LoadMore({ signal? }?)` appends the next page, deduplicates operation
IDs, and returns the accumulated readonly array; calling it on the final page is
a harmless no-op. Readonly `history`, `hasMore`, and `nextCursor` and
`OnHistoryChange` support existing lists/grids. The API orders records by UUID,
with up to 50 records per page. History does not select a record or contain
checkout URLs. Use `GetOperation(id)` to select an operation explicitly.

After the customer chooses to cancel the current subscription:

```typescript
const operation = await this.Payments1.CancelSubscription();
```

Or target an existing operation explicitly:

```typescript
const operation = await this.Payments1.CancelSubscription(operationId);
```

Cancellation options are `{ signal? }`. Stripe schedules cancellation with the
provider; Asaas removes recurrence immediately while preserving the paid period
in the normalized response. Inspect `provider.periodEnd`,
`provider.cancelAtPeriodEnd`, and `status`. Canceling does not request a refund.

## Component state and recovery storage

Readonly helpers reduce UI bookkeeping:

- `state`, `busy`, and `watching` describe local activity.
- `operation`, `status`, and `checkoutState` describe the selected operation.
- `synchronizationPending` and `synchronizationError` expose source update state.
- `checkoutUrl`, `canOpenCheckout`, and `canCancelSubscription` support action UI.
- `history`, `hasMore`, and `nextCursor` support pagination.
- `attempt` and `error` expose the current immutable attempt and last error.

States include `idle`, `restoring`, `preparing`, `creating`, `waiting`, `opening`,
`watching`, `refreshing`, `loading-history`, `canceling`, `ready`, `confirmed`,
`canceled`, `uncertain`, `failed`, and `error`. Local state is not a substitute for
the financial or synchronization fields.

With `persistAttempts: true`, recovery is saved in browser `localStorage` and
serialized with purchase-scoped Web Locks. Keys are scoped to API URL, gateway,
customer, source key, and mode. The component saves the attempt before POST and
the operation ID before navigation. Records contain no JWT, refresh token,
provider secret, or temporary checkout URL. They are runtime recovery data,
not Project Model configuration or cross-device persistence.

Unavailable storage/locking or invalid saved data produces a clear
`storage-unavailable` / `storage-corrupt` error. The default flow never silently
falls back to memory or replaces a damaged record with a fresh charge attempt.
An explicitly selected `persistAttempts: false` is advanced, nondurable operation:
the application then owns recovery across reloads and devices.

Advanced runtime construction can provide the `storage` option implementing
`WebPaymentsStorageAdapter`: synchronous `getItem`, `setItem`, and `removeItem`,
plus optional `withLock<T>(name, action, signal?)`. The adapter is runtime-only and
is not serialized. If `withLock` is absent, browser Web Locks are required. A
custom adapter must durably preserve records and coordinate the same purchase
across participating callers.

`Clear()` clears local selection/work, including history, while retaining durable
attempts. Logout/account change, client replacement, and disposal cancel obsolete
requests and prevent late navigation. Disabling stops local work. No local stop,
abort, timeout, clear, or disposal cancels the backend transaction. No failed
request automatically creates another charge with a different key.

## Advanced control and direct SDK

Existing lower-level APIs remain available for authored workflows:

```typescript
this.Payments1.PrepareCheckout(purchaseId, 'payment');
const operation = await this.Payments1.CreateCheckout();
await this.Payments1.WaitForCheckout(operation.id);
this.Payments1.OpenCheckout();
```

`PrepareCheckout` is synchronous and needs an already restored customer identity.
Default persistence saves its checkpoint. `CreateCheckout` returns the accepted
operation and **does not open checkout**; the high-level `Pay`, `Subscribe`, and
`Checkout` methods own automatic opening. `GetOperation`, `ListOperations`,
`StartWatching`, `StopWatching`, `ExportCheckpoint`, and `RestoreCheckpoint` are
also available. Low-level callers own sequencing and can use explicit observation
control when necessary.

The SDK remains a transport API:

```typescript
const gateway = RestGO.payments.gateway('customer-payments');
```

It exposes `createCheckout`, `getOperation`, `listOperations`, and
`cancelSubscription`, returning `RestGoResult`. Direct SDK users provide/persist
their own idempotency key. All four routes require the customer Authentication
session, never an application API token or dashboard cookie. HTTP 200 and 202
are valid successes. RestGo CORS must allow the deployed application origin.

Async component failures retain `RestGoError` for HTTP/network errors or use
`WebPaymentsError` for orchestration. Timeout/abort is local; `uncertain` retains
the attempt for support rather than issuing another charge. Unknown financial
states stay visible and are not assumed successful. Gateway endpoint activity,
including observation and errors, currently cancels scheduled deletion during
RestGo's grace period. The Designer never polls payment routes.

The implemented API and existing smoke interactions still require explicitly
requested validation. Local HTTP fixture evidence does not certify a live gateway,
provider checkout, hosted return, or webhook-driven financial confirmation.
