# Compiler

The compiler is an independent Node API and has no React or Electron dependency.

```text
load/receive project
  -> validate model and references
  -> compile the reusable style catalog to static Tailwind CSS
  -> generate replaceable page/reusable sources and browser entry
  -> type-check user plus generated TypeScript
  -> bundle with esbuild
  -> emit dist/index.html and dist/assets/app.{js,css}
```

Diagnostics use stable categories and preserve source, code, file, line, column, length, and model path when available. The IDE projects authoritative F9 diagnostics into both Problems and Monaco decorations, while live Monaco markers provide immediate feedback between builds; duplicate reports are merged by resource, range, and message. Registry validation rejects unknown components, unsupported children/events, unknown properties, and property values with the wrong metadata type. It also validates each Data Grid API Client, operation, and response-list binding against the same page's saved API response contract. Preview displays these exact emitted assets in an isolated browser context; it never reuses the Designer as a simulation.

The API accepts explicit input/output paths and options, making a future `webrad build` CLI a thin wrapper. Output is browser-only and must not import Electron or Node built-ins.

Tailwind compilation uses the official PostCSS plugin with source discovery disabled. The compiler resolves the exact saved utility candidates, adds interaction variants for the state-specific groups, imports theme and utilities without Preflight, and places WebRAD defaults in the lower-priority `components` layer. This lets utilities override initial paint properties without resetting the runtime controls. The resulting `app.css` is static; Tailwind, PostCSS, and the native Oxide compiler remain build-time dependencies in the Electron main process and are not shipped to generated browser applications.

Runtime TypeScript sources are embedded into the compiler's virtual graph from a generated, checked-in snapshot. `npm run runtime:sources:check` prevents that snapshot from drifting. Packaged desktop builds carry the TypeScript standard libraries, the host-specific esbuild binary, and the platform-specific Tailwind native dependency closure as explicit resources, so F9 and live style preview use the same compiler APIs inside and outside Electron.

The registry's `visual` flag also controls generation. Visual nodes are serialized into the browser page DOM model; nonvisual nodes are omitted from that tree and are constructed as typed fields in generated page and reusable classes from their saved property object. A reusable definition gets a generated `WebReusableElementInstance` class and a user source under `reusables/`; the bootstrap constructs one such class for every mounted placement, passes its template-to-physical ID map, and keeps fields, handlers, nonvisual services, and mutable state isolated from other placements. Its readonly `this.pageName` identifies the containing page, while `this.name` remains the reusable definition-root name. This keeps services such as `WebApiClient` available to user TypeScript without emitting placeholder elements into the final page.

For `WebApiClient`, the compiler validates the versioned `apiClientConfig` and passes it unchanged to the browser runtime. When a saved response contract is present, generation emits a `WebApiClient<TOutputs>` field whose named `execute` operations and latest result data use the inferred scalar/object/list types. The runtime keeps operation state and result data transiently in memory; only the request and response contract is part of the saved project. API calls are ordinary browser `fetch` requests in both generated applications and the IDE tester, so endpoint CORS and authentication policies remain the API owner's responsibility.
