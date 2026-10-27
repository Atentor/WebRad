# Release checklist for agents and maintainers

A release is ready only when its exact tagged commit passes the real distribution
workflow on all four platforms. Local checks do not replace that evidence. This
checklist complements [AGENTS.md](../AGENTS.md) and the [release guide](releases.md).

## Agent execution policy

Run local tests/validation only when the user explicitly requests them. Ordinary
implementation, fixes, or documentation do not authorize tests, smokes, validate,
typecheck, lint, formatting checks, builds, or packaging. Do not routinely ask to
run them; deliver the edits and state that validation was not requested. Keep
requested validation within scope. Full release-candidate commands below require
an explicit full-validation request. CI gates and evidence requirements remain
mandatory before claiming release readiness or publishing.

## When changing code or UI

1. Preserve the requested product contract. Changes to controls, labels,
   navigation, shortcuts, or layout require reviewing `apps/ide/main/*smoke*.ts`,
   main.ts smoke interactions, and required evidence in both
   `scripts/smoke-development.mjs` and `scripts/smoke-packaged.mjs`.
2. Update existing smoke interactions for current behavior. Verify intentionally
   removed controls are absent and supported features still work. Do not restore
   obsolete UI merely to satisfy an outdated test.
3. Runtime/embedded-source changes require `npm run runtime:sources` and the
   corresponding generated files. Keep strict types, Electron isolation, and
   integrity checks intact.
4. When full release-candidate validation is explicitly requested, run on the
   final checkout (use `npm.cmd` on PowerShell):

```sh
npm run validate
npm run smoke:development
npm run smoke:packaged
npm run smoke:packaged -- --webrad-smoke-updates
```

Validate includes icons, generated sources, strict TypeScript, lint, portable
linked-temp tests, formatting, and host packaging. Electron smokes are separate.
Keep at most two test workers in `vitest.config.ts`, without CLI/workflow overrides.
Passing assertions with worker RPC errors or unexecuted groups still fail.

Preserve real event-loop turns in `tests/setup/worker-event-loop.ts`. Synchronous
TypeScript suites must service pending worker messages between cases. Resolved
Promises/fake timers do not provide that boundary; longer transport deadlines
are not a fix. Keep isolated profiles/projects. On failure inspect the original
error and `artifacts/smoke/` raw log, metadata, and retained project. Do not rerun
until green without investigating the previous failure.

## Hidden smoke-window rendering

Keep offscreen rendering for hidden development/packaged smoke windows.
`backgroundThrottling: false` alone does not guarantee normal animation frames.
Commit `8080ca5` reproduced about one second per frame despite native input taking
only tens of milliseconds. Preserve real native input, rendered cursor/character
geometry, exact code restoration, captures, and renderer health checks. Cursor
evidence separates total/input/frame time and maximum frame wait.

Historical Windows evidence from 2026-10-22: complete development smoke took
about 35 seconds within the unchanged 120-second budget; 24 cursor samples fell
from about 32 to 2.6 seconds with 1.5 px tolerance and an 18 ms maximum frame wait.
Validate passed 1,673 tests with 38 optional skips; packaged/updater smokes passed.
This does not certify a later commit or Linux/macOS.

## Before creating a tag

1. With authorization, push the commit to main or `codex/verify-release-*`, or
   open a PR. Release verification performs all four builds, smokes, installers,
   and assembly without publishing. Manual dispatch can verify an existing branch.
2. Wait for all four builds and assemble, with publish skipped. Check validate
   and security too, recording the exact SHA and run links.
3. The verification authorizing a tag must be an eligible branch push/manual run
   on the **same SHA**. A PR's temporary merge commit does not certify the final
   commit. Merge, rebase, or edits require verification of the resulting SHA.
4. Only with publication authorization, create and explicitly push a new stable
   lowercase `vMAJOR.MINOR.PATCH` tag at the approved commit. Never move a tag.
   Rerunning an old tag rebuilds old code.

Preflight checks main ancestry, exact-SHA nonpublishing release verification,
and the latest eligible successful validate/security runs. Scheduled main security
scans count. Pending/cancelled/failed latest runs block, even with older success.
Tag/PR runs do not replace branch/manual gates. Publication repeats all three
checks. Nonpublishing verification stays independent. Keep this protection intact.

Retain these known readiness constraints:

- After synchronous main-process compilation, smoke polling must reread current
  renderer state before deciding the deadline expired. A stale pre-build false
  sample does not prove absent Preview. Before one F9, await Saved, enabled Run,
  and no dialog; record compiler, Preview, Save, and dialog state on timeout.
- Native prerequisite probes set `RUSTUP_AUTO_INSTALL=0`, preserve the real isolated
  Rustup regression and command/duration logs, and never download during inspection.
  Keep the shared 10-second budget and 5-second process cap, descendant cancellation,
  and distinct timed-out/skipped diagnostics. Missing-tool fixtures also isolate
  Visual Studio/Windows SDK paths from installed runner tools.
- Monaco restore must paint after `restoreViewState`, including font-deferred
  restore. Assert rendered first line/cursor immediately and after frames; the
  regression must not supply the missing paint itself. React remount readiness
  waits for real geometry within the same 15 seconds, rather than logical state
  or two arbitrary frames. Retain `renderer Monaco workspace restored view:`.
- Long-line insert/remove history must preserve scroll height across Design/Code.
  Cached horizontal width must not change vertical geometry. Retain three-width
  Chromium coverage for cursor, first line, and scrolling.

Related historical incidents: `39987745678` (`be52986`, macOS Intel first title F9),
`39947116378`/`39947116404` (`cf26fa9`, Windows prerequisite stall), and
`39923680356` (`v0.0.12`, restored logical cursor with unpainted viewport).
These identify past observations rather than current verification.

## Investigating failures

Read the first failed step, original functional error, and retained project/logs.
Missing later evidence usually means those interactions never ran. Distinguish
functional defects, stale selectors, async races, native window limits, missing
tools, and external network failures. Correct the observed cause without hiding
it through retries, workers, looser tolerances, or longer deadlines. Add meaningful
regression coverage when requested; update existing expectations when necessary.
After correction, verify the final commit on all required platforms. Local Windows
results do not prove Linux/macOS, publication, installed updates, or native WebViews.

### Native report collection follow-up: 7067bd3 (2026-10-27)

[Release 40545084526](https://github.com/Atentor/WebRad/actions/runs/40545084526)
passed three platforms; Intel again stopped during Menu F9. Quality/security
passed. The process snapshot showed runnable Electron (63.9% CPU, about 1.5 GiB
RSS) and sleeping esbuild (0% CPU, about 51 MiB RSS), but sample subprocesses
expired before writing their reports. Retain `-mayDie` and the bounded report
finalization allowance; neither changes the one-second sampling duration or any
smoke/build deadline. Intel's automated Menu workflow also writes a local V8 CPU
profile in finally. Preserve it with `native-diagnostics/`, including on failure;
profile errors must not replace the original exception or expose a debug port.

### Failed native workaround and independent stack sampling: 47ccce0 (2026-10-27)

[Release 40538022322](https://github.com/Atentor/WebRad/actions/runs/40538022322)
again failed only on Intel, despite the single-P workaround. Quality/security and
the other three platform builds passed. This time the initial Menu F9 stopped
before reusable Interaction. Earlier native-build brackets also included
6,623 ms of main-process CPU and a large JS heap collection. Do not treat the
previous Go hypothesis as a confirmed root cause; the ineffective restriction
has been removed.

On macOS the parent runner captures native stacks after a bundle phase remains
active for three seconds. Only the owned Electron/native child tree is inspected;
process arguments and unrelated processes are excluded. Keep `native-diagnostics/`
with the original log and retained project. Each `ps`/`sample` subprocess has its
own bounded timeout, and capture errors preserve the original functional result.
An already-started capture completes before artifact preservation. Build/smoke
deadlines and required behavioral evidence remain unchanged. No local validation
was requested or run; a native diagnostic execution is needed before claiming
that this recurring stall is repaired.

### Native scheduler/GC workaround: 41b6f2a (2026-10-27)

[Release verification 40532063982](https://github.com/Atentor/WebRad/actions/runs/40532063982)
again passed Windows, Linux, and macOS ARM64; quality and security passed.
Intel job `122287405778` stalled at reusable Menu F9 with the power assertion
active. Typecheck took 2,447 ms and runtime preparation 55 ms; native bundling
remained pending for at least 11,102 ms. Saved/disabled Run and the still-building
Preview rule out an unsubmitted F9; the artifact has no native stack identifying
the exclusive cause.

The official esbuild 0.28.2 Darwin x64 executable embeds Go 1.26.5. Its blocking
pipe service is compatible with the known [Go 1.26 scheduler/GC regression](https://github.com/golang/go/issues/81759).
The compiler temporarily sets `GOMAXPROCS=1` around the synchronous API call
that spawns this service, restoring the host environment before awaiting. Keep
this limited to Darwin x64, preserve the pinned dependency and security fixes,
and do not change test workers, deadlines, strict diagnostics, or required smoke
evidence. This is an upstream-informed workaround, not a substitute for native
confirmation. Remove it after an official fixed esbuild toolchain passes on the
final Intel commit. No local validation was requested or run for this change.

### Hidden macOS native work and bundle attribution: e1c5294 (2026-10-27)

[Validate 40526361466](https://github.com/Atentor/WebRad/actions/runs/40526361466)
and [security 40526361348](https://github.com/Atentor/WebRad/actions/runs/40526361348)
passed. [Release verification 40526361351](https://github.com/Atentor/WebRad/actions/runs/40526361351)
passed Windows x64, Linux x64, and macOS ARM64. macOS Intel passed its code/tests,
packaging, Menu focus and horizontal flyouts, then stalled during reusable F9:
typecheck 3,538 ms, module loading 1 ms, selection 37 ms, followed by at least
22,535 ms in `bundle-build` with Preview still building. The log does not isolate
the native service, OS scheduling, or main-thread work/GC as the exclusive cause.

Keep a scoped `prevent-app-suspension` assertion for automated hidden macOS smoke
work, releasing it on success, functional failure, startup failure, and quit.
Keep normal IDE power behavior and renderer offscreen settings. macOS considers
background apps without power assertions eligible for App Nap, which reduces
CPU priority and timer/I/O activity; see [Apple's App Nap guidance](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/AppNap.html)
and the [Chromium macOS power assertion implementation](https://raw.githubusercontent.com/chromium/chromium/main/services/device/wake_lock/power_save_blocker/power_save_blocker_mac.cc).
This is prevention of a known mechanism, not proof that App Nap caused this run.

Prepare adapter selection before native bundle callbacks. Phase diagnostics
include main-process CPU, heap, and RSS only when logging is enabled; Menu timeout
evidence also includes Save, Run-disabled, and the iframe URL. Preserve all real
interactions, focus/geometry assertions, deadlines, and final-commit platform gates.
No local validation was requested or executed; hosted Intel confirmation remains
pending for these source changes.

### Preview focus transfer and Explorer identity: 0de22b8 (2026-10-27)

Runs [40521416402](https://github.com/Atentor/WebRad/actions/runs/40521416402)
(validate) and [40521416036](https://github.com/Atentor/WebRad/actions/runs/40521416036)
(release) passed code checks, portable tests, formatting, and packaging. Security
passed. Both development smokes then recorded `documentFocused: true` and
`inputActive: true`, but `inputFocused: false` and `inputFocusVisible: false` in
the separate Preview renderer. All four packaged smokes passed those assertions,
horizontal flyouts, and reusable Interaction, then failed selecting `index` during
cleanup; the actual Explorer contained the selected entry page.

For a cross-process Preview, activate the child focus emulation before transferring
focus into the iframe. First focus the real Stop control to leave any existing
child focus, then activate the child session, focus the iframe, and observe the
browser's focused frame. Repeat before mobile checks. Preserve the 10-second
readiness budget, hidden/offscreen window, all real focus pseudo-classes, outline
and geometry assertions, native input, cleanup, and required evidence. The relevant
[Chromium focus controller](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/page/focus_controller.cc)
updates emulated page focus separately from the local frame selection; a fresh
frame transfer synchronizes both states.

Select Explorer resources through their model IDs (`data-project-resource-id`),
or their direct `.wr-explorer-name` when discovering a newly created document.
Do not infer resource names from arbitrary descendant spans or aggregate row
text: icons and entry badges also contribute descendants/text. Keep the helper
shared by Menu cleanup, page-title navigation, resource operations, and return
from Styles; await mounted rows and assert the selected resource.

These are local source corrections. No local validation was requested or run;
final-commit hosted confirmation on all required platforms remains pending.

### Preview child focus, Explorer navigation, and compilation: 1525042 (2026-10-27)

Runs [40494300442](https://github.com/Atentor/WebRad/actions/runs/40494300442)
(validate) and [40494300430](https://github.com/Atentor/WebRad/actions/runs/40494300430)
(release) passed code checks, portable tests, and packaging; security passed.
Windows, Linux, and macOS ARM packaged smokes confirmed desktop/mobile Menu focus
and the corrected invisible-outline assertion. Their next timeout waited for
`MenuInteractionSmoke` in an unmounted Project Explorer. Design selects Builder;
open the actual Project Explorer control before querying rows, selecting project
documents, dragging reusable definitions, or cleanup. Return to Builder for
component-tree selection. Preserve dialog dismissal/selection assertions and
record Explorer rows and dialog fields on timeout.

Development still recorded an unfocused Preview. When it owns another renderer
process, activate its exact iframe debugger target through an owned flattened
session as well as the IDE target. Chromium focus emulation is page-local. Keep
real document/input focus, pseudo-classes, native input, isolation, geometry,
deadlines, and required evidence; reset/detach surviving child sessions in cleanup.

macOS Intel stopped before Menu: first title F9 spent 10,949 ms in typecheck and
remained in bundle for 15,086 ms before failure, with Saved, disabled Run, and
Preview still building. Preserve the 20-second assertion budget. Browser compilation
must not implicitly discover unrelated ancestor `@types` packages. Reuse only
exact-content runtime metadata/adapter transforms, recalculate strict diagnostics,
and retain bundle-load/selection/build/output stage logs to distinguish the slow
subphase. These are source corrections; timing improvement and complete smoke
success require new hosted evidence. No local validation was requested or run.

### Menu focus lifecycle and outline measurement: ba9be66 (2026-10-27)

Runs [40490523051](https://github.com/Atentor/WebRad/actions/runs/40490523051)
(validate) and [40490523032](https://github.com/Atentor/WebRad/actions/runs/40490523032)
(release) passed code checks, portable tests, and packaging before all six Electron
smokes failed at the first compiled Menu search assertion. Security passed.
Development logs show `documentFocused: false` and an active input that does not
match `:focus` or `:focus-visible`; focusing webContents/the iframe alone did not
activate the hidden document. Packaged logs show real focus, the correct outer
2 px ring/offset, and unchanged geometry, but an inner computed width of `3px`
with `outline-style: none` and no shadow. That width draws no inner outline.

The Menu workflow enables `Emulation.setFocusEmulationEnabled` through its owned
debugger session and resets it in cleanup alongside viewport overrides. Keep the
window hidden/offscreen, real input and pseudo-class checks, desktop/mobile
interactions, and existing deadlines. Require no visible inner outline using
its style rather than requiring a zero raw width; retain the raw measurements
in failure evidence. Preserve offset/shadow checks, the 0.5 px geometry tolerance,
blur cleanup, and both runners' required focused-iframe evidence. No runtime CSS
change is needed. Local validation was not requested. The 1525042 follow-up above
records which hosted assertions passed and the remaining failures.

### Menu search focus diagnostics: d62b462 (2026-10-27)

Runs `40480883364` (validate) and `40480883287` (release) passed the previous
Designer/formatting fixes: 1,725 tests and 41 optional skips per hosted suite,
complete Windows/Linux quality checks, and four-platform packaging. Both development
smokes failed Menu search focus. Packaged smokes stopped in the same desktop phase
without preserving the original exception; their exclusive failed predicate is
unproven.

Focus webContents in the newly compiled iframe before checking `:focus-visible`
and `:focus-within`, as in Icons smoke. A stored activeElement is insufficient.
Record document/pseudoclass focus, inner/outer outlines, viewport, and before/after
rectangles. Preserve the 2 px outer ring, zero inner outline, 0.5 px tolerance,
and blur cleanup. Both runners require
`renderer Menu search focus passed: focused Preview iframe,`.
Serialize error message/stack inside the frame before crossing Electron, including
non-Error thrown values. Hosted confirmation of the local correction remains
pending; do not change CSS merely to accommodate an unfocused smoke.

### Theme and Styles fixtures: 07398e9 (2026-10-25)

Menu preview resets by keyed theme identity, without synchronous setState in an
effect. New defaults require semantic theme references while old saved styles stay
intact. Legacy HelloWebRad lacks some field styles: create temporary Edit/Text
Area/Combo Box/List Box samples through real UI when needed and remove afterward.
Select Roboto explicitly for the typography sample; unconfigured button fonts
also inherit Roboto. Bind the default Popup style before testing an open Popup's
live theme changes, preserving identity, state, and geometry assertions.

Theme initialization precedes the Preview bundle. Source-map tests locate scripts
by sourceURL and compare their complete contents. Removed-component CSS checks
match class selectors separately from global variables such as
`--wr-data-grid-header-background-color`.

### Compiler memory, scrolling, and atomic Save: f41d4fc

Run `40195347739` exhausted both macOS workers' 2 GB heaps in compiler tests.
CompilerHost retained the previous Program and chained every compilation. Clear
that reference in finally after createProgram and release incompatible graphs,
retaining strict checks and syntax-tree reuse. Do not increase heaps/workers/timeouts.

Run `40195347759` sampled Linux Panel geometry before scroll extent/layout settled
(`scroll: 0`, `delta: -62`). Prepare overflow, await load/fonts/layout, establish
baseline, and issue one native scroll. Preserve exact 120 px assertions and the
shared 15-second budget; restore content/position in finally. Windows EPERM on
atomic index.ts replacement requires bounded sharing-error backoff, preserving
old files, rollback, and persistent/unrelated error propagation.

### Slow Preview compilation: 2b2897e

In `40121913310`, macOS Intel recorded Saved, disabled Run, and Build started at
the first title F9 timeout: compilation was still active. This differs from stale
polling after completion. Preserve 20 seconds and inspect `[COMPILER] Preview`
stage durations: save, validation, selection, styles, generation, typecheck, bundle,
assets, output, publication. Reuse only unchanged syntax trees from a compatible
Program and recalculate strict diagnostics. The original log did not identify the
slow stage; optimization requires runner evidence before claiming measured gains.

### Responsive geometry and Monaco setup: 3c3d1b1 / 8d95388

Runs `40119219411`/`40119219511` showed that Default uses available canvas width
and can be mobile. Calculate responsive state from actual simulated width; also
check Tablet 768 px and Mobile 390 px, restoring Default. Preserve visual/hitbox
geometry and 48 px mobile height.

Run `40120762152` then showed compiled iframe width is independent of the Designer
preset. Use 1920×1080 IDE metrics for desktop and 390×844 for mobile; inspect actual
iframe width/state, require `renderer Menu compiled viewports passed:`, and restore
metrics in finally. Finding a frame does not establish readiness.

Linux development run `40120762132` rendered only neutral mtk1 tokens. Register the
official TypeScript/Monarch grammar before creating models; only semantic services
load asynchronously. Retain token-class/color/keyword checks. Its macOS Intel
Icons timeout lacked compiler diagnostics; use fresh renderer polling and record
state without claiming a proven exclusive cause from that log.

Security run `40119219393` flagged an Aurora Project Model UUID in four apiClientId
bindings. `.gitleaks.toml` extends all default rules and allows only that exact
UUID/property/path combination, including history. Keep full scans, redaction,
and detailed diagnostics; do not exclude directories, commits, or real secrets.

### Prerequisite budget: b6e1ba4

Run `39963098127` timed out Windows smoke's 15-second readiness while a rustc
version query could consume 20 seconds. Keep the shared inspection budget instead
of changing smoke deadlines or marking timed-out tools available. The real
unresponsive-process regression failed originally after 20.1 seconds and passed
in about 5 seconds after correction. Historical Windows validation passed 1,697
tests with 39 optional skips and development/packaged/updater smokes; hosted
confirmation still required the corrected commit.

## Earlier regression lessons

- `v0.0.7`: smokes still expected removed Zoom/Arrange controls. Require one active
  document tab, absence of those controls, and default Designer scale while
  retaining navigation, selection, responsiveness, Monaco, and F9.
- `39356337911` (`v0.0.9` attempt): Monaco DOM existence did not prove native input
  readiness. Await the expected handler, focused input, and body cursor before
  typing. macOS runner-deadline fixtures must signal readiness through IPC after
  logging/installing signal handlers; preserve the production 240-second deadline.
- `39404320016`/`39404320095` (`b628fcb`): readiness must accept both textarea.inputarea
  and native-edit-context. Real Monaco Chromium coverage checks both input modes,
  native insertion, and handler AST, alongside mocked fixture expectations.
- Windows esbuild EBUSY: load esbuild before mocking cwd, reuse one service per
  suite, and prove the temporary directory removable while it is active. stop()
  alone does not await native resource release. Historical follow-up passed 1,554
  tests and development smoke locally; it did not certify other platforms/releases.

Detailed historical findings and failed local verification are retained in the
[2026-10-26 release review](release-review-2026-10-26.md). Older delivery chronology
remains in Git history; none of these records certifies the current checkout.
