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
```

## Package boundaries

- `packages/project-model`: versioned models, validation, migrations, serialization, naming, and immutable update operations.
- `packages/component-registry`: component metadata and registry behavior without React dependencies.
- `packages/components`: React projection of the browser-safe visual contract exported by the runtime.
- `packages/designer`: selection, commands/history, geometry, overlays, and design-time interaction. It may depend on the model and registry, never vice versa.
- `packages/language`: generated declarations and TypeScript AST transformations. User source is preserved.
- `packages/runtime`: browser-only component API, shared visual projection/CSS, nonvisual services, and global working helpers.
- `packages/compiler`: UI-independent validation/generation/build pipeline.
- `apps/ide`: Electron main/preload/renderer. Main owns filesystem, dialogs, processes, and project operations; renderer has no Node access.

Packages are created only when they contain working behavior.

## Security boundary

The browser window uses context isolation, sandboxing, and no Node integration. The preload exposes capability-shaped methods such as `project.open`, `project.save`, and `files.read`; it never exposes raw `ipcRenderer`. The main process validates every payload, binds filesystem capabilities to the originating main frame and exact renderer URL, rejects path traversal through links, and revokes roots when a project or window closes. Top-level navigation, redirects, popups, webviews, and web/device permission requests are denied by default. Preview content is served from a dedicated `webrad-preview:` origin with its own restrictive CSP, runs without Node privileges, and consumes actual compiler output.

## Designer model

The form surface renders real component DOM from the same browser-safe property projection and CSS used by the generated runtime. A separate design overlay owns hit testing, selection handles, marquee selection, drag, and resize. Pure geometry services calculate deltas, snapping, bounds, and multi-selection transforms. Pointer movement may use transient UI state; a command commits the model once at operation completion.

Nonvisual nodes remain children of the form in the Project Model but are projected into a dedicated design-time tray instead of the canvas. Generated classes construct their typed runtime service instances directly from registered properties, immutable IDs, and user-facing names, while the compiler removes those nodes from the form DOM model. Nonvisual runtime objects therefore retain the same identity contract without pretending to own a DOM element: `id` remains stable and `name` reflects the current Project Model name.

Component IDs are immutable. Names are validated TypeScript identifiers unique within a form. Child coordinates are relative to their container. Layout is modeled with an explicit mode (`absolute`, `flex`, or `grid`) even though the first implementation edits absolute bounds.

## Commands and selection

`SelectionManager` owns ordered selected IDs and anchor selection. `CommandHistory` owns executable reversible commands and transactions; it does not store whole-project snapshots per edit. Multi-property edits form one transaction.

## Code and language services

Each user file owns one long-lived Monaco TypeScript model whose URI matches its project path. Models survive Design/Code/Preview switches so undo history, view state, cross-file definitions, references, rename, hover, signature help, formatting, inlay hints, and IntelliSense share one project-wide language-service graph. Model edits are projected back through `ProjectController`; the versioned Project Model and its user-source map remain the source of truth.

Runtime declarations and every generated form declaration are synchronized as disposable TypeScript extra libraries. Stale models and declarations are removed when forms or projects change, while generated implementation files remain separate and replaceable. User files are changed only by explicit editor actions or TypeScript AST transformations. Event generation parses TypeScript, detects the target class/method, inserts a method through compiler AST nodes/printers, and returns a stable navigation range.

Every non-root component in a form, visual or nonvisual, becomes a typed `public readonly Name: RuntimeType` field on the generated base class. Authored form methods access those instances as `this.Name`; the root component is the form instance itself (`this`) and is never duplicated as a generated field. Monaco complements TypeScript IntelliSense with Delphi-like suggestions labelled by component `Name`, but accepting one inserts the ordinary TypeScript expression `this.Name`. This keeps live diagnostics, build, and Preview on the same JavaScript semantics instead of introducing ambient component globals.

For the registered MVP component set, Registry metadata and runtime declarations form one typed authoring contract: properties exposed by the Registry have corresponding runtime accessors on their component type, so completion after `this.Name.` reflects the API that executes in Preview. Renaming a component regenerates the field and declarations but deliberately does not rewrite user-authored TypeScript automatically. Existing references to the old name remain visible compiler diagnostics until the author updates them.

Monaco reports syntax, suggestion, and semantic markers continuously for fast feedback. The Problems projection merges and deduplicates those markers with the last authoritative compiler result, preserves source/code/range metadata, and navigates either to source code or the affected model component. The standalone F9 compiler remains authoritative because the embedded Monaco TypeScript service and the build compiler can be different patch versions.

## Cross-platform decisions

Filesystem paths remain native inside Electron and are converted to URI/path forms at boundaries. Build logic is a Node API rather than shell scripts so Windows and Linux share behavior. Runtime and compiler output contain no Electron imports.
