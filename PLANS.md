# WebRAD delivery plan

## Release validation repairs and hosted verification: 2026-10-29

The requested commit/push and GitHub Actions follow-up includes the accumulated
template, theme, HTML tutorial and Menu changes below. Updated existing tests to
use Apply changes, keyboard-accessible palette titles, the current project-folder
hint, issue-count control and Monaco cursor metadata. The runtime completion
contract excludes design-only Menu definition selection/actions. The Inspector
margin case now supplies a new authoritative value after its simulated draft
edits, exercising the intended external-model update.

Preview startup smoke now expects the route synchronization script injected by
publication. Styles smoke scopes the selected style to its library and compares
the Roboto face, size and weight across themes while compiler CSS can update the
fallback stack. Failure diagnostics include computed typography. A real isolated
Electron probe confirmed that Enter key transitions alone do not insert a newline
into a textarea; the list-editing smoke now includes the native character event.
Another isolated Electron probe confirmed that sandboxed inline HTML rejects
`WebFrameMain.executeJavaScript`. HTML smoke reads the owned iframe through a
DevTools isolated world instead, locating its target from the parent DOM node
and cleaning up its sessions. Script permissions and same-origin isolation stay
unchanged; content, computed CSS, geometry and screenshot requirements remain.
The HTML declaration generator uses the repository Prettier configuration, so
generated-source integrity and formatting checks agree. Applied required
repository formatting and regenerated embedded runtime sources. All existing
smoke requirements, deadlines, sandboxing and worker limits remain intact.

Hosted verification of the final commit is required before release readiness.
No publication or tag creation is included in this verification request.

The next development smoke reached shared Menu compilation and exposed a real
generator error: static `WebMenu.fromElement` calls were classified as type-only
imports. The AST import classifier now retains value imports for static member
access, alongside constructor and extends references. Strict typecheck passed
after this repair. Earlier smoke failures and focused test logs remain retained.

## Local release-candidate validation: 2026-10-29

Executed the full requested local Windows candidate sequence against the dirty
checkout based on `545a40897cf7968b0313eca624e5d97399e88bc1`. Fixed strict
style-length narrowing in the project-chooser smoke, Menu callback dependencies,
RestGO pending-change callback dependencies, and control-character validation
without disabling lint rules. Icons, generated sources, strict typecheck and lint
then passed. Portable tests finished with 1,710 passed, 11 failed and 41 skipped
across 229 files (189 passed, four failed and 36 skipped). Failures cover seven
App integration cases, two RestGO event-focus fixtures, Menu metadata/completion
parity and the Inspector margin projection. Separate formatting validation found
56 files requiring formatting; these were not mass-rewritten.

Packaging completed, but development, packaged and packaged-update smokes all
stopped at the Preview HTTP HTML comparison: publication now injects the route
notification script while the expected HTML only injects the base element.
Their later UI/update interactions did not run. Logs are retained in
`artifacts-release-{validation,validation-lint-failure,format,build,development,packaged,updates}.log`;
original smoke logs, metadata and fixture projects are under `artifacts/smoke/`.
The host uses Node 24.19.0/npm 12.2.0, below the declared Node 26.12.1/npm 12.2.1
requirements. This candidate is blocked; no installer, tag or publication was
created. No final-SHA four-platform hosted verification was performed.

## Menu user action icon: 2026-10-29

Replaced the profile row's double chevron with Lucide `user-round-cog`, conveying
user settings. The shared runtime updates the modal preview, Designer, compiled
Preview and exported applications. Existing Menu SVG geometry smoke interactions
continue to cover this icon. Validation was not requested and was not run.

## Menu mobile icon position: 2026-10-29

Added **Behavior & layout → Mobile icon position** to the dedicated Menu dialog,
with Left/Right choices and a live mobile preview. The saved `mobileIconPosition`
configuration controls the shared runtime hamburger placement in Designer,
compiled Preview and browser exports. Missing values default to Left. Updated
the existing Electron smoke interactions and required development/packaged
evidence for the modal preview, persistence and compiled mobile geometry.
Validation was not requested and was not run.

This file tracks current implementation scope, unresolved work, and relevant
verification records. Detailed contracts belong in the [documentation index](docs/README.md).
Superseded per-edit notes and early milestone tables remain available in Git
history. Historical passing results do not certify the current checkout.

## Shared button polish across themes: 2026-10-29

Reviewed Aurora, Prism and WebRAD against the Flat refinements. Moved medium
button text (500) and 27px icons into the shared Default Button metadata, keeping
Roboto and existing alignment. Updated the bundled example style libraries.
Aurora's gradients and adaptive text remain; Prism Light now brightens violet
and coral on hover. WebRAD keeps neutral IDE fills and uses its existing editable
Selection color when pressed, separating that state from hover.

No corner radii or Flat colors changed. Existing saved/custom user styles remain
project-owned. Updated existing model expectations and Electron smoke definitions
and required evidence for every template/theme presentation, Prism hover, WebRAD
pressed state and rendered medium-weight Designer/Preview button text. Tests,
smokes, typecheck, lint, formatting checks, builds and packaging were not
requested or run.

## Card and button corners: 2026-10-29

Panel cards and buttons now use 8px corners across both project templates and
all four Light/Dark presets, including Data Grid cell buttons. Prism and WebRAD
retain their other control appearances. Updated the materialized examples, the
tutorial's embedded HTML card, creation card previews and picker card shells.
Existing user projects keep their saved/custom styles.

Updated existing model expectations and Electron smoke definitions/evidence for
all template/theme radii and rendered 8px Designer/Preview buttons. Tests, smokes,
typecheck, lint, formatting checks, builds and packaging were not requested or run.

## Template button alignment: 2026-10-29

Default Button now seeds `justifyContent: 'start'` and `textAlign: 'left'`, with
the icon before the caption. Both project templates and all four theme presets
inherit the same editable style metadata. The bundled Aurora Workspace and Hello
WebRAD examples use the same alignment. Icon/text spacing and vertical centering
remain unchanged, and existing user projects retain their saved style choices.

Updated the existing default-style expectation and Electron smoke definitions
for all template/theme combinations and rendered Designer/Preview alignment
parity. Both smoke runners require the updated evidence. Tests, smokes, typecheck,
lint, formatting checks, builds and packaging were not requested or run.

## Flat theme palette and corners: 2026-10-29

Flat uses near-white Light surfaces and neutral graphite Dark surfaces, with
balanced blue accents and coordinated text, borders and scrollbars. Blue button
fills share the same normal, hover and active colors in Light and Dark, with
hover lighter than normal. Primary and accent buttons use white text in both modes.
Flat button text uses Roboto Medium (500) for a slightly lighter weight, with
27px icons in both modes.
Turquoise accents and status colors retain their vivid palette. New Flat projects
materialize solid Default styles with 8px card/button corners, including Data Grid
cell buttons, and 6px corners on other controls.
Both creation previews reflect the palette and radius. Saved projects keep their
authored colors and styles.

Updated existing Electron chooser smoke definitions and both runners' evidence
requirements for white/graphite surfaces, softer blue, brighter hover, preview
radius and materialized style radii.
No tests, smokes, typecheck, lint, formatting checks, builds or packaging were
requested or run.

## Project template polish and HTML example: 2026-10-29

Fixed Examples & Tutorial creation failing its complete-component catalogue
guard after HTML was registered. Media now includes a local, editable HTML/CSS
card with a typed WebHtml instance. Updated the materialized example and its
generated Media declarations while preserving existing component IDs and
authored sources.

The creation dialog keeps the project name, location hint and actions visible
while options scroll. Compact template previews follow the selected theme;
radio labels/descriptions are explicit, and creation errors no longer mark a
valid project name as invalid or expose Electron's transport prefix. The Blank
project default and independent Light/Dark theme choices remain available.

Updated the existing Electron chooser smoke and both runners' required evidence
for template construction, HTML content, theme-aware previews and visible
creation actions after scrolling. These are definitions, not passing results.
Source generation for the materialized example completed; tests, smokes,
typecheck, lint, formatting checks, builds and packaging were not requested or run.

Documentation: [Project format](docs/project-format.md),
[Tutorial guide](examples/aurora-workspace/README.md).

## IDE UX improvements: 2026-10-29

Implemented the 19 findings from the approved static UX review: pending RestGo
and Settings drafts, truthful Apply/Save feedback, ListBox/numeric drafts,
transactional multiple-selection events, Settings validation navigation, Menu
subtree undo, nonintrusive live Problems, inline Explorer rename/search feedback,
keyboard trees/tabs/dividers/palette insertion, Preview error recovery/live route,
build result attribution, inherited style values, zoom-independent resize targets
and actionable welcome controls.

Native pending-editor IPC is separate from project dirtiness, including local
Inspector field drafts. Save/Preview confirm the focused field without stealing
focus, and invalid numeric input prevents the action with an inline error.
Preview reporting is injected only into IDE publications with origin/source/payload checks;
generated exports and the project format are unchanged. Updated existing smoke
interactions and evidence requirements are definitions, not execution results.
No tests, smokes, typecheck, lint, formatting commands, builds or packaging were
requested or run. Source/diff review also corrected contextual reusable events,
mixed-value cancellation, overlapping resize targets, asset keyboard navigation
and background project updates that could otherwise dismiss exclusive Preview.

Documentation: [IDE editing and navigation](docs/ide-workflows.md).

## Application menu cleanup: 2026-10-28

Removed the unused, empty Component section from the native application menu.
The existing Electron shell smoke now asserts its absence, with required
evidence in both development and packaged runners. Validation was not requested
or run.

## IDE status bar removal: 2026-10-28

Removed the IDE footer status bar, its component and obsolete component tests,
styles and theme tokens. The workbench now occupies the released height.
Existing toolbar save feedback and Problems navigation remain available.
Electron smoke cursor/selection checks now observe Monaco DOM metadata populated
from its editor model; rendered caret and source assertions remain intact.
Both smoke runners require evidence of the absent footer and full-height layout.
Tests, smokes, typecheck, lint, formatting checks, builds and packaging were not
requested or run.

## Reusable creation dialog cleanup: 2026-10-28

Removed Responsive menu from the reusable-component creation choices. Its
internal factory remains available to the existing Aurora project template;
saved reusable Menus keep their runtime support. The dialog creates a blank
composition directly and hides Template while only one public choice exists.
New shared Menus continue to come from the component palette or Menus folder.

Updated the existing Menu Electron workflow to assert the obsolete chooser is
absent and compose its reusable through the normal Menu palette. Both runners
retain their required reusable and native Menu evidence. No tests, smokes,
typecheck, lint, formatting checks, builds or packaging were requested or run.

## Native shared Menu definitions: 2026-10-28

Menu palette insertion now creates or reuses a project-level definition without
requiring a reusable component. Definitions live in the Explorer's Menus folder,
own a WebMenu root and authored `menus/Name.ts`, and are referenced by stable ID
from ordinary WebMenu placements. The Inspector selects, creates, duplicates and
opens shared definitions. Configuration and style resolve from the definition;
placement layout, visibility, page handlers and runtime state remain independent.
Shared configuration dialogs identify their definition and placement count.

Generated page/reusable members use the concrete authored Menu class, including
custom methods, through the existing implicit-this language contract. Runtime
factories construct each physical class once, initialize the saved placement
before its authored constructor, and bind internal handlers before page handlers
without replacing either or losing synchronous cancellation. Nested reusable and
repeating-row placements receive the same factory contract and disposal path.

Persistence includes Menu documents and owned generated/authored files in the
existing atomic save, rename/archive, save-as and reopen lifecycle. Invalid links,
duplicate identities, destinations, styles and theme colors are rejected. Linked
placements do not persist configuration copies. Existing local Menus and authored
reusable Menu compositions remain unchanged. Shared edits use the definition's
document history; changing the definition of a placement is undoable locally.

Updated the existing Electron Menu workflow and required evidence to cover native
palette drag, shared persistence, typed internal/page handlers, cancellation and
independent state in two placements alongside the legacy reusable interactions.
`npm.cmd run runtime:sources` completed successfully. Tests, smokes, typecheck,
lint, formatting checks, builds and packaging were not requested or run.

Documentation: [Menu](docs/menu.md), [Project format](docs/project-format.md).

## Panel, Group and HTML aspect ratios: 2026-10-28

Added Registry-backed `aspectRatio` choices `none`, `1:1`, `4:3`, `3:4`, `16:9`
and `9:16` for Panel, Group and HTML. Missing/initial values mean free sizing.
The Project Model validates the optional property without a format migration.
Typed runtime classes, Monaco declarations and embedded sources share the
`WebAspectRatio` contract. Video Player keeps its existing narrower public enum.

Extended the existing shared layout projection to the additional presets,
floating Panel anchors and fit-content containers. Width drives height while a
ratio is active; saved vertical rules remain intact. The Designer disables
height editors and offers only available horizontal resize handles. Floating
resize commits retain the free height. Root surfaces keep their existing owner
sizing contract. Documentation: [Aspect ratios](docs/aspect-ratio.md).

Updated the existing HTML Electron workflow and development/packaged required
evidence for Panel/Group/HTML ratio selection, free restoration, saved heights,
resize handles and compiled geometry after runtime width changes. This updates
smoke definitions only. No tests, smokes, typecheck, lint, formatting checks,
builds or packaging were requested or run; source regeneration is recorded
separately from verification.

## HTML component: 2026-10-28

Added the Registry-backed Standard > HTML visual component (`WebHtml`) for HTML
fragments and complete documents. The Inspector uses generic `multiline` string
metadata to preserve authored markup, whitespace and CSS in `props.html`; the
accessible frame name is `props.title`. Existing project serialization and
history commands remain the source of truth without a format version change.

Designer and browser runtime share script-disabled, opaque-origin `srcdoc`
rendering for inline markup. Standalone cross-origin HTTPS iframe snippets are
projected directly as external frames, preserving their media permissions,
referrer policy and actual remote origin for YouTube-style embeds. IDE/Preview
CSP permit HTTPS frames; Preview delegates media permissions. Raw markup never
receives script/same-origin sandbox tokens. Designer frames are inert for canvas
gestures; runtime enabled state controls interaction. Outer styles remain
separate from embedded CSS.

The public runtime class exposes `html`, `title`, `clear()` and `onLoad`, with
generated declarations and embedded runtime sources for Monaco, page/reusable
instances, compiled Preview and exports. The frame has no access to IDE IPC.

Updated the Electron workflow and development/packaged evidence requirements for
real HTML palette insertion, multiline editing, saved markup, Designer rendering,
CSS isolation, compiled F9 sandbox and geometry. The same flow now retains a
separate HTTPS embed fixture and requires direct
source, saved markup, sandbox, media permissions and referrer-policy evidence in
Designer/F9 without relying on provider connectivity or claiming actual playback.
No tests, smokes, typecheck, lint, formatting checks, builds or packaging were
requested or run. See [HTML](docs/html.md) for the public contract and limitations.

## Responsive Preview viewports: 2026-10-28

The exclusive Preview toolbar now offers Desktop (available width), Tablet
(768 px), and Mobile (390 px), reusing the Designer viewport widths. Switching
resizes the existing application iframe without rebuilding or reloading it.
Fixed widths center in the available space and remain exact through horizontal
scrolling when the IDE window is narrower. Compact icon controls retain their
accessible labels; Stop remains visible. Each Preview session starts at Desktop,
independently of Designer UI state and without changing the Project Model.

Updated the existing Electron Preview workflow to click the real controls and
assert selected state, iframe geometry, browser media queries, and preserved
application document/form state before returning to Desktop and clicking Stop.
Development and packaged runners require this viewport evidence. No tests,
smokes, typecheck, lint, formatting checks, builds, or packaging were requested
or run. Runtime code and persisted formats are unchanged.

## Isolate IDE compilation after 71c9f3d: 2026-10-27

[Release 40592211180](https://github.com/Atentor/WebRad/actions/runs/40592211180)
passed Windows, Linux and macOS ARM64; quality/security passed. Intel again failed,
this time on horizontal Menu F9. Bitmap delivery was stopped, but native bundling
remained pending for 15,700 ms after 2,909 ms of preparation. The mitigation is
insufficient and has been removed. Do not claim the offscreen hypothesis was the
exclusive proven cause. Original log is retained under
`artifacts/github-actions-71c9f3d-20261027/`.

Move the IDE's compiler execution into one owned utility process with a separate
V8 heap/event loop. Preview, Debug, Deploy, Native frontend generation, live styles
and smoke fixture compilation use typed request/result/progress contracts and a
sequential queue. Preserve the public Node compiler API, strict diagnostics,
source caches, native dependencies, resource environment and browser-only output.
Main keeps trust/root checks, Save, destination grants and Preview publication.
Phase logs identify actual compiler PID/CPU/heap/RSS. Outstanding work rejects on
child crash; shutdown rejects pending calls and terminates the child. Failed calls
are never retried. Forge builds the separate entry in development and packaging.

Existing IPC test mocks now target the service adapter, preserving their original
assertions; no test cases were added. Native sampling includes the owned esbuild
parent when it differs from the browser. The existing functional deadlines, frame
and screenshot evidence, two Vitest workers, sandbox and release gates remain.
No local validation was requested or run. Further authorized exact-SHA hosted
verification is required before claiming this architectural repair is confirmed.

## Offscreen bitmap allocation during hidden compilation: 2026-10-27

Exact commit `07ae25530435792f60d7bb63453537989ba2751c` again failed only on
Intel in [release 40589301580](https://github.com/Atentor/WebRad/actions/runs/40589301580).
Quality/security and the other three platform builds passed. This failure was
the initial page-title F9, before Menu, after typecheck and runtime preparation.
The bundle remained pending for 26,464 ms. The owned process snapshot showed
main CPU at 79.2%, software compositor CPU at 82%, main RSS about 1.5 GiB, and
sleeping esbuild at 0%. Native sampling produced no usable thread stacks; it
does not prove an exclusive native deadlock. Original logs/samples are retained
under `artifacts/github-actions-07ae255-20261027/`.

Review of Electron 45's `OffScreenRenderWidgetHostView::OnPaint` and
`WebContents::OnPaint` found full-frame bitmap copying and NativeImage creation
on every offscreen paint, even without a JavaScript paint listener. NativeImage
reports that pixel memory to V8, triggering GC pressure in the same isolate as
strict TypeScript and the esbuild plugin bridge. This is a concrete unnecessary
allocation path compatible with the observed CPU/RSS spikes, not a claim that
the failed native report identified the exclusive cause.

Hidden smoke windows now stop unused paint-event bitmap delivery. Electron's
SetPainting changes the consumer's active state, separately from compositor
frame scheduling; keep offscreen rendering and background timer settings.
Real capturePage screenshots, geometry, Monaco cursor/input/frame evidence,
Preview, and all deadlines remain required. Normal IDE windows are unchanged.
V8 profiling is now opt-in via `WEBRAD_SMOKE_CPU_PROFILE=1`, so final hosted
verification exercises the correction without an active CPU profiler.
No local validation was requested or run. Native final-commit CI is pending.

## Keep slow-success evidence: 9b11a9a, 2026-10-27

Exact commit `9b11a9a98717bfbf0bc314daf6f74836bf6a0ffd` passed all four
platform builds in [release 40587121234](https://github.com/Atentor/WebRad/actions/runs/40587121234),
including Intel's complete Menu/reusable F9 and update smoke. Quality and security
passed. Intel's reusable bundle still took 4,339 ms, with 3,446 ms of main CPU,
heap dropping from 405 to 218 MiB and RSS rising to 1,813 MiB. A diagnostic-only
change and one green run do not establish a permanent compiler correction.

Successful runners previously removed the profiles/native samples with their
temporary directories. Preserve existing macOS measurements on success too,
without preserving browser profiles, projects or changing functional results.
Upload them under a separate `compiler-diagnostics-*` artifact, outside assembly's
`release-*-*` pattern. Include the packaged main source map to interpret minified
CPU frames. Existing failure artifacts remain intact. Another authorized hosted
execution is needed to retrieve these measurements; no local validation ran.

## macOS Intel diagnostic follow-up: 7067bd3, 2026-10-27

The authorized hosted run passed Windows, Linux, macOS ARM64, quality and
security. [Release 40545084526](https://github.com/Atentor/WebRad/actions/runs/40545084526)
failed only on Intel (`122333553598`) during the initial Menu F9. At sampling,
Electron was runnable at 63.9% CPU with 1,578,196 KiB RSS; esbuild was sleeping
at 0.0% CPU with 51,936 KiB RSS. This snapshot does not prove a Go deadlock.
The original log/project and process listing are retained under
`artifacts/github-actions-7067bd3-20261027/`.

Both native samples exceeded the diagnostic subprocess cap before report output.
Keep the one-second sample, capture symbols before target exit (`-mayDie`), and
allow bounded report generation to finish after the original functional result.
This changes only diagnostic finalization, never build or assertion deadlines.
For the automated Intel Menu workflow, also record a local V8 CPU profile into
`native-diagnostics/menu-main.cpuprofile` in finally, including functional failure.
No inspector port is exposed, and profiling errors preserve the original result.
Native evidence is still required before a source correction can be certified.
No local validation was requested or run; further hosted execution is authorized.

## macOS Intel stall: failed workaround and native stack collection, 2026-10-27

Inspected exact commit `47ccce061978ad1d97609219a31a1c2ec547546d` and the supplied
log. [Validate 40538022323](https://github.com/Atentor/WebRad/actions/runs/40538022323)
and [security 40538022385](https://github.com/Atentor/WebRad/actions/runs/40538022385)
passed. [Release 40538022322](https://github.com/Atentor/WebRad/actions/runs/40538022322)
passed Windows, Linux, and macOS ARM64; Intel job `122308647922` again failed.
It stopped at the initial Menu F9, before reusable Interaction, so the recurring
bundle-phase failure is not exclusive to the reusable fixture.

The failed bundle began at 16:25:27.689 UTC after 2,421 ms of strict typecheck and
74 ms of preparation. It remained pending at 16:25:40.864 UTC, with Saved and
disabled Run. Earlier in the same process, a completed bundle took 8,380 ms and
6,623 ms of main-process CPU while the JS heap fell from 409 MiB to 205 MiB.
That is compatible with significant JavaScript/GC work; the existing brackets
cannot identify an exclusive native Go deadlock. Both preceding mitigations
failed to establish a resolution. Removed the ineffective single-P override.

Prepared evidence collection before changing the execution model again:

- The parent smoke runner observes compiler progress. After three seconds in a
  bundle phase on macOS it collects only the owned process tree, its CPU/RSS,
  and one-second native samples of Electron and esbuild. It remains independent
  of the Electron event loop, does not inspect unrelated processes or command
  arguments, and does not retry builds or change the functional deadlines.
- Process listing and sampling have bounded subprocess timeouts. Sampling errors
  are retained as diagnostics without replacing the original result. Finalization
  waits for an already-started capture before preserving/removing its directory.
- Both real runners retain `native-diagnostics/` in failure artifacts. Existing
  isolated-runner fixtures copy the new helper; no test cases were added.

The original full job log is under `artifacts/github-actions-47ccce0-20261027/`.
This change prepares a diagnostic run; it is not a proven correction of the stall.
The user subsequently authorized committing/pushing this diagnostic change and
executing the GitHub CI workflows. Native Intel stack evidence is still required;
the authorized hosted run will determine the next correction. No local test/build
matrix has been run as part of this diagnostic change.

## Native esbuild workaround for repeated macOS Intel stalls: 2026-10-27

Inspected exact commit `41b6f2a8c6e521064549155b49d1eb7c9b8b569a`:
[validate 40532064142](https://github.com/Atentor/WebRad/actions/runs/40532064142)
and [security 40532064211](https://github.com/Atentor/WebRad/actions/runs/40532064211)
passed. [Release verification 40532063982](https://github.com/Atentor/WebRad/actions/runs/40532063982)
again passed Windows x64, Linux x64, and macOS ARM64. macOS Intel job
`122287405778` failed at the same reusable Menu F9. The macOS activity guard was
active and released on failure, so it did not resolve the observed stall.

The last compilation completed strict typecheck in 2,447 ms and prepared the
runtime in 55 ms. Native bundling started at 15:49:26.315 UTC with main-process
heap 407/452 MiB and RSS 1,116 MiB. No bundle completion arrived before the
15:49:37.417 UTC timeout; Saved was present, Run was disabled, and Preview was
still building. The preceding bundle phase took 463 ms. Reviewing the retained
project found no source-graph explosion, unresolved public imports, or concurrent
F9 builds.

Read-only inspection of the official `@esbuild/darwin-x64@0.28.2` executable
confirmed embedded Go `1.26.5`. Upstream [Go issue 81759](https://github.com/golang/go/issues/81759)
documents a Go 1.26 scheduler/GC race with blocking pipe syscalls; its reproducer
avoids the race with `GOMAXPROCS=1`. The esbuild service uses blocking stdin/stdout
pipes and awaits host replies, matching that class of failure. This is stronger
evidence than the earlier power-management hypothesis, although the failed job
has no native Go stack proving the exact race.

Applied `GOMAXPROCS=1` only around the synchronous call that starts esbuild on
Darwin x64. The pinned JavaScript API spawns its native service before returning
the build Promise; the host environment is restored in `finally` before any
await, including synchronous errors. Only the native service inherits the limit.
This preserves esbuild 0.28.2 and its security fixes, all original strict checks,
browser output, smoke deadlines, and Vitest worker scheduling. Native Go bundling
on Intel uses one execution slot until an official fixed binary can replace the
workaround; the other platforms retain their existing behavior.

Original job log, failure archive/project, upstream binary metadata, and diagnosis
are retained under `artifacts/github-actions-41b6f2a-20261027/`. No local tests,
validation checks, builds, packaging, workflow reruns, commits, or pushes were
requested or executed. Confirmation on the final hosted Intel commit is pending;
remove the workaround only after verifying an updated native toolchain there.

## Remaining macOS Intel smoke stall for e1c5294: 2026-10-27

Inspected exact commit `e1c5294081dbd3a251246184c03607364ef44a8d`:
[validate 40526361466](https://github.com/Atentor/WebRad/actions/runs/40526361466)
and [security 40526361348](https://github.com/Atentor/WebRad/actions/runs/40526361348)
passed. [Release verification 40526361351](https://github.com/Atentor/WebRad/actions/runs/40526361351)
passed Windows x64, Linux x64, and macOS ARM64, including their packaged/update
smokes and distributables. Only macOS Intel job `122267090601` failed; assembly
and publication were skipped. This confirms the preceding focus/Explorer fixes
on those completed workflows without certifying the pending local edits.

The Intel job passed strict checks, tests, packaging, desktop/mobile Menu focus,
and horizontal flyouts. Its reusable Interaction F9 began at 15:20:46.893 UTC;
typecheck took 3,538 ms, module loading 1 ms, and runtime selection 37 ms.
`bundle-build` began at 15:20:50.718 UTC and did not complete before the smoke
reported the still-building Preview at 15:21:13.253 UTC. Its previous native
bundle took 915 ms. The original log proves a stall in this phase, but cannot
distinguish native service latency, scheduling, or main-process work/GC.

Applied a conservative environment mitigation and diagnostic improvements:

- Hold `prevent-app-suspension` only during automated hidden macOS smokes; release
  it before every explicit exit and on normal quit. Offscreen rendering addresses
  the renderer; the main/native work also needs an active power assertion. Apple
  documents hidden apps without IOKit assertions as App Nap candidates. This
  prevents that known throttling mechanism; App Nap is not a proven exclusive
  cause of this failure, and hosted Intel confirmation remains pending.
- Prepare the selected runtime adapter AST during `bundle-selection`, before
  entering the native esbuild RPC. Plugin source callbacks now return prepared
  text rather than running that synchronous transform inside `bundle-build`.
- Log main-process CPU, heap, and RSS with phase timings when diagnostic logging
  is enabled. Preserve Save, Run-disabled, and iframe URL in Menu timeout evidence.
  No authored source or credentials are included in these measurements.

Original full job log and failure project/archive are retained under
`artifacts/github-actions-e1c5294-20261027/`. No tests, validation checks, builds,
packaging, workflow reruns, commits, or pushes were requested or executed locally.
Assertions, deadlines, worker limits, renderer isolation, and release gates are
unchanged. These edits are not yet verified on the hosted macOS Intel runner.

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
