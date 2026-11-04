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

Both runners require `renderer API Client authorization passed:`,
`renderer API Client response refresh passed:` and
`renderer API Client compiled authorization passed:`. The existing API Client
workflow configures client-level Basic Auth through the Authorization tab,
inherits it for a request, compares the real HTTP header, saves/reopens masked
credentials and changes endpoint to require removal of previous response fields.
The compiled browser flow uses a saved Basic Auth client and its typed request
instance against the HTTP fixture, alongside all existing RestGo assertions.
These interactions have not been executed for the 2026-11-04 changes.

Both runners require `renderer Edit mask Inspector and F9 passed:`. The shared
real IDE interaction inserts Edit, checks opt-in Inspector defaults, saves a
pattern with an optional group and a custom uppercase hexadecimal token, and
compares Designer/compiled text. Native Chromium input must format before input
handlers observe it; Backspace after a separator must delete the preceding
editable character and retain the caret. Preserve input/change delivery, saved
model checks, Undo cleanup and fatal renderer-error handling. This interaction
has not been executed for the Edit mask change.

Both runners require `renderer Date Inspector and F9 passed:` and
`renderer Date popup field alignment passed:`. The shared real IDE interaction
inserts Date, reviews date-only defaults, changes to datetime, positions it with
room for field alignment and saves the canonical value. It compares Designer/F9
field paint and unclipped input/icon geometry, opens the actual calendar through
native Space activation, and measures the open popup's left/right edges and width
against the complete date field with a 260px popup-only minimum (1.5 px
tolerance). Narrow fields retain their own width while the popup starts at the
same left edge. Evidence also requires placement below it, viewport containment and lack of
internal clipping. It selects a day and applies it while preserving time, then
checks native text typing, masking, Input/Change delivery, impossible-date
rejection and Undo of four model commands. An anchor direction flag is not
popup-alignment evidence. Preserve the stable ID, existing deadlines and fatal
renderer error handling. These interactions have not been executed for this change.

Default style typography evidence must retain centered Button icon/caption
content, Roboto 15px/20px normal text (400), 22px icons, and 8px corners in all four
theme presets and both project templates. The existing Designer/Preview button
parity flow also compares vertical alignment, typography and spacing. Both
runners require the updated template-chooser and button-parity evidence strings.
The bundled examples carry these saved defaults; existing user projects keep
their authored typography. These smoke definitions have not been executed as
part of the 2026-11-02 polish.

Project Settings draft-protection evidence must include the discard confirmation
with both actions inset from its edges, buttons at least 34 px tall, no horizontal
overflow, initial focus on Keep editing, and working Escape/discard behavior.
Both runners exercise this through the shared native-build smoke and retain
`renderer Project Settings draft protection and validation navigation passed`.

Packages / NPM has a scoped real Electron flow in both development and packaged
runners: pass `--webrad-smoke-packages` to the existing root smoke script.
It requires real public registry access and external Node.js 20+/NPM 10+ on PATH.
The flow installs into an isolated temporary project, retains actual NPM logs,
and exercises the Project menu, dialog geometry, Explorer direct dependencies,
Monaco completion/hover/strict diagnostics, Unit-to-Page F9 execution, Debug Unit
breakpoints and value evaluation, static Web/PWA output without Node APIs,
reopening, lockfile restoration, update, removal and unresolved imports.
Required evidence prefixes are `renderer Packages dialog passed`,
`renderer Packages empty layout passed` (framed installed/registry panels,
manual installation and useful empty-state guidance),
`renderer Packages notebook layout passed` (1366x768 and 1280x720, a dialog
bounded to 940x600 px or the available viewport, visible header/footer actions
and independently scrolling lists),
`renderer Packages install and Explorer passed`, `renderer Packages native menu passed`,
`renderer Packages presented screenshots passed:` (desktop, both notebook sizes,
720px layout and native Monaco menu captured from actual marker-free frames),
`renderer Packages Monaco passed`,
`renderer Packages Preview passed`, `renderer Packages Debug passed`,
`renderer Packages Web PWA passed` and `renderer Packages lifecycle passed`.
Keep uncaught renderer errors fatal. This scoped flow does not certify native
Tauri execution on other platforms or replace exact-commit release gates.

The Login workflow requires `renderer Login configuration and F9 passed: compact editor; Aurora appearance; compact template; project styles; mobile fields at least 16px type and 44px height;`
in both Electron runners, covering the bounded 1040 by 620 px configurator,
compact header/close control, two-column settings, visible footer and scaled
editor-only preview occupying half the desktop body without horizontal overflow,
plus project Style/None selectors for each internal element, compatible type
filtering, persisted IDs and the same bindings in Designer/configurator/F9,
Aurora surface/input/button gradients and shadows,
preview/runtime form-spacing parity, palette/configuration persistence, Panel, native modal
Popup and mobile field geometry. The default desktop form uses 14 px type,
36 px fields, 20 px panel padding on all sides in desktop/mobile, 8 px field gaps
and a shared remember/password-options row; the
registration card with the default bound label styles fits within 500 px. Mobile inputs retain at least 44 px touch
height and 16 px type. `renderer Login authentication passed:` exercises
the compiled typed template against the existing RestGo HTTP fixture, including
registration without automatic authentication, mismatch/error feedback, login,
the shared session and password clearing. Keep the fixture boundary explicit;
these records do not establish a live RestGo deployment's behavior. The workflow
must be executed under an explicit validation request before claiming it passed.

`renderer Login recovery passed:` is also required by both runners. The existing
RestGo HTTP fixture exercises the real recovery forms, anonymous request/confirm
calls, preserved route/placement, URL cleanup before authored construction,
expired/reused links, matching-password validation, the typed completion event,
no automatic session and login with the changed password. The Login UI workflow
also saves recovery settings and previews both recovery forms, including Popup
navigation. SMTP delivery and a live RestGo deployment require separate evidence.

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

### Project resources native selection: 2026-11-03

Both resources runners require focused native Monaco input and observed Select
All before replacing Model/Unit text, followed by exact saved-file comparisons.
Inline rename must observe native selection and the requested draft before Apply,
reject an occupied name and retain the renamed page ID. Keep all existing import,
F9, keyboard/search, duplication, deletion and persistence evidence and deadlines.

Hidden/offscreen Resources windows use the same Chromium focus emulation as the
Packages/Menu workflows, restored in `finally`. DOM `activeElement` alone does
not establish an active page focus controller. Diagnostics retain actual page
focus, selection length/cursor, rename draft/error and resource-row identities.
The original packaged failure retained the inserted Unit followed by `export {};`;
it proves a content mismatch rather than an absent disk write. The original
development failure timed out on the renamed row. A focused diagnostic run then
recorded `document.hasFocus() === false` despite an active Monaco input. The
corrected development and rebuilt packaged resources workflows passed locally on
Windows, including exact source, F9 and Explorer persistence. This focused
evidence does not replace final-SHA hosted platform verification.

### RestGO development connection readiness: 7e5d5fa (2026-11-02)

[Release verification 41453459804](https://github.com/Atentor/WebRad/actions/runs/41453459804)
passed Linux and both macOS architectures, including Intel's Charts captures.
Validate/security also passed. Only packaged Windows failed: API Client timed
out waiting for an enabled development-login fieldset after the Menu workflow.
The old API-dialog-only diagnostics did not capture the RestGO form state, so
they cannot prove whether it was missing, busy, disabled or already signed in.

Check effective `:disabled` state before interacting with form controls. A
disabled ancestor fieldset also disables controls whose own `.disabled` remains
false, and native `.click()` then does nothing; see the
[HTML disabled-control definition](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#concept-fe-disabled)
and [click algorithm](https://html.spec.whatwg.org/multipage/interaction.html#dom-click).
Confirm the integration checkbox after activation and the edited URL before
Apply. A disabled Apply button alone does not establish completion: require
`aria-busy="false"`, configuration matching the project, and the expected enabled
flag/URL in the model-backed sidebar projection before using development login.

Both Electron runners require `renderer RestGO development connection passed:`
alongside the existing login/refresh/override/isolation/logout evidence. Preserve
the ten-second per-step limits and original authentication assertions. Timeout
evidence includes the actual workspace, configuration and development-login
presence/busy/disabled states without collecting password or token input values.
No local validation was requested; confirmation on a corrected hosted commit is
still required.

### Charts screenshot readback: v0.0.22 (2026-11-02)

[Tagged release 41443336802](https://github.com/Atentor/WebRad/actions/runs/41443336802)
at `e5c54af` passed Windows, Linux and macOS ARM64. Intel passed code checks,
portable tests and packaging, then Charts failed with `UnknownVizError`.
[Electron 45's capture implementation](https://github.com/electron/electron/blob/v45.0.0/shell/browser/api/electron_api_web_contents.cc)
maps this error to failed Viz surface readback; it does not establish a Charts
model/geometry defect or identify the exclusive native cause.

Data Grid/Charts now share Native Build's presented-frame capture in
`apps/ide/main/smoke-capture.ts`. Observe a temporary pixel in an actual frame,
remove it, and save the following marker-free bitmap from offscreen `paint`
(or a frame subscription for an ordinary window). Do not substitute DOM readiness
or an old queued frame, retry failed capture, skip screenshots, or relax geometry,
focus, scrolling, image validity or smoke deadlines. Both runners additionally
require `renderer Charts presented screenshots passed:` and preserve
`webrad-*.png` evidence from the appropriate process working directory on failure.
Native Intel confirmation remains pending; no local validation was requested.

Keep offscreen rendering for hidden development/packaged smoke windows.
Stopping bitmap delivery alone did not fix Intel run `40592211180`; that
mitigation has been removed. Compile through the owned utility process, keeping
the normal offscreen compositor, real presented screenshots, frame/cursor,
native input and geometry assertions. Do not lower frame rate or change deadlines.
Ordinary verification must run without a V8 CPU profiler; opt in separately with
`WEBRAD_SMOKE_CPU_PROFILE=1` when collecting a Menu CPU profile.
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

Page navigation changes must retain `renderer Page parameters Inspector and F9
passed:` in both development and packaged smoke runners. The existing Page
Inspector workflow configures a required numeric input with a default, exercises
Save/Cancel and Undo/Redo, checks persisted declarations and compiled URL input,
and checks same-page context updates and rejection of an invalid required value.
It restores the original declaration. The 2026-11-02 local validation passed this
flow in development and packaged Windows runners; later edits still require new
execution evidence and final-SHA hosted verification.

The Menu workflow must retain native shared-definition evidence as well as legacy
reusable interactions. Both development and packaged runners require
`renderer native Menu persistence passed:` and
`renderer native shared Menu Interaction passed:`. These cover the real palette
drag, definition-owned configuration and TypeScript, typed handlers, compiled
internal-before-page dispatch/cancellation, and isolated state in two placements.
The 2026-11-02 local development and packaged Windows runs passed these workflows.
Updating definitions afterward still requires new execution evidence.

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

### Date cleanup and native inspection overlap: fc40e87 (2026-11-03)

[Release 41733888779](https://github.com/Atentor/WebRad/actions/runs/41733888779)
passed Windows and both macOS targets; Linux failed Date cleanup after popup
alignment. Both quality validate commands and security passed, but Ubuntu
development hit a null tree row and Windows development exhausted its 120-second
budget after Menu. Assembly was skipped. See the
[review](ci-review-2026-11-03-fc40e87.md) and `artifacts/ci-fc40e87/`.

Date Undo dispatches through the surviving root, stops at component removal within
four commands and compares the complete saved page with its original. Both runners
require `renderer Date Inspector and F9 passed: complete original page restored;`.
Keep native typing, popup geometry, event and invalid-date assertions intact.
Native inspections must await cancelled process-tree completion before launching
the latest request, and equivalent settings must not trigger new probes. Preserve
explicit Check again, cancellation, authorization and tool deadlines. These local
changes have not been executed; Windows timing improvement remains unverified.

### Native Monaco smoke attribute ownership: 70dbbec (2026-11-03)

[Release 41613804410](https://github.com/Atentor/WebRad/actions/runs/41613804410)
and [validate 41613804463](https://github.com/Atentor/WebRad/actions/runs/41613804463)
show healthy TypeScript syntax, but the new language assertion reads null.
Monaco's caller container owns `data-mode-id`; its child `.monaco-editor` View
owns `data-uri`. Sample the primary Code workspace, get the former from the
view's nearest owning ancestor and the latter from the view itself. Keep all
language, token/color, keyword, inlay-hint and deadline requirements. Do not
remove the assertion or supply synthetic attributes to accommodate this error.

See the [review](ci-review-2026-11-03-70dbbec.md) and retained
`artifacts/ci-70dbbec/`. These workflows stop before Login; a corrected final
SHA must execute the remaining supported workflows before release readiness.

### Login mobile typography and Monaco startup: fbd7d0e (2026-11-03)

All six native jobs passed code checks, formatting, portable tests and packaging
in [release 41569409213](https://github.com/Atentor/WebRad/actions/runs/41569409213)
and [validate 41569409180](https://github.com/Atentor/WebRad/actions/runs/41569409180).
Five Electron workflows failed Login's 16 px mobile font minimum: the explicit
14 px Default Edit utility overrode the earlier component-layer rule. Structured
WebEdit font-size candidates now honor Login's responsive CSS floor while
retaining larger authored sizes and desktop/theme/state typography. Keep the
real 16 px/44 px assertions, exact geometry and updated Login evidence in both
runners; embedded runtime sources must include this projection.

Linux packaged stopped earlier at neutral Monaco syntax tokens. Project effects
can run before the React loader's setup; the normal App open path also
preconfigures Monaco, so this does not establish the original failure's cause.
Enforce setup at model-creation boundaries and keep a single eager grammar
registration with lazy semantic services. Retain native TypeScript language,
syntax token/color assertions and the 20-second deadline. Timeout evidence now
includes language, resource, visibility, focus and editor geometry. The original
artifact lacks internal tokenizer state, so the exclusive native cause remains
unproven and corrected hosted execution remains required.

All six archives and decoded logs are retained in `artifacts/ci-fbd7d0e/`; see
the [detailed review](ci-review-2026-11-03-fbd7d0e.md). No local validation was
requested or run. Packaging the original SHA does not certify later smokes,
updates, distributables or assembly; the final corrected SHA still needs the
full hosted gate.

### Local release-candidate validation: 2026-11-02

The final Windows working tree passed complete validate (1,812 tests, Chrome
enabled, zero skips), packaging and eleven Electron smoke flows, including
development/packaged standard, updater, Packages, debugger, project resources,
Web/PWA deploy, Native Build UI/export, viewport and ReportBuilder. Production
dependency audit reported zero vulnerabilities. Evidence and original failures:
`artifacts/release-readiness-2026-11-02/REPORT.md`.

Package boundaries and declaration snapshots must handle canonical paths for
projects opened through junctions while rejecting dependency links outside the
project. Label visuals are separate from selection overlays; Page roots use
their real tree row. The Login visual workflow seeds/restores missing default
styles only in its isolated legacy fixture, uses anonymous memory-only startup
separately from authentication fixtures, inspects visible fields and awaits real
CSS size transitions before mobile measurements. Keep the original geometry,
deadlines, uncaught-error failures and platform gates.

These uncommitted Windows results do not certify a final SHA, Linux/macOS,
installed updates or native Tauri execution. No tag, version change, installer or
publication accompanied this validation.

### Tagged Menu compilation timeout: 74fb1ed (2026-10-30)

[Tagged release 41047683011](https://github.com/Atentor/WebRad/actions/runs/41047683011)
passed Windows, Linux and macOS ARM; Intel failed its packaged Menu Interaction
F9 wait. Compilation/publication took 11,007 ms against the 10-second wait:
typecheck 5,509 ms, native bundle build 1,559 ms and the observed bundle-output
interval 3,260 ms. The later failure evidence already showed the published URL.
The same SHA's [branch verification](https://github.com/Atentor/WebRad/actions/runs/41044475333)
passed all platforms, with this Intel F9 taking 3,751 ms. Validate/security passed.
Those successes do not replace the failed tagged execution or prove the exclusive
cause of the longer native interval.

Root-list changes must not discard otherwise compatible parsed TypeScript files.
Let createProgram reconcile added/removed documents; reuse only exact-content
SourceFiles with matching parse settings and compiler environment. Recompute
strict diagnostics and module resolutions, release the previous host capture and
retain only the latest Program. Preserve the Menu wait, real compiled interactions,
evidence markers and platform gates. Timeout diagnostics distinguish the last
poll's start/end/result from evidence collected later. Local validation was not
requested; native confirmation of this correction remains pending.

### Windows loopback navigation: 068dfe8 (2026-10-30)

[Validate 41037777128](https://github.com/Atentor/WebRad/actions/runs/41037777128)
passed Linux, but Windows packaged smoke failed opening its first Page-title
Preview with -176 ERR_NO_BUFFER_SPACE after successful compilation (1,733 ms).
The subsequent empty title and absent later markers are consequences of this
navigation failure, not evidence that each later workflow independently failed.

Windows startup disables TcpPortRandomizationWin while preserving other feature
flags. This uses the Windows default port allocator in ordinary IDE and smoke
sessions, matching the mitigation described in
[Chromium issue 572515601](https://issuetracker.google.com/issues/572515601).
This is an upstream-informed mitigation, not confirmed exact-SHA evidence or an
exclusive root-cause finding without a NetLog. Revisit it after the upstream
Windows socket fix. Load-failure diagnostics retain the URL and frame identity;
keep actual navigation, title, mounted-page and routing assertions, unchanged
deadlines, isolation and the full platform verification gate.

Inline HTML smoke inspection must keep the empty iframe sandbox. Electron rejects
`WebFrameMain.executeJavaScript` in that document. Use the smoke-owned DevTools
DOM/CSS protocol to read the document, resolving its target from the parent
iframe DOM node and cleaning up sessions. Avoid execution-context-dependent DOM
inspection. Preserve authored-content, computed-style, geometry, screenshot and
opaque-origin assertions; never grant scripts or same-origin access for a smoke.

Read the first failed step, original functional error, and retained project/logs.
Missing later evidence usually means those interactions never ran. Distinguish
functional defects, stale selectors, async races, native window limits, missing
tools, and external network failures. Correct the observed cause without hiding
it through retries, workers, looser tolerances, or longer deadlines. Add meaningful
regression coverage when requested; update existing expectations when necessary.
After correction, verify the final commit on all required platforms. Local Windows
results do not prove Linux/macOS, publication, installed updates, or native WebViews.

### Slow-success evidence: 9b11a9a (2026-10-27)

All four platform builds passed [release 40587121234](https://github.com/Atentor/WebRad/actions/runs/40587121234),
including Intel's Menu/reusable F9 and update smoke; quality/security passed.
A reusable bundle still consumed 4,339 ms, with substantial main CPU/heap change.
The diagnostic change is not a proven permanent correction. Preserve successful
macOS measurements and their packaged main source map before temporary cleanup.
Upload `compiler-diagnostics-*` separately from assembly's release artifacts;
retain existing failure artifacts and all functional requirements.

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
