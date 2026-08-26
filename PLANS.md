# WebRAD delivery plan

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| Milestone                    | Status | Scope                                                                                                                                                                               | Exit criteria                                                                                                      |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1. Repository foundation     | DONE   | npm workspaces, Electron Forge/Vite, React, strict TypeScript, lint, format, Vitest, desktop shell                                                                                  | IDE builds; typecheck, lint, tests, and package build pass                                                         |
| 2. IDE shell                 | DONE   | Menus/toolbars, resizable panels, Explorer, Palette, Inspector shell, Design/Code/Preview, output, status bar, themes                                                               | Packaged renderer smoke and shell interactions pass                                                                |
| 3. Project model             | DONE   | Versioned model, registry, serialization, typed IPC, create/open/save/add/delete page                                                                                               | Round-trip, schema rejection, validation, and persistence tests pass                                               |
| 4. Designer basics           | DONE   | DOM runtime renderers, selection overlay, page/panel/label/edit/textarea/button/checkbox/combobox/image/listbox, add/drag/move/resize/delete/snap                                   | Core design interactions and the complete MVP component set pass tests                                             |
| 5. Object Inspector          | DONE   | Metadata-driven properties/events, validation, immediate model projection                                                                                                           | Typed property and event editors update the model                                                                  |
| 6. Commands and selection    | DONE   | Command pattern, transactions, undo/redo, clipboard, multi-select, z-order, marquee                                                                                                 | History, clipboard, selection, and geometry tests pass                                                             |
| 7. Monaco                    | DONE   | Project-wide models, full TypeScript IntelliSense, syntax themes, live/build diagnostics, Problems navigation, save, F12                                                            | Real bundle proves highlight/autocomplete; models, markers, declarations, navigation, and save are covered         |
| 8. Events                    | DONE   | AST method insertion, event double-click, and body-cursor navigation/focus                                                                                                          | Existing methods are never duplicated; the matching handler body receives focus                                    |
| 9. WebRAD typings            | DONE   | Typed Registry runtime API, readonly `this.Name` page fields, and Delphi-like `Name` completion insertion                                                                           | Every non-root visual/nonvisual component is typed in generated declarations and native TypeScript                 |
| 10. Runtime/compiler/preview | DONE   | Browser runtime, independent esbuild pipeline, isolated preview protocol, F9                                                                                                        | Hello project compiles; development and packaged compiler smokes pass                                              |
| 11. Nonvisual foundation     | DONE   | Registry-driven nonvisual tray, Inspector/persistence integration, generated service fields, and functional `WebApiClient`                                                          | Tray, code generation, browser exclusion, and runtime client pass tests                                            |
| 12. Cross-platform packaging | DONE   | Windows/Linux validation and Forge packaging                                                                                                                                        | Windows package/smoke pass; Windows/Linux CI is configured                                                         |
| 13. Responsive layout engine | DONE   | Version 2 per-node container/item layout contract, shared runtime projection, and responsive Designer interaction                                                                   | Runtime and Designer reflow from one model across fixed, anchored, row, and column containers                      |
| 14. API Client contracts     | DONE   | Versioned named API operations, direct browser tester, saved response-contract trees, typed nonvisual outputs, and request lifecycle events                                         | Tester action, model/schema, generated typings, runtime sources, lifecycle events, and focused tests pass together |
| 15. Dynamic Data Grid        | DONE   | API Client result binding, dedicated configurator modal, mixed fixed/dynamic column widths and row heights, typed cells, sticky header/footer, styles, and generated runtime wiring | Model/compiler validation, Designer, Preview, generated app, and focused tests pass together                       |

## Current work

- DONE: The visual and nonvisual MVP vertical paths, from persisted model through generated code and browser execution.
- DONE: Every user-facing IDE window opens maximized after its renderer is ready, without exposing the hidden automated-smoke window.
- DONE: The renderer toolbar uses compact grouped actions without duplicate WebRAD branding or a theme button; theme switching remains available from Tools > Toggle Theme.
- DONE: Problems, Output, and Build are docked in the editor column below the nonvisual component tray, while the side rails remain full-height.
- DONE: Project Explorer Styles provides persisted, reusable, component-compatible Tailwind styles with metadata-driven visual properties for five states, including exclusive solid/gradient choices for text, backgrounds, and radius-safe layered borders, live Designer preview, Inspector assignment, and static compiler output without requiring class or code entry.
- DONE: New projects seed an editable Aurora default style for every visual component; page roots and visual palette/canvas insertion bind the compatible default automatically, while the protected defaults remain available for future components.
- DONE: Buttons support an expanded shared local SVG catalogue: the Default Button uses text plus a left 16px icon, the `Icon` style group owns its base presentation plus state-aware color and size, those settings render consistently in the Styles preview, Designer, and generated browser runtime, and each button selects its typed icon from an accessible visual gallery with canonical ID/label search. Search recognizes common aliases such as `log in` and `door enter` without displaying redundant icon choices.
- DONE: The Styles editor adapts to its actual available workspace width, avoiding horizontal overflow beside IDE rails while keeping the live preview visible during property scrolling.
- DONE: The root `Icon.svg` is the canonical application icon for native packages, windows, installers, favicon, and renderer branding.
- DONE: Build and run resolves TypeScript standard libraries and esbuild resources explicitly in both Forge development and packaged applications.
- DONE: Monaco provides project-wide TypeScript models, complete runtime/page typings, professional editing features and themes, live diagnostics, authoritative build markers, and navigable Problems.
- DONE: Monaco buffers use canonical resource URIs, so edits survive focus/view changes and saving persists the exact current source on Windows and Linux.
- DONE: Monaco inlay hints are disabled so inferred types and parameter labels never appear as synthetic code in the source view.
- DONE: Monaco ships JetBrains Mono Light 300, including its real italic face, as self-hosted renderer assets instead of depending on an operating-system font.
- DONE: distributable desktop artifacts use the public product name `WebRad` for the executable, installer, and Windows shortcut while retaining the lowercase npm package identifier.
- DONE: Every non-root component is exposed as a typed readonly `this.Name` field; Delphi-like `Name` suggestions insert that standard TypeScript expression for consistent diagnostics, build, and Preview.
- DONE: The version 2 responsive-layout contract replaces page-level layout mode with per-node container and item rules; runtime and Designer reflow from that one persisted model across fixed, anchored, row, and column containers.
- DONE: Windows packaging and packaged smoke are locally proven; the CI workflow validates development and packaged applications on Windows and Linux.
- DONE: API Client lifecycle events (`OnRequest`, `OnSuccess`, `OnError`, and `OnComplete`) are available in the Inspector, generated bindings, and browser runtime.
- DONE: Dynamic Data Grid has a transactional dedicated modal for API binding, column order and cell settings, mixed fixed/dynamic column widths, configurable row sizing, padding, wrapping, alignment, lines, stripes, empty state, and matching Designer/generated-runtime projection. Its Data Grid-only Styles groups independently control horizontal and vertical line visibility, color, width, and style, plus the header and footer background/text, separator border, height, padding, and font weight.
- DONE: Generated page wrappers rehydrate every Data Grid's persisted configuration before API binding, so all grids subscribed to a client render each new successful operation result.
- DONE: The Data Grid configurator uses a compact, high-density layout that keeps sizing, appearance, and column controls readable while reducing modal scrolling.
- DONE: Default Data Grid headers and footers use solid Aurora-compatible surfaces, with the same non-transparent fallbacks for existing projects that have not customized those properties.
- DONE: Disabled modal controls use the standard `not-allowed` cursor; `wait` is reserved for actual request or editor loading feedback.

## Validation evidence

- Strict TypeScript, ESLint, Prettier, and the complete Vitest suite pass locally.
- `npm run validate` and the packaged Windows smoke passed on 2026-08-25 after the API Client contract work; the full suite contains 237 tests across 35 files.
- API Client lifecycle tests cover Inspector visibility, AST-generated typed event handlers, successful and failed request transitions, and each event's runtime detail payload.
- Project Model, compiler, runtime, Registry-driven component rendering, Styles workspace, Inspector binding, live CSS IPC, and the real development Electron smoke cover reusable Tailwind styles from authoring through generated Preview execution.
- Renderer integration tests cover the compact toolbar, Tools-only theme switching, functional Styles navigation and editing, the File/Toolbar New Project dialog, validation/cancel, visual and nonvisual palette insertion, Inspector edits, AST event generation, Monaco source editing, live/build Problems navigation, save/close/open, F9, and the sandboxed Preview URL. The packaged smoke opens the real Monaco/TypeScript bundle, waits for lazy TypeScript tokenization, proves distinct syntax tokens/colors, and opens a populated Ctrl+Space suggestion widget.
- The packaged renderer smoke loads both the normal and italic JetBrains Mono weight-300 faces and verifies Monaco's computed font family, proving that installed applications use bundled webfonts; packaging also includes the font's OFL 1.1 notice.
- Language and renderer tests cover every MVP component as a generated `this.Name` member, concrete non-`any` runtime types, Registry property completion, stable visual IDs, nonvisual identity, root-as-`this`, and the exact completion insertion text.
- Application icon validation checks generated PNG/ICO/ICNS assets, renderer reuse of the SVG, packaged native icon loading, and the Windows Squirrel installer.
- The persisted Hello WebRAD example is compiled, mounted in a DOM, edited, clicked, and verified to call `Message` with the live input value.
- Responsive-layout tests cover version 2 validation and serialization, Registry controls, runtime fixed/anchored/flex projection, Designer viewport reflow, and drag reorder for row/column containers.
- Dynamic Data Grid tests cover v1-to-v2 configuration migration, fixed and dynamic track constraints, dialog save/cancel/reorder behavior, Inspector persistence, base-only reusable line/header/footer styles, Designer projection, generated runtime behavior, and public runtime-typing parity.
- Data Grid runtime regression coverage verifies that multiple grids bound to one API Client replace their rows after each successful execution.
- The development and packaged smokes start the real Forge bundles, open a Hello project through the UI/preload/IPC path, verify the Monaco editor through F12, dispatch F9, wait for `PreviewPane`, enter `Ada`, click the generated button inside the sandbox, verify `Olá Ada`, then exit automatically.

## Decision log

- Use npm workspaces to minimize bootstrap requirements on Windows and Linux.
- Keep packages source-first during development, with explicit package exports and project references where useful.
- Exclude source-first `@webrad/*` workspaces from Vite dependency optimization while explicitly optimizing the CommonJS TypeScript distribution, so renamed exports cannot leave the development renderer on a stale bundle.
- Represent `.wrpage` and the project manifest as versioned JSON while keeping user code in separate `.ts` files.
- Keep the current Page contract at format version 2 and reject version 1 or future documents outside the current schema without carrying a migration layer.
- Store reusable style identities and component references in the version 2 Project Model; compile exact Tailwind candidates to static utility CSS with no Preflight or browser Tailwind dependency.
- Persist responsive rules on every component as `layout.container` and `layout.item`; preserve `bounds` only as the fixed-layout fallback so runtime and Designer share one geometry source.
- Share browser-safe component property projection and CSS through `@webrad/runtime/visual`; keep design interaction exclusively in the Designer overlay.
- Keep nonvisual nodes in the Project Model and tray, construct their typed services in generated code, and omit them from the final DOM model.
- Keep the API Client's request and response contract in an optional, schema-versioned component property so existing format-v2 projects remain readable without a project-format migration.
- Persist only API operation metadata and selected response-schema definitions, never sampled response data; stable operation and schema-node IDs are future binding keys.
- Send API Client test and generated-runtime traffic with browser `fetch`; do not route arbitrary endpoints through Electron, and preserve the target API's CORS and authentication boundary.
- Treat `Icon.svg` as the application icon source of truth; commit checked PNG/ICO/ICNS derivatives required by native platforms.
- Resolve compiler resources from `node_modules` during Forge development and from copied `resources` in packaged applications; never rely on the Vite main bundle directory for TypeScript standard libraries.
- Treat Monaco diagnostics as immediate authoring feedback and F9 diagnostics as authoritative; merge both in Problems and invalidate completed build results whenever the project revision changes.
- Load Monaco through public granular feature entrypoints and omit only production renderer source maps; this preserves the professional TypeScript feature set while keeping the standard 4 GB package build deterministic.
- Canonicalize every Monaco model, marker, navigation target, and extra-library URI through Monaco's URI implementation before comparing or registering it; user-source paths remain the Project Model keys.
- Keep Monaco inlay hints disabled at both the editor and TypeScript service layers; autocomplete, signature help, diagnostics, and syntax highlighting remain enabled.
- Generate a readonly typed field for every non-root component and represent the root page only as `this`; use stable DOM IDs for visual construction and pass stable `id`/`name` metadata to nonvisual services.
- Present component names as Delphi-like completion labels while inserting `this.Name`; do not create ambient component globals or silently rewrite user source when a component is renamed.
