# WebRAD releases and updates

`.github/workflows/release.yml` publishes stable lowercase `vMAJOR.MINOR.PATCH`
tags in **Atentor/WebRad**. It produces Windows x64 Setup/Squirrel, Linux x64
DEB/RPM, and macOS Intel/Apple Silicon ZIPs containing `WebRad.app`. IDE releases
do not include iOS; generated application targets are a separate [Native Build](native-build.md)
feature. Packages are published in [WebRAD Releases](https://github.com/Atentor/WebRad/releases).

Local `package.json`/lockfile versions can remain fixed during development.
`npm run release` only aliases `npm run make`, using the local version without
incrementing or publishing. The local Windows installer is
`out/make/squirrel.windows/x64/WebRAD-Dev Setup.exe`. CI applies the tag version
only in its temporary checkout and stages the official Setup as
`WebRad-<version>-win32-x64-Setup.exe`.

## GitHub setup

Keep the repository public with Actions enabled. Source archives and installers
belong to the same tag/repository. Workflows use the automatic `GITHUB_TOKEN`,
with Contents: Read and Actions: Read by default. Only `publish` receives Contents:
Write. No separate fine-grained publication token is needed.

The destination is `${{ github.repository }}`, embedded into the main-process
build without a token. Legacy `WEBRAD_RELEASE_REPOSITORY` and `WEBRAD_RELEASE_TOKEN`
are unused. Preflight checks the tag, token access, and public repository before
starting builds. No separate installer repository is required.

## Verify before tagging

The release workflow also runs without publishing on pushes to `main` and
`codex/verify-release-*`, pull requests, and manual dispatch. It uses temporary
version `0.0.0`, runs all four builds, application/updater smokes, installer
creation, and complete assembly. Output is the `release-assembled` artifact;
`publish` is skipped, and no tag or Release is created.

A tag requires successful nonpublishing verification of its **exact SHA** from
an eligible branch push or manual run. Pull-request merge commits do not certify
the final commit. Preflight resolves the SHA through the API and paginates runs.
The latest eligible `validate` and `security` runs for that SHA must also have
completed successfully. Pending, cancelled, or failed latest runs block publication
even if an older run passed. Eligible quality/security runs are branch pushes or
manual runs; scheduled main security scans also count. Tag/PR runs do not replace
these gates. All three gates are rechecked before publication, without gating
nonpublishing verification itself. See the [release checklist](release-checklist.md).

Assembly uses read-only permissions. Publication requires a stable tag, successful
assembly, and no `WEBRAD_RELEASE_VERIFY_ONLY` flag. A new verification-branch commit
supersedes its earlier run. Tags build independently; publication jobs serialize
with up to 100 pending entries without cancelling earlier publications. Rerunning
an old tag uses its original code, not subsequent fixes.

## Publish a version

After the authorized commit is pushed and all exact-SHA gates pass, create and
push a **new** stable tag only with publication authorization. Choose a version
higher than every previously distributed version, including releases from the
former repository. Do not reuse or move an existing tag. The tag must point to
main or an ancestor. CI applies it to the root manifest/lockfile before dependency
installation, without creating commits or invoking local `npm run release`.

For clones predating the public-history baseline of 2026-10-17, start from a fresh
clone and transfer only reviewed changes onto current main. Do not merge old
history, restore retired tags/branches, or push a mirror. The former baseline
migration guide has been consolidated here. History rewrites cannot guarantee
removal from existing clones, caches, or read-only pull-request references.

Each platform job checks icons/generated sources, strict types, lint, formatting,
portable tests, packaging, and packaged application smoke. The updater smoke uses
a test backend without installing software on the runner. Linux prepares both
development and packaged `chrome-sandbox` helpers. Logs remain outside bundles
to preserve macOS signatures.

Packaging includes `THIRD_PARTY_LICENSES.txt`. For `@img/sharp-libvips-*` packages
without separate license files, notice generation preserves their README and
Licensing table. Other dependencies without recognized notices still fail the
build. Preserve these redistribution notices.

`npm run test:portable` runs with TEMP/TMP/TMPDIR through a temporary symlink/junction,
covering logical/physical path differences such as macOS `/var` and `/private/var`.
Cross-process fixtures use physical paths while Deploy link protections remain.
The shared two-worker limit belongs only in `vitest.config.ts`. Real event-loop
turns in `tests/setup/worker-event-loop.ts` allow worker RPC/reporting between
synchronous TypeScript cases. Keep the real Node scheduling primitives, including
with fake timers; do not increase workers or transport deadlines to hide failures.

Every smoke isolates Chromium profile/project state. Uncaught JavaScript errors
and renderer crashes fail even if later interactions finish. Required
`renderer workflow completed` appears only after renderer health checks; Forge
exit zero alone is insufficient. Failures retain raw logs, metadata, and project
copies under `artifacts/smoke/`, excluding profiles. CI uploads
`release-smoke-<platform>-<architecture>` or `validation-smoke-<runner>` artifacts.
Windows/Linux quality jobs remain independent to retain both diagnostics.

Maintain the actual UI contract in smoke interactions: one active document tab,
removed Zoom/Arrange controls absent, default Designer scale, and exclusive
Stop-driven Preview. Monaco checks preserve code, cursor, scroll, native input,
fonts, and rendered geometry during Design/Code switching. Restore layout after
the hidden container becomes visible; stale deferred restoration must not override
event-handler navigation. Rendered lines are compared in visual order because
Monaco recycles DOM nodes. `tests/monaco-view-state.browser.test.ts` uses real
Monaco/fonts at three widths when `WEBRAD_BROWSER_PATH` is configured.

Native cursor cleanup uses Shift+Left and one Backspace for inserted ASCII text,
retaining exact restoration and all 24 geometry samples. Editor diagnostics
publish real changes without resending identical lists on every edit.
Responsive API Client/Data Grid smokes retain exact widths and accept native height
limits, with a positive temporary `1x1` window minimum on macOS. Diagnostics record
requested/native/renderer/minimum sizes. `npm run smoke:viewport` probes sandboxed
Electron resizing on both Macs before the full suite; the full smoke still
requires 1080/740 px widths.

Development smoke separates cold startup (120 seconds) from the functional
workflow (120 seconds, 180 for debugger). Timeout terminates the owned process
tree with bounded cleanup, including pipe-holding descendants: taskkill on Windows,
isolated process groups on POSIX. Preserve per-interaction limits/evidence and
report phase, deadline, progress, and cleanup errors. Register Monaco's public
`dropOrPasteInto` capability before the first editor while semantic TypeScript
services load asynchronously.

Linux Xvfb uses a private authentication file under RUNNER_TEMP, removed on exit,
retaining X11 authorization, Electron sandboxing, and the original exit code.
Assembly checks all four builds, exact file inventories, sizes, SHA-256, and
`SHA256SUMS`, repeating integrity checks after transfer to publication. It verifies
the tag exists, creates a draft Release, uploads every asset, then publishes.
Upload failure retains a recoverable draft; public releases are not overwritten.
Latest-version comparison paginates all Releases so old tags cannot become latest.

## Installed application behavior

- Public metadata is checked about 15 seconds after startup and every six hours.
  **Help → Check for Updates...** checks immediately without downloading, including
  with no project open.
- **Update** appears beside Beta only after confirming a newer release. Clicking
  downloads; the label stays Update, with tooltip progress and duplicate actions
  blocked. Before installation, the IDE saves the latest project edits. Unsaved
  changes in any window block restart; save failure leaves the update retryable.
- **Windows Setup/Squirrel:** validates and installs the NuGet update, then restarts
  through `quitAndInstall()`. Portable copies need initial Setup installation.
- **Linux packages:** the executable must belong to `webrad`. APT, DNF, or Zypper
  installs a verified DEB/RPM using pkexec/polkit authorization. Cancel/failure
  keeps the IDE open. No downloaded privileged shell script is executed.
- **Signed macOS:** Squirrel.Mac uses architecture-specific ZIP/feed when both
  installed and incoming versions have Developer ID signatures.
- **Unsigned macOS:** verified ZIP download is revealed in Finder for manual
  replacement in Applications. System protections remain intact.
- **Portable/unsupported Linux:** downloads an installer for manual installation.
  Development and ordinary smokes do not check real updates.

Builds without this updater need an initial installer update. Older builds pointing
to `Atentor/WebRad-Releases` retain that embedded destination; install a release
from `Atentor/WebRad` once to migrate. The workflow does not transfer/delete old
releases.

## Optional macOS signing

Without Apple credentials, both macOS artifacts are unsigned and release notes
say so. Signed distribution/native automatic updates require a Developer ID
Application certificate and these repository Secrets:

| Secret                        | Content                                           |
| ----------------------------- | ------------------------------------------------- |
| `APPLE_CERTIFICATE_BASE64`    | Base64 `.p12` containing certificate/private key. |
| `APPLE_CERTIFICATE_PASSWORD`  | `.p12` password.                                  |
| `APPLE_SIGNING_IDENTITY`      | Full Developer ID Application identity.           |
| `APPLE_ID`                    | Notarization Apple account.                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | Account app-specific password.                    |
| `APPLE_TEAM_ID`               | Apple team identifier.                            |

CI imports into a temporary keychain and removes it afterward. Forge uses hardened
runtime, versioned entitlements, and notarization. Incomplete signing credentials
fail with a configuration diagnostic. Migration from unsigned to signed requires
one manual replacement.

## Distribution contract

Public releases contain installers, `RELEASES`, Squirrel `.nupkg`,
`webrad-darwin-x64.json`, `webrad-darwin-arm64.json`, `webrad-update.json`, and
`SHA256SUMS`. Manifest format 1 records version, date, platform/architecture/format,
filename, size, SHA-256, and macOS signing status. Mac feeds use
`currentRelease`/`releases`/`updateTo`. The application fetches
`https://github.com/Atentor/WebRad/releases/latest/download/webrad-update.json`
and pins downloads to its concrete tag.

Preload exposes only update `getState()`, `check()`, `download()`, `install()`,
and state subscriptions. IPC validates trusted origin/main frame and accepts no
renderer-supplied URL, path, token, or command. Downloads require HTTPS and validate
every redirect against GitHub asset hosts with time/size bounds. Windows/signed
macOS also retain native updater checks. This feature belongs to the desktop IDE;
exported applications contain no Electron updater dependency.

References: [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater),
[Forge macOS signing](https://www.electronforge.io/guides/code-signing/code-signing-macos),
[Squirrel.Mac feed](https://github.com/Squirrel/Squirrel.Mac#update-file-json-format).
