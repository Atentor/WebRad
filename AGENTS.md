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

## Release reliability

- Read [the release checklist](docs/release-checklist.md) before changing CI, packaging, smoke tests, editor navigation or controls exercised by a smoke. Follow it when preparing a release.
- UI changes must update the real Electron smoke interactions and required evidence in the same change. Verify the current product contract; do not restore intentionally removed controls to satisfy an obsolete test, delete evidence for supported behavior, add retries or increase timeouts to hide a regression.
- Run `npm run validate`, `npm run smoke:development`, `npm run smoke:packaged` and the packaged update smoke for a release candidate. Inspect failures and retain diagnostic artifacts. Uncaught renderer exceptions and crashes fail the smoke even when later interactions succeed. A scoped unit test or renderer-only build does not establish release readiness.
- The `release` workflow verifies Windows x64, Linux x64 and both macOS architectures on `main` and pull requests without publishing. A tag requires a successful non-publishing verification of its exact commit. Do not bypass this gate or claim native platform success from local Windows results.
- Keep `strict: true`, sandboxing, generated-source checks, integrity checks and publication permissions intact. Keep at most two test workers in the shared `vitest.config.ts`; avoid CLI/workflow overrides or raising parallelism to speed up a local check. Changes to test scheduling require complete native verification before a release.
- Preserve the real event-loop turns in `tests/setup/worker-event-loop.ts`. Synchronous TypeScript suites must allow pending worker RPC messages to run between cases; a resolved Promise or a fake timer does not provide that I/O scheduling boundary.
- Official versions come from new stable lowercase `vMAJOR.MINOR.PATCH` tags. Local `npm run release` is only `npm run make`, uses the existing version and names the Windows installer `WebRAD-Dev Setup.exe`. Creating a tag, publishing a release, incrementing versions or generating local installers requires user authorization.
