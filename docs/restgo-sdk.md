# RestGo SDK

`@webrad/restgo-sdk` uses standard browser APIs (`fetch`, `FormData`, `Blob`) for
authentication, Storage, videos, and dynamic APIs. Preview and compiled applications
share the client without Electron or Node.js. Public registration requires the
server to allow `POST /auth/users` without `Authorization`.

`RestGO.videos` provides resumable binary uploads, verified checkpoints, library,
metadata, jobs, and HLS descriptors. The nonvisual `WebVideoUpload` integrates it
with Designer, Monaco, and Preview. These routes use the Authentication session,
never the application API token. See [Video Upload](video-upload.md).

## WebRAD configuration

Open **RestGo integration** through the database icon in the activity rail.
**Connection** separates application SDK settings from IDE administration.

- Enable **Enable native RestGO integration** and enter the HTTP(S) instance URL.
  Reverse-proxy prefixes, such as `https://example.com/backend`, are preserved.
- Leave **Application API token** empty for public registration/login. Set it
  without `Bearer` only for dynamic APIs needing an application token. It persists
  as `settings.restGo.apiToken` and is visible in browser JavaScript.
- Choose request versions in API Client; optionally set a default database slug.
- Choose local, session, or memory storage and a key distinguishing applications
  sharing an origin.
- Click **Save changes**, then save the project. Settings persist in `.wrproj`
  under `settings.restGo`.

The compiler configures the shared `RestGO` client before constructing pages.
Access while disabled throws `RestGoNotConfiguredError` with configuration guidance.
Automatic dynamic-API authorization uses `Bearer <JWT>` during a session and the
raw configured API token otherwise, including after logout. Rejection never
triggers a fallback to a different credential type.

Registration, login, refresh, and public recovery/confirmation calls omit
`Authorization`, even with an existing session/token. Failures of public calls
do not end a valid session. Keep `RESTGO_AUTHORIZATION` and administrative secrets
on the server; an application token is part of exported project code.

## Endpoint administration in the IDE

Set a separate administrative API token in **Connection**. **Connect** checks
permission against the saved integration URL. Apply URL changes before connecting.
The token stays in Electron's main process. Optional remembering uses encrypted
OS storage in the local IDE profile; without secure storage it remains temporary.
**Disconnect** removes the remembered credential. It never enters `.wrproj`,
API Client operations, Preview, or Build.

In **Endpoints**, edit a slug/version and HTTP methods using parameterized SQL
or an existing API Operation. Saving writes to the server. Publishing binds the
group to an existing database, selects JWT/API Token/public access, and activates
required records. Group methods share publication/authentication policy. These
remote operations take effect immediately; local Designer undo covers project
components only.

Published endpoints restore **Database** and **Required credential**. With multiple
publications, the configured default database is preferred, otherwise the first.
Selecting another database loads its saved authentication policy.
**Published APIs** lists routes, database, version, method, authentication, and
availability. Only active routes with active database/endpoint and any required
API Operation can be imported.

Add/open an **API Client** and choose **Import from RestGo**. Import preserves
IDs/existing operations, fills routes, versions, methods, and inputs, and prevents
duplicates. Each client has one authentication mode; use separate clients for
different modes. Converting a custom client needs explicit confirmation in the
editor. Routes escaping the integration URL are rejected.

The importer can reconnect using **Administrative API token** without closing or
losing request drafts. A rejected credential stops indicating an active connection;
transient network/server failures preserve it. Remembering still requires secure
storage. See [import synchronization](api-client.md#updating-imported-restgo-apis)
for updating existing operations across open/closed pages and reusables.

| API Client connection                        | Credential policy                                          |
| -------------------------------------------- | ---------------------------------------------------------- |
| RestGo JWT Authentication (`restgo-session`) | Current validated session; no API-token fallback.          |
| RestGO API Token (`restgo-api-token`)        | Raw `settings.restGo.apiToken`, including while signed in. |
| RestGO Public (`restgo-public`)              | No Authorization or cookies.                               |

These modes fix the integration base URL, manage Authorization, use browser fetch,
respect CORS, and reject redirects. Response fields are inferred from a real test
request. Response samples, selected files, and temporary credentials are not saved.

Body templates support `<name>` placeholders, for example
`{"customerId": <customerId>}`. **Body** discovers inputs and stores their types;
repeated names share an input and removed placeholders remove it. Test values
remain in memory. At runtime, pass `parameters` to `execute()`; substitution
preserves numbers, booleans, objects, arrays, and null, and JSON-escapes strings.
It does not change authentication mode.

## Development login in API Client

After saving connection settings, use **Development login** under **Application
SDK**, then **Sign in for development** with an application user's credentials.
No administrative connection is needed.

**Remember development login on this device** encrypts JWT, refresh token, and
expiration dates in the OS-backed local IDE profile. Passwords are never stored.
Without secure storage, credentials last until the window closes. Sessions are
keyed by normalized instance URL, including proxy prefix, in
`restgo-development-credentials`, separate from administrative credentials.

With **RestGo JWT Authentication**, leave **Test JWT** empty. Before each test,
the IDE validates `/auth/session`, attempts `/auth/refresh` after 401, and serializes
rotation between windows. Definitive rejection removes saved credentials;
transient failures retain them. An explicit Test JWT overrides the session only
in that editor. Other connection modes retain their own policies.

**Sign out and forget session** attempts remote logout and always removes the
local copy. Authentication uses validated main-process IPC without cookies or
redirects; endpoint tests still execute in the browser with CORS. Development
credentials never enter project files, Preview, or Build. Applications have their
own login flow.

## Login and session

With components named `Email` and `Password` and a destination page `Home`:

```ts
const login = await RestGO.login(this.Email.text.trim(), this.Password.text, true);
if (!login.sucess) {
  Message(login.error.message);
  return;
}
Message(`Hello, ${login.data.user.fullName}`);
Navigate('Home');
```

The public result field is spelled **`sucess`**. `RestGoLoginResult` discriminates
success and failure: `data.user` is available on success, `error.message` on failure.
Failed login returns `sucess: false` even if an earlier session is still valid.
The optional third argument, `remember`, defaults to `false`; the server determines
credential lifetime, while Project Settings controls browser persistence.

| Shortcut                            | Result in `data`                         |
| ----------------------------------- | ---------------------------------------- |
| `login(email, password, remember?)` | Authenticated session, user, and tokens. |
| `logout()`                          | Session revocation result.               |
| `getSession()`                      | Server-validated session or `null`.      |
| `getUser()`                         | Server-validated user or `null`.         |
| `refreshSession()`                  | Rotated session and credentials.         |
| `onAuthStateChange(callback)`       | Directly returns `{ unsubscribe }`.      |

Async methods return `{ data, error }`; `login()` also includes `sucess`. The same
shortcuts exist on clients created with `createClient()`, alongside `auth` methods.
Navigation is explicit application logic; login does not choose a page.

```ts
await RestGO.auth.ready;
const { data: session, error } = await RestGO.getSession();
const { data: user } = await RestGO.getUser();
const subscription = RestGO.onAuthStateChange((event, currentSession) => {
  // Update the UI from the validated session and event.
});
subscription.unsubscribe();
await RestGO.logout();
```

`auth.ready` validates restored credentials, refreshing an expired JWT first when
possible. `getSession()` calls `GET /auth/session`. `expiresAt` schedules refresh;
it does not prove current server validity. Logout, administration, password reset,
and backend restart can revoke a session earlier.

Errors include `message`, `code`, `status`, details, and `retryAfterMs` when
available. Network failures, 429, and 5xx retain credentials. Authoritative JWT
401 attempts refresh; refresh 401 clears the session. Dynamic endpoint JWT 401
revalidates the session because the endpoint may require a different credential.
A network error alone never proves logout. Restored identity comes from server
validation; blocked/disabled persistent storage falls back to memory.

## Authentication events in Interaction

Select a page in **Builder**, open **Interaction → RestGO**, and double-click
**OnLogin**, **OnLogout**, or **OnUnauthenticated**. WebRAD creates a typed handler
and persists its association. Enable the integration to receive notifications.

`OnLogin` supplies `event.detail.user` after login or when showing a page with an
existing authenticated session; the latter sets `restored: true`. Validation or
refresh of that session does not repeat login. `OnLogout` supplies the previous
user after confirmed logout/revocation. Network errors do not emit logout. Hidden,
closed, or disposed pages stop observing; reusable observers last while mounted.
User detail contains identity only, without tokens:

| Field                 | Type             | Meaning              |
| --------------------- | ---------------- | -------------------- |
| `user.id`             | `string`         | User ID.             |
| `user.fullName`       | `string`         | Full name.           |
| `user.email`          | `string`         | Email address.       |
| `user.avatarUrl`      | `string \| null` | Optional avatar URL. |
| `user.active`         | `boolean`        | Active account.      |
| `user.emailConfirmed` | `boolean`        | Confirmed email.     |

### Detecting unauthenticated users

`OnUnauthenticated` fires when a page appears without a confirmed session or the
SDK confirms session termination, even without a preceding OnLogin. It receives
only `sender`. On protected pages, its body can redirect:

```ts
Navigate('Login');
```

Keep the login page accessible without a session. Runtime checks on page display,
every 30 seconds while visible, and on focus/visibility return. One timer per
shared client and shared concurrent validation avoid duplicate requests. Confirmed
logout notifies immediately; server revocation is detected by the next check or
protected operation after any refresh attempt.

Notification occurs once per unauthenticated period per page. New login allows
another notification after termination; hide/show starts a new observation.
Disposal releases subscriptions and the last observer stops monitoring. Disabled
integration, network errors, 429/5xx, and failed initial network validation do not
emit false unauthenticated redirects.

### Keeping user data in page fields

Local variables last for the handler. Declare fields on the page class when other
methods need the values, and populate/clear them in the handlers created by
Interaction. Keep handler names consistent with saved associations:

```ts
import type { WebPage, WebPageLoginEventDetail, WebPageLogoutEventDetail } from '@webrad/runtime';
import { PageMainGenerated } from './PageMain.generated';

export class PageMain extends PageMainGenerated {
  private userId = '';
  private userName = '';
  private userEmail = '';

  public async PageMainLogin(
    sender: WebPage,
    event: CustomEvent<WebPageLoginEventDetail>,
  ): Promise<void> {
    this.userId = event.detail.user.id;
    this.userName = event.detail.user.fullName;
    this.userEmail = event.detail.user.email;
  }

  public async PageMainLogout(
    sender: WebPage,
    event: CustomEvent<WebPageLogoutEventDetail>,
  ): Promise<void> {
    this.userId = '';
    this.userName = '';
    this.userEmail = '';
  }
}
```

This example assumes a page named `PageMain`; use your page's generated base class
and Interaction handler names. Preserve its other methods. Interaction creates
the corresponding runtime type imports. Fields last for that page instance and are recreated on navigation.
The SDK shares the session; the next page receives its current user through
OnLogin. `await RestGO.getUser()` fetches a current server-validated identity
outside these events.

## Reading CurrentUser

```ts
const user = RestGO.CurrentUser;
if (user) {
  Message(user.nome);
  // Also: user.email, user.id, user.emailconfirmed, user.ativo.
}
```

The existing API retains these property names: `nome`, `email`, and `id` are
read-only strings; `emailconfirmed` and `ativo` are booleans. Each access returns
an immutable snapshot of the last server-confirmed identity. A captured variable
retains that snapshot. Login, validated restore, refresh, and validation update
it; confirmed logout/revocation clears it. Network failures retain identity.

It returns `null` without a session or during initial restoration. Await
`RestGO.auth.ready` to wait for restoration. Reading does not make a request or
prove current server validity; use `getUser()` for that. Independent clients
expose the same property.

## Session refresh

Login/refresh returns `token`, `expiresAt`, `refreshToken`, `refreshExpiresAt`, and
`user`. Credentials persist in one record. Refresh happens before expiration,
before protected calls with expired JWTs, and after authoritative 401. A rejected
protected call may retry once with the new JWT, preserving JSON, multipart, or
binary downloads. Network/5xx failures do not automatically replay writes.

`POST /auth/refresh` sends only `{ refreshToken }`, without password or Authorization.
Each refresh consumes the old token. Concurrent calls share refresh. Clients/tabs
sharing local storage, instance URL, and storage key coordinate through Web Locks
and reread credentials after acquiring the lock.

Shared local-storage refresh requires Web Locks in HTTPS or localhost. Otherwise
`REFRESH_LOCK_UNAVAILABLE` preserves the session without consuming the token; use
session or memory storage. Manually copying tokens to separate stores/processes
requires external coordination. Network/429/5xx refresh failures back off from
1–60 seconds and respect a longer `Retry-After`. Expired, consumed, or revoked
refresh tokens require login. A lost response after rotation can also require
login. Legacy sessions without refresh remain valid until rejected. RestGo keeps
session digests in memory, so backend restart requires login.

`remember` lifetime remains server-controlled. Logout waits for active rotation
and revokes the current session. Independent clients can set
`autoRefreshToken: false` for manual control. `client.dispose()` stops timers/listeners without logout;
runtime disposes the client when replacing the connection.

## Registration, recovery, confirmation, and avatars

| Method                                                                    | Server contract                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `auth.signUp({ email, password, fullName?, active? })`                    | Public `POST /auth/users`; returns a user without automatic login.              |
| `auth.setSession({ token, expiresAt, refreshToken?, refreshExpiresAt? })` | Validate through `GET /auth/session`; refresh fields must be supplied together. |
| `auth.resetPasswordForEmail(email, { url? })`                             | `POST /auth/password-reset/request`.                                            |
| `auth.confirmPasswordReset({ token, password })`                          | `POST /auth/password-reset/confirm`.                                            |
| `auth.confirmEmail(token)`                                                | `POST /auth/email-confirmation/confirm`.                                        |
| `auth.uploadAvatar(blob, { name?, signal? })`                             | Multipart `PUT /auth/avatar` with `file`.                                       |
| `auth.deleteAvatar()`                                                     | `DELETE /auth/avatar`.                                                          |

Registration never sends an existing JWT/API token and does not locally require
`API_TOKEN_REQUIRED`. A server disallowing public registration returns its HTTP
error, such as 401. Administrative user management/confirmation resend remain
server administration APIs. Recovery supports an optional HTTP(S) link destination;
otherwise it uses server settings and SMTP. Recovery/confirmation tokens are
single-use. Avatars accept JPEG/PNG/WebP; RestGo produces public 512×512 JPEG images.
OAuth and general self-service profile editing are outside this contract.

## Storage

[File Upload](file-upload.md) offers typed selection, sending, and progress events.
For direct SDK use:

```ts
const uploaded = await RestGO.storage.upload(file, {
  name: 'document.pdf',
  isPublic: false,
});
if (uploaded.error) throw uploaded.error;
const download = await RestGO.storage.download(uploaded.data.id);
if (download.error) throw download.error;
const objectUrl = URL.createObjectURL(download.data);
// Display the object URL, then revoke it when finished.
```

| Method                                                               | Operation                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `storage.list({ page?, pageSize?, q?, ownerId?, signal? })`          | List authorized files, preserving the server's pagination envelope. |
| `storage.upload(blob, { name?, isPublic?, ownerId?, signal? })`      | Multipart upload.                                                   |
| `storage.get(id)`                                                    | Retrieve metadata.                                                  |
| `storage.update(id, { file?, name?, isPublic?, ownerId?, signal? })` | Update content/metadata.                                            |
| `storage.remove(id)`                                                 | Delete; 204 returns `data: null`.                                   |
| `storage.download(id, { range?, public?, signal? })`                 | Return a Blob; support Range and public downloads.                  |
| `storage.getPublicUrl(id)`                                           | Build `{ data: { publicUrl }, error: null }` without a request.     |
| `storage.usage()`                                                    | Used, total, and available space.                                   |

Public URLs do not change permissions. Private files require the owner's JWT or
server-authorized administration; dynamic API tokens do not authorize Storage.
`ownerId` does not expand rights. Generic Storage routes cannot modify avatars.
Upload/update progress reports `loaded`, `total`, `percentage`, and `lengthComputable`
for the complete multipart body. See [transport and redirect limits](../packages/restgo-sdk/README.md#storage).

## Dynamic APIs and API Operations

Published routes use `/v{version}/{database}/{endpoint}`. API Operations use the
same routes; endpoint/database names and response fields must match your server:

```ts
interface Customer {
  id: number;
  name: string;
}
const result = await RestGO.api
  .from('customers')
  .endpoint<Customer[]>('list')
  .get({ query: { active: true }, page: 1, pagination: 'simple' });
if (result.error) throw result.error;
const customers = result.data;
const hasMore = result.has_more;

await RestGO.api.endpoint('create').post({ name: 'Anna' }); // Default database.
```

`get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `request` use published
methods. Results preserve `page`, `total_pages`, `has_more`, and `next_cursor`.
Pagination supports `exact`, `simple`, and `cursor`. Cursor requires a unique,
stable, non-null SQL column; subsequent requests retain endpoint, method, column,
and filters. Supply `cursorColumn` and the previous `next_cursor`. JSON inputs
override query inputs with the same names. Version is set per endpoint/call.

`auth: 'auto'` chooses session then explicitly configured API token. Select
`'session'`, `'apiToken'`, or `'none'` to fix the mode. A token-authenticated endpoint
with JWT disabled still requires its API token; that setting alone does not imply
anonymous public access.

## API Client with the authenticated user

Choose **Connection → RestGo JWT Authentication** in API Client. Integration must
be enabled. Base URL is fixed to the shared connection, including proxy prefix;
relative `/v1/customers/list` stays beneath that prefix.

Before a request, the component obtains the shared validated session and sends
`Authorization: Bearer <JWT>`, refreshing as needed. Logout/no session prevents
the request without API-token fallback. Endpoint 401 becomes an HTTP error without
automatically replaying a possibly mutating operation.

Custom headers cannot replace JWT. Absolute endpoints, base changes, prefix escape,
and redirects are blocked. Method, other headers, query, body, and timeout remain
configurable. GET/HEAD have no body; CONNECT/TRACE/TRACK are browser-forbidden.
`head()`, `options()`, and `request()` remain available. Editor Test JWT and
multipart files are temporary; Preview/exports use the actual application session.
Pass `FormData` as `body` for uploads and let the browser set its boundary.

## Independent usage

```ts
import { createClient } from '@webrad/restgo-sdk';
const client = createClient('https://api.example.com', {
  apiVersion: 1,
  defaultDatabase: 'customers',
  persistSession: true,
  sessionStorage: 'local',
  storageKey: 'customer-portal-restgo',
});
await client.auth.signInWithPassword({ email, password });
```

This is a source workspace, not an automatically published npm package. WebRAD's
compiler resolves and bundles it directly. A custom `fetch` can be injected.
The [package README](../packages/restgo-sdk/README.md) covers standalone setup.

Requests use headers without administrative cookies. Fetch uses
`credentials: 'omit'`; measured cross-origin uploads use XHR with `withCredentials: false`.
RestGo CORS accepts valid HTTP(S) origins, handles OPTIONS before authentication,
and exposes Retry-After. Null, file, and custom-scheme origins are rejected.
Preview and packaged IDE use separate local HTTP origins on `127.0.0.1`, with a
port selected per run. Restricted APIs must allow the received origin, and proxies
must preserve CORS headers. Serve generated applications over HTTP/HTTPS. OAuth,
MFA, Realtime, and arbitrary table access require additional backend contracts.
