# WebRAD delivery plan

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| Milestone                    | Status      | Scope                                                                                                                                             | Exit criteria                                                           |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Repository foundation     | DONE        | npm workspaces, Electron Forge/Vite, React, strict TypeScript, lint, format, Vitest, desktop shell                                                | IDE builds; typecheck, lint, tests, and package build pass              |
| 2. IDE shell                 | DONE        | Menus/toolbars, resizable panels, Explorer, Palette, Inspector shell, Design/Code/Preview, output, status bar, themes                             | Packaged renderer smoke and shell interactions pass                     |
| 3. Project model             | DONE        | Versioned model, registry, serialization, typed IPC, create/open/save/add/delete form                                                             | Round-trip, migration, validation, and persistence tests pass           |
| 4. Designer basics           | DONE        | DOM runtime renderers, selection overlay, form/panel/label/edit/textarea/button/checkbox/combobox/image/listbox, add/drag/move/resize/delete/snap | Core design interactions and the complete MVP component set pass tests  |
| 5. Object Inspector          | DONE        | Metadata-driven properties/events, validation, immediate model projection                                                                         | Typed property and event editors update the model                       |
| 6. Commands and selection    | DONE        | Command pattern, transactions, undo/redo, clipboard, multi-select, z-order, marquee                                                               | History, clipboard, selection, and geometry tests pass                  |
| 7. Monaco                    | DONE        | Persistent models, tabs, TypeScript services, dirty state, save, F12                                                                              | Models, generated libraries, save, find, and navigation are integrated  |
| 8. Events                    | DONE        | AST method insertion, default event double-click, navigation                                                                                      | Existing methods are never duplicated                                   |
| 9. WebRAD typings            | DONE        | Runtime declarations and form-generated members for IntelliSense                                                                                  | Form components appear in generated TypeScript declarations             |
| 10. Runtime/compiler/preview | DONE        | Browser runtime, independent esbuild pipeline, isolated preview protocol, F9                                                                      | Hello project compiles and executes; packaged compiler smoke passes     |
| 11. Nonvisual foundation     | DONE        | Registry-driven nonvisual tray, Inspector/persistence integration, generated service fields, and functional `WebApiClient`                        | Tray, code generation, browser exclusion, and runtime client pass tests |
| 12. Cross-platform packaging | IN PROGRESS | Windows/Linux validation and Forge packaging                                                                                                      | Windows package/smoke pass; Windows/Linux CI is configured              |

## Current work

- DONE: The visual and nonvisual MVP vertical paths, from persisted model through generated code and browser execution.
- IN PROGRESS: Linux packaging evidence from CI; Windows packaging is locally proven.

## Validation evidence

- Strict TypeScript, ESLint, Prettier, and all 105 Vitest tests pass locally.
- A renderer integration test covers New, visual and nonvisual palette insertion, Inspector edits, AST event generation, Monaco source editing, save/close/open, F9, and the sandboxed Preview URL.
- The persisted Hello WebRAD example is compiled, mounted in a DOM, edited, clicked, and verified to call `Message` with the live input value.
- The packaged smoke used by Windows/Linux CI starts the Forge artifact, opens a temporary Hello project through the real UI/preload/IPC path, dispatches F9, waits for `PreviewPane`, enters `Ada`, clicks the generated button inside the sandbox, verifies `Olá Ada`, then exits automatically.

## Decision log

- Use npm workspaces to minimize bootstrap requirements on Windows and Linux.
- Keep packages source-first during development, with explicit package exports and project references where useful.
- Represent `.wrform` and the project manifest as versioned JSON while keeping user code in separate `.ts` files.
- Share browser-safe component property projection and CSS through `@webrad/runtime/visual`; keep design interaction exclusively in the Designer overlay.
- Keep nonvisual nodes in the Project Model and tray, construct their typed services in generated code, and omit them from the final DOM model.
