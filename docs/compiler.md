# Compiler

ComboBox API bindings are validated against the local document's saved response schema, including the client/operation IDs, response list and both item-relative scalar fields. Generated page and reusable wrappers initialize `comboBoxConfig` and the requested `value`, bind the local API Client, and dispose their ComboBox subscriptions with the authored scope. The emitted browser-only runtime projects API results into native select options; Preview uses this same implementation.

The compiler is an independent Node API and has no React or Electron dependency.
The IDE hosts that API in one owned Electron utility process, built as a separate
Forge/Vite entry. Preview, Debug, Deploy, Native frontend generation, live styles,
and smoke fixture compilation share that service. Requests use typed message-port
contracts and execute sequentially, preserving the latest compatible TypeScript
graph and Tailwind caches without sharing the UI's V8 heap or event loop.
The main process retains all trusted-frame/root checks, Save, destination grants,
Preview publication and deployment writes. It forwards phase/CPU/heap/RSS evidence
from the actual compiler PID. Crashes reject outstanding work without retrying;
shutdown rejects pending requests and terminates the owned service. Child processes
inherit the packaged compiler-resource paths; sandbox/fuse settings remain intact.

Application type checking uses explicit browser libraries and `types: []` so the
IDE or runner's ancestor `@types` packages cannot inject Node/test globals or an
unrelated declaration graph. Explicit imports and project declarations still
participate in strict checking. Runtime export metadata is reused only for the
same catalog and exact source text; adapter selection retains only its last exact
source/component-type combination. Diagnostics are recalculated for each build.
The existing progress callback separates bundle loading, runtime selection,
esbuild execution, and output processing for compilation timing diagnostics.

## Native bundler on macOS Intel

Repeated Intel smoke failures have stopped inside the esbuild call after strict
checking and runtime preparation completed. A Go-runtime hypothesis led to a
temporary `GOMAXPROCS=1` workaround, but hosted commit `47ccce0` still failed.
That restriction has been removed; normal native concurrency is restored.

The smoke runner now samples its own Electron and esbuild descendants when a
bundle phase remains active for three seconds. Sampling runs in the parent runner,
independently of Electron's event loop, and records process CPU/RSS plus native
stacks in `native-diagnostics/`. Failure artifacts preserve those files alongside
the original smoke log and project. Capture failures are recorded separately and
do not replace the functional result. Sampling does not retry builds or extend
their deadlines. These measurements are required to distinguish main-process
GC/work, native service work, and blocked transport before choosing another fix.

Intel's automated Menu workflow also saves a V8 CPU profile of the main process
in that directory, including when the workflow throws. The inspector session is
local and exposes no listening port. Native sampling captures symbol locations
before target exit and allows bounded report generation after sampling; this
diagnostic finalization does not extend any functional deadline. Capture failures
never replace the original exception.

Successful macOS runs retain existing measurements too, including the packaged
main-process source map for interpreting CPU frames. CI uploads these separately
from installers as `compiler-diagnostics-*`; they do not enter release assembly.
Browser profiles and successful project fixtures are not included. CPU profiling
requires `WEBRAD_SMOKE_CPU_PROFILE=1`; ordinary CI uses no active V8 profiler.

Stopping offscreen bitmap delivery alone did not resolve Intel run `40592211180`
and has been removed. Keep the compositor, screenshots and frame assertions.
Compiler isolation separates its retained syntax/type graphs and native service
bridge from main-process rendering, NativeImages and UI automation instead of
attempting to attribute every pause to an unproven native deadlock.

## Native frontend target

`CompileProjectOptions.target` accepts the additive `native` destination. Native Build calls the same model validation, generated instance declarations, authored TypeScript checking, browser bundler and asset/license emission as existing builds. The compiler produces ordinary local `index.html`, `assets/app.js`, `assets/app.css` and used resources in memory; it has no Tauri, Rust, Electron or device API dependency.

The native target omits the PWA manifest, service worker and registration helper, including the worker-retirement script used by web deployment. It retains relative resource paths and the existing runtime. Web/PWA Deploy and F9/Preview continue their own target contracts. Native Application name/version/window/package preferences are applied by the Native Build orchestration/container, with the native application name/description projected into the compiled document by the caller.

`packages/native-build` consumes this artifact and validates safe paths before generating a separate Tauri 2 project with `build.frontendDist: '../frontend'`. Its toolchain and artifact diagnostics belong to the main-process build operation; compiler diagnostics keep their existing locations, categories and source contracts. Native Build does not edit user TypeScript or introduce a second component/runtime compiler. See [Native Build](native-build.md) for CSP, network/CORS and WebView validation requirements.

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

Tailwind compilation uses the official PostCSS plugin with source discovery disabled. The compiler resolves the exact saved utility candidates, adds interaction variants for the state-specific groups, imports theme and utilities without Preflight, and places WebRAD defaults in the lower-priority `components` layer. This lets utilities override initial paint properties without resetting the runtime controls. The resulting `app.css` is static; Tailwind, PostCSS, and the native Oxide compiler remain build-time dependencies in the IDE's owned compiler process and are not shipped to generated browser applications.

The shared [project font catalog](fonts.md) registers matching `font-<id>` theme
tokens. Designer and application CSS embed the selected families' Latin/Latin
Extended WOFF2 faces as data URLs, with normal/italic and upstream weight ranges.
The checked-in snapshot is regenerated and verified by `runtime:sources` and
`runtime:sources:check`; compilation requires no network or Fontsource package
lookup at runtime. Static exports retain the selected fonts' upstream notices
under `assets/licenses/fonts/`.

Runtime TypeScript sources are embedded into the compiler's virtual graph from a generated, checked-in snapshot. `npm run runtime:sources:check` prevents that snapshot from drifting. Packaged desktop builds carry the TypeScript standard libraries, the host-specific esbuild binary, and the platform-specific Tailwind native dependency closure as explicit resources, so F9 and live style preview use the same compiler APIs inside and outside Electron.

The Shaka Player snapshot includes its upstream UI declarations alongside JavaScript, CSS and license. Strict type checking resolves `shaka-player/dist/shaka-player.ui.js` to `__vendor/shaka/shaka-player.ui.d.ts` in the virtual graph; bundling resolves the same import to the embedded JavaScript. Neither phase requires Shaka in the project's or executable's `node_modules`. All embedded runtime modules participate in type checking, including the video adapter when a page has no Video Player. Preview, Debug and Deploy share this contract.

The registry's `visual` flag controls browser generation, independently from `designerPresentation`. Visual nodes are serialized into the browser page DOM model; DOM-less nonvisual nodes are omitted from that tree and are constructed as typed fields in generated page and reusable classes from their saved property object. `WebPopup` deliberately combines `visual: true`, `designerPresentation: "tray"`, and visual children: it is authored from the Designer's nonvisual tray but is serialized with its ordinary child hierarchy, receives its resolved static Popup style classes on the native-dialog root, and constructs a runtime native-dialog control. Its one inner host receives the saved `layout.container` responsive rules; it has no caption/message header shell. The native dialog remains a floating window outside page layout. A reusable definition gets a generated `WebReusableElementInstance` class and a user source under `reusables/`; the bootstrap constructs one such class for every mounted placement, passes its template-to-physical ID map, and keeps fields, handlers, DOM-less nonvisual services, and mutable state isolated from other placements. Its readonly `this.pageName` identifies the containing page, while `this.name` remains the reusable definition-root name. This keeps services such as `WebApiClient` available to user TypeScript without emitting placeholder elements into the final page, while Popup remains a normal browser DOM container.

For `WebApiClient`, the compiler validates the versioned `apiClientConfig` and passes it unchanged to the browser runtime. A configuration with `connection: "restgo-session"` requires an enabled, valid project RestGo integration; this cross-document validation also applies to services inside reusable definitions. Its operation endpoints must remain relative to the integration's fixed base URL, and saved enabled `Authorization` headers are rejected because the runtime supplies the authenticated user's current Bearer JWT. The bootstrap configures that shared browser service before constructing page or reusable services. When a saved response contract is present, generation emits a `WebApiClient<TOutputs>` field whose named `execute` operations and latest result data use the inferred scalar/object/list types. The runtime keeps operation state and result data transiently in memory; only the request and response contract is part of the saved project. API calls are ordinary browser `fetch` requests in both generated applications and the IDE tester, so endpoint CORS and authentication policies remain the API owner's responsibility. CONNECT, TRACE, and TRACK cannot be executed by browser Fetch; these methods produce an explicit unsupported-method error rather than a simulated result.

The IDE serves the inlined Preview HTML over dedicated loopback HTTP, with an origin separate from its renderer. Keeping that origin in the iframe sandbox lets HTTP(S)-only CORS policies work for JSON preflights and Authorization headers. Packaged API tests also originate from HTTP. The compiler output stays independent of these IDE servers and should be hosted over HTTP/HTTPS.

For native RestGO integration, `settings.restGo` determines whether the shared browser client is configured before page construction. The generated global `RestGO` and the public runtime import use that same client. User code can also import `createClient` and SDK types from `@webrad/restgo-sdk`; the virtual graph resolves that package from its embedded browser sources rather than from application-local node_modules. No master credential is inserted into the bootstrap.

`npm run runtime:sources` synchronizes the runtime and SDK snapshots and produces editor SDK declarations with the TypeScript compiler. `npm run runtime:sources:check` verifies all those artifacts. This makes the SDK available in development and packaged builds without runtime filesystem access or an Electron dependency in emitted applications.

Models and Units are ordinary authored TypeScript inputs from `models/` and `units/`, participating in strict type checking and bundling through relative imports. Imported manifest assets are emitted as exact binary bytes under `assets/imported/` and served at that relative URL by the isolated HTTP Preview. Asset paths are separate from compiler-owned `app.js` and `app.css`.

# Debug source maps

`compileProject` accepts `debug: true` to force an unminified bundle and composed source maps. Successful debug compilation returns `debug.sourceMap` and `debug.scriptUrl`, with original authored contents and portable project-relative source paths. Maps preserve columns across AST-selected component-reference edits. The dedicated debug Preview uses that script URL to resolve breakpoints before execution. See [the integrated debugger](debugger.md) for IDE behavior and security boundaries.

## Browser routes

The compiler validates unique page paths and embeds the selected History/Hash strategy. Generated HTML supports a deployment base directory, and isolated HTTP Preview permits only compiled routes under the live publication token. See [Browser routing](browser-routing.md).
