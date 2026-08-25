# WebRAD architecture

## Direction

WebRAD is a desktop IDE built with Electron, React, and web tooling, while projects produced by it are normal browser applications. The versioned Project Model owns all persistent state. The Designer, Object Inspector, Explorer, language services, generator, compiler, and Preview are projections or consumers of that model.

```text
Electron main -> typed preload bridge -> React renderer
                                        |-> project model
                                        |-> designer
                                        |-> Monaco/language
                                        `-> compiler preview result

project model -> generated source -> esbuild -> browser-only output
             `-> reusable styles -> Tailwind/PostCSS -> static app.css
```

## Package boundaries

- `packages/project-model`: versioned models, validation, serialization, naming, and immutable update operations.
- `packages/component-registry`: component metadata and registry behavior without React dependencies.
- `packages/components`: React projection of the browser-safe visual contract exported by the runtime.
- `packages/designer`: selection, commands/history, geometry, overlays, and design-time interaction. It may depend on the model and registry, never vice versa.
- `packages/language`: generated declarations and TypeScript AST transformations. User source is preserved.
- `packages/runtime`: browser-only component API, shared visual projection/CSS, nonvisual services, and global working helpers.
- `packages/compiler`: UI-independent validation/generation/build pipeline.
- `apps/ide`: Electron main/preload/renderer. Main owns filesystem, dialogs, processes, and project operations; renderer has no Node access.

Packages are created only when they contain working behavior.

## Security boundary

The browser window uses context isolation, sandboxing, and no Node integration. The preload exposes capability-shaped methods such as `project.open`, `project.save`, `files.read`, and `styles.compile`; it never exposes raw `ipcRenderer`. The style capability accepts only validated project style records and returns CSS for live design-time projection; Tailwind and PostCSS stay in the main process. The main process validates every payload, binds filesystem capabilities to the originating main frame and exact renderer URL, rejects path traversal through links, and revokes roots when a project or window closes. Top-level navigation, redirects, popups, webviews, and web/device permission requests are denied by default. Preview content is served from a dedicated `webrad-preview:` origin with its own restrictive CSP, runs without Node privileges, and consumes actual compiler output.

## Designer model

The page surface renders real component DOM from the same browser-safe property projection and CSS used by the generated runtime. Both project the version 2 `ComponentNode.layout` contract while retaining `bounds` for fixed-layout fallback. A separate design overlay owns hit testing, selection handles, marquee selection, drag, and resize. Pure geometry services calculate deltas, snapping, bounds, and multi-selection transforms. Pointer movement may use transient UI state; a command commits the model once at operation completion.

Reusable styles remain project-level model records with stable IDs. The Styles workspace edits their Tailwind candidate groups, the Inspector offers only styles whose registered target type matches the selected visual component, and the Designer injects debounced CSS compiled through the narrow preload capability. Generated runtime nodes contain only the resolved static class names, so applications have no dependency on the Project Model or Tailwind compiler. The button-only `Icon` style group keeps content mode and icon placement base-only, while icon color and explicit width/height can vary by interaction state; the individual icon remains an instance property. A browser-safe expanded local SVG catalogue is shared by the IDE, React component projection, generated DOM runtime, and Monaco declarations, so no generated application depends on the Electron renderer or an icon network request. The Inspector presents that catalogue through an accessible visual modal gallery with in-place ID/label search rather than a textual icon dropdown.

Nonvisual nodes remain children of the page in the Project Model but are projected into a dedicated design-time tray instead of the canvas. Generated classes construct their typed runtime service instances directly from registered properties, immutable IDs, and user-facing names, while the compiler removes those nodes from the page DOM model. Nonvisual runtime objects therefore retain the same identity contract without pretending to own a DOM element: `id` remains stable and `name` reflects the current Project Model name.

Component IDs are immutable. Names are validated TypeScript identifiers unique within a page. Version 2 removes page-level `layoutMode`: each component persists a container mode (`fixed`, `align-to-parent`, `row`, or `column`) plus item sizing, constraints, anchors, and insets. `bounds` remains the deterministic geometry fallback for fixed mode. Runtime and Designer implementations must derive their layout from this shared Project Model contract rather than retaining independent layout state.

## Commands and selection

`SelectionManager` owns ordered selected IDs and anchor selection. `CommandHistory` owns executable reversible commands and transactions; it does not store whole-project snapshots per edit. Multi-property edits form one transaction.

## Code and language services

Each user file owns one long-lived Monaco TypeScript model whose URI matches its project path. Models survive Design/Code/Preview switches so undo history, view state, cross-file definitions, references, rename, hover, signature help, formatting, inlay hints, and IntelliSense share one project-wide language-service graph. Model edits are projected back through `ProjectController`; the versioned Project Model and its user-source map remain the source of truth.

Runtime declarations and every generated page declaration are synchronized as disposable TypeScript extra libraries. Stale models and declarations are removed when pages or projects change, while generated implementation files remain separate and replaceable. User files are changed only by explicit editor actions or TypeScript AST transformations. Event generation parses TypeScript, detects the target class/method, inserts a method through compiler AST nodes/printers, and returns both its stable navigation range and a collapsed cursor target inside its body. Monaco reapplies a pending target after asynchronous editor mounting, reveals it, and focuses the handler body.

Every non-root component in a page, visual or nonvisual, becomes a typed `public readonly Name: RuntimeType` field on the generated base class. Authored page methods access those instances as `this.Name`; the root component is the page instance itself (`this`) and is never duplicated as a generated field. Monaco complements TypeScript IntelliSense with Delphi-like suggestions labelled by component `Name`, but accepting one inserts the ordinary TypeScript expression `this.Name`. This keeps live diagnostics, build, and Preview on the same JavaScript semantics instead of introducing ambient component globals.

For the registered MVP component set, Registry metadata and runtime declarations constitute one typed authoring contract: properties exposed by the Registry have corresponding runtime accessors on their component type, so completion after `this.Name.` reflects the API that executes in Preview. Renaming a component regenerates the field and declarations but deliberately does not rewrite user-authored TypeScript automatically. Existing references to the old name remain visible compiler diagnostics until the author updates them.

Monaco reports syntax, suggestion, and semantic markers continuously for fast feedback. The Problems projection merges and deduplicates those markers with the last authoritative compiler result, preserves source/code/range metadata, and navigates either to source code or the affected model component. The standalone F9 compiler remains authoritative because the embedded Monaco TypeScript service and the build compiler can be different patch versions.

The editor's JetBrains Mono Light face is self-hosted from the pinned `@fontsource/jetbrains-mono` package. Vite emits the weight-300 normal and italic webfont assets into the renderer bundle, and the renderer CSP permits only the packaged self origin. Monaco therefore has identical typography in development and installed applications without a system font or CDN dependency. The Electron package also carries `JetBrainsMono-OFL.txt` beside its resources so every distributed copy includes the font copyright and SIL Open Font License 1.1.

## Cross-platform decisions

Filesystem paths remain native inside Electron and are converted to URI/path forms at boundaries. Build logic is a Node API rather than shell scripts so Windows and Linux share behavior. Runtime and compiler output contain no Electron imports.
