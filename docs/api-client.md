# API Client in code

An API Client configured in the Designer is a concrete instance in page or
reusable component code. Monaco completes requests, parameters, and response
fields from the saved model. `ApiClient1` and `this.ApiClient1` address the same
instance; local variables with the same name retain normal TypeScript scope.

## Updating imported RestGo APIs

Saving an endpoint or refreshing the RestGo catalog synchronizes existing imported
clients across all project pages and reusables, including closed documents.
Reimporting updates an operation without duplicating it. Routes, methods,
versions, and query/JSON parameters are reconciled; public names, IDs, retained
parameter values, headers, timeouts, and response contracts are preserved. Save
the project to persist changes. Each document's Designer history supports undo.

Imported operations store `restGoSource: { apiId, parameterNames }`: an optional
link to the publication/method and its last input list. This Project Model metadata
is removed from runtime options by the Component Registry and contains no SQL or
credentials. Older imports can be recognized by their stable importer IDs and
previous query definitions. Old JSON fields with unproven ownership survive the
first synchronization.

Manual requests, unselected new methods, and missing/inactive catalog operations
are not added or deleted automatically. **Send test request** remains the source
of response-field inference. Clients requiring mixed authentication modes or
unsafe custom-body reconciliation are reported for manual adjustment. Catalog
failures retain saved configuration; results for another project or URL are ignored.

## Development login for JWT endpoint testing

In **RestGo integration → Connection → Development login**, authenticate an
application user. **Remember development login on this device** stores an encrypted
session, never the password. Without secure storage, the session lasts only while
the IDE window remains open.

Select **RestGo JWT Authentication** in the API Client editor and leave **Test JWT**
empty to validate/refresh and use this session for tests. An explicit temporary JWT
takes precedence. **Sign out and forget session** removes the local login. Neither
this session nor administrative credentials are exported to projects, Preview, or
Build. See [development login](restgo-sdk.md#development-login-in-api-client).

## Connecting a ComboBox

For fixed choices, **Edit Items…** and **Edit Values…** accept one label and one key
per line, in matching order. Empty Values use item text as the key. **Save** applies
both lists as one change; **Cancel** and Escape discard the draft. **Value** remains
the selected key.

Double-click a ComboBox or use **API Client binding → Configure ComboBox**. Select
the client, operation, response list, **Display field**, and **Key field** from the
saved response schema. **Static items** removes the binding and restores `Items`.
The binding follows operation results but does not execute requests or save returned
data in the project. Execute the operation explicitly, for example in `OnCreate`:

```ts
await ApiClient1.ListCustomers.execute();
const customerKey: string = ComboBox1.value;
```

With `/name` as display field and `/id` as key, a choice can show `Anna` and return
`"42"`. Numeric and boolean keys become strings. `OnChange` remains available,
selection survives reordering by key, and `value` may be set before data loads.
Scalar lists use **Item value** for both fields.

## Setting parameters and executing a named request

Configure a request named `PutKey` with integer `instanceId` and string `key`:

```json
{
  "instanceId": <instanceId>,
  "key": <key>
}
```

This is an editor body template; placeholders are replaced before sending JSON.
In a button handler:

```ts
ApiClient1.PutKey.parameter.instanceId = 42;
ApiClient1.PutKey.parameter.key = 'value';
const result = await ApiClient1.PutKey.execute();
const lastResult = ApiClient1.PutKey.Response.Value;
```

The request name selects its object directly, without assigning `Operation`.
Reading a parameter only returns its value; execution requires `execute()`.
`parameter` combines body and query inputs. Required placeholders and input types
are checked at runtime. Named JSON/form fields on imported endpoints are supported.
Values belong to each request and instance and do not modify project files.

## Accessing request objects

```ts
const request = ApiClient1.PutKey;
request.parameter.instanceId = 42;
request.parameter.key = 'value';
request.Options.Timeout = 10000;
request.Headers['X-Source'] = 'application';
const result = await request.execute();
const status = request.Response.Status;
```

Each request has independent parameters, options, and response state. Completion
and diagnostics use configured names and types. `ApiClient1.Requests.PutKey`
provides catalog access. Query inputs accept scalars and repeated-field arrays;
assignment enables the field, while `undefined` or `null` omits it. Headers require
strings. The API uses lowercase `parameter` and `execute()`, without aliases.

Names colliding with members such as `execute`, `get`, `constructor`, or `then`
are accessible through `Requests.Name` or `RequestByName(name)`. Runtime renaming
updates direct access while preserving the object and values by stable ID. Manually
created `new WebApiClient<Outputs, Inputs>(configuration).withRequests()` clients
receive the same typed view automatically provided to pages and reusables.
`RequestByName(name)` also accepts names known only at runtime. Runtime contract
changes do not rewrite the Designer model or authored TypeScript.

## Public properties

| Access                                              | Behavior                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `Operation`                                         | Selects the active request; initially the first configured request. |
| `Request` / `Requests.Name`                         | Active or named request object.                                     |
| `Connection.Mode`                                   | `custom`, `restgo-session`, `restgo-api-token`, or `restgo-public`. |
| `Connection.BaseURL`                                | Custom base URL; RestGo retains the integration URL.                |
| `Connection.Timeout`                                | Default timeout in milliseconds.                                    |
| `Connection.Headers.Name`                           | Shared default header.                                              |
| `Connection.DefaultHeaders`                         | Read or replace default header definitions.                         |
| `Method`, `Endpoint`, `ApiVersion`                  | Read/write active request settings; also on named requests.         |
| `Body.Kind` / `Body.Value`                          | Body type and content/template.                                     |
| `Body.Parameters`                                   | Body parameter definitions.                                         |
| `parameter.Name`                                    | Read/write an input value.                                          |
| `ParamByName(name).Value` / `.Type`                 | Dynamic parameter value/type access.                                |
| `Query.Name`                                        | Read, add, or update a query field.                                 |
| `Headers.Name`                                      | Read, add, or update a request header.                              |
| `Options.Credentials`                               | Cookie policy for custom APIs; RestGo omits cookies.                |
| `Options.Timeout`                                   | Request timeout; `null` inherits the client default.                |
| `Options.ResponseType`                              | `auto`, `json`, `text`, `blob`, or `arrayBuffer`.                   |
| `Response.Value`, `.Status`, `.Error`, `.UpdatedAt` | Read-only result/state.                                             |
| `Response.Schema`                                   | Read or replace the response contract.                              |
| `Request.Definition`                                | Read or replace a validated definition, preserving its ID.          |
| `Configuration` / `apiClientConfig`                 | Immutable snapshot or validated replacement.                        |
| `operations`                                        | Read or replace request definitions.                                |
| `ClearParameters()`                                 | Clear active request values and disable query fields.               |

Code changes affect the running instance. The Designer owns persisted configuration.
Definition snapshots are immutable; use setters or replace a definition/configuration.
Component and request IDs remain stable.

## Client execution and RestGo

```ts
ApiClient1.Operation = 'PutKey';
ApiClient1.parameter.instanceId = 42;
ApiClient1.parameter.key = 'value';
await ApiClient1.execute();

await ApiClient1.execute('PutKey', {
  parameters: { instanceId: 42, key: 'value' },
});
await ApiClient1.execute('PutKey', {
  body: { instanceId: 42, key: 'complete body' },
});
```

Per-call values override stored parameter values; an explicit `body` replaces the
template. `request`, `get`, `post`, `put`, `patch`, `delete`, `head`, `options`,
`getOutputById`, `getList`, `getOperationState`, `subscribe`, and registered events
remain available.

RestGo endpoints must remain under the configured integration prefix. The SDK
provides the current JWT or application token for the selected mode; public
requests omit authorization and cookies. Header objects reject manual
`Authorization` overrides in RestGo modes. IDE administrative credentials never
enter these objects.
