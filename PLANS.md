# WebRAD delivery plan

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| Milestone                    | Status      | Scope                                                                                                                                             | Exit criteria                                                                                              |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1. Repository foundation     | DONE        | npm workspaces, Electron Forge/Vite, React, strict TypeScript, lint, format, Vitest, desktop shell                                                | IDE builds; typecheck, lint, tests, and package build pass                                                 |
| 2. IDE shell                 | DONE        | Menus/toolbars, resizable panels, Explorer, Palette, Inspector shell, Design/Code/Preview, output, status bar, themes                             | Packaged renderer smoke and shell interactions pass                                                        |
| 3. Project model             | DONE        | Versioned model, registry, serialization, typed IPC, create/open/save/add/delete page                                                             | Round-trip, schema rejection, validation, and persistence tests pass                                       |
| 4. Designer basics           | DONE        | DOM runtime renderers, selection overlay, page/panel/label/edit/textarea/button/checkbox/combobox/image/listbox, add/drag/move/resize/delete/snap | Core design interactions and the complete MVP component set pass tests                                     |
| 5. Object Inspector          | DONE        | Metadata-driven properties/events, validation, immediate model projection                                                                         | Typed property and event editors update the model                                                          |
| 6. Commands and selection    | DONE        | Command pattern, transactions, undo/redo, clipboard, multi-select, z-order, marquee                                                               | History, clipboard, selection, and geometry tests pass                                                     |
| 7. Monaco                    | DONE        | Project-wide models, full TypeScript IntelliSense, syntax themes, live/build diagnostics, Problems navigation, save, F12                          | Real bundle proves highlight/autocomplete; models, markers, declarations, navigation, and save are covered |
| 8. Events                    | DONE        | AST method insertion, default event double-click, navigation                                                                                      | Existing methods are never duplicated                                                                      |
| 9. WebRAD typings            | DONE        | Typed Registry runtime API, readonly `this.Name` page fields, and Delphi-like `Name` completion insertion                                         | Every non-root visual/nonvisual component is typed in generated declarations and native TypeScript         |
| 10. Runtime/compiler/preview | DONE        | Browser runtime, independent esbuild pipeline, isolated preview protocol, F9                                                                      | Hello project compiles; development and packaged compiler smokes pass                                      |
| 11. Nonvisual foundation     | DONE        | Registry-driven nonvisual tray, Inspector/persistence integration, generated service fields, and functional `WebApiClient`                        | Tray, code generation, browser exclusion, and runtime client pass tests                                    |
| 12. Cross-platform packaging | IN PROGRESS | Windows/Linux validation and Forge packaging                                                                                                      | Windows package/smoke pass; Windows/Linux CI is configured                                                 |

## Current work

- DONE: The visual and nonvisual MVP vertical paths, from persisted model through generated code and browser execution.
- DONE: Every user-facing IDE window opens maximized after its renderer is ready, without exposing the hidden automated-smoke window.
- DONE: The renderer toolbar uses compact grouped actions without duplicate WebRAD branding or a theme button; theme switching remains available from Tools > Toggle Theme.
- DONE: Problems, Output, and Build are docked in the editor column below the nonvisual component tray, while the side rails remain full-height.
- DONE: Project Explorer Styles provides persisted, reusable, component-compatible Tailwind styles with metadata-driven visual properties for five states, live Designer preview, Inspector assignment, and static compiler output without requiring class or code entry.
- DONE: The Styles editor adapts to its actual available workspace width, avoiding horizontal overflow beside IDE rails while keeping the live preview visible during property scrolling.
- DONE: The root `Icon.svg` is the canonical application icon for native packages, windows, installers, favicon, and renderer branding.
- DONE: Build and run resolves TypeScript standard libraries and esbuild resources explicitly in both Forge development and packaged applications.
- DONE: Monaco provides project-wide TypeScript models, complete runtime/page typings, professional editing features and themes, live diagnostics, authoritative build markers, and navigable Problems.
- DONE: Monaco buffers use canonical resource URIs, so edits survive focus/view changes and saving persists the exact current source on Windows and Linux.
- DONE: Monaco inlay hints are disabled so inferred types and parameter labels never appear as synthetic code in the source view.
- DONE: Monaco ships JetBrains Mono Light 300, including its real italic face, as self-hosted renderer assets instead of depending on an operating-system font.
- DONE: distributable desktop artifacts use the public product name `WebRad` for the executable, installer, and Windows shortcut while retaining the lowercase npm package identifier.
- DONE: Every non-root component is exposed as a typed readonly `this.Name` field; Delphi-like `Name` suggestions insert that standard TypeScript expression for consistent diagnostics, build, and Preview.
- DONE: Page is the canonical web concept throughout the version 1 model, IDE, runtime, compiler, generated sources, paths, and documentation.
- IN PROGRESS: Linux packaging evidence from CI; Windows packaging is locally proven.

## Validation evidence

- Strict TypeScript, ESLint, Prettier, and the complete Vitest suite pass locally.
- Project Model, compiler, runtime, Registry-driven component rendering, Styles workspace, Inspector binding, live CSS IPC, and the real development Electron smoke cover reusable Tailwind styles from authoring through generated Preview execution.
- Renderer integration tests cover the compact toolbar, Tools-only theme switching, functional Styles navigation and editing, the File/Toolbar New Project dialog, validation/cancel, visual and nonvisual palette insertion, Inspector edits, AST event generation, Monaco source editing, live/build Problems navigation, save/close/open, F9, and the sandboxed Preview URL. The packaged smoke opens the real Monaco/TypeScript bundle, waits for lazy TypeScript tokenization, proves distinct syntax tokens/colors, and opens a populated Ctrl+Space suggestion widget.
- The packaged renderer smoke loads both the normal and italic JetBrains Mono weight-300 faces and verifies Monaco's computed font family, proving that installed applications use bundled webfonts; packaging also includes the font's OFL 1.1 notice.
- Language and renderer tests cover every MVP component as a generated `this.Name` member, concrete non-`any` runtime types, Registry property completion, stable visual IDs, nonvisual identity, root-as-`this`, and the exact completion insertion text.
- Application icon validation checks generated PNG/ICO/ICNS assets, renderer reuse of the SVG, packaged native icon loading, and the Windows Squirrel installer.
- The persisted Hello WebRAD example is compiled, mounted in a DOM, edited, clicked, and verified to call `Message` with the live input value.
- The development and packaged smokes start the real Forge bundles, open a Hello project through the UI/preload/IPC path, verify the Monaco editor through F12, dispatch F9, wait for `PreviewPane`, enter `Ada`, click the generated button inside the sandbox, verify `Olá Ada`, then exit automatically.

## Decision log

- Use npm workspaces to minimize bootstrap requirements on Windows and Linux.
- Keep packages source-first during development, with explicit package exports and project references where useful.
- Exclude source-first `@webrad/*` workspaces from Vite dependency optimization while explicitly optimizing the CommonJS TypeScript distribution, so renamed exports cannot leave the development renderer on a stale bundle.
- Represent `.wrpage` and the project manifest as versioned JSON while keeping user code in separate `.ts` files.
- Keep the current Page contract at format version 1 and reject documents outside the current schema without carrying a migration layer.
- Store reusable style identities and component references in the version 1 Project Model; compile exact Tailwind candidates to static utility CSS with no Preflight or browser Tailwind dependency.
- Share browser-safe component property projection and CSS through `@webrad/runtime/visual`; keep design interaction exclusively in the Designer overlay.
- Keep nonvisual nodes in the Project Model and tray, construct their typed services in generated code, and omit them from the final DOM model.
- Treat `Icon.svg` as the application icon source of truth; commit checked PNG/ICO/ICNS derivatives required by native platforms.
- Resolve compiler resources from `node_modules` during Forge development and from copied `resources` in packaged applications; never rely on the Vite main bundle directory for TypeScript standard libraries.
- Treat Monaco diagnostics as immediate authoring feedback and F9 diagnostics as authoritative; merge both in Problems and invalidate completed build results whenever the project revision changes.
- Load Monaco through public granular feature entrypoints and omit only production renderer source maps; this preserves the professional TypeScript feature set while keeping the standard 4 GB package build deterministic.
- Canonicalize every Monaco model, marker, navigation target, and extra-library URI through Monaco's URI implementation before comparing or registering it; user-source paths remain the Project Model keys.
- Keep Monaco inlay hints disabled at both the editor and TypeScript service layers; autocomplete, signature help, diagnostics, and syntax highlighting remain enabled.
- Generate a readonly typed field for every non-root component and represent the root page only as `this`; use stable DOM IDs for visual construction and pass stable `id`/`name` metadata to nonvisual services.
- Present component names as Delphi-like completion labels while inserting `this.Name`; do not create ambient component globals or silently rewrite user source when a component is renamed.
