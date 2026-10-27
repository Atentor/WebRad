# RestGo SDK

Browser-safe TypeScript client for authentication, Storage, resumable video
uploads, and published RestGo endpoints. It has no Designer, Electron, or Node.js
dependency. This package is a source workspace in the WebRAD repository; it is
not automatically published to npm. WebRAD's compiler resolves its import directly.

```ts
import { createClient } from '@webrad/restgo-sdk';

const client = createClient('https://api.example.com', {
  apiVersion: 1,
  defaultDatabase: 'customers',
  persistSession: true,
  sessionStorage: 'local',
});

const login = await client.login('anna@example.com', 'user-password');
if (login.error) throw login.error;
const customers = await client.from<{ id: number; name: string }[]>('list').get({
  query: { active: true },
  page: 1,
});
if (customers.error) throw customers.error;
```

Database, endpoint, and response names must match your published server APIs.
Operations return `{ data, error }`; `login()` also exposes the public `sucess`
discriminant. HTTP failures include `error.status`; network/cancellation codes
include `NETWORK_ERROR` and `ABORTED`. Dynamic API results preserve pagination
metadata (`page`, `total_pages`, `has_more`, `next_cursor`).

## Authentication

Shortcuts `login`, `logout`, `getSession`, `getUser`, `refreshSession`, and
`onAuthStateChange` share `auth` state and persistence. Event subscriptions return
`{ unsubscribe }`. See the [complete authentication guide](../../docs/restgo-sdk.md#login-and-session)
for typed results, CurrentUser, Interaction events, restore, and refresh.

- `auth.signInWithPassword({ email, password, remember? })` sends public
  `POST /auth/token` without Authorization, even with an existing session/token.
- `auth.ready` validates restored credentials; `getSession()`/`getUser()` consult
  `/auth/session`. Refresh uses `POST /auth/refresh` with only `{ refreshToken }`.
- `auth.setSession({ token, expiresAt, refreshToken?, refreshExpiresAt? })`
  validates before replacement; supply both refresh fields together.
- `auth.signOut()` revokes the session. Transient failure retains credentials.
- `auth.signUp({ email, password, fullName?, active? })` uses public `/auth/users`,
  without an API token or automatic login. The server must permit registration;
  otherwise its HTTP rejection, such as 401, is returned.
- Recovery, confirmation, and avatar methods follow the
  [account contracts](../../docs/restgo-sdk.md#registration-recovery-confirmation-and-avatars).
- Auth events are `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`,
  `SESSION_VALIDATED`, `TOKEN_REFRESHED`, and `USER_UPDATED`.

Persistence options are `persistSession`, `sessionStorage` (`local`, `session`,
`memory`), and `storageKey`. Records are bound to the normalized instance URL;
unbound legacy records and other-server credentials are not sent. Unavailable
storage falls back to memory. Public login errors, invalid API tokens, and network
failures do not clear a valid session.

Automatic refresh defaults to enabled. Concurrent refresh is shared; local-storage
coordination requires Web Locks in a secure context. Without it,
`REFRESH_LOCK_UNAVAILABLE` preserves credentials; use session/memory storage.
Refresh tokens are single-use. Network/429/5xx failures retain credentials and
back off, respecting `error.retryAfterMs`; refresh 401 ends the session. A lost
rotation response can require login. `autoRefreshToken: false` retains manual
refresh. `dispose()` stops timers/listeners without revoking the session.

OAuth, arbitrary profile editing, and administrative account management are
outside the browser contract. Never configure the server master credential here.

## Storage

```ts
const uploaded = await client.storage.upload(file, {
  name: 'document.pdf',
  isPublic: false,
});
if (uploaded.error) throw uploaded.error;
const downloaded = await client.storage.download(uploaded.data.id);
const removed = await client.storage.remove(uploaded.data.id);
```

Storage supports list/get/update/remove/usage, multipart upload, Blob download,
Range, and public URLs. See the [method reference](../../docs/restgo-sdk.md#storage).
`list()` preserves either the original list or paginated
`{ data, page, page_size, has_more }` envelope. Private operations need the
Authentication JWT. Public URLs do not change file permissions.

Upload/update accept `onUploadProgress({ loaded, total, percentage,
lengthComputable })`. Measurements include the entire multipart body. Unknown
totals yield `null`; measured 100% means the body was sent, not that server storage
completed. A retry after JWT refresh starts a new measurement.

Measured progress uses `XMLHttpRequest.upload` only when requested, in an HTTP(S)
page, against a different origin, with `withCredentials: false`. Same-origin,
nonbrowser, and custom-fetch clients retain fetch with `credentials: 'omit'` and
`redirect: 'error'`, reporting indeterminate progress. No intermediate percentages
are simulated. The browser sets multipart boundaries.

Configure the final server URL without redirects. XHR may follow redirects before
exposing its final URL; the SDK rejects a final URL different from the request.
This cannot prevent the first redirected request or detect a chain returning to
the original URL. Browsers remove Authorization on cross-origin redirects.
Requests without measured progress retain fetch's early redirect rejection.

## Published endpoints and videos

```ts
const result = await client.api
  .from('customers')
  .endpoint('find')
  .post({ customer_id: 42 }, { version: 2, auth: 'session' });
```

Routes use `/v{version}/{database}/{endpoint}`. Methods are `get`, `post`, `put`,
`patch`, `delete`, `head`, and `options`; writes accept `(body?, options?)`, others
`(options?)`. `RestGoDynamicOptions` supports query, exact/simple/cursor pagination,
cursor column/value, version, headers, and AbortSignal.

Use `auth: 'session'` for JWT, `'apiToken'` with an explicitly configured
application token, or `'none'` for public access. `'auto'` chooses the current
session then application token, without fallback after rejection. Dynamic JWT
rejection is checked against `/auth/session` before clearing the session. An
application token is browser-visible; it must have suitable permissions.

The `videos` service adds SHA-256 binary chunking, confirmed progress, verified
checkpoints, session refresh, explicit processing waits, library, metadata, jobs,
HLS descriptors, and thumbnails. It uses Authentication JWT; public HLS/thumbnail
access must explicitly select `{ public: true }`. See [Video Upload](../../docs/video-upload.md).

Direct table queries, remote SQL, and bucket operations are outside these APIs.
For IDE setup and complete integration details, use the
[RestGo guide](../../docs/restgo-sdk.md).
