# WebRAD engineering rules

These rules apply to the entire repository.

## Non-negotiable architecture

- Use TypeScript with `strict: true`. Do not weaken strictness to make a build pass.
- The versioned Project Model is the single source of truth. React state and DOM nodes are projections of it.
- Keep design-time behavior in `packages/designer` and browser runtime behavior in `packages/runtime`. The runtime must never depend on the designer, Electron, or Node.js.
- Register component behavior and metadata through the central Component Registry. Do not spread type-specific conditionals through the IDE.
- Every component, visual or nonvisual, must have a real object-oriented runtime class with typed properties, methods, and events. Export its public API from `@webrad/runtime` and keep the Monaco runtime declarations and generated runtime sources in parity with it. A Designer representation alone does not constitute a working component.
- Expose every non-root component as a concrete typed instance in page and reusable code, with native Monaco completion, hover, signatures, and diagnostics for its API. Support both `ComponentName.member` and `this.ComponentName.member` through the shared instance-scoped language contract; preserve lexical shadowing and isolate reusable placements. The root remains `this`. Do not substitute `any`, untyped DOM handles, or runtime component globals for this contract.
- Keep generated files separate from user-authored files. Never overwrite a user-authored TypeScript file.
- Use the TypeScript compiler AST for edits to TypeScript source. Never modify user TypeScript with regular expressions or global textual replacement.
- Electron renderer code must not import Node.js or Electron APIs. Keep `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`; expose only typed, narrow preload APIs and validate all IPC input in the main process.
- Generated applications must be ordinary browser applications with no Electron dependency.
- Preserve stable component IDs when names or properties change.

## Portability and quality

- Support Windows and Linux paths and process behavior; avoid shell-specific runtime assumptions and keep macOS support architecturally possible.
- Prefer small, testable modules and pure business logic. Do not create a single all-purpose React component or store.
- Test serialization, validation, registry behavior, commands/history, geometry, code generation, and compilation.
- For each new component or public component API, extend meaningful coverage for generated instance types, Monaco member completion and invalid-use diagnostics, runtime behavior, and compiled Preview/F9 execution before declaring it `DONE`.
- A milestone is `DONE` only when typecheck, lint, tests, and build pass for its scope.
- Update `PLANS.md` as work advances. Update relevant files under `docs/` whenever architecture or persistent formats change.
- Do not leave placeholder UI or fake operations presented as working functionality.

## Repository workflow

- Use npm workspaces and root scripts for development and validation.
- Keep public package boundaries explicit; avoid importing another package's private source files.
- Prefer platform-neutral Node APIs and `path` helpers. Never persist project state only in browser storage.
- Keep logging categorized (`IDE`, `PROJECT`, `DESIGNER`, `COMPILER`, `PREVIEW`, `IPC`) and avoid stray `console.log` calls.
- Preserve unrelated user changes in a dirty worktree.
