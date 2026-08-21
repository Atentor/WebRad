# Compiler

The compiler is an independent Node API and has no React or Electron dependency.

```text
load/receive project
  -> validate model and references
  -> generate replaceable page sources and browser entry
  -> type-check user plus generated TypeScript
  -> bundle with esbuild
  -> emit dist/index.html and dist/assets/app.{js,css}
```

Diagnostics use stable categories and preserve source, code, file, line, column, length, and model path when available. The IDE projects authoritative F9 diagnostics into both Problems and Monaco decorations, while live Monaco markers provide immediate feedback between builds; duplicate reports are merged by resource, range, and message. Registry validation rejects unknown components, unsupported children/events, unknown properties, and property values with the wrong metadata type. Preview displays these exact emitted assets in an isolated browser context; it never reuses the Designer as a simulation.

The API accepts explicit input/output paths and options, making a future `webrad build` CLI a thin wrapper. Output is browser-only and must not import Electron or Node built-ins.

Runtime TypeScript sources are embedded into the compiler's virtual graph from a generated, checked-in snapshot. `npm run runtime:sources:check` prevents that snapshot from drifting. Packaged desktop builds carry the TypeScript standard libraries and the host-specific esbuild binary as explicit resources, so F9 uses the same compiler API inside and outside Electron.

The registry's `visual` flag also controls generation. Visual nodes are serialized into the browser page DOM model; nonvisual nodes are omitted from that tree and are constructed as typed fields in the generated page class from their saved property object. This keeps services such as `WebApiClient` available to user TypeScript without emitting placeholder elements into the final page.
