# WebRAD delivery plan

This file tracks current implementation scope, unresolved work, and relevant
verification records. Detailed contracts belong in the [documentation index](docs/README.md).
Superseded per-edit notes and early milestone tables remain available in Git
history. Historical passing results do not certify the current checkout.

## GitHub Actions focus and Explorer corrections for 0de22b8: 2026-10-27

Inspected all six failed jobs on `0de22b8c834a18e4bdf536fe64ac8e264be36ef8`:
[validate 40521416402](https://github.com/Atentor/WebRad/actions/runs/40521416402)
and [release 40521416036](https://github.com/Atentor/WebRad/actions/runs/40521416036).
All six passed strict code checks, formatting, portable tests (1,725 passed,
41 optional skips per suite), and packaging. Security `40521416216` passed.
The macOS Intel job also completed: its packaged smoke reached the same Explorer
cleanup failure as Windows, Linux, and macOS ARM. Assembly and update smokes did
not run after the failure.

Implemented the two causes shared by those jobs:

- Development Preview is a separate renderer. Enabling its focus emulation after
  focusing the iframe made `document.hasFocus()` true while input `:focus` and
  `:focus-visible` stayed false. Transfer focus to the real Stop control, activate
  the child target, then transfer back to the iframe. Await the browser's focused
  frame at each transfer within one existing 10-second readiness budget, including
  the mobile pass. Retain all original focus, outline, geometry, blur, native input,
  isolation, and required-evidence assertions.
- All four packaged jobs passed desktop/mobile Menu focus, horizontal flyouts,
  and reusable Interaction before cleanup could not select `index`. Positional
  descendant `span:last-child` queries depend on icon markup and the `entry` badge.
  Expose stable model IDs and a dedicated direct name span in Explorer rows; use
  one shared lookup contract for Menu, page-title, resource duplication/deletion,
  and the return from Styles. Prefer known IDs and assert the selected row.

Reviewed subsequent API Client and Popup navigation and current compiler reuse
without finding another established defect. Original job logs, diagnostic
excerpts, and downloaded failure projects are retained under
`artifacts/github-actions-0de22b8-20261027/`.

Implementation remains local. No tests, validation checks, builds, packaging,
workflow reruns, commits, or pushes were requested or executed. Hosted results
above describe the original commit, not these edits; successful final-commit
Windows/Linux/macOS and quality/security verification remains required.

## GitHub Actions formatting correction for 6060e02: 2026-10-27

Inspected all six failed jobs for `6060e02352af3f2849af970cc3829816436cc2f5`:
[validate 40499384581](https://github.com/Atentor/WebRad/actions/runs/40499384581)
and [release 40499384267](https://github.com/Atentor/WebRad/actions/runs/40499384267).
Every job stopped on the same Prettier finding in
`packages/compiler/src/runtime-selection.ts`. Security `40499384381` passed.
Both quality jobs passed code checks and 1,725 tests with 41 optional skips before
formatting failed. The four release builds stopped at formatting before their
portable tests and packaging; no job reached the earlier Electron smoke failures.

Applied Prettier in write mode to that single source file, correcting only the
line wrapping of `previousAdapterSelection`. The edit command exited successfully;
no local validation check, test, build, packaging, or smoke was run. The source
change preserves behavior. Changes remain local without commit, push, or workflow
rerun. Hosted confirmation of formatting and the earlier smoke fixes is pending.
Diagnostic excerpts are retained in `artifacts/github-actions-6060e02-20261027/`.

## GitHub Actions follow-up for 1525042: 2026-10-27

Inspected all six failed jobs and retained their diagnostic archives for
`1525042fc4fe31221b6e4100d9f9fd2c1bfe1749`:
[validate 40494300442](https://github.com/Atentor/WebRad/actions/runs/40494300442)
and [release 40494300430](https://github.com/Atentor/WebRad/actions/runs/40494300430).
Code checks, portable tests (1,725 passed, 41 optional skips per suite), and
packaging passed; security `40494300395` passed. Windows, Linux, and macOS ARM
packaged smokes passed the previous desktop/mobile search focus assertions.

Implemented locally:

- Apply focus emulation to the exact Preview child target when it owns another
  renderer process, using an owned flattened debugger session. Development logs
  still showed an unfocused Preview after activating only the IDE target. Keep
  real focus/pseudo-class assertions and reset/detach surviving child sessions.
- Open Project Explorer before looking up project rows, selecting documents,
  dragging reusable placements, and cleanup. Design selects Builder and unmounts
  those rows; the three packaged jobs waited for a row in an unmounted Explorer.
  Return to Builder explicitly when selecting the internal Menu in its tree.
  Include Explorer rows and dialog fields in timeout diagnostics.
- Restrict implicit TypeScript globals to browser libraries instead of discovering
  the IDE/runner's ancestor `@types` packages. Preserve strict checking and explicit
  imports/declarations. Reuse exact-content runtime export metadata and one adapter
  transformation without caching programs or diagnostics.
- Split bundle progress into module loading, runtime selection, esbuild, and output.
  macOS Intel spent 10,949 ms in typecheck and remained in bundle for 15,086 ms
  before the first title smoke failed while Preview was still building. The log
  does not identify the exclusive bundle subphase; speed improvement requires
  hosted measurement. Preserve the 20-second assertion deadline and real F9.

Original archives, retained projects, logs, and diagnosis are under
`artifacts/github-actions-1525042-20261027/`. No local validation was requested or
executed during implementation. These changes were subsequently committed as
`6060e02`; the follow-up above records the formatting blocker. Hosted confirmation
of the smoke corrections and timing improvement remains pending.

## GitHub Actions corrections for ba9be66: 2026-10-27

Inspected all six failed jobs for `ba9be66b35b0f45beabfebed92b8dea4ad246012`:
[validate 40490523051](https://github.com/Atentor/WebRad/actions/runs/40490523051)
and [release 40490523032](https://github.com/Atentor/WebRad/actions/runs/40490523032).
Both complete quality jobs and all four platform builds passed their code checks,
portable tests (1,725 passed, 41 optional skips), and application packaging before
the Electron smokes failed. Security run `40490523125` passed. Release assembly,
installer generation, and subsequent update checks were skipped after the failure.

Implemented locally in the existing Menu smoke:

- Activate Chromium's page focus lifecycle through the owned CDP session while
  the workflow runs, then reset it during cleanup. In both development jobs the
  hidden offscreen document lacked focus despite its stored active input.
- Require no visible inner outline through `outline-style: none`, retaining the
  raw computed width as diagnostic evidence. All four packaged jobs had real
  focus and correct geometry but Chromium reported `3px` for the invisible outline.
- Preserve actual document/input focus and CSS pseudo-class assertions, the outer
  2 px ring and offset, inner offset/shadow checks, 0.5 px geometry tolerance,
  desktop/mobile interactions, blur cleanup, and existing deadlines/evidence.

All six original diagnostic archives, retained projects, and smoke logs are saved
under `artifacts/github-actions-ba9be66-20261027/`. No local validation was requested
or executed for this correction. These changes were subsequently committed as
`1525042`; follow-up hosted results and corrections are recorded above.

## Full test suite: 2026-10-27

Passed locally after the user's explicit request to run all tests:

- Ran the complete root `npm run test:portable` suite with Node 26.12.1,
  npm 12.2.1, Chrome enabled, linked temporary paths, the existing two-worker
  limit, and unchanged real event-loop scheduling.
- Result: **230 test files passed; 1,766 tests passed; zero failures, skips, or
  todo cases**. This includes 42 browser cases in 37 files and all 51 App
  integration cases. Vitest duration was 331.47 seconds; process exit code was 0.
- Snapshot: HEAD `d19ebaffd744008fecf18edd7cd886fd1162e0f8` with the pending
  documentation/cleanup edits. This is local Windows evidence for that working
  tree, not hosted certification of the commit or later changes.
- Report, raw log, machine-readable results, and execution metadata are retained
  under `artifacts/test-run-20261027-0724/`.
- No test or product source was changed. Electron application smokes, typecheck,
  lint, formatting/integrity checks, builds, packaging, and hosted platform
  verification were outside this test-suite run and were not executed.

## Documentation and cleanup: 2026-10-27

Implemented locally:

- Maintain repository documentation and examples in English, including README,
  contribution/security guidance, API Client, RestGo, uploads/media, reports,
  floating Panels, releases, and the Aurora example. Preserve real API identifiers.
- Remove third-party product comparisons from workspace descriptions and describe
  the current WebRAD interface directly.
- Add docs/README.md for navigation. Consolidate repeated SDK guidance, replace
  superseded delivery chronology with this plan, and move the one-time public
  history migration guidance into docs/releases.md.
- Remove 13 obsolete scratch helpers after tracking/reference inspection.
  Preserve third-party notices, project examples, recovery backups, diagnostic
  logs, screenshots, and existing release-failure evidence.
- The initial documentation task ran no validation. A later explicit request ran
  the complete test suite recorded above; other checks/builds were not included.

## Implemented product scope

| Area                  | Contract and documentation                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project ownership     | Versioned Project Model, stable IDs, transactional save, undo/redo, separate authored/generated files; [project format](docs/project-format.md).                           |
| Designer              | Registry-based components, shared selection/tree/Inspector, responsive geometry, insertion/reparent feedback; [architecture](docs/architecture.md).                        |
| Typed programming     | Real runtime classes, bare/this component references, lexical shadowing, isolated reusable placements, Monaco/compiled parity; [component model](docs/component-model.md). |
| Compilation           | Strict TypeScript, browser bundles, assets, styles, Preview, Web/PWA export; [compiler](docs/compiler.md).                                                                 |
| Routing               | Protected editable index/404 pages, `/index` and `/404`, History/Hash routing and host fallback; [routing](docs/browser-routing.md).                                       |
| Styling               | Aurora/Prism/Flat/WebRAD presets, Light/Dark/System, semantic/custom colors, saved choices and typography; [themes](docs/themes.md), [fonts](docs/fonts.md).               |
| Data/services         | Typed API Client, imported endpoint synchronization, RestGo auth/storage/video and IDE-only administration; [API Client](docs/api-client.md), [SDK](docs/restgo-sdk.md).   |
| Components            | Visual controls, containers, Menu, Icons, Data Grid, Repeating Group, Timer, uploads, Video Player, Report Builder; [component guides](docs/README.md#components).         |
| Examples              | Hello WebRAD and 13-page Aurora Workspace with local assets, shared reusables, nonvisual services, and real account flows; [Aurora](examples/aurora-workspace/README.md).  |
| Desktop distribution  | Electron sandbox, integrity, exact-SHA release gates, platform installers/updater; [releases](docs/releases.md).                                                           |
| Generated native apps | Tauri project/settings/tool inspection/build process/CI export; experimental pending real artifact/WebView certification; [Native Build](docs/native-build.md).            |

Implementation availability does not mean all later changes have passed the
required verification. The recent records below identify remaining evidence gaps.

## Recent implementation and verification gaps

### Menu search smoke diagnostics: 2026-10-27

Inspected all six failed jobs and downloaded all six diagnostic artifacts for
`d62b462`: release `40480883287`, validate `40480883364`. Hosted suites passed
1,725 tests with 41 optional skips per job, confirming the previous Designer/
formatting fixes. Complete Windows/Linux quality checks and all four platform
packages passed; security `40480883415` passed. Development smokes stopped at Menu
search focus. Packaged jobs stopped in the same desktop phase but lost the
originating exception, so their exclusive failed predicate remains unproven.

Local correction focuses the newly compiled iframe before desktop/mobile checks,
records focus/style/viewport/rectangles, and serializes message/stack inside the
frame before crossing Electron. Non-Error values retain diagnostic detail. Both
runners require focused-iframe evidence. All outline/margin/geometry assertions,
0.5 px tolerance, and existing deadlines remain intact. Hosted confirmation of
this correction and later smoke stages remains pending. No local validation,
commit, push, or rerun accompanied this correction.

### Designer drag compatibility: 2026-10-27

Commit `6cc0253` failed the same four Designer drag cases in validate `40439807910`;
all release platforms in `40439807928` stopped at DesignerSurface formatting.
Security `40439807867` passed. The local fix gates cross-container target resolution
on the optional onReparentComponents callback so hosts without structural editing
retain ordinary movement constraints. The affected source was formatted. No local
validation was requested. The later d62b462 hosted suites confirmed those fixes,
while the Menu smoke failures above still blocked release.

### Preview and release-review corrections: 2026-10-26

Implemented exclusive Preview from compilation through execution, with a compact
bar showing only the page path and a visible red Stop action. The authoring shell
stays mounted with stable geometry but is hidden/inert. Stop restores workspace/
focus, ignores late results, and remains available during compilation/errors.
Native IDE commands and F12 cannot return to editing. Native menus are hidden
through a trusted-main-frame boolean preload capability and restored after Stop,
renderer startup, or crash. Debugging retains its separate lifecycle.

F9 now accepts clean Save normalization in the same project context, captures
revision after Save, and preserves invalidation for edits/project replacement/Stop.
Reusable Menu event relaying is private in menu-events.ts, avoiding an accidental
public export absent from Monaco. Tag preflight/publication now enforce latest
eligible exact-SHA validate/security results in addition to four-platform release
verification. Runtime sources and existing fixtures were updated. See the
[historical review](docs/release-review-2026-10-26.md).

Requested Windows validation on 2026-10-26 completed 230 files/1,766 tests:
**1,764 passed, 2 failed, zero skips**. Failures were a dark/50% Panel drop insertion
and a reusable insertion callback expectation missing the before-component argument.
Nine of 13 Electron variants passed; development/packaged standard and resources
failed Stop restoration. The composite predicate did not isolate the cause.
Typecheck found two unknown x/y spread errors in preview-workspace-smoke.ts;
formatting found six files. Icons, embedded sources, lint, and Windows packaging
passed. All 51 App integration tests and release/publication suites passed.
Evidence: `artifacts/test-run-2026-10-26-full/REPORT.md`, machine-readable results,
and four retained diagnostic projects/logs. No installer/publication was produced.
Do not treat this failed historical run as current checkout approval.

### Designer insertion and reparenting: 2026-10-26

Implemented destination outlines, dashed component footprints, row/column insertion
lines, and nonvisual tray feedback using shared creation geometry and undoable
commands. The final accent is amber-yellow `#fbbf24`; transient feedback clears on
cancel/drop/context changes. Removed the floating coordinates card and native drag
thumbnail. Reparenting chooses the deepest compatible container, preserves absolute
position, rejects cycles, and records parent/child order through history. Existing
smoke interactions/evidence were updated; implementation alone ran no validation.

### Menu runtime and themes: 2026-10-25/26

Implemented theme-aware defaults and live Light/Dark switching, preserving explicit
saved choices. New menus show the accessible icon action opposite the brand;
legacy missing settings retain their previous disabled fallback. The runtime keeps
SVG sizing/collapse rules even when no standalone Icons component is used.

Reusable Menu placements expose nine typed Interaction events with concrete
placement senders and original detail types, preserving internal-before-placement
ordering, synchronous cancellation, isolation, and disposal. Event-only search
submits on Enter, including unchanged/empty text; typing/clearing updates searchText
without submission/filtering. Composition/repeating Enter is suppressed. Filter mode
remains live. Search focus draws a full-field outer ring without an inner outline.
Existing runtime sources, documentation, and smoke expectations were synchronized;
subsequent hosted focus evidence remains pending as described above.

### Themes, source compilation, and persistence: 2026-10-25

Implemented project Light/Dark semantic and custom colors, initial Light/Dark/System,
optional remembered choice, theme-aware Designer/Styles previews, sparse style
overrides, and browser-only WebTheme/Theme. Unified colors under Styles → Themes;
legacy palette IDs survive as aliases, references remain stable on rename/reorder,
and in-use adaptive colors cannot be removed. Saved custom styles/fonts and prior
choices remain project-owned. All presets retain Roboto/base typography across
Light/Dark unless explicitly overridden.

For f41d4fc (`40195347739`/`40195347759`), local corrections release the compiler's
previous Program capture, wait for real Panel scroll layout, and retry only bounded
Windows sharing errors during atomic Save while retaining rollback. Existing
heap, worker, geometry, and deadline limits remain unchanged. Original diagnostics:
`artifacts/ci-40195347739/`. No local validation accompanied those corrections.

A separate explicitly requested 2026-10-25 Windows review passed all 1,766 portable
tests with Chrome/zero skips, final typecheck/lint/generated-source checks,
packaging, and development/packaged/updater smokes. An initial formatting stop
was fixed and checked separately; no single later complete validate run was claimed.
Evidence: `artifacts/release-readiness-2026-10-25/`. This predates subsequent edits
and does not replace exact-SHA hosted verification.

### Aurora Workspace and project workflow: 2026-10-24/25

The 13-page example now uses shared AuroraMenu and FeatureCard reusables, all 25
registered component types, Default styles, local JSON/media, nonvisual API/Timer/
upload/report examples, and real RestGo registration/login/recovery/profile/session
flows. Passwords/tokens are not displayed or persisted in page models. The account
SDK edits avatars only; general profile fields remain read-only. Mandatory index/
404 pages, typed page identity, routes, chooser, shared sidebar, progress formats,
Roboto defaults, and current palette controls are documented in their guides.

Project Explorer supports search, collapse, duplicate, and confirmed deletion;
Help → Documentation opens the fixed external guide URL. Authored TypeScript
migrations/duplication use AST edits with stable IDs and protected generated files.
Materialized example repair backups and diagnostic evidence were retained. Many
individual changes were delivered without validation; use the dated execution
records above rather than assuming every implementation note is a passing check.

## Remaining work

- Verify the final corrected commit through validate, security, all four release
  platforms, assemble, and required Electron/updater evidence before tagging.
  Inspect original failures rather than merely rerunning jobs.
- Keep unresolved historical failures visible until matching final-code evidence
  demonstrates correction. The current documentation task does not resolve them.
- Obtain real Tauri artifacts and execution on representative desktop/mobile
  WebViews, with RestGo/CORS/CSP, signing, installation, and store-flow evidence.
  Prerequisite checks, generation fixtures, and Electron smokes cannot certify them.
- Configure macOS Developer ID/notarization for native automatic IDE updates;
  unsigned builds retain manual replacement.
- Continue onboarding/user evaluation and realistic application feedback. Recovery
  drafts and new native capabilities remain future work unless explicitly scoped.
- Maintain remote branch/security settings and third-party redistribution notices;
  versioned workflows alone do not configure GitHub protections.

## Persistent engineering decisions

- Project Model format v2 owns state, responsive rules, styles, references, and
  stable IDs. React/DOM are projections. Ephemeral selection, viewport, searches,
  and panel state do not become an alternate project store.
- Designer interactions remain in packages/designer. Browser runtime is independent
  of Designer, Electron, and Node. Registry metadata owns component-specific
  behavior, events, capabilities, Inspector presentation, and style dependencies.
- Every visual/nonvisual component has a concrete typed runtime class. Public API,
  Monaco declarations, generated sources, and compiler instances stay aligned.
  Bare and this-qualified access retain lexical shadowing and reusable isolation.
- Authored TypeScript stays separate from generated files. Source edits use the
  TypeScript AST; malformed/unowned files are not overwritten. Saves serialize
  per root, write atomically, retain rollback/trash, and commit the manifest last.
- Browser API Client traffic respects CORS and authentication; arbitrary requests
  are not proxied through Electron. Administrative/development credentials stay
  main-process-local and use OS encryption only when secure storage is available.
- Renderer sandboxing, context isolation, narrow validated preload IPC, strict
  TypeScript, generated-source/icon checks, integrity, and release permissions
  remain mandatory. Runtime source regeneration is implementation work; validation
  execution still requires explicit user request.
- TypeScript 7 is the strict CLI toolchain; TypeScript 6 remains the embedded JS
  compiler/AST/Monaco API. Use root npm workspace scripts and portable Node paths.
  Keep two workers and real event-loop turns; do not conceal failures with limits.
- Official releases require new stable lowercase tags on the approved exact SHA.
  Local release aliases make and creates WebRAD-Dev Setup.exe without publishing.
  Commits, pushes, tags, version changes, installers, and publication require
  their respective authorization.
- Remove files only after tracking/reference inspection. Keep supported features,
  licenses, useful diagnostics, and recovery material. Write maintained guides and
  documentation examples in English.
