# Compiler

ComboBox API bindings are validated against the local document's saved response schema, including the client/operation IDs, response list and both item-relative scalar fields. Generated page and reusable wrappers initialize `comboBoxConfig` and the requested `value`, bind the local API Client, and dispose their ComboBox subscriptions with the authored scope. The emitted browser-only runtime projects API results into native select options; Preview uses this same implementation.

The compiler is an independent Node API and has no React or Electron dependency.

```text
load/receive project
  -> validate model and references
  -> compile the reusable style catalog to static Tailwind CSS
  -> generate replaceable page/reusable sources and browser entry
  -> resolve typed document-local component names through TypeScript AST symbols
  -> type-check user plus generated TypeScript
  -> bundle with esbuild
  -> emit dist/index.html and dist/assets/app.{js,css}
```

Diagnostics use stable categories and preserve source, code, file, line, column, length, and model path when available. The IDE projects authoritative F9 diagnostics into both Problems and Monaco decorations, while live Monaco markers provide immediate feedback between builds; duplicate reports are merged by resource, range, and message. Registry validation rejects unknown components, unsupported children/events, unknown properties, and property values with the wrong metadata type. It also validates each Data Grid API Client, operation, and response-list binding against the same page's saved API response contract. Preview displays these exact emitted assets in an isolated browser context; it never reuses the Designer as a simulation.

The API accepts explicit input/output paths and options, making a future `webrad build` CLI a thin wrapper. Output is browser-only and must not import Electron or Node built-ins.

Generated applications keep `index.html`, `assets/app.js` and `assets/app.css`
and include `assets/licenses/WebRAD-MIT.txt` for the embedded WebRAD runtime and
RestGo SDK. This notice is synchronized from the root license by `runtime:sources`
and verified by `runtime:sources:check`. PDF/video dependencies retain their
conditional license files. Deployments must preserve `assets/licenses/`;
user-authored application code keeps its own license.

Within page and reusable instance code, `BTNMostrar.caption` and `this.BTNMostrar.caption` address the same component. Type checking uses module-local declarations appended to virtual snapshots, preserving authored line/column positions. After validation, an AST and symbol pass qualifies unshadowed bare names only in the in-memory bundle input, including object shorthand such as `{ EDTNome }`. Lexical bindings win, arrow callbacks retain the receiver, and unsupported instance contexts fail before bundling. Saved source files remain untouched and reusable placements retain independent instances.

Tailwind compilation uses the official PostCSS plugin with source discovery disabled. The compiler resolves the exact saved utility candidates, adds interaction variants for the state-specific groups, imports theme and utilities without Preflight, and places WebRAD defaults in the lower-priority `components` layer. This lets utilities override initial paint properties without resetting the runtime controls. The resulting `app.css` is static; Tailwind, PostCSS, and the native Oxide compiler remain build-time dependencies in the Electron main process and are not shipped to generated browser applications.

Runtime TypeScript sources are embedded into the compiler's virtual graph from a generated, checked-in snapshot. `npm run runtime:sources:check` prevents that snapshot from drifting. Packaged desktop builds carry the TypeScript standard libraries, the host-specific esbuild binary, and the platform-specific Tailwind native dependency closure as explicit resources, so F9 and live style preview use the same compiler APIs inside and outside Electron.

The registry's `visual` flag controls browser generation, independently from `designerPresentation`. Visual nodes are serialized into the browser page DOM model; DOM-less nonvisual nodes are omitted from that tree and are constructed as typed fields in generated page and reusable classes from their saved property object. `WebPopup` deliberately combines `visual: true`, `designerPresentation: "tray"`, and visual children: it is authored from the Designer's nonvisual tray but is serialized with its ordinary child hierarchy, receives its resolved static Popup style classes on the native-dialog root, and constructs a runtime native-dialog control. Its one inner host receives the saved `layout.container` responsive rules; it has no caption/message header shell. The native dialog remains a floating window outside page layout. A reusable definition gets a generated `WebReusableElementInstance` class and a user source under `reusables/`; the bootstrap constructs one such class for every mounted placement, passes its template-to-physical ID map, and keeps fields, handlers, DOM-less nonvisual services, and mutable state isolated from other placements. Its readonly `this.pageName` identifies the containing page, while `this.name` remains the reusable definition-root name. This keeps services such as `WebApiClient` available to user TypeScript without emitting placeholder elements into the final page, while Popup remains a normal browser DOM container.

For `WebApiClient`, the compiler validates the versioned `apiClientConfig` and passes it unchanged to the browser runtime. A configuration with `connection: "restgo-session"` requires an enabled, valid project RestGo integration; this cross-document validation also applies to services inside reusable definitions. Its operation endpoints must remain relative to the integration's fixed base URL, and saved enabled `Authorization` headers are rejected because the runtime supplies the authenticated user's current Bearer JWT. The bootstrap configures that shared browser service before constructing page or reusable services. When a saved response contract is present, generation emits a `WebApiClient<TOutputs>` field whose named `execute` operations and latest result data use the inferred scalar/object/list types. The runtime keeps operation state and result data transiently in memory; only the request and response contract is part of the saved project. API calls are ordinary browser `fetch` requests in both generated applications and the IDE tester, so endpoint CORS and authentication policies remain the API owner's responsibility. CONNECT, TRACE, and TRACK cannot be executed by browser Fetch; these methods produce an explicit unsupported-method error rather than a simulated result.

The IDE serves the inlined Preview HTML over dedicated loopback HTTP, with an origin separate from its renderer. Keeping that origin in the iframe sandbox lets HTTP(S)-only CORS policies work for JSON preflights and Authorization headers. Packaged API tests also originate from HTTP. The compiler output stays independent of these IDE servers and should be hosted over HTTP/HTTPS.

For native RestGO integration, `settings.restGo` determines whether the shared browser client is configured before page construction. The generated global `RestGO` and the public runtime import use that same client. User code can also import `createClient` and SDK types from `@webrad/restgo-sdk`; the virtual graph resolves that package from its embedded browser sources rather than from application-local node_modules. No master credential is inserted into the bootstrap.

`npm run runtime:sources` synchronizes the runtime and SDK snapshots and produces editor SDK declarations with the TypeScript compiler. `npm run runtime:sources:check` verifies all those artifacts. This makes the SDK available in development and packaged builds without runtime filesystem access or an Electron dependency in emitted applications.

Models and Units are ordinary authored TypeScript inputs from `models/` and `units/`, participating in strict type checking and bundling through relative imports. Imported manifest assets are emitted as exact binary bytes under `assets/imported/` and served at that relative URL by the isolated HTTP Preview. Asset paths are separate from compiler-owned `app.js` and `app.css`.

# Debug source maps

`compileProject` accepts `debug: true` to force an unminified bundle and composed source maps. Successful debug compilation returns `debug.sourceMap` and `debug.scriptUrl`, with original authored contents and portable project-relative source paths. Maps preserve columns across AST-selected component-reference edits. The dedicated debug Preview uses that script URL to resolve breakpoints before execution. See [the integrated debugger](debugger.md) for IDE behavior and security boundaries.
