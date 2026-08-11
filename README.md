# WebRAD

WebRAD is a cross-platform visual RAD IDE for building browser applications with forms, components, properties, events, TypeScript, and a real build/preview loop. The desktop IDE uses Electron and React; generated applications use only browser technologies.

## Prerequisites

- Node.js 24 or newer
- npm 11 or newer
- Windows or Linux (the architecture keeps macOS support possible)

## Install and develop

```sh
npm install
npm start
```

On Windows PowerShell installations that block `npm.ps1`, use `npm.cmd` for the same commands.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:packaged
```

Run the complete sequence with `npm run validate`. Format sources with `npm run format`; verify formatting with `npm run format:check`. `npm run runtime:sources:check` verifies that the compiler's embedded browser runtime matches its source package.

## Packaging

`npm run package` creates an unpacked application for the current platform. `npm run smoke:packaged` starts that exact artifact, opens a temporary copy of the Hello project through the IDE, runs F9 through the typed IPC build path, interacts with the sandboxed Preview, and verifies the generated event result before exiting. `npm run make` invokes Electron Forge makers for distributable artifacts supported by the host platform.

## Repository guide

- `apps/ide`: Electron main/preload and React renderer.
- `packages`: independent project model, registry, designer, language, runtime, and compiler modules.
- `examples/hello-webrad`: sample project used by the vertical workflow.
- `docs`: architecture, format, component model, and compiler details.
- `PLANS.md`: live milestone state.

See [the architecture guide](docs/architecture.md) before changing package boundaries.
