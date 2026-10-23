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

### Windows CI follow-up

Commit `cf26fa9` passed security, Linux validation and all Linux/macOS release build jobs, but both Windows smoke jobs timed out while Native Build still displayed Checking requirements. See [validation](https://github.com/Atentor/WebRad/actions/runs/39947116378) and [release verification](https://github.com/Atentor/WebRad/actions/runs/39947116404). The original logs did not identify the active tool command.

Prerequisite subprocesses now force `RUSTUP_AUTO_INSTALL=0`: Rustup proxies can otherwise download an absent active toolchain even for version queries. This violates the inspection-only contract and introduces a network-dependent wait. See the [Rustup environment variable contract](https://rust-lang.github.io/rustup/environment-variables.html). A real Rustup regression with isolated configuration and a local HTTP endpoint reproduced eight download requests before the fix and none afterward. The original runner's exact slow command remains unconfirmed. Smoke logs now retain command names, durations and redacted tool output so a future stall identifies the pending command. Actual build commands and the caller's environment are unchanged; no smoke deadline or required evidence is relaxed.

Follow-up validation passed on Windows with Node 26.12.1: complete `validate` (1,684 passing tests, 38 optional skips and production packaging), development and packaged Electron workflows with an absent active Rust toolchain, and packaged update smoke, all final runners exiting zero. Logs are retained as `artifacts/ci-native-build-validate.log`, `ci-native-build-development-confirmation.log`, `ci-native-build-packaged.log` and `ci-native-build-updates.log`. An additional development run hit Windows EPERM while atomically saving `pages/PageMain.wrpage`, after passing native requirements. Its diagnostics remain under `artifacts/smoke/development/standard/failure-IY6z1R`; inspection identified the rejected rename, and the final complete workflow passed without persistence changes or retries. Native confirmation on the final commit remains pending in GitHub; no installer or release was generated locally.

### Original upgrade validation

Windows x64 validation passed: generated sources and icons, strict TypeScript 7 typecheck, ESLint, formatting, 1,683 portable tests with 38 optional skips, and final Forge production packaging. Development and packaged Electron workflows completed all required assertions, including Monaco, compiled F9, RestGo, API Client and bare authored members. The packaged updater workflow passed with exit code zero. Full npm audit reports zero vulnerabilities and npm ls reports no dependency conflicts.

Evidence is retained under artifacts/dependency-upgrade: validate-final.log, development-first.log, packaged-final.log, updates-final.log, audit-final.json and tree-final.json. The initial test failure was the Vitest JSON reporter transition; the fixture now reads an explicit report file and its real event-loop assertions pass. The first packaging download failed with a network termination; installation then fetched the Electron binary and final packaging passed. Electron 45 still reports deprecation notices for synchronous safeStorage operations and the legacy Data Grid console listener; these did not cause crashes or uncaught renderer errors. No installer, application version bump, tag, publication or hosted release workflow is part of this update. Local Windows results do not certify native Linux or macOS operation.
