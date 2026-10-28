# WebRAD

WebRAD is an open-source visual IDE for building web applications with TypeScript.
It combines a component Designer, typed event handlers in Monaco, REST integration,
and a compiler that produces ordinary browser applications. The IDE uses Electron;
exported Web/PWA applications run independently of it.

Original WebRAD code is available under the [MIT license](LICENSE). Bundled
code and demonstration media retain their [own licenses](THIRD_PARTY_NOTICES.md).

## Install

Download a package from [GitHub Releases](https://github.com/Atentor/WebRad/releases/latest).

| Platform            | Package                                    |
| ------------------- | ------------------------------------------ |
| Windows x64         | `WebRad-<version>-win32-x64-Setup.exe`     |
| Linux x64           | `.deb` or `.rpm` package                   |
| macOS Intel         | `darwin-x64` ZIP containing `WebRad.app`   |
| macOS Apple Silicon | `darwin-arm64` ZIP containing `WebRad.app` |

Packages include the tools needed to create Web/PWA applications in the IDE.
Source development and native application builds have separate requirements.
Unsigned macOS builds may be blocked by the operating system and require manual
application replacement. See [releases and updates](docs/releases.md).

## Create your first application

1. Open **New Project**, choose **Blank project** or **Examples & Tutorial**, and
   select **Aurora**, **Prism**, **Flat**, or **WebRAD** as the application theme.
   Each offers Light and Dark modes. Enter a name and select the parent directory
   for the project folder.
2. In **Builder**, drag components onto the canvas. Select them in the tree or on
   the canvas and edit their properties in the **Visual** Inspector.
3. Open **Interaction** and double-click an event to edit its typed handler in
   Monaco. Use **Design**, **Code**, or **F12** to switch views.
4. Save with **Ctrl+S** (**Cmd+S** on macOS) and press **F9** to run Preview. Preview
   occupies the workspace and shows the page path, such as `/index`. Switch between
   **Desktop** (available width), **Tablet** (768 px), and **Mobile** (390 px) in the
   Preview bar to inspect responsive layouts without restarting the application.
   Use **Stop** to return to authoring. Diagnostics appear in **Output / Problems**.
5. Configure **Build and publishing** and **PWA and metadata** in **Project
   Settings**. Set **Output Directory** under **Native Application → Build**.
6. Open **Project → Build Application…** and select **Web/PWA**. Exported files
   are written to a project-named subfolder in the selected destination.

Serve exported files over HTTP/HTTPS. History routing uses clean URLs and requires
page routes to fall back to `index.html`; Hash routing supports hosting without
that fallback. See [routing and hosting](docs/browser-routing.md).

The IDE tries to reopen the last saved project at startup. If its files are
missing or invalid, the startup screen lets you open or create another project.

Explore [HelloWebRad.wrproj](examples/hello-webrad/HelloWebRad.wrproj) for a small
project, or open [AuroraWorkspace.wrproj](examples/aurora-workspace/AuroraWorkspace.wrproj)
for forms, reusable navigation, data, media, uploads, reports, and account flows.
See the [Aurora guide](examples/aurora-workspace/README.md). Local examples work
without a backend; PokéAPI needs internet, and RestGo operations need your server.

## Design and code

- **Builder** contains the component tree and palette. Nonvisual components appear
  in the tray below the canvas.
- **Responsive** offers **Default** (available width), **Tablet** (768 px), and
  **Mobile** (390 px), without changing saved page dimensions.
- **Visual** edits properties; **Interaction** connects events; **Styles** manages
  shared styles and application themes. **Project Explorer** organizes pages,
  reusable components, Models, Units, and assets.
- **F5** starts the [integrated debugger](docs/debugger.md).

Components are typed instances with completion, hover information, and diagnostics.
For a button's Interaction handler, the body can read an Edit named `NameEdit`:

```ts
Message(`Hello ${NameEdit.value}`);
```

`NameEdit.value` and `this.NameEdit.value` access the same instance. Local variables,
parameters, and imports retain normal TypeScript scope. Use arrow callbacks to
retain the instance. The compiler resolves instance access without rewriting
saved TypeScript. See the [component model](docs/component-model.md).

## APIs and RestGo

**API Client** configures REST operations, parameters, headers, request bodies,
and typed responses. Double-click its tray icon to open the editor. Named
operations are directly available in code:

```ts
ApiClient1.UpdateCustomer.parameter.customerId = 42;
await ApiClient1.UpdateCustomer.execute();
```

The example assumes an `UpdateCustomer` operation with a `customerId` parameter.
See the [API Client guide](docs/api-client.md).

**RestGo integration** provides connection settings, endpoint administration, and
an API catalog. The shared `RestGO` SDK supports authentication, session refresh,
account recovery, avatars, Storage, video services, and dynamic APIs. Tester,
Preview, and generated application requests respect browser CORS.

Administrative credentials and development sessions stay in the IDE. Application
API tokens saved in a project are visible in the browser and need appropriate
permissions. See the [RestGo SDK guide](docs/restgo-sdk.md).

## Native applications: experimental

**Native Build / Tauri 2** provides project generation, tool inspection, build
commands, logs, cancellation, and CI export. Configure it in **Project Settings →
Native Application** and select the export platform in **Build Application**.
The IDE remains an Electron application; Tauri applications use the compiled
WebRAD frontend.

Native artifact production and execution in target WebViews still require real
platform evidence. Prerequisite checks and IDE smokes do not certify a Tauri
application. See [Native Build](docs/native-build.md) for configurations, host
requirements, and verification limits.

## Develop from source

Use **Node.js 26.12.1 or newer** and **npm 12.2.1 or newer**, as declared in
[package.json](package.json). Run from the repository root:

```sh
npm ci
npm start
```

On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`; changing the
system policy is unnecessary. The [dependency guide](docs/dependency-upgrade.md)
explains the TypeScript 7 CLI and embedded TypeScript 6 compiler API.

When preparing a change for verification, the root commands are:

```sh
npm run validate
npm run smoke:development
npm run smoke:packaged
npm run smoke:packaged -- --webrad-smoke-updates
```

`validate` checks icons, generated sources, strict types, lint, portable tests,
formatting, and host packaging. Tests share the root limit of two workers.
Regenerate embedded snapshots with `npm run runtime:sources` after runtime or SDK
changes. Agents run validation only when explicitly requested; see [AGENTS.md](AGENTS.md).

Electron smokes use isolated temporary profiles and projects. Failures preserve
logs and projects under `artifacts/smoke/`. A Designer capture needs an absolute path:

```powershell
npm.cmd run smoke:development -- --webrad-smoke-screenshot="$PWD\artifacts\designer.png"
```

## Packaging and releases

`npm run build` or `npm run package` creates the unpacked application under
`out/WebRad-<platform>-<architecture>`. Share the entire directory for a portable
copy; the executable depends on its accompanying resources.

`npm run make` creates host installers. `npm run release` is an alias for it:
it uses the existing local version and does not commit, tag, or publish. The local
Windows installer is `out/make/squirrel.windows/x64/WebRAD-Dev Setup.exe`.
`.nupkg` files serve the updater and are not end-user installers.

Official releases use stable lowercase `vMAJOR.MINOR.PATCH` tags. The exact commit
must pass Windows x64, Linux x64, and both macOS architectures, plus quality and
security gates, before publication. Follow the [release checklist](docs/release-checklist.md)
and [distribution guide](docs/releases.md).

## Repository and documentation

| Path                   | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `apps/ide`             | Electron main process, preload, and React renderer                            |
| `packages`             | Model, Registry, Designer, language, runtime, compiler, SDK, and Native Build |
| `examples`             | Hello WebRAD and Aurora Workspace projects                                    |
| `tests`, `scripts`     | Integration coverage, browser fixtures, generation, and verification tools    |
| [docs](docs/README.md) | Technical guides and persistent contracts                                     |
| [PLANS.md](PLANS.md)   | Current delivery status and unresolved verification work                      |

Start with the [documentation index](docs/README.md),
[architecture](docs/architecture.md), [project format](docs/project-format.md),
and [compiler](docs/compiler.md). Read [CONTRIBUTING.md](CONTRIBUTING.md) to
contribute and [SECURITY.md](SECURITY.md) to report vulnerabilities.
