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
change is needed. Local validation was not requested; hosted confirmation of the
correction and later smoke stages remains pending.

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
