# WebRAD delivery plan

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| Milestone                    | Status      | Scope                                                                                                                                             | Exit criteria                                                                                              |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1. Repository foundation     | DONE        | npm workspaces, Electron Forge/Vite, React, strict TypeScript, lint, format, Vitest, desktop shell                                                | IDE builds; typecheck, lint, tests, and package build pass                                                 |
| 2. IDE shell                 | DONE        | Menus/toolbars, resizable panels, Explorer, Palette, Inspector shell, Design/Code/Preview, output, status bar, themes                             | Packaged renderer smoke and shell interactions pass                                                        |
| 3. Project model             | DONE        | Versioned model, registry, serialization, typed IPC, create/open/save/add/delete form                                                             | Round-trip, migration, validation, and persistence tests pass                                              |
| 4. Designer basics           | DONE        | DOM runtime renderers, selection overlay, form/panel/label/edit/textarea/button/checkbox/combobox/image/listbox, add/drag/move/resize/delete/snap | Core design interactions and the complete MVP component set pass tests                                     |
| 5. Object Inspector          | DONE        | Metadata-driven properties/events, validation, immediate model projection                                                                         | Typed property and event editors update the model                                                          |
| 6. Commands and selection    | DONE        | Command pattern, transactions, undo/redo, clipboard, multi-select, z-order, marquee                                                               | History, clipboard, selection, and geometry tests pass                                                     |
| 7. Monaco                    | DONE        | Project-wide models, full TypeScript IntelliSense, syntax themes, live/build diagnostics, Problems navigation, save, F12                          | Real bundle proves highlight/autocomplete; models, markers, declarations, navigation, and save are covered |
| 8. Events                    | DONE        | AST method insertion, default event double-click, navigation                                                                                      | Existing methods are never duplicated                                                                      |
| 9. WebRAD typings            | DONE        | Runtime declarations and form-generated members for IntelliSense                                                                                  | Form components appear in generated TypeScript declarations                                                |
| 10. Runtime/compiler/preview | DONE        | Browser runtime, independent esbuild pipeline, isolated preview protocol, F9                                                                      | Hello project compiles; development and packaged compiler smokes pass                                      |
| 11. Nonvisual foundation     | DONE        | Registry-driven nonvisual tray, Inspector/persistence integration, generated service fields, and functional `WebApiClient`                        | Tray, code generation, browser exclusion, and runtime client pass tests                                    |
| 12. Cross-platform packaging | IN PROGRESS | Windows/Linux validation and Forge packaging                                                                                                      | Windows package/smoke pass; Windows/Linux CI is configured                                                 |

## Current work

- DONE: The visual and nonvisual MVP vertical paths, from persisted model through generated code and browser execution.
- DONE: The root `Icon.svg` is the canonical application icon for native packages, windows, installers, favicon, and renderer branding.
- DONE: Build and run resolves TypeScript standard libraries and esbuild resources explicitly in both Forge development and packaged applications.
- DONE: Monaco provides project-wide TypeScript models, complete runtime/form typings, professional editing features and themes, live diagnostics, authoritative build markers, and navigable Problems.
- DONE: Monaco buffers use canonical resource URIs, so edits survive focus/view changes and saving persists the exact current source on Windows and Linux.
- IN PROGRESS: Linux packaging evidence from CI; Windows packaging is locally proven.

## Validation evidence

- Strict TypeScript, ESLint, Prettier, and all 145 Vitest tests pass locally.
- Renderer integration tests cover the File/Toolbar New Project dialog, validation/cancel, visual and nonvisual palette insertion, Inspector edits, AST event generation, Monaco source editing, live/build Problems navigation, save/close/open, F9, and the sandboxed Preview URL. The packaged smoke opens the real Monaco/TypeScript bundle, waits for lazy TypeScript tokenization, proves distinct syntax tokens/colors, and opens a populated Ctrl+Space suggestion widget.
- Application icon validation checks generated PNG/ICO/ICNS assets, renderer reuse of the SVG, packaged native icon loading, and the Windows Squirrel installer.
- The persisted Hello WebRAD example is compiled, mounted in a DOM, edited, clicked, and verified to call `Message` with the live input value.
- The development and packaged smokes start the real Forge bundles, open a Hello project through the UI/preload/IPC path, verify the Monaco editor through F12, dispatch F9, wait for `PreviewPane`, enter `Ada`, click the generated button inside the sandbox, verify `Olá Ada`, then exit automatically.

## Decision log

- Use npm workspaces to minimize bootstrap requirements on Windows and Linux.
- Keep packages source-first during development, with explicit package exports and project references where useful.
- Represent `.wrform` and the project manifest as versioned JSON while keeping user code in separate `.ts` files.
- Share browser-safe component property projection and CSS through `@webrad/runtime/visual`; keep design interaction exclusively in the Designer overlay.
- Keep nonvisual nodes in the Project Model and tray, construct their typed services in generated code, and omit them from the final DOM model.
- Treat `Icon.svg` as the application icon source of truth; commit checked PNG/ICO/ICNS derivatives required by native platforms.
- Resolve compiler resources from `node_modules` during Forge development and from copied `resources` in packaged applications; never rely on the Vite main bundle directory for TypeScript standard libraries.
- Treat Monaco diagnostics as immediate authoring feedback and F9 diagnostics as authoritative; merge both in Problems and invalidate completed build results whenever the project revision changes.
- Load Monaco through public granular feature entrypoints and omit only production renderer source maps; this preserves the professional TypeScript feature set while keeping the standard 4 GB package build deterministic.
- Canonicalize every Monaco model, marker, navigation target, and extra-library URI through Monaco's URI implementation before comparing or registering it; user-source paths remain the Project Model keys.
