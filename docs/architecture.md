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

Nonvisual nodes remain children of the form in the Project Model but are projected into a dedicated design-time tray instead of the canvas. Generated classes construct their typed runtime service instances directly from registered properties, while the compiler removes those nodes from the form DOM model.

Component IDs are immutable. Names are validated TypeScript identifiers unique within a form. Child coordinates are relative to their container. Layout is modeled with an explicit mode (`absolute`, `flex`, or `grid`) even though the first implementation edits absolute bounds.

## Commands and selection

`SelectionManager` owns ordered selected IDs and anchor selection. `CommandHistory` owns executable reversible commands and transactions; it does not store whole-project snapshots per edit. Multi-property edits form one transaction.

## Code and language services

Each user file owns one long-lived Monaco model. Generated form files declare model components and may be replaced; user files are created once and subsequently edited only through explicit user actions or AST-based transformations. Event generation parses TypeScript, detects the target class/method, inserts a method through compiler AST nodes/printers, and returns a stable navigation location.

## Cross-platform decisions

Filesystem paths remain native inside Electron and are converted to URI/path forms at boundaries. Build logic is a Node API rather than shell scripts so Windows and Linux share behavior. Runtime and compiler output contain no Electron imports.
