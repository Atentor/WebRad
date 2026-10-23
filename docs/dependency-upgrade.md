# Stable dependency upgrade - 2026-10-23

The root manifest and all nine npm workspaces use exact stable dependency pins. The application version remains unchanged.

## Toolchain

Use Node.js 26.12.1 or newer and npm 12.2.1 or newer. CI installs the same npm version declared by packageManager. Local validation uses a portable, SHA-256-verified Node distribution without changing the machine-wide installation.

TypeScript 7.0.2 is installed as typescript-native and runs the strict root/workspace command-line typechecks. TypeScript 6.0.3 remains the stable JavaScript compiler API used by the embedded compiler, AST transformations, Monaco integration and ESLint. TypeScript 7 exposes a different experimental API, and typescript-eslint 8.72.0 declares TypeScript below 6.1. This separation avoids unsupported peer dependencies or experimental application compiler APIs; strictness is unchanged.

## Application and build migrations

- Electron 45.0.0; Forge CLI, makers and plugins 8.0.1; Fuses 2.1.3. Main and preload bundles now use .cjs, including the RestGo smoke window. Electron sandbox, IPC validation and integrity fuses remain enabled.
- Vite 8.3.5, React plugin 6.1.2, Vitest 5.0.5. Main-process externals use rolldownOptions. The root package declares ESM; Forge emits explicit CommonJS desktop bundles. The test worker cap remains two and real event-loop turns remain enabled.
- React/React DOM 19.3.1, Monaco 0.57.0, Shaka 5.3.2, Zod 4.6.7 and current stable test/lint/type packages. Shaka's embedded sources are regenerated.
- The dependency lock is regenerated from a clean installed tree, without force or legacy-peer-deps.

## Validation

Windows x64 validation passed: generated sources and icons, strict TypeScript 7 typecheck, ESLint, formatting, 1,683 portable tests with 38 optional skips, and final Forge production packaging. Development and packaged Electron workflows completed all required assertions, including Monaco, compiled F9, RestGo, API Client and bare authored members. The packaged updater workflow passed with exit code zero. Full npm audit reports zero vulnerabilities and npm ls reports no dependency conflicts.

Evidence is retained under artifacts/dependency-upgrade: validate-final.log, development-first.log, packaged-final.log, updates-final.log, audit-final.json and tree-final.json. The initial test failure was the Vitest JSON reporter transition; the fixture now reads an explicit report file and its real event-loop assertions pass. The first packaging download failed with a network termination; installation then fetched the Electron binary and final packaging passed. Electron 45 still reports deprecation notices for synchronous safeStorage operations and the legacy Data Grid console listener; these did not cause crashes or uncaught renderer errors. No installer, application version bump, tag, publication or hosted release workflow is part of this update. Local Windows results do not certify native Linux or macOS operation.
