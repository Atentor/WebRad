# Native Build with Tauri 2

The WebRAD IDE remains an Electron application. **Native Build** uses the WebRAD
compiler and official Tauri 2 CLI to build project applications. The frontend
retains browser components and typed events, without Electron, Designer, or IDE
administration APIs. Tauri hosts it in a WebView rather than converting components
into platform-native controls.

**Native Build remains experimental.** Configuration, generation, prerequisite
inspection, command execution, logs, cancellation, CI export, and artifact
collection are implemented. The initial 2026-10-21 verification produced no real
native artifact because toolchains/hosts were unavailable. Later prerequisite
checks do not certify builds or WebView execution. See the historical evidence below.

## Architecture

```text
Project Model + authored TypeScript
  -> WebRAD Compiler (target: native)
     -> index.html + assets/app.js + assets/app.css + referenced assets
  -> Electron main / Native Build
     -> host, architecture, tools, and signing inspection
     -> isolated Tauri project + local frontend
     -> cargo tauri / Rust / Gradle / Xcode
     -> artifact validation and output publication
```

`packages/native-build` accepts compiled files and typed settings without importing
compiler or Designer. `apps/ide/main/native-build-ipc.ts` integrates the active
project, compiler, and authorized directories. Renderer access is limited to typed
bridge calls and request-scoped events, without generic filesystem/process access.

Intermediate files live in the IDE cache, separate from `.wrproj`, pages, Models,
Units, and authored TypeScript. Cargo dependencies can be reused. A short Cargo
target directory under IDE data avoids long Windows linker paths and stays
separate from per-project workspaces.

A saved absolute destination is reused. Results update
`<destination>/<sanitized-project-name>`, replacing corresponding generated files
and preserving unrelated files. Compilation uses separate staging, preserving
previous output on compilation failure. Symlink destinations are rejected.
Building user applications does not change IDE versions or releases.

Generation writes `frontend/`, `src-tauri/tauri.conf.json`, Cargo/Rust entry points,
capabilities, icons, and `native-settings.json`. UI loads from local `frontendDist`
without web hosting; Cargo/Gradle dependency downloads may require internet.

## Project Settings

Open **Project Settings → Native Application**. Settings persist in
`settings.nativeApplication`. Existing projects receive defaults without changing
`formatVersion: 2`.

| Group              | Fields                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| Identification     | Application Name, Identifier, Version, Description, Publisher, Application Icon |
| Desktop            | Initial/minimum width/height, Resizable, Fullscreen, Maximizable                |
| Mobile             | Orientation, Mobile Fullscreen, Status Bar, Safe Area, Mobile Application Icon  |
| Build              | Target Platform/Architecture, Output Directory, Debug/Release, Bundle Format    |
| Network            | Allowed Network Origins: one exact HTTP(S)/WS(S) origin per line                |
| Signing references | Installed identities and environment-variable names, without embedded secrets   |

Identifiers such as `com.example.portal` use dot-separated alphanumeric segments
starting with letters. Versions contain three numbers, such as `1.2.3`. Minimum
sizes cannot exceed initial sizes. Toolchains can impose additional constraints.

Icons accept SVG/PNG up to 1 MB. Generation converts to PNG and calls
`cargo tauri icon`. Mobile icons override the native application icon. The IDE
falls back to the General application icon when the native icon is empty, then
to the built-in default. Inspect final/adaptive icons on the target platform.

**Custom Splash Screen is not implemented** and has no image picker. Platform
launch screens/default icons are used. The model retains the field for imported
projects: existing custom images receive a removal warning, and mobile builds
reject them explicitly instead of silently ignoring them.

## Build Application

**Project → Build Application** selects the export platform, including **Web/PWA**.
Name, version, architecture, format, configuration, and output belong in Project
Settings. Web compiler options belong in **Build and publishing**; PWA options
belong in **PWA and metadata**. Incompatible architecture/format choices adapt to
defaults for the selected platform. **Export for GitHub Actions** exports a
standalone project without running a local native build.

**Build Requirements** inspects the computer when opened or when relevant
selections change. Available requirements show green checks; missing ones show
minimum versions and **How to resolve**. **Check again** refreshes inspection.
It does not save, compile, or install tools. Stale responses are discarded;
build-time inspection also updates the list.

Tool probes share a **10-second total budget**, capped at **5 seconds per process**.
Unresponsive tools and descendants are terminated; later probes receive remaining
time. Filesystem checks can still identify SDKs/libraries. Unqueried/timed-out
versions do not receive green checks. Rust/Cargo/Rustup guidance distinguishes
timeout from skipped probes and logs the affected command. Probe subprocesses set
`RUSTUP_AUTO_INSTALL=0` to prevent inspection-triggered downloads. These limits
apply to inspection, including preflight, rather than native build deadlines.

Web/PWA checks the bundled compiler without Rust/Tauri. Unsupported hosts are
reported while CI export remains available. Checks certify prerequisite availability
only. The dialog reports actual stages from Preparing through Completed/Failed/
Cancelled, exposes stdout/stderr and diagnostics, and keeps footer actions
accessible. **Cancel Build** terminates the process tree; partial output is not
success. **Open Output Folder**, **Copy Artifact Path**, and **Build Again** use
the current results. Exit zero without the expected artifact is still failure.
CI export success does not imply an installer was built.

Saved absolute **Output Directory** is reused across Save, Build Again, and reopen.
Empty/unauthorized relative paths open the picker and save the chosen destination.
The effective project-named path is shown. Failure to save that preference produces
a warning without hiding successfully produced artifacts.

## Tools and hosts

Developers install tools explicitly. WebRAD does not silently install Rust, SDKs,
certificates, or system components. Official tools may fetch dependencies during
an explicitly requested build. All native targets require Rust/Cargo, Rustup,
the selected target, and Tauri CLI major 2. Inspection requires Rust 1.77.2+;
resolved dependencies may require newer versions. See
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) and
[CLI reference](https://v2.tauri.app/reference/cli/):

```sh
cargo install tauri-cli --version "^2" --locked
```

| Target  | Required host           | Offered architectures                        | Formats                          |
| ------- | ----------------------- | -------------------------------------------- | -------------------------------- |
| Web/PWA | Windows, Linux, macOS   | CPU-independent                              | `index.html` and assets          |
| Windows | Windows                 | Host, x64, x86, ARM64                        | Executable EXE, NSIS EXE, MSI    |
| Linux   | Linux                   | Host, x64, ARM64                             | DEB, RPM, AppImage               |
| macOS   | macOS                   | Host, Intel x64, ARM64, Universal            | APP, DMG                         |
| Android | Compatible SDK/NDK host | ARM64, ARMv7, x64, x86                       | APK, AAB                         |
| iOS     | macOS                   | ARM64 device, ARM64 simulator, x64 simulator | iOS application; device-only IPA |

These are generated/validated configuration options, not completed-build claims.
Linux needs the selected runner architecture; arbitrary linker/sysroot cross
compilation is not configured. Windows needs architecture-specific libraries.
Universal macOS needs both Rust targets. Unsupported hosts fail before compilation.

### Windows

Install Microsoft C++ Build Tools with **Desktop development with C++**, Windows
SDK, WebView2, and Rust targets. MSI also needs WiX's VBScript support. See
[Windows Installer](https://v2.tauri.app/distribute/windows-installer/).
Inspection checks MSVC and SDK separately for the selected architecture: compiler,
linker, runtime libraries, Win32/UCRT headers, target libraries, and Resource
Compiler from one SDK version. `WindowsSdkDir` locates nondefault SDKs;
`WindowsSDKVersion` selects a version.

**Executable (EXE)** is an application executable, not an installer. NSIS and MSI
select installers. Desktop builds run `cargo tauri build --no-bundle` before
separate bundling. Without a certificate thumbprint, output can be unsigned.
Signing requires an installed user-store certificate and SDK `signtool`; save
only the thumbprint. Certificate issuance/trust is outside the IDE.

### Linux

Install compiler/linker and WebKitGTK 4.1, GTK3, OpenSSL, and Ayatana AppIndicator
development libraries. Debian/Ubuntu examples include `build-essential`,
`libwebkit2gtk-4.1-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, and
`librsvg2-dev`. Inspection uses `pkg-config`; AppImage also checks `patchelf`.
Package names vary. Validate installation/execution on the minimum supported
distribution. Windows/macOS do not build Linux in this flow.

### macOS

Install Xcode Command Line Tools and selected Rust targets. APP is an application
directory; DMG is a distribution image. **Apple Signing Identity** references an
installed keychain identity. **Apple Notarization Keychain Profile** references
an existing `notarytool` profile. When configured, builds submit zipped APP/DMG,
require `Accepted`, then run `stapler staple`/`validate` before copying output.
This path has not been exercised on a Mac in the implementation evidence. Apple
connectivity and valid credentials are required. Gatekeeper may block unsigned/
unnotarized builds. See [macOS signing](https://v2.tauri.app/distribute/sign/macos/).

### Android

Install JDK 17+, Android SDK Platform/Platform-Tools/Build-Tools/Command-line Tools,
NDK, and Rust targets. Configure `JAVA_HOME`, `ANDROID_HOME` (or `ANDROID_SDK_ROOT`),
and `NDK_HOME`. Empty directories do not qualify as SDKs.
Generation runs `cargo tauri android init --ci --skip-targets-install`, applies
configuration, then runs `cargo tauri android build` with architecture, APK/AAB,
and build mode. Debug APK uses development signing. AAB requires complete signing
references and a valid keystore and is not directly installable.

Signing fields contain environment-variable names, such as `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
Actual paths/keys/passwords remain in the IDE/runner environment. See
[Android signing](https://v2.tauri.app/distribute/sign/android/).
Shared `configure-mobile.mjs` applies orientation and Kotlin status-bar/fullscreen/
inset configuration. Safe Area also uses CSS `env(safe-area-inset-*)`. Inspect
rotation, cutouts, and bars on devices; native WebView projection remains unverified.

### iOS

iOS requires macOS with full Xcode, iOS SDK, CocoaPods, Rust targets, and correct
`xcode-select`. Windows/Linux can export to CI but cannot build/simulate iOS.
The flow uses `cargo tauri ios init --ci --skip-targets-install` and
`cargo tauri ios build`. ARM64 device differs from `arm64-simulator`; x64 targets
compatible Intel simulators. IPA requires ARM64 device and valid provisioning.
**Apple Team ID** (also `APPLE_DEVELOPMENT_TEAM`) and **iOS Export Method**
(`debugging`, `release-testing`, `app-store-connect`) configure signing. See
[iOS signing](https://v2.tauri.app/distribute/sign/ios/).

Generation writes orientation/status-bar `Info.ios.plist`. Safe Area uses
`viewport-fit=cover` and inset CSS, without custom UIKit adaptation or device
verification. Simulator compilation does not certify device installation, IPA,
or App Store approval. Review certificates, entitlements, and provisioning.

## Network, RestGo, and security

Existing fetch, API Client, and SDK contracts remain. The developer hosts RestGo;
no backend/admin token is embedded. Native metadata does not change authentication
or component APIs. Two independent policies apply:

1. Application CSP allows exact **Allowed Network Origins** plus statically
   detectable RestGo/API Client origins. Include CDNs, media, uploads/downloads,
   code-constructed URLs, and required redirect origins.
2. Server CORS must allow the WebView's actual origin/headers. CSP does not
   configure CORS. Keep web security, origin checks, and CORS enabled.

Local origins can include `http://tauri.localhost` or `tauri://localhost`, depending
on platform/configuration. Inspect the actual target before configuring backend
access. HTTP, cookies, mixed content, and system policy vary; see
[Tauri configuration](https://v2.tauri.app/reference/config/).

Session persistence follows `settings.restGo`. Each WebView owns its origin/storage;
Preview/Chrome sessions do not transfer. Test updates/reinstallation on devices.
No native credential-storage layer is added.

Default capabilities use `permissions: []`, no custom shell/filesystem commands,
`withGlobalTauri: false`, and disabled asset protocol. CSP restricts local scripts
and network/media/image origins; inline styles support existing rendering. Future
native integrations need narrow permissions, implementation, and coverage. See
[Tauri CSP](https://v2.tauri.app/security/csp/).

Build processes run in main with explicit executables/arguments and no generic
shell. Paths reject traversal/unsafe links; directories are isolated. Review
external-tool logs for local paths or tool-supplied data before sharing them.

## PWA and WebView compatibility

Compiler target `native` omits PWA registration/service worker/manifest. Generation
rejects HTML still registering a service worker. Web exports retain PWA behavior.
Cargo build cache is separate from application cache/storage. Retaining the DOM,
routing, Models, Units, reusables, and typed events does not prove every WebView.
Before distribution, verify representative targets:

- Pages/navigation, form controls, Repeating Group, Data Grid, Popup, layouts,
  reusable isolation, and authored handlers.
- Login/logout, refresh, CurrentUser, persistence, network errors, API Client,
  uploads/downloads, real CSP, and real CORS.
- Video codecs, HLS/DASH, autoplay, MSE/DRM, and Blob URLs.
- PDF generation, modal/new-tab preview, embedded PDF, and download.
- Secure-context APIs, mobile keyboard, rotation, cutouts, and safe areas.

No native file/download/camera/notification/external-browser plugin is included.
Unavailable web APIs do not automatically receive native replacements.

## Export for GitHub Actions

Export writes compiled frontend and Tauri files to a new folder without local
Rust. `.github/workflows/native-application.yml` runs in the **user application's
repository**. Manual dispatch selects desktop, Android APK/AAB, or iOS simulator/
device. Mobile jobs share `configure-mobile.mjs`. Review runner, tool, architecture,
path, and signing setup before use.

Reexport after WebRAD edits; exports are compiled snapshots requiring no Electron
IDE to run. Use appropriate native hosts. Keep signing keys in Secrets/Environments
and temporary runner stores. Materialize signing files temporarily, pass passwords
through environment variables, and remove files afterward. Application owners
configure approvals/store publication. The workflow collects artifacts without
publishing user applications to `Atentor/WebRad`. IDE releases/updater are separate.
Export does not prove execution or certification.

## Troubleshooting

| Symptom                           | Action                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Missing Rust/Cargo/Tauri          | Install explicitly; restart with correct PATH/CARGO_HOME; require CLI major 2. |
| Windows `LNK1104` in build script | Use short Cargo cache paths; check disk space and IDE data permissions.        |
| Missing Rust target               | Follow the displayed `rustup target add`; SDK/linker setup is separate.        |
| Unsupported host                  | Use the required system or export to CI.                                       |
| Android build cannot start        | Check JDK, NDK_HOME, SDK components/licenses, and first Gradle/Tauri error.    |
| Signing failure                   | Check identity, validity, variable names/values, Team ID, and provisioning.    |
| APIs/media fail                   | Inspect CSP, redirects, CORS, TLS/mixed content, and WebView APIs.             |
| Preview session missing           | Sign in within the app's separate origin/storage.                              |
| No installer                      | Executable, APP, and CI export differ from NSIS/MSI/DMG.                       |
| Exit zero without artifact        | Build stays Failed; preserve logs and inspect output paths.                    |
| Cancellation                      | Wait for Cancelled; do not distribute partial output.                          |

## Historical verification status

These observations belong to 2026-10-21/22, not the current checkout:

| Layer                                        | Recorded evidence                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Project Model                                | 203 package tests, including 16 native-setting cases.                               |
| Project Settings                             | 13 UI cases covering editing, validation, persistence, and icons.                   |
| Hello WebRAD                                 | Real compilation/handler execution in JSDOM; no native WebView.                     |
| Generation/processes/integration             | 1,649 passed, 35 optional skips; includes 36 engine and 15 prerequisite cases.      |
| Tauri configuration                          | 12 configurations passed the official JSON schema; no CLI/toolchain certification.  |
| Windows Electron IDE                         | Types, lint, formatting, package, development/packaged/update smokes passed.        |
| Build dialog on 2026-10-22                   | Focused smokes, nine captures, two themes/widths; Windows tools showed 7/7 checks.  |
| Windows/Android native builds                | Initially not run due to missing toolchains; later probes do not certify artifacts. |
| Linux/macOS/iOS native builds                | Not run due to unavailable hosts in that change.                                    |
| WebViews/signing/notarization/install/stores | Unverified; require real artifacts/devices.                                         |

When explicitly requested, `npm run validate:native-build` compiles Hello WebRAD,
exports 12 target/format combinations, probes tools, and attempts builds when host/
toolchain permit. Reports use `out/native-build-validation/latest-report.json`
and per-run UUID folders. Status is `validated`, `failed`,
`not-run-missing-toolchain`, or `not-run-platform`. Generation and compilation are
distinct; native WebView/RestGo execution is separate. **Exit zero with unexecuted
targets is not native build success.** Initial Windows/Android targets lacked
tools; Linux/macOS/iOS lacked hosts. No native artifact was produced. Later
Windows inspection did not rerun that command. Retain artifacts, tool versions,
and device/backend evidence before updating these claims.
