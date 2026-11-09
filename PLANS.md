# WebRAD delivery plan

## Icons F9 semantic timeout: f8ea9a6

At `f8ea9a6b8757a4a3e2874b34313542f488a385c2`, validate, security, all six
portable jobs and five release builds passed. Release run 42557774085 failed
the Intel packaged smoke at the existing ten-second Icons F9 wait. Styles' three
presented screenshots passed and are retained. Preview remained building; its
semantic-diagnostics phase had run for at least 9,652 ms when the wait failed.
The unchanged second Preview recorded 34 ms in that phase, while other changed
Previews took 9,235 ms and 6,743 ms. The log does not identify the affected file
or signature work responsible for the timeout.

The compiler now reports slow completed affected-file categories without source
names, using the same TypeScript builder and complete whole-program diagnostics.
The macOS runner also samples the owned compiler process if semantic diagnostics
remain active for seven seconds; existing bundle sampling and all deadlines are
retained. Original logs, the project and screenshots are in
`artifacts/commit-review-f8ea9a6/`. This is diagnostic instrumentation, not a
proven performance correction. No local tests or validation were requested or
run; native final-commit evidence is needed to identify the slow work and assess
any subsequent correction.

## Styles presented-frame capture: 2026-11-09

At `15cc23ad26bb10b3b17cbbc5c1d5ce681587dbbd`, validate, security, all six
portable jobs and five release builds passed. Release run 42554329686 failed the
Intel packaged smoke with `UnknownVizError` in the first resized Styles capture,
before any interactive Preview compilation. The retained artifact contains its
original log and project; the prior cumulative deadline was not reached.

Styles and Toast now consume the shared presented-frame helper instead of
requesting a second Viz surface copy through `capturePage`. Empty-image and all
existing geometry/interaction assertions remain. Screenshots use `webrad-*.png`
names so both runners retain them on failure. Both runners additionally require
`renderer Styles presented screenshots passed:` for Toast and both editor widths.
Original logs and the verified artifact are in `artifacts/commit-review-15cc23a/`.
No local tests, typecheck, lint, builds or smokes were requested or run. Intel
capture confirmation and the complete final-commit hosted gates remain pending.

## macOS Intel cumulative smoke deadline: 640ff05

Release run 42552208596 at `640ff0535a40a5ea6fadbb14adf8cdd9079a0d74` passed
all six portable jobs and five release builds. Intel packaging passed, but its
standard packaged smoke reached the unchanged 240-second global deadline while
still progressing through API Client. Both validation jobs and security passed.
The retained smoke log records 13 Preview semantic-diagnostic passes totaling
70,780 ms; native bundle builds total 4,775 ms. Assembly and the Intel update
smoke did not run. Original logs, retained project and screenshots are in
`artifacts/commit-review-640ff05/`; the downloaded artifact matched its digest.

The compiler now uses TypeScript's semantic builder with current-content SHA-256
source versions and dependency-aware invalidation. It returns whole-program
diagnostics, retains one compatible builder, releases predecessor captures and
recomputes component-reference analysis. Existing strictness, current module
resolution, assertions, smoke deadlines and worker limits remain intact. This
targets repeated semantic work identified by the log; it is not yet a measured
native performance improvement. No tests, typecheck, lint, builds or smokes were
requested or run locally for this change. Native final-commit confirmation is
still required.

## Toolchain formatting correction: 2026-11-08

At `e2e481d5b9974bfea1704f63d6a3b9776c393aba`, the completed quality/build jobs
passed lint and then failed formatting in `apps/ide/main/package-toolchain.ts`.
Prettier was applied to that file; only the timeout error call's line wrapping
changed. Original logs are in `artifacts/commit-review-e2e481d/`. Security passed;
portable jobs and the Windows ARM build were still running at inspection. No
tests, builds or smokes were run locally for this formatting correction.

## Portable test diagnostics lint correction: 2026-11-08

Commit `bdcdeeb000ffc42de5990786ce294d4223c95382` passed all six hosted portable
test jobs and security. All six release build jobs and both validation jobs
stopped at the same lint error: `Buffer` was used without an explicit import in
`scripts/test-portability.mjs`. The script now imports it from `node:buffer`,
following the other Node scripts. Original failed job logs are retained in
`artifacts/commit-review-bdcdeeb/`. Packaging, smokes and assembly were not reached;
no workflow artifacts were available. No local validation was requested or run
for this correction; final-commit hosted verification remains outstanding.

## Release v0.0.32 test failures: 2026-11-08

Tag run 42545283231 at `2d3a7febd932edce71e3f55a75d742fe60fc5ce1` passed all
six builds, packaged/update smokes and artifact staging. The macOS Intel portable
job failed the first project IPC concurrency test's five-second deadline; its
cold module import was inside the case. Validate run 42545283302 failed three
Windows NPM integration cases after toolchain detection timed out and cached its
negative result. Linux validation and security passed. Assembly and publication
were skipped. All corresponding main verification jobs had passed on the same
commit.

Toolchain inspection now probes the external Node executable and reads NPM's
version from the manifest beside its CLI, avoiding full NPM startup/configuration
loading just to obtain a version. Unavailable results are not retained in the
cache. The IPC suite loads fresh modules in setup before each behavior deadline.
Portable test failures now retain their output and environment metadata, uploaded
by release and validate workflows. Existing deadlines, assertions, two workers
and real event-loop turns remain intact.

Original failed logs and the downloaded Intel distribution are retained in
`artifacts/release-review-v0.0.32/`; its inner ZIP and outer artifact SHA-256
matched their manifests. No local tests, typecheck, lint, formatting, builds or
smokes were requested or run for these changes. Native hosted confirmation of
the corrected commit remains outstanding.

## Release v0.0.31 packaging failure: 2026-11-08

Tag run 42530885947 at `6b8270e69523da6fab9411a136b431d3adebb29f` passed all
six portable jobs and five builds, but macOS Intel failed while copying the
Electron distribution with `TypeError: fetch failed`. The log did not identify
the URL or underlying network error, and no failure artifact was produced.
Assembly and publication were skipped; validate and security passed. The prior
non-publishing run on the same commit passed all six targets and assembly.

Forge now receives the checksums distributed with the installed Electron package,
as its installer already does. This preserves archive integrity verification and
avoids a fresh checksum download for every package, including cache hits. Scoped
Electron download diagnostics identify cache and download activity in release
logs. The failing URL was not captured, so this is a preventive correction, not
proof of the original network failure's cause. These changes have not been
validated; the final commit still requires all hosted release gates.

## Windows release battery: 2026-11-08, follow-up

On the working tree based on `9cefb90a13a4ee3e7612de22c2cab9768c96868a`,
the Payments documentation formatting was corrected. With lockfile dependencies,
Node 26.13.0, npm 12.2.1 and Chrome, `validate` passed 242 files and 1,815 tests,
source checks, typecheck, lint, formatting and Windows x64 packaging. Development,
packaged and simulated update smokes passed, along with 12 supplementary smoke
flows. The production dependency audit found no vulnerabilities; the complete
dependency audit reported 27 moderate development dependency findings. Logs are
in `artifacts/release-battery-20261108/`. Exact-commit hosted verification on all
six targets, the hosted security workflow and a real update installation remain
outstanding.

## Windows release battery: 2026-11-08

On the working tree based on `4a8f43e01b9b0c970f5cf8b98612a9f9b277f9cc`,
the grouped import tests were aligned with endpoint selection, the catalog hook
was corrected for React lint rules, and the API Client smoke was updated to
recognize request tabs with counts. The full Windows x64 validation with Chrome
passed 242 files and 1,815 tests, and development, packaged and simulated update
smokes passed. Logs are in `artifacts/release-battery-20261108/`. Native hosted
verification on the final committed SHA and actual update installation remain
outstanding.

## RestGO API Client grouped import: 2026-11-08

The import picker groups methods by endpoint slug, database, version and access
policy. One selected group imports one request, preferring GET for a new group.
Existing requests retain their selected method when reimported. Available
methods are selected inside the request editor and loaded again when reopening
the client. Switching updates the source identity and query/JSON inputs while
preserving request IDs, names and shared primitive values; the previous method's
response contract is cleared. Authentication modes remain separate. Catalog
data and SQL stay in the IDE; the persistent project format is unchanged.

The existing Electron API Client flow is adapted to grouped selection and
method switching rather than separate GET/PUT import rows. The local release
battery above covers this working tree.

## RestGO endpoint editor UX: 2026-11-08

RestGO operation progress banners appear only after one second. Busy controls
still update immediately; completion and workspace disposal cancel the timer.
The endpoint list combines text search with a database filter that initially
selects the configured default once the catalog is available. Manual selections
remain in effect for the workspace session. All databases includes endpoints
without publications; a database selection includes its inactive publications.

Endpoint details, HTTP method handlers and publication access now have separate
sections. Methods show their own activation state, a compact SQL preview and an
explicit action to add a missing handler. SQL editing opens a dedicated dialog
with a large editor, draft-only Apply SQL, Cancel/Escape, keyboard focus
containment and return focus. Saving the endpoint remains the server-write step.
Publications are listed separately; Add publication and Edit access open the
database/credential form without keeping duplicate controls on screen.
Publication drafts participate in pending-edit tracking and keep endpoint edits
disabled until the publication is saved or cancelled.
The SQL dialog uses up to 1440px of the viewport with 24px side margins. Its
width rule overrides the shared modal default regardless of stylesheet order.
SQL text uses JetBrains Mono at 12px with normal width and weight.

The existing API Client Electron flow checks default database filtering, manual
selection across refresh and combined text search, then SQL cancellation, applying
GET/PUT drafts, access restoration, modal focus and desktop/narrow geometry,
while preserving its server-save and imported-client synchronization checks.
Both runners require the updated endpoint-editor evidence. Validation was not
requested or run.

## RestGO connection UX: 2026-11-08

The Connection workspace now gives application configuration its own primary
card, with visible activation, instance URL, API defaults and user session
settings, and a clear Apply footer. Separate IDE-only cards group administrative
access and development login, using compact
connection states, shorter actions, an expandable sign-in form and actionable
guidance when configuration must be applied first. All three cards occupy a
single full-width column; related settings and development login fields use two
columns when space permits and stack on narrow workspaces. Refined section
headings, field spacing and type sizes preserve readability at wide and narrow
sizes. Larger, unboxed heading icons identify the three sections. The connected
administrative card places its connection and actions beside the database,
endpoint and publication counts on wide workspaces, with
responsive stacking when space is limited. Project settings and credential
storage contracts are unchanged.

Published APIs appear in one full-width column, keeping each publication's
actions, route, authentication and methods together. Publish and Unpublish have
distinct action colors, icons and endpoint-specific accessible names. The existing
API Client smoke uses three temporary fixture publications to check both action
states, their transitions and the desktop and narrow layouts before restoring
the fixture. In the published list, publication changes update the card without
a separate success banner; operation errors remain visible. Search focus now
outlines the complete search field, including its icon. Validation was not
requested or run.

Updated the existing Electron interactions, required evidence and affected
development-login tests for the visible sections, action labels and responsive card
layout. Validation was not requested or run.

## Release battery corrections: 2026-11-07

The release battery exposed nonvisual reusable IDs being resolved through the
visual mount map. The registry now opts persistent components into placement-scoped
IDs while preserving model IDs used by existing API Client bindings. Payments is
included in the Aurora RestGo session page. The Login label gap was reduced to
keep its registration card within the existing height contract.

Windows x64 validation passed with Chrome enabled: 242 files and 1,815 tests,
with no skips, plus typecheck, lint, formatting, generated-source checks and
packaging. All 15 local Electron smoke flows passed after the fixes. Update
smokes use a simulated update, and Payments uses an HTTP fixture. Hosted
six-target verification, an installed update and live payment-provider evidence
remain separate.

## Login Edit focus: 2026-11-07

Removed the Login-specific focus outline from the inner Edit input so the
component's outer focus indication remains the sole field indicator. Legacy
Login styling retains an outline on the Edit container. Updated the existing
Login Electron interaction for the focus appearance. Validation was not
requested or run.

## Login field polish: 2026-11-07

Refined the Login form using composite Edit controls with associated labels and
decorative field icons. The shared runtime projection also updates the Designer
and configuration preview while retaining the individual project Style bindings,
password visibility action and responsive field sizing. Updated the existing
Electron Login interaction for the new field structure. Validation was not
requested or run.

## About dialog link alignment: 2026-11-07

Centered the website address and icon in the About dialog card. Updated the
existing Electron smoke interaction to check its alignment. Validation was not
requested or run.

## Styles component icons: 2026-11-07

Removed the background boxes and enlarged the Styles component list icons while
keeping the row selection styling. Updated the existing Styles smoke interaction to
check the icon background. Validation was not requested or run.

## Nonvisual tray polish: 2026-11-07

The Designer tray uses the registered component icon shared with the palette,
with larger unboxed icons, compact cards, a horizontal header and visible keyboard focus. The existing
API Client Electron interaction checks icon parity. Validation was not requested
or run.

## Asaas boleto support: 2026-11-08

Expose the optional boleto due date, invoice URL and bank-slip URL returned by
RestGo as immutable, typed payment operation data. Preserve URL validation and
allow the available Asaas invoice to open during processing or overdue states.
Regenerate embedded sources and Monaco declarations, and document recovery and
the distinction between boleto issuance and financial confirmation. Source
generation includes its SDK declaration diagnostics; no separate tests, builds,
smokes or validation commands were requested or run. Live Asaas boleto issuance
and settlement remain unverified.

## Payments Inspector integration notice: 2026-11-07

The Inspector now displays the registered Payments dependency on RestGo when
the project's integration is disabled, with guidance to enable and configure it
in the RestGo sidebar. The notice remains visible across Inspector tabs and for
mixed selections. Updated the existing nonvisual Electron smoke interaction to
check the fixture's integration state. Validation was not requested or run.

## Automatic Payments workflows: 2026-11-07

Added one-call `Pay`, `Subscribe` and configured-mode `Checkout`: session
restoration, durable attempt recovery, original-key checkout creation, readiness
and explicit-action navigation are coordinated by the component. Matching
concurrent calls share the full workflow; browser/custom locks serialize the
same purchase across instances/tabs. Saved attempts are never silently replaced
after corruption, storage failure, or network uncertainty.

Default-on persistence, resume and observation settings are registry/model-owned.
Automatic resume restores/queries an existing operation without creating a charge
or redirecting; explicit Resume can recover a lost response with the original key.
Refresh, selected-subscription cancellation, history/cursor accumulation and
mode-aware confirmation coordinate observation internally. Added semantic payment,
subscription, history and state events plus typed convenience getters. Reusable
nonvisual identities now use placement-scoped runtime IDs, while model IDs remain
stable. Updated the existing language/Inspector/browser smoke contracts and the
English examples. Runtime sources/declarations are regenerated as implementation
work; tests, smokes, builds, typecheck, lint and formatting checks were not requested
or executed. Real provider/webhook evidence remains pending.

## RestGO Payments component: 2026-11-07

Implemented the session-only `RestGO.payments` gateway SDK and concrete
`WebPayments` nonvisual class for Stripe/Asaas checkout, operation queries,
pagination and subscription cancellation. Server-owned prices/credentials,
checkout preparation, financial state and database synchronization retain their
separate contracts, as recorded in [the integration plan](docs/restgo-payments-plan.md).
The component provides
typed public APIs/events, explicit navigation, serialized bounded observation,
checkpoint recovery, and auth/project-client lifecycle cleanup. Added strict
authoring-only model properties, registry/tray/Inspector/Interaction metadata,
Monaco declaration generation and compiler RestGO dependency selection. Updated
existing component enumeration fixtures and both runners' required smoke evidence
through the existing nonvisual/RestGO workflows. Added the delivered API and
TypeScript examples in [Payments](docs/payments.md). Runtime/SDK source snapshots
and declarations were regenerated as implementation work. No tests, builds,
smokes, typecheck, lint, or formatting checks were requested or run; validation
and real sandbox provider/webhook confirmation remain pending.

## v0.0.27 macOS Intel Preview timeout: 2026-11-06

Tag release run 42199526517 failed while the Icons F9 Preview was collecting
TypeScript diagnostics. The same commit's main verification passed, including
that interaction. Split diagnostic progress into options, syntactic, global and
semantic stages while retaining the complete sorted and deduplicated diagnostics.
This is instrumentation, not a demonstrated performance fix; preserve the smoke
deadline and obtain native hosted evidence before drawing further conclusions.
Local validation was not requested or run.

## macOS Intel packaging failure: 2026-11-06

For a004818, hosted validate, security, all portable jobs, and five release
builds passed. macOS Intel stopped while Forge copied packaging files with
`TypeError: fetch failed`; its log did not identify the URL or underlying cause.
No smoke diagnostics were produced. Retry the failed hosted job when authorized
and retain the exact-commit release gates; no source fix is established yet.

## Hosted formatting failure: 2026-11-06

Release and validation runs for d30c8ca stopped at Prettier on seven files.
Formatted those files and synchronized the generated runtime sources. Packaging
and Electron smokes were skipped by those jobs; the corrections have not been
validated locally or on a new hosted commit.

## Test battery corrections: 2026-11-05

Aligned the style property names with their definitions, kept Edit's essential
style shortcuts within the curated catalog limit, and updated compiler and
Electron smoke interactions for the composite Edit. The portable suite passed
1,772 tests, with 43 browser tests run separately and passed in Chrome. The
development, debugger, resources, packages, Report Builder and native viewport
Electron smokes also passed on Windows. The packaged and update smokes and other
native platforms were not verified.

## Edit icon Interaction: 2026-11-05

Added the typed OnIconClick Interaction and an accessible optional action name.
An icon with a bound handler becomes a native button with hover and keyboard
focus feedback; an unbound icon remains decorative. Updated the Edit smoke for
Interaction authoring, compiled pointer and keyboard activation, and hover.
The icon gap defaults to 4 px, and hover changes the icon color without
adding a background.
The icon is shifted up to 4 px toward its chosen edge, bounded by the field's
configured padding so it stays inside the border.
Validation was not requested or run.

## Edit icon: 2026-11-05

Added an optional decorative icon to Edit with Inspector selection and removal,
typed runtime/Monaco access, and style controls for position, size, gap and
color. Designer, compiled runtime, generated sources and existing Electron
smoke interactions were updated. Validation was not requested or run.
The default icon size is 24 px, with up to 2 px of vertical padding available
so the standard field does not clamp it to 22 px. It uses a softer gray in light mode; explicitly
configured style sizes and colors are preserved.

## Edit label: 2026-11-05

Added an optional accessible Edit label, a typed runtime property, shared
Designer/runtime rendering and label controls in Edit styles. The default
places a normal label above the field; positions, alignment, spacing, offsets,
colors and typography are configurable. Updated the existing Edit smoke for the
composite field and label. Validation was not requested or run.
The label defaults to #2e2e2e in light mode and #d4d4d4 in dark mode, including
in existing styles without an explicit label color.
The default gap between the label and field is 2 px.
The label uses fit-content height and normal line height by default; saved
explicit line heights remain available as style choices.

## Local release validation corrections: 2026-11-05

The Windows x64 release battery stopped at formatting in `docs/toast.md`; the
portable suite then reported four failures, and both standard Electron smokes
stopped when the Aurora template lacked WebToast. Added a Toast to the template,
aligned existing language and margin fixtures with its tray behavior, updated the
API Client error assertion for its diagnostic context, and corrected the Markdown
formatting. The packaged update smoke passed before these edits. These corrections
have not been validated; the complete local battery and hosted exact-commit release
gates remain necessary.

## API Client network diagnostics: 2026-11-05

Browser fetch failures in the API Client tester and runtime now include request
origins, method, credentials mode and troubleshooting guidance while retaining
the original error as the cause. Timeout, cancellation and HTTP response handling
remain separate. The existing Electron smoke includes a real blocked CORS response;
runtime sources were regenerated. Validation was not requested or run.

## Toast component: 2026-11-05

Added a tray-authored viewport Toast with Success, Alert, Danger and Notifier methods, typed states, per-state icons, duration and position, a shared four-state project style, runtime cleanup, and Inspector smoke evidence. Removed the public Show method in favor of the four state methods. Refined the Toast icon, spacing, dismissal affordance and motion, with 22px state icons and no background behind them; reserved unclipped shadow space in the viewport stack and Styles preview. The updated Styles smoke records all four states and shadow clearance. Runtime source snapshots were regenerated. Tests, typechecking, builds and Electron or browser smokes were not requested and have not been run.

## Hosted macOS Intel smoke timeout: 2026-11-04

Release verification of commit d3c7157 reached the global 240-second packaged
smoke deadline on macOS Intel while the workflow was still progressing. The
Menu and API Client designer checks passed; later browser and runtime evidence
was not reached. Preview typechecking repeatedly took several seconds, but the
original phase log did not distinguish program creation, diagnostics and
component-reference analysis. Added separate compiler progress phases to locate
the work responsible in a future hosted run without changing checks or deadlines.
This instrumentation is not a confirmed timeout fix and has not been validated.

## Windows and Linux ARM64 releases: 2026-11-04

Added native ARM64 Windows and Linux runners to both release matrices, with
architecture-specific installers, update targets, and complete six-target assembly.
Windows ARM64 updates use a temporary loopback Squirrel feed backed by the verified
ARM package; existing x64 feed URLs remain compatible. Updated release documentation
and existing release fixtures.

The requested local Windows x64 battery passed `npm run validate`, with 1,815 tests
in 242 files, browser tests enabled, and the existing two-worker limit. Added tests
for the ARM feed, package response, rejected requests, and cleanup; the focused
release and updater run passed 39 tests. All 15 Electron smoke flows passed, including
the packaged update UI fixture. The initial full suite exposed an obsolete API Client
test expectation after the empty response section was introduced; corrected it while
retaining the assertion that an HTTP error is not saved as a response schema. The
initial formatting check also found YAML syntax and formatting issues, now corrected.
Logs and smoke results are in `artifacts/arm64-test-battery/`.

The update smoke uses a simulated backend and does not install an update. Native
ARM64 builds, installers and updates and hosted exact-commit six-target verification
remain unverified; the local x64 run does not establish release readiness.

## Popup canvas presentation: 2026-11-04

Popup authoring shows a canvas-sized, theme-aware translucent backdrop and a
floating surface shadow while the Popup or a descendant is selected. The existing
Designer smoke records centered geometry, backdrop behavior and child insertion;
this change has not been validated locally.

## API Client editor UX polish: 2026-11-04

Organized the editor into request, settings, response and response-field sections,
clarified the shared Base URL and endpoint behavior, and added guidance for
discovering and selecting response fields. Improved typography, focus and compact
spacing while retaining request editing, authorization, sending and saved schema
behavior. Extended the existing Electron designer smoke with section, typography,
viewport and populated-response evidence. No validation, smoke, build or packaging
was requested or run.

## Inspector visual polish: 2026-11-04

Refined the shared Visual and Interaction Inspector presentation with more
readable 12 px labels and controls, larger editing targets, clearer section and
tab states, and keyboard focus indicators. The compact two-column layout and
component-specific editors remain shared across registry components. Extended
the existing Electron Interaction smoke and both runners' evidence requirements
to cover typography, editor size and horizontal layout. No validation, smoke,
build or packaging was requested or run.

## Release workflow feedback time: 2026-11-04

Release verification runs the unchanged portable suite on all four native runners
in parallel with the four packaging and smoke jobs. Both matrices prepare the same
release candidate and install dependencies independently. Assembly requires every
portable-test and build job to succeed, so publication retains the complete gate.
The additional jobs consume more runner capacity and may be affected by queueing.
The validate script also checks formatting before the long portable suite to report
style failures earlier. No validation was requested or run for this change; hosted
timing and complete native verification remain necessary before release readiness.

## Local test battery and corrections: 2026-11-04

The user requested the test battery and necessary corrections. The full portable
suite passed all 1,812 tests in 241 files with Chrome enabled, no skips and the
existing two-worker limit. Icon/runtime-source integrity, strict typecheck and
lint passed. Formatting found one function signature in ApiClientTesterDialog;
the repository Prettier corrected it and the full formatting check then passed.

The initial checkout was clean. Windows packaging, standard development/packaged
smokes, packaged updates and both resources flows passed. The Packages development
smoke then failed with UnknownVizError when taking its narrow-layout screenshot,
after actual registry installation and notebook geometry passed. Its screenshots
now use the existing presented-frame capture shared by Charts and Native Build,
including diagnostic and native-menu captures. Both runners require explicit
presented screenshot evidence; geometry, native interactions and deadlines remain
intact. Corrected development and rebuilt packaged Packages flows passed. All 15
Electron flows passed across this run: standard, updates, resources, Packages,
debugger, Web/PWA deploy, Native Build UI/export, viewport and ReportBuilder.
Final strict typecheck, lint, full formatting and all 16 existing runner/completion
tests passed after the smoke-only correction; the complete 1,812-test run preceded
that correction. Original failures and final results are retained under
`artifacts/test-battery-20261104/`. No installer, version change, commit, push,
tag or publication is part of this test run. Local results do not replace
exact-commit hosted platform verification.

## API Client authorization and response refresh: 2026-11-04

Added a compact Authorization tab for custom APIs: client defaults, per-request
inheritance/overrides, No auth, UTF-8 Basic Auth, Bearer Token and API Key in a
header or query parameter. Optional validated model definitions preserve existing
projects and manual headers. The editor and browser runtime share authorization
construction; typed connection/request/active-request properties and per-call
options support runtime credentials. RestGo managed modes reject custom
authorization, and conversion clears custom definitions. Credentials configured
in the editor are explicitly described as project/export data.

Successful Send responses now remove fields absent from the latest JSON sample,
including nested branches, while retaining matching node identities and edited
types. Empty/non-JSON successes clear the contract; HTTP/network failures retain
it. Saving uses the refreshed selection and generated type contract.

Updated the existing Electron API Client workflow and both runners' required
evidence for Basic Auth inheritance, real HTTP headers, save/reopen, endpoint
response refresh and compiled browser authorization. Updated the API Client guide
and synchronized embedded runtime sources and Monaco declarations. No tests,
smokes, typecheck, lint, validation, builds or packaging were requested or run.

## Hosted CI corrections for f1dc5cf: 2026-11-03

Inspected all six failed jobs in release 41738666945 and validate 41738666837.
Each stopped at the same Native Build IPC fixture: it awaited a second probe
before settling the cancelled first probe, contrary to the serialized inspection
contract introduced in f1dc5cf. All six suites reported one failure, 1,768 passes
and 43 optional skips. Security 41738666918 passed. Packaging and subsequent
smokes were skipped in these failed runs.

Updated the existing fixture to observe cancellation, assert that only the first
probe has started, settle it and verify stale-result rejection before awaiting
the replacement. The replacement must retain its live signal and return its
actual report. Production serialization, deadlines, assertions and release gates
remain intact. Original logs are retained under `artifacts/ci-f1dc5cf/`; see
`docs/ci-review-2026-11-03-f1dc5cf.md`.

No local tests, validation, builds or packaging were requested or run. This is a
local fixture correction; final-SHA hosted confirmation on all four platforms
is still required before release readiness. No commit, push, tag, version change,
installer generation or publication was performed.

## Hosted CI corrections for fc40e87: 2026-11-03

Monitored release 41733888779, validate 41733888853 and security 41733888935
through completion. Security, both quality validate commands and all four release
code/test/package stages passed. Windows and both macOS release jobs passed;
Linux packaged and development failed in Date Undo cleanup with a null tree row.
Windows development exhausted the unchanged 120-second functional deadline after
Menu, with repeated slow Rust probes and overlapping cancelled inspections.

Date cleanup now dispatches through the surviving page root, stops once its
component is removed within the existing four-command bound, and compares the
complete persisted page with the original. Both runners require that evidence.
Native inspections now await the previous cancelled process tree before starting
the latest request; superseded queued requests abort before probing. Requirements
effects follow the toolchain key rather than unrelated settings object identity.
Check again still performs a fresh inspection. No deadlines, assertions, worker
limits or release gates were relaxed. Original failed job logs are retained in
`artifacts/ci-fc40e87/`; see `docs/ci-review-2026-11-03-fc40e87.md`.

These are local corrections, not measured timing improvements or hosted proof.
No local tests, validation, builds or packaging were requested or run. The exact
corrected commit still requires native CI confirmation; no commit/push or release
publication was performed.

## Project resources smoke focus correction: 2026-11-03

Investigated both resources failures from the authorized release validation.
The packaged Unit retained `export {};` after native insertion; a focused
diagnostic run recorded an inactive page focus controller despite the Monaco
input being `activeElement`. Resources now scope Chromium focus emulation to the
workflow and restore it in `finally`, matching the existing Packages/Menu setup.
They await actual focused input and native Select All before replacing authored
text, and native field selection/value before applying an inline rename. Exact
saved Model/Unit comparisons, stable renamed IDs, duplicate-name rejection, all
resource/Preview/persistence assertions and existing deadlines remain intact.
Both runners require the more specific native-input evidence. Timeout diagnostics
include focus, selection/cursor, rename draft/error and resource identities.

Corrected development and rebuilt packaged resources flows passed, including
exact authored-file contents, F9, stable-ID rename, duplication and confirmed
deletion/persistence. Strict typecheck, lint and Windows packaging also passed.
The final development/packaged evidence strings passed, and all 11 existing
smoke-runner contract tests passed with linked temporary paths. Logs are retained
under `artifacts/resource-smoke-fixes-20261103/`. Earlier failed artifacts remain
available. This focused correction does not replace final-SHA hosted release
gates or claim a new full-suite run after the smoke-only changes.

## Full local release validation: 2026-11-03

The user requested the complete local test battery before preparing a release.
Validation uses isolated Node 26.12.1/npm 12.2.1, Chrome, the existing two-worker
limit and linked temporary paths. The first browser-enabled run passed 1,809
tests and exposed three failures: Aurora lacked WebDate, the ProgressBar fixture
expected obsolete 12px text, and the default-button typography fixture omitted
its default style binding. Added Date to the new-project form, summary and reset;
updated the existing fixtures. All four focused cases then passed.

Generated JSON now uses the repository Prettier configuration before writing or
checking, correcting the Date declaration formatting failure without changing
the declarations. Corrected `npm run validate` passed all 1,812 tests in 241 files
with no skips, generated-source checks, strict typecheck, lint, formatting and
Windows x64 packaging. The extended smoke matrix completed 15 flows: 13 passed.
Development and packaged standard, updates, packages, deploy and native-build UI
flows passed, as did debugger, native viewport and ReportBuilder flows. Both
resources flows failed: development timed out renaming a duplicated page to
ResourceRename; packaged saved the Unit with its original `export {};` still
appended to the inserted source. The retained files prove a content mismatch,
not a missing save. Those failures initially blocked local release approval;
the focused correction and verification are recorded in the entry above.
No blind reruns or deadline/evidence reductions were made.
Logs and command results are retained under
`artifacts/release-validation-20261103-190603/`. No commit, push, version change,
installer, tag or publication is authorized by this validation request. Local
Windows results cannot certify the final SHA on Linux or either macOS target.

## Customizable Edit masks: 2026-11-03

Added an opt-in Input mask Inspector section to Edit, with a pattern, letter-case
conversion and JSON custom character tokens. The bounded browser-only engine
supports Unicode rules, escaped literals, optional groups, repetitions and
alternatives. One typed WebEdit instance per element preserves configuration
through mounted/generated construction. Typing/paste, selection, separator
deletion, composition and programmatic values share the same formatter;
`rawValue`, `maskComplete` and `maskError` expose the runtime state. Existing
unmasked fields retain their defaults. JSON drafts stay outside the Project Model
until valid and committed. Registry metadata, compiler diagnostics, generated
Monaco declarations and embedded browser sources carry the same contract.

Documented the additive property format and Monaco examples. Updated the real
Electron interaction and both runners' required evidence for Inspector settings,
custom tokens, persistence and compiled native input. Source regeneration is an
implementation step. No tests, smokes, typecheck, lint, formatting checks, builds
or packaging were requested or run; runtime and rendered behavior are unverified.

## Date calendar minimum popup width: 2026-11-03

Added a 260px minimum only to the calendar popup so narrow date inputs do not
squeeze the month/year controls or overlap day cells. The input keeps its saved
width; the popup starts at the same left edge and grows to the right as needed.
Existing viewport width limits still apply on very small screens. Updated the
existing smoke geometry contract and documentation; regenerated runtime sources
and declarations. No tests, smokes, builds or validation commands were requested
or run.

## Date calendar aligned to both field edges: 2026-11-03

The user confirmed the component-owned calendar works and requested its left
edge line up with the date field as well. The popup now measures the entire
field, adopts its width and starts at its left edge, so both edges align. It
opens below the field's full height and retains viewport clamping, vertical
flipping and scroll/resize positioning. Updated both runners' required evidence
and the existing Date interaction to compare the actual open popup's left/right
edges and width with the field at the existing 1.5 px tolerance. Updated docs
and regenerated embedded sources/declarations. No tests, smokes, builds or
validation commands were requested or run; this refinement remains unverified.

## Date calendar right alignment: 2026-11-03

The user's follow-up screenshot shows the native popup still left-aligned; the
previous RTL-anchor workaround did not fix the behavior. Chromium's temporal
input implementation derives internal direction from locale, so an input `dir`
attribute is insufficient. Replaced the opaque native picker with a component-
owned calendar whose measured right edge aligns with the icon button. It uses
the Popover top layer, viewport clamping/vertical flipping and scroll/resize
repositioning, with month/year/day/keyboard navigation, Today/Clear, datetime
fields and Apply, existing limits, events, focus handling and disposal.

The public `showPicker()` and typed Date APIs stay compatible. Calendar drafts
remain transient; project formats do not change. Both Electron runners now require
the actual open popup's measured right edge, viewport containment, native Space
opening and day/time commit evidence, replacing the insufficient direction-only
assertion. Updated documentation and embedded runtime sources. No tests, smokes,
builds or validation commands were requested or run; the replacement's rendered
geometry and execution remain unverified.

## Complete Date component: 2026-11-03

Added the centrally registered `WebDate` / **Date** palette control, Inspector
date/datetime modes, three display masks, native calendar selection, optional
seconds, initial value, inclusive limits, required/read-only/disabled states,
accessibility and inherited field styles. Local ISO strings remain distinct
from displayed drafts and typed `.date` / `.datetime` (`Date | null`) accessors.
Calendar/time parsing rejects rollovers and nonexistent local date-times;
programmatic access includes validity, clear, current date/time and picker APIs.

Designer and runtime share the projection, with one instance per element to
preserve configuration through generated page/reusable construction. Added the
protected Default Date style, additive loading defaults, all theme presets,
compiler CSS ownership, generated Monaco declarations and embedded sources.
Updated existing registry-wide language fixtures and default-style count to
match the new component. Both Electron runners require a Date palette/Inspector,
persistence, native F9 typing, validity/event, geometry and Undo interaction.
See [Date](docs/date.md) for the public contract and [Project format](docs/project-format.md)
for persistence. Runtime source regeneration is an implementation step; no tests,
typecheck, lint, formatting checks, smokes, builds or packaging were requested or
run. Runtime and visual execution remain unverified. Changes remain local.

## Hosted 70dbbec Monaco smoke ownership: 2026-11-03

Tracked release `41613804410`, validate `41613804463` and security `41613804433`
at exact commit `70dbbec44d04e2bb79ce3d512cfbcabbfdc4028a`. All jobs finished:
security and release preflight passed; all six native jobs passed code checks, formatting, portable tests and
packaging before the shared Monaco smoke stopped them. Syntax evidence is now
healthy: 46 spans, four syntax classes, seven colors and all expected keywords.
The failure is the added language check returning null from the wrong DOM node.

Monaco writes native `data-mode-id` on the caller container and `data-uri` on
its child View root. The smoke now scopes to the main Code workspace, obtains
language from that view's nearest owning container, and reads resource on the
view itself. The TypeScript language assertion, original highlighting checks
and 20-second deadline remain intact. Both runners share the correction.

The [review](docs/ci-review-2026-11-03-70dbbec.md) documents the confirmed smoke
regression and source fix. Original logs/artifacts are retained under
`artifacts/ci-70dbbec/`, including all six downloaded/extracted archives.
These failed runs did not reach Login or later workflows; assembly was skipped.
The correction needs a new approved push and final-SHA hosted verification;
monitoring the original SHA does not validate local edits. No local test,
build, smoke, tag, version change or publication accompanies the source fix.

## Hosted fbd7d0e Electron corrections: 2026-11-03

Reviewed all eleven jobs in release `41569409213`, validate `41569409180` and
security `41569409165` at exact commit
`fbd7d0ee04794c4962483a47ab9aa884da6aa4f2`. All six native jobs passed code checks,
formatting, portable tests (1,769 passed, 43 skipped) and application packaging.
The previous Interaction fixture and formatting corrections passed. Security
and release preflight passed. Downloaded all six smoke artifacts and retained
original logs, models, screenshots and metadata in `artifacts/ci-fbd7d0e/`.

Five jobs failed the same Login mobile assertion: Default Edit's 14 px utility
overrode the template's 16 px floor through CSS layer ordering. WebEdit's shared
structured font-size projection now combines authored sizes with a responsive
floor set only by Login, preserving larger custom sizes, desktop typography,
theme/state behavior and saved model values. Regenerated embedded runtime
sources and updated the existing Login evidence required by both runners.

Linux packaged stopped earlier with neutral Monaco syntax tokens. CodeEditor
now enforces configuration before project-model creation, including effects
that run before the React loader's `beforeMount`. The normal App open path can
already preconfigure Monaco; this is initialization hardening, not proof of the
original Linux cause. A single eager owner registers the
TypeScript metadata and official grammar; semantic services remain lazy. Existing
smoke diagnostics include model language and editor visibility. Original
artifacts do not prove the exclusive tokenizer state; hosted confirmation is
still required. Assertions, deadlines, strictness and platform gates remain.

The [detailed review](docs/ci-review-2026-11-03-fbd7d0e.md) records each job,
artifact, cause and evidence limit. No local tests, checks, builds, packaging or
smokes were requested or run. These source corrections remain uncommitted; no
push, tag, version change, installer or publication was performed. Final-SHA
hosted verification and assembly remain required before release.

## Hosted d9207b2 validation corrections: 2026-11-02

Reviewed all eleven jobs in release `41547033292`, validate `41547033369` and
security `41547033332` for exact commit
`d9207b26d1d313bfd2014208ad01bb3a68ae5bcf`. Both security jobs and release preflight
passed. All four release targets passed generated-source, strict TypeScript and
lint checks, then stopped at formatting in `component-registry/src/registry.ts`
and `language/src/generator.ts`. Applied Prettier to those two files.

Both quality jobs reported the same single language-test failure: 1,768 tests
passed, one failed and 43 were skipped per host. The registry-wide Interaction
fixture omitted `Audit.generated`, now referenced by Data Grid's generated row
type argument. It now supplies real model-generated document declarations and
uses matching component names, preserving the exact diagnostic expectations,
all registered events, native completions and hover checks.

The [detailed review](docs/ci-review-2026-11-02-d9207b2.md) records the individual
jobs, causes, corrections and evidence limits. Six original decoded failure
logs, job metadata and empty artifact inventories are retained under
`artifacts/ci-d9207b2/`. Packaging, application smokes and assembly were not
reached in the hosted runs. No local tests or validation checks were requested
or run; source formatting was a corrective write. Changes remain local, with no
commit, push, tag, version change or publication. A corrected final SHA still
requires hosted verification.

## Typed Data Grid row field access: 2026-11-02

Data Grid cell events expose `getValue.fieldName` alongside the existing
`getValue('fieldName')` and JSON Pointer calls. Generated page and reusable
modules derive each grid's `GridNameRowValue` from its selected API operation
and response-list contract, including nested fields and nullability. Registry
metadata makes newly created and reopened handlers use that row type through
`WebDataGridCellEventDetail<TRow>`; AST edits preserve authored handler bodies
and explicit custom row types. Grids without a saved response contract retain
unknown row types. Runtime/editor declarations and embedded runtime sources
are synchronized, and existing handler-signature expectations are updated.
No tests, typecheck, lint, smokes, builds or packaging were requested or run;
Monaco and compiled execution remain unverified.

## Default style typography and alignment polish: 2026-11-02

Seeded Default styles now share Roboto at 14px/20px (Button: 15px/20px) across all four theme
presets, Designer, Styles, Preview and generated applications. Buttons center
the icon/caption group, use normal weight (400), retain 8px corners and use 22px icons,
a 6px gap and balanced padding that fits the initial 100 by 36px geometry.
Fields receive explicit matching typography/padding; labels and checkboxes use
regular weight, checkbox controls have stable size/margins, Label alignment
uses the full caption width, and progress/chart text uses the readable baseline.
The IDE interface now loads bundled Roboto directly; the `ide` font choice and
new Styles typography values follow that default. Authored code keeps its
existing monospaced editor font. Saved project typography remains project-owned.

Updated bundled example defaults, existing model/browser expectations, and the
real Electron template/button interactions and evidence required by both smoke
runners. Runtime source snapshots are regenerated for the shared CSS/font
projection. No tests, smokes, typecheck, lint, checks, builds or packaging were
requested or run. Rendered appearance and geometry remain unverified.

## Project Settings discard confirmation polish: 2026-11-02

Refined the confirmation with consistent 24 px horizontal spacing, a compact
title, muted description, and an inset action footer using existing theme
surfaces. Buttons retain their labels and behavior, with a visible keyboard
focus ring. The shared Electron smoke now requires inset actions, minimum button
height and no horizontal overflow; both runners retain the existing draft
protection evidence. Validation was not requested and was not run; rendered
appearance remains unverified.

## Hosted 7e5d5fa RestGO readiness race: 2026-11-02

Reviewed all jobs of validate `41453460002`, security `41453459874` and release
`41453459804` at exact commit `7e5d5fa7a9f80143febc7c71675a55a0cf195800`.
Validate/security passed. Linux and both macOS release jobs passed, including
Intel's four Charts presented screenshots and complete packaged/update workflows.
Only Windows release failed, after Charts and Menu succeeded: API Client waited
for an enabled development-login fieldset. Its timeout evidence described only
the already-closed API Client dialog, so it did not distinguish a missing login
form, disabled integration, pending status or an unexpected saved session.

Found a concrete readiness defect in the smoke: integration setup returned
success after calling `.click()` without checking the checkbox result, and
control helpers read only the own `disabled` property. A disabled fieldset can
disable descendants whose own `disabled` is false; Chromium ignores their clicks.
Also, a disabled Apply button could represent pending work instead of an applied
configuration. This explains a possible skipped activation without proving the
exclusive original runtime state, which the old diagnostics did not capture.

API Client and the companion RestGO settings flow now respect effective
`:disabled` state, await edited values/checked state, and require settled
configuration with the enabled flag and expected instance URL projected from
the Project Model before continuing. Both runners require the new development
connection evidence while retaining login, renewal, synchronization, credential
isolation and logout requirements. Timeouts now report RestGO workspace, model
projection, draft, busy and development-form states without input credentials.
No deadlines, retries, security settings or product behavior were changed.

Original logs, Windows screenshots/project and a detailed report are preserved
under `artifacts/ci-7e5d5fa/`. No local tests, checks, builds or smokes were
requested or run. Source edits were formatted as part of the correction; no
commit, push, tag, version change or publication was performed. A native hosted
run of the corrected commit remains necessary before claiming this race solved
in execution or the release ready.

## Hosted bcae7aa follow-up: 2026-11-02

Monitoring validate `41447975967`, release verification `41447975955` and security
`41447975951` for the exact pushed commit `bcae7aab0680eee834f870a52f3d5c74d774d170`.
All three workflows have now finished. Security passed. All four release
platforms passed strict types and lint, then failed `format:check` on the call
in `native-build-smoke.ts`, before portable tests, packaging or Electron smokes.
Both quality jobs passed 203 test files / 1,769 tests, with 38 files / 43 tests
skipped, then failed the same formatting gate. Assemble/publication were skipped
and the release run produced no artifacts. Applied the repository's Prettier
formatting to that file without changing behavior or capture budgets. The six
original job logs and final report are retained under `artifacts/ci-bcae7aa/`.
These runs do not confirm the native screenshot correction because no Electron
smoke was reached.

No local validation, commit, push, tag or publication was requested or performed
for this follow-up. Formatting the identified source is the corrective edit;
the hosted result still refers to the uncorrected commit until a new push.

## macOS Intel v0.0.22 screenshot failure: 2026-11-02

Investigated tagged release run `41443336802` at `e5c54af`. Windows, Linux and
macOS ARM64 passed; Intel passed portable tests and packaging, then stopped in
Charts with Electron's `UnknownVizError` during screenshot readback. Later smoke
requirements were never reached, and assemble/publication were skipped. Original
failure diagnostics are retained locally under `artifacts/ci-v0.0.22/`.

Extracted Native Build's existing presented-frame capture into a shared smoke
helper and applied it to Data Grid/Charts. Observe a temporary pixel and its
removal in real compositor frames, then save the delivered image directly;
DOM animation-frame callbacks alone cannot establish presentation readiness.
Keep hidden offscreen rendering, geometry/focus/scroll assertions, empty-image
failures and existing native budgets. Both runners require presented Charts
screenshots and preserve cached PNG evidence on failure. No retries or relaxed
functional requirements were added. The original log does not isolate why Viz
failed, so this change still needs native Intel confirmation.

No tests, builds, formatting checks or smokes were requested or run for this
correction. No commit, push, tag, version change or publication was performed.

## Release-candidate validation: 2026-11-02

Full local validation and corrective work were explicitly requested. Preserve the
existing uncommitted Packages, Login, routing, compiler and editor work. Use the
repository's Node 26.12.1/NPM 12.2.1 toolchain, Chrome-enabled portable tests and
the existing two-worker configuration. Execute validate and real development,
packaged and updater smokes; include the scoped Packages workflows affected by
the latest UI edits. Record failures, corrections and final evidence under
`artifacts/release-readiness-2026-11-02/`. Execution is in progress; no passing
result or cross-platform release readiness is implied. Tags, publication and
version changes remain outside this local validation task.

The initial Chrome-enabled portable run reported 1,795 passing and 17 failing
tests. Corrected canonical-path handling in compiler package boundaries and
Monaco declaration snapshots, restored the missing public Label wrap helper
declarations, and updated existing Login/style/navigation/color fixtures for the
current product contract. All 115 tests in the nine affected files passed on the
linked-temp rerun. The complete corrected validation and Electron evidence are
still in progress.

The complete validate then passed all 1,812 tests with no skips, formatting,
strict checks and Windows x64 packaging. Real Electron execution exposed stale
Label/Page-root selectors and Login fixture preconditions: inspect visuals by
stable ID outside the selection overlay, toggle the root through its actual tree
row, seed/restore missing default styles only in the isolated legacy fixture,
and use an anonymous memory-only client for visual geometry independently of the
existing authentication HTTP fixture. Measure the visible email input and await
its real CSS size transitions before checking mobile touch sizing. Preserve all
deadlines and requirements; retain computed-style/geometry diagnostics on failure.
The final complete `npm run validate` after these corrections passed 241 files /
1,812 tests with Chrome enabled and zero skips, plus strict types, lint, icons,
generated-source checks, formatting and Windows x64 packaging. All eleven smoke
flows passed: development/packaged standard, packaged updater, development/packaged
Packages, debugger, project resources, Web/PWA deploy, Native Build UI/export,
native viewport and ReportBuilder Electron. Production audit found zero
vulnerabilities. Logs, original failure diagnostics and the result matrix are in
`artifacts/release-readiness-2026-11-02/REPORT.md`. No commit, push, tag, version
increment, installer or published release was produced. These working-tree
Windows results do not replace final-SHA hosted validate/security and all four
native release platforms; actual Tauri WebViews and installed updates remain
outside this local evidence.

## Compact Packages dialog for notebooks: 2026-11-02

Preserved the Packages panel design while bounding the dialog to 940 by 600 px
and the available viewport. Reduced header/footer padding, field spacing, card
padding and log height. The body now uses a bounded flex layout; package lists
scroll inside their panels instead of increasing the dialog's natural height.
Header and footer remain outside the scrolling body. Narrow screens keep stacked
panels and body scrolling for access to all controls.

Updated the existing real Electron smoke and both runners' required evidence for
1366x768 and 1280x720 notebook geometry, visible actions and list scrolling,
retaining the narrow-screen assertions. Validation was not requested and was not
run for this change.

## Packages dialog visual polish: 2026-11-02

Separated manual installation, installed dependencies and registry search into
clear, theme-aware surfaces. Added compact section icons/counts and useful empty
states, balanced field widths, consistent controls and spacing, and a quieter
operation-log disclosure. Restore is aligned to the left of the footer; Close
remains on the right. Narrow layouts stack the panels and keep actions reachable.

Updated the existing development/packaged smoke interactions and required
evidence for the new empty-state panels and narrow geometry. Validation was not
requested for this visual change and was not run; the earlier NPM implementation
results below do not validate this new presentation.

## Project Packages / NPM: 2026-11-01

Implemented project-owned manifest/lockfile persistence, controlled
external NPM operations with lifecycle scripts disabled, Project Packages dialog
and Explorer actions, installed declaration snapshots for the existing Monaco
TypeScript service, and isolated esbuild/typecheck resolution shared by Preview,
Debug and publishing. Existing dirty-worktree features are preserved. Declaration
navigation uses a lazy read-only Monaco viewer. Existing embedded vendor names
are explicitly reserved to prevent installing an alternative version that would
be shadowed by the compiler's retained built-in aliases.

The user explicitly requested integration/regression tests and development and
packaged IDE evidence. Real NPM installation, restore, update/removal, cancellation,
isolation and real axios/dayjs browser HTTP execution have passed focused tests.
The final consolidated suite passed 25 files / 269 tests with no failures or
skips. Root typecheck, zero-warning lint, runtime-source check and Windows x64
portable packaging passed. The real development and packaged Electron workflows
both passed installation/search, Explorer versions, desktop/narrow geometry,
native menu contrast, typed Monaco completion/hover/diagnostics and read-only
definitions, Unit/Page F9, Debug breakpoints/value inspection, static Web/PWA,
reopening, missing dependencies, locked restore, update/removal and unresolved
imports. Captures and logs are in `artifacts/npm-packages-20261101/REPORT.md`.
Actual native Tauri execution, other operating systems and hosted exact-commit
release verification remain unexecuted; no installer or release was produced.

## Login responsive height default: 2026-11-01

New Login placements default to responsive fit-content height. Registry creation
now honors the registered Responsive width/height property defaults, so the
Inspector and persisted layout agree without IDE type-specific insertion logic.
Existing placements retain their authored sizing. Validation was not requested
and was not run.

## Login submit button alignment: 2026-11-01

The primary Login action uses fit-content width and is horizontally centered
as a whole inside its panel. Inline important width, maximum width, align-self
and horizontal margins keep linked Style utilities from stretching or moving
the button. Caption alignment continues to follow the linked Button Style.
The existing smoke checks the button's centered position and content-sized width.
Other Buttons remain unchanged.
Shared runtime CSS covers Designer, configuration preview and generated apps.
Runtime sources regenerated; validation was not requested and was not run.

## Preview entry scaffold recovery: 2026-11-01

Added a shared TypeScript AST migration for a partially renamed entry scaffold:
`pages/index.ts` can still export its former page class even though the model
already names the entry `index`. Opening and saving now reconcile an unambiguous
exported class with its matching generated-base import, including an already
renamed `indexGenerated` base. Preview compilation applies the same migration to
its in-memory source graph. Current classes, custom exports and ambiguous
scaffolds are left for normal TypeScript diagnostics; authored methods/comments
are preserved. Existing legacy source-key and breakpoint migration remains in
place. No project format change is required.

Code review only. Tests, typecheck, lint, builds and Electron smokes were not
requested or run. The reported Ubuntu project has not been inspected or executed,
so confirmation against that exact source and platform remains pending.

## Login internal project Style bindings: 2026-10-31

Replaced the Login Appearance editors with a Styles tab that links every internal
container, label, field, checkbox, action and feedback message to a compatible
project Style or None. Save materializes stable IDs through the existing Designer
command; preview and Inspector use the same style library. Selected Styles own
paint, typography and interaction states, retaining compact structural defaults
and 20 px panel padding unless the selected Style explicitly overrides them.

Added Registry-owned embedded-style metadata, generic catalogue projection and
retention in the compiler, and a shared Designer style context. Runtime classes
apply the normal utility classes and retain compatible catalogues for authored
configuration changes. Project validation rejects missing/incompatible IDs;
deleting a removable Style clears its internal bindings atomically. Saved Login
configurations without bindings retain legacy paint until their modal is saved.
No project/configuration version bump is needed. Updated the real Electron smoke
selectors and required evidence for type filtering, None, persistence and F9.
Popup configuration previews include the same styled child host and close action
as the runtime; embedded style retention also covers retained menu definitions.

Runtime sources and Monaco declarations regenerated. Tests, browser/Electron
smokes, typecheck, lint, formatting checks, builds and packaging were not requested
and were not run. Visual/runtime verification remains pending.

## Login panel padding: 2026-10-31

Set the default Login panel padding to 20 px on all four sides in desktop and
mobile. Updated the complete previous compact preset while preserving custom
spacing combinations, and removed the narrow-container padding cap. Existing
Electron geometry assertions now require the same 20 px padding in both views.
Runtime sources/declarations regenerated. Validation was not requested or run.

## Login account recovery: 2026-10-31

Added compact email-request and new-password forms to the Login component,
using the RestGo SDK's anonymous password-reset endpoints. Recovery has its own
configuration tab, localized editable texts, enablement, automatic-link control
and optional return URL. Registry events and the typed runtime/Monaco API cover
request acceptance, reset completion and programmatic view/link handling.

An internal browser broker captures and cleans reset links before the router
constructs authored pages, restores Hash route context, preserves other queries
and delivers only to an eligible placement. Tokens stay outside project data,
DOM, storage and event payloads and are discarded on hiding/view/configuration
changes, completion or disposal. Resets validate confirmation, retain server
error feedback and return to login without creating a session. Older projects
receive recovery defaults within existing format/configuration versions.

Updated the Aurora example, documentation, generated runtime/declarations and
existing Electron UI/HTTP-fixture smoke interactions and required evidence.
Validation was not requested and was not run; real SMTP delivery and a deployed
RestGo instance have not been exercised.

## Preview authentication investigation: 2026-10-31

Inspected the last-opened project's Connection settings: RestGo and session
persistence are enabled with local storage. Its current project/backend/storage
scope has no encrypted Preview credential file. That observation alone does not
identify a storage failure or establish whether a backend rejected a session.

Focused isolated Electron reproductions using the actual Preview server and
runtime/SDK restored a fixture login after revoking and republishing the Preview,
including a localhost parent and a separate loopback Preview origin. The Debug
Preview path omits the persistent session adapter and creates a fresh in-memory
Electron partition on every execution. Reproducing that lifecycle lost the login
on the second execution, confirming a debugger persistence defect. The reported
normal F9 failure remains unconfirmed against the live backend. No application
code was changed; no full suite, packaging or live credential login was run.

## Compact Login forms: 2026-10-31

Reduced the default template to 14 px typography, 16 px padding, 8 px gaps and
36 px desktop inputs/buttons. Remember and password visibility share a single
row, headings/actions have tighter spacing and cards fit their content. New
placements use 420 by 400 px; the configuration modal retains its wide preview
and reduces to 620 px height. Narrow/touch layouts preserve 44 px controls and
16 px input type. Only the complete original spacing preset is normalized to
the compact defaults; independently customized combinations remain unchanged.
Updated the Aurora example, protected default style, documentation and existing
Electron smoke interactions/evidence. Runtime sources and declarations were
regenerated. Validation was not requested and was not run.

## Login Aurora defaults: 2026-10-31

Replaced the template's flat default paint with Aurora-style surface/input
gradients, gradient borders, a primary-to-accent button, elevation and hover/focus
feedback. Gradient endpoints, heading and focus colors use project theme roles
and remain editable. Legacy customized base colors receive matching solid end
colors unless endpoints were explicitly saved, preserving authored choices.
The additive optional settings retain configuration version 1 and project format
v2. Removed inherited IDE modal padding from the embedded Login form so its
projection matches runtime spacing. Updated docs and the existing Electron smoke
appearance/evidence contract. Embedded sources and declarations regenerated;
validation was not requested and was not run.

## Wider Login configuration preview: 2026-10-31

Balanced the desktop modal columns equally, expanding Preview from 360 px to
approximately 520 px within the existing modal width. Removed the preview's
percentage width compensation to keep its scaled surface within the available
area. Narrow-window stacking is retained. Updated the existing smoke geometry
contract to require the wider column and no horizontal canvas overflow.
Validation was not requested and was not run.

## Compact Login configurator: 2026-10-31

Polished only the Login modal: reduced its desktop footprint to 1040 by 680 px,
compacted the header, tabs and footer, adopted the shared modal close control,
and arranged settings in two columns. The preview has its own scroll area and
an editor-only visual scale; saved Login appearance and runtime controls remain
unchanged. Dedicated container rules preserve a scrollable stacked layout in
narrow windows. Updated the existing Login Electron smoke geometry/evidence
contract. Validation was not requested and was not run.

## Configurable Login template: 2026-10-31

Added Authentication > Login with a Registry-owned configurator and a concrete
typed WebLogin runtime composed from Panel, Label, Edit, Button and CheckBox.
The agreed first-version scope is email/password login and registration only,
with customization through the modal. Panel/Popup presentation, fields, English
and Portuguese texts, theme-aware colors, typography, spacing, remember behavior,
optional post-registration login and post-login hiding are saved in a version-1
configuration inside project format v2. Existing projects receive the additive
protected default Login style without replacing authored styles.

Designer, configuration previews, Monaco, compiled Preview and generated browser
sources share the contract. Runtime/authored constructors retain one instance per
physical placement; subscriptions, native dialog state and passwords are disposed
with it. RestGo startup restoration is awaited, registration remains anonymous by
default and event payloads exclude credentials/tokens. Added the template to Aurora
and updated the actual Electron UI/HTTP-fixture smoke interactions and evidence
requirements in both runners. Documentation records configuration and API behavior.

Required runtime sources and declarations regenerated. Tests, Electron/browser
smokes, typecheck, lint, formatting checks, builds and packaging were not requested
and were not run. Runtime and visual verification remain pending.

## Label Inspector color: 2026-10-31

Removed the redundant Color editor from Label through Registry Inspector metadata;
text color remains configured through Style. Retained the legacy property metadata
for existing project compatibility. Updated the existing Electron Label selection
evidence to require the Color field to be absent. Validation was not requested
and was not run.

## Implicit Page Inspector property edits: 2026-10-31

Property changes now target the active document root when the selection is empty,
matching the Page properties displayed by the Inspector. This fixes ignored
Browser title edits and other root properties in that state, including root
rename and dimension handling. Existing explicit selections remain the targets.
The existing Page title Electron smoke now deselects the root before editing and
saving the title, retaining its persistence and compiled F9 assertions.
Validation was not requested and was not run.

## Label text wrapping: 2026-10-31

Added Registry-owned Text wrap options: none, word, break-word and character.
The saved property is projected in Designer and browser runtime, with a typed
WebLabel API and Monaco declarations. Auto Size retains the configured width
when wrapping and fits the runtime height. Legacy labels without textWrap keep
their style-driven whitespace behavior. Embedded runtime sources regenerated.
Validation was not requested and was not run.

## Typed page navigation parameters: 2026-10-31

Implemented page-owned scalar input declarations with required/default settings,
a Registry-driven Inspector editor, persistence and Designer undo/redo. The
shared generated navigation map supplies destination-aware `Navigate` inputs to
Monaco and compilation. Each page receives an immutable concrete `params` type;
bare `params.id` and explicit `this.params.id` share the existing AST/symbol-based
instance contract, including lexical shadowing and repeating-row isolation.

The router accepts new query values, serializes typed navigation inputs for
History/Hash and new-window URLs, validates before programmatic activation and
installs the context before authored construction and lifecycle events.
Same-page changes retain the instance and emit OnParametersChanged. Explicit
values replace previous queries by default; merge/preserve are explicit options,
and legacy calls without values retain their previous behavior. Updated the real
Page Inspector Electron smoke interactions and required evidence in both runners.
Documentation describes the additive page-format-v2 field and public API.

Reviewed the model, runtime, compiler, Monaco and Inspector wiring and regenerated
embedded runtime sources with npm run runtime:sources. Legacy Hash calls retain
the original location of their query, while explicit inputs use the route query.
The mutable context helpers remain internal to the runtime. Tests,
browser/Electron smokes, typecheck, lint, formatting checks, builds and packaging
were not requested and have not been run. Runtime/UI verification remains pending.

## Release corrections and template verification: 2026-10-30

Added the missing API-bound Charts example to the editable Aurora Data page,
including a typed point-selection handler and tutorial documentation. Preserved
the template's all-components guard. Browser fixtures now load both WOFF/WOFF2
fonts and serve extracted Designer CSS. Report Builder color helpers emit the
final native change before changing selection, and the style workflow expects
the protected Default Charts style. Resource smoke readiness checks the selected
document tab instead of requiring a new unit's name inside its empty source.
Formatted the affected files and regenerated runtime sources/declarations.

Focused browser checks passed for the eight former bundling failures and both
Report Builder cases. Added explicit template coverage: both templates serialize
in all four themes, compile and navigate through every page in real Chromium,
using Preview and exported output. Aurora loads all five bundled chart points
and executes its typed point handler through native browser input. Template
verification passed, with screenshots retained under
artifacts/release-fixes-20261030-200934/templates. Complete npm run validate passed:
1,763 tests in 230 files, no failures or skips, strict TypeScript, lint, generated
sources, formatting and Windows x64 packaging. All 13 Electron variants passed,
including standard development/packaged Charts workflows and both resource
workflows. Final evidence is in artifacts/release-fixes-20261030-200934/REPORT.md.
Local Windows validation is complete; exact-SHA hosted verification on all four
required platforms remains necessary before a release tag. No installer, version
change, commit, push, tag or publication was performed.

## Full local release-candidate validation: 2026-10-30

Executed the requested complete local matrix on the existing Charts/color-input
working tree over 28d08ad170fd44dc115cf0d203945b5c4a1f30df, using isolated Node
26.12.1/npm 12.2.1 and Chrome. Icons, generated sources, strict TypeScript, lint and
Windows x64 packaging passed. Portable tests completed with 1,750 passed,
11 failed and no skips across 229 files. Eight browser cases failed fixture
bundling after Charts introduced font CSS; two Report Builder cases failed color
assertions; one IDE case expected the previous default-style count. Formatting
failed in 15 files. Nine of 13 Electron variants passed. Both standard smokes
stopped because Aurora lacks registered WebCharts; both resource smokes timed out
waiting for ResourceHelpers inside an editor containing export {};. Later standard
workflows were not reached. Original diagnostics and projects are retained;
details and command logs are in
artifacts/release-validation-20261030-195549/REPORT.md. No product/test corrections,
installer, version change, commit, push, tag or publication were performed. Release
remains blocked pending corrections, complete local revalidation and exact-SHA
hosted verification on all four required native platforms.

## Charts preview stays visible while editing: 2026-10-30

Bounded the Charts dialog body to the available viewport and gave configuration
controls their own scroll area. Scrolling the fields leaves the preview in place;
on narrow windows the preview occupies a separate row above the scrollable fields.
Header and Save/Cancel remain visible. Updated existing Electron smoke geometry
interactions and required evidence to cover preview position after scrolling the
controls at desktop/narrow widths and in both themes. Validation was not requested
or run; rendered geometry verification remains pending.

## Shared native color picker responsiveness: 2026-10-30

Centralized native color inputs across Inspector, Styles, Themes, Menu, Charts,
project settings and Report Builder. Continuous native input stays local to the
picker; editor/model updates receive the latest color after 120 ms of inactivity,
or immediately on native change/blur. This avoids rerendering whole editors and
rebuilding previews for each drag sample. External values still synchronize;
unmounting cancels pending work and selection-scoped fields remount on identity
changes. Theme swatches remain immediate, and PWA fields retain accessible inline
validation. Updated existing Electron/browser fixture color interactions to emit
the final native change, including required Charts smoke evidence. No validation
commands were requested or run; native drag responsiveness remains unverified.

## Charts typography and title icon: 2026-10-30

Added independent general/legend font selectors, general/title/subtitle/legend
text colors with inheritance resets, and the existing searchable Lucide picker
for an optional title icon. The shared SVG projection applies these choices in
Designer, the live editor preview and generated applications. Older chart
configurations retain inherited appearance through additive optional/defaulted
fields in schema version 1. The compiler includes selected font faces/licenses;
design-time previews load local font families. Updated the existing Charts smoke
interactions and required evidence for colors/fonts, title icon and save/cancel.
No tests, smokes, typecheck, lint, formatting checks, builds or packaging were
requested or run. Regenerated runtime sources and Monaco declarations with
npm run runtime:sources. Runtime/visual verification remains pending.

## Data Grid and Charts component icons: 2026-10-30

Updated the central registry icons: Data Grid uses the Lucide table glyph with
visible rows and columns; Charts uses combined columns and a trend line. Shared
component rendering applies both icons consistently in the palette and element
tree. Updated the existing Electron palette interactions and required development
and packaged smoke evidence for these glyphs. Validation was not requested or run.

## Charts component: 2026-10-30

Implemented a first-class WebCharts component across the Project Model,
Registry, Designer, browser runtime, compiler and Monaco. The confirmed limit
is five independent API-bound series, with multiple response rows per series.
The editor covers eight chart types, schema-driven label/numeric-value bindings,
presentation controls and transactional Save/Cancel. Typed point-click events
carry label, value and stable series identity. Shared SVG rendering covers missing
categories, negative values, duplicate-label occurrences, keyboard activation,
accessible data tables and extreme finite measurements. Added the protected,
theme-linked Default Charts style and chart/client clipboard reference remapping.
Generated runtime sources and public declarations with npm run runtime:sources;
reusable instances own their subscriptions. Updated existing component/style
fixtures and the real development/packaged smoke interactions and required
evidence for the Charts editor, source limit, save/reopen/cancel and screenshots.
These smoke changes have not been executed. No tests, smokes, typecheck, lint,
formatting checks, builds or packaging were requested or run. No commit, push,
tag, version change or publication was performed.

## Hosted lint correction: 2026-10-30

Inspected all six failed jobs for 9eb7de75ca9c287b14979d6cf7df020b7c1476fe:
release 41054552210 (four platforms) and validate 41054552244 (Windows/Linux).
Every job stopped at the same two no-useless-assignment errors in menu-smoke.ts.
The diagnostic variables were initialized before a loop that always overwrites
both before any read. Removed only those dead initializers and declared explicit
number types; the loop assigns them before evaluating timeout evidence. Retained
strict types, lint rules, smoke deadlines, assertions and compiler changes.

Both runs contain zero artifacts: lint failed before packaging and smoke
execution. This is a new diagnostic-code regression, not evidence of another
macOS Preview timeout. Security passed; icons, generated sources and typecheck
passed before lint in the failed jobs. Saved each failed job's original log and
run/artifact metadata under artifacts/ci-9eb7de7/. No local validation was
requested or run. The original Intel timing correction remains unconfirmed until
the updated commit reaches and passes the native smoke. No commit, push, tag,
installer or publication was performed.

## Tagged release Menu compilation follow-up: 2026-10-30

Release 41047683011 for v0.0.19 / 74fb1ed58f66785378373ebfe317da507534eab9
failed only on macOS Intel in the packaged Menu Interaction F9 smoke. Preflight,
code checks, portable tests and packaging passed; Windows, Linux and macOS ARM
completed their build jobs. Assembly/publication were skipped. The same SHA's
earlier branch release verification 41044475333 and both branch/tag validate and
security runs passed; these do not override the failing tagged smoke.

The failing Preview took 11,007 ms against the unchanged 10-second Menu wait:
typecheck 5,509 ms, bundle build 1,559 ms and observed bundle-output interval
3,260 ms. Its later timeout evidence already contained the published Preview URL.
The successful Intel branch run completed this F9 in 3,751 ms. The logs establish
a timing failure, not an exclusive native scheduler or bundle-output root cause.

Removed the compiler's unnecessary whole-Program invalidation when root files
change. Adding the smoke page/reusable had discarded the previous parser graph;
compatible builds now reuse exact-content SourceFiles while TypeScript reconciles
the current roots, resolves imports and computes strict diagnostics again. The
cache still retains only the latest Program and clears the old host capture.
Menu timeout diagnostics now separate the last poll's result/start/end from the
later evidence timestamp, without changing waits, assertions or required markers.
Retained the original diagnostic archive/project under artifacts/ci-74fb1ed/.
No local validation was requested or run. The correction's native timing and
full success require hosted verification of the updated commit; no commit, push,
tag, version change, installer or publication was performed.

## Hosted Actions follow-up: 2026-10-30

Tracking commit 068dfe86caed5729de79fba55a05a1d80c7aaa15. Security passed;
release verification 41037777200 passed Windows x64, Linux x64, macOS ARM64 and
macOS Intel, including packaged/update smokes, distributables and final assembly;
publication was skipped. Intel portable tests passed after 15m26s.
Validate 41037777128 passed Linux but
failed the Windows packaged smoke: compilation completed in 1,733 ms, then the
Preview navigation failed with Chromium -176 ERR_NO_BUFFER_SPACE. The later
empty-title assertion is secondary to the failed navigation.

Added a Windows startup mitigation for upstream Chromium issue 572515601:
disable TcpPortRandomizationWin before app readiness, preserve other disabled
features, and use the OS default port allocator for ordinary IDE and smoke
sessions. This matches the upstream loopback failure report; hosted logs alone
do not establish the exclusive Winsock cause or prove the mitigation. Load-failure
logs now identify the URL and main/child frame. Retained the original failed
artifact under artifacts/ci-068dfe8/. No local validation was requested or run;
no commit, push, tag, version change, installer or publication was performed.

## Local release-candidate validation: 2026-10-30

The authorized full validation first passed icons, generated sources, strict
TypeScript, lint and 1,720 portable tests (41 browser-dependent skips), then found
15 formatting issues. Formatted those files and regenerated sources. Enabled the
installed Chrome for all 1,761 tests; five browser failures exposed stale Apply
changes/Panel-radius/Monaco-position fixtures and resize handles covering a small
component's center at reduced zoom. Updated the fixtures to the current product
contract and bounded resize hit areas to leave the center draggable; all five
focused native browser cases now pass without relaxed assertions or timeouts.
Final npm run validate passed all 1,761 tests in 229 files with no skipped tests,
plus icons, embedded sources, strict TypeScript, lint, formatting and Windows x64
application packaging. Development, packaged and packaged-update Electron smokes
passed, including the Menu account controls and compiled runtime workflows.
Evidence is retained under artifacts/validation-2026-10-30/. The related RestGo
backend passed go test -count=1 ./... and go vet ./...; its race check cannot start
with CGO disabled and no C compiler. These are local Windows results only: the
exact-commit four-platform hosted release gates remain required. No installer,
version change, commit, tag or publication was performed.

## Persistent project-isolated Preview authentication: 2026-10-29

F9 publications with RestGO persistence/local storage now receive a temporary,
publication-scoped storage capability. SDK credential metadata is validated and
saved atomically with OS encryption under the WebRAD profile, keyed by canonical
project root, project ID, backend URL and storage key. Browser-only storage
adapters restore it before SDK session initialization, persist token rotations
synchronously, notify sibling frames without publishing credentials to browser
storage, and remove the saved entry on logout. Preview ports remain ephemeral;
Stop/rebuild/window close revoke access, including pending writes, while retaining
the encrypted session. Session/memory/disabled modes keep their existing behavior.
When secure OS encryption is unavailable, only isolated main-process memory is
used and a PREVIEW warning is emitted. Added the typed SDK storage-adapter contract
and updated architecture/SDK docs and generated sources. Previous port-scoped
browser sessions require one fresh login; no credentials are migrated across
projects or placed in project/export files. No tests, smokes, typecheck, lint,
builds, packaging or restart validation were requested or run.

## Automatic RestGO email confirmation on any page: 2026-10-29

The shared RestGO runtime now captures email_confirmation_token in query strings,
plain fragments or hash-route parameters before page construction. It strips the
token without navigation, rejects conflicting duplicate values and confirms once
per token without requiring a Menu, authored handler or authenticated session.
Hash routing preserves remaining route parameters. Native runtime messages report
success/failure using document locale; successful confirmation refreshes an existing
SDK identity without signing in the link owner. Listeners are disposed when the
integration is reconfigured. The sibling RestGo handler now updates existing session
email-confirmation snapshots after its successful database update. Updated runtime
and account-flow docs and regenerated embedded sources. No tests, smokes, typecheck,
lint, builds or deployment were requested or run.

## Configurable account email-link destinations: 2026-10-29

Added Email confirmation URL and Password reset URL beside enabled user settings.
Optional user.emailConfirmationUrl/passwordResetUrl persist absolute HTTP(S)
destinations without credentials; blank/missing values use the RestGo server
defaults. Runtime passes the reset URL to resetPasswordForEmail, the confirmation
URL to resendEmailConfirmation, and emailConfirmationUrl to profile updates so
automatic confirmation after an email change uses the same destination. Extended
the SDK and sibling RestGo self-service handlers to accept these optional values,
reusing existing link builders and fragment-token semantics. Omitted/empty resend
bodies remain compatible. Updated docs in both repositories and the existing
Menu smoke interactions/evidence for editing and retaining destinations. Runtime
and Monaco sources regenerated. No tests, smokes, typecheck, lint, builds or
deployment were requested or run.

## Compact account editor and footer feedback: 2026-10-29

Reduced the account dialog to 520px with a compact header/segmented tabs, smaller
photo toolbar, inline email-verification badge and collapsed account metadata.
Removed redundant opening/synchronization copy. Email-change guidance is shown
only when needed. Form-associated primary buttons live beside Close in a fixed,
padded footer; only the body scrolls. Save profile reflects actual draft changes.
Status/error/success feedback now belongs to the footer and is hidden when idle,
fixing the unpadded message shown against the dialog edge. Mobile keeps 44px action
targets, 16px inputs, safe areas and a full-height shell. English/Portuguese copy
and generated runtime sources are synchronized. Existing Menu smoke option/icon
contracts remain unchanged; no account-popup runtime or visual validation was
requested or run. No tests, smokes, typecheck, lint, builds or deployment ran.

## Menu user settings language: 2026-10-29

Added **User settings language** beside enabled user settings in Brand & user,
with English and Portuguese choices. Optional user.settingsLanguage persists en
or pt-BR in the shared configuration, defaulting legacy/new Menus to English.
Localized account-editor copy, buttons, photo flow, account states, feedback,
validation and SDK error messages, plus the icon accessible label and dialog lang.
User identity/content remains unchanged. Public types, Monaco and generated runtime
sources are synchronized. Updated the existing Menu smoke interactions and runner
evidence for both language choices. No tests, smokes, typecheck, lint or builds
were requested or run.

## Menu profile icon-only interaction: 2026-10-29

The profile photo/name/description now render as informational content. Only the
separate accessible settings icon is clickable and keyboard-focusable. It opens
the built-in account editor when enabled, or raises the existing OnUserClick for
authored actions otherwise. Removed the profile-wide hover and pointer cursor.
Updated the existing Menu smoke contract and documentation; regenerated runtime
sources. No tests, smokes, typecheck, lint or builds were requested or run.

## Account photo picker polish and permission diagnosis: 2026-10-29

Replaced the native file-picker chrome with a themed, keyboard-accessible Choose
photo button, upload icon and truncated filename with a full-name tooltip. The
native input remains hidden and continues to feed the existing photo preview/save
flow. Legacy backend 403 administrator-permission errors now explain that the
account operation is unavailable on the server, rather than implying the user
needs administrative privileges. Source inspection confirms the error originates
in RestGo's administrative authorization middleware; local /auth/profile dispatch
already precedes that middleware. Focused unauthenticated GET requests to
https://api.atentor.com/auth/profile and /auth/profile/email-confirmation both
returned 401, whereas the new handlers reject GET with 405 before authentication.
Together with the reported authenticated 403, this shows the published instance
is not serving the new self-service dispatch (outdated backend or proxy routing).
GET /auth/session returned the expected 401 control response. No credentials or
account writes were used. Local Docker is unavailable. No backend deployment,
builds, test suites or visual smokes were run.

## Menu current-account settings: 2026-10-29

Added opt-in user.settings and the Menu configuration option **Enable user settings**.
It enables the visible RestGO-bound profile and opens a separate native account
dialog with Profile/Security tabs, mobile full-screen layout, keyboard/focus support,
photo preview/save/removal, profile/email/password editing, confirmation/reset email
requests and logout. Account ID/activation/verification are readonly. Credential
changes require the current password and revoke all sessions. Runtime subscriptions,
photo object URLs, drafts and pending requests are disposed with the editor/Menu.
Public typed openUserSettings/closeUserSettings and SDK updateUser/resendEmailConfirmation
are included in generated sources and Monaco declarations. Added the corresponding
JWT-only self-service endpoints in the sibling RestGo repository; deployment of that
backend is required. Updated existing Menu smoke interactions and runner evidence.
No tests, smokes, typecheck, lint, builds, packaging or deployment were requested/run.

## Remove custom page Route path: 2026-10-29

Removed Route path from the Page registry/Inspector and creation defaults.
Compiler routes, HTML metadata and runtime projections now use lowercase page
names, with mandatory /index and /404. Project normalization removes obsolete
root props.routePath values while preserving IDs and page content. Readonly
runtime this.routePath continues to report the actual automatic route. Updated
existing routing fixtures, documentation and Electron Inspector evidence.
Regenerated runtime sources. No tests, smokes, typecheck, lint or builds were
requested or run.

## Menu RestGO current-user binding: 2026-10-29

Added **Brand & user > User profile > Bind to current RestGO user**. The optional
`user.bindToCurrentUser` flag defaults to false for legacy and new configurations.
Runtime uses the project SDK snapshot/auth notifications to project the user's
name, email, session photo and online status, hiding the profile without a session.
Subscriptions are released on unbinding/disposal. Manual values remain saved and
serve as Designer/configuration-preview samples; session identity is never persisted.
The public typed Menu configuration and generated runtime/declarations include the
flag. Updated the existing Electron Menu workflow and required runner evidence for
the checkbox and manual-field disabling. Runtime sources were regenerated; tests,
smokes, typecheck, lint and builds were not requested or run.

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
`WebFrameMain.executeJavaScript`. HTML smoke reads the owned iframe through the
DevTools DOM/CSS protocol, locating its target from the parent DOM node
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

The complete local portable rerun passed 1,720 tests with 41 skipped and one
remaining stale Scale input selector. Updated it to the numeric draft editor's
`spinbutton` role; the focused style integration workflow then passed. Hosted
verification must use the resulting follow-up commit rather than the first push.

The HTML document inspector now refreshes child-target availability after reading
the owner node, handling initial srcdoc mounting within the unchanged readiness
budget. An isolated Electron probe exercised five publications with the empty
sandbox retained; the complete development smoke then passed, including native
shared Menu persistence/Interaction and the final renderer workflow evidence.

Hosted quality on Linux passed the complete validation but timed out locating the
initial sandboxed HTML document in development smoke. The HTML inspector now
uses the debugger frame tree to resolve in-process documents rather than relying
on the Electron child-frame URL/process projection, and retains the last owner,
target/tree or evaluation result in timeout diagnostics. Both isolated-process
and same-process local probes retain the empty sandbox. Hosted confirmation of
this Linux follow-up remained required; no deadline or assertion was removed.

Commit `593202f` subsequently passed security and complete release verification
on Windows x64 and both macOS architectures. Linux packaged smoke and both
development quality smokes failed because the isolated execution context returned
no matching heading, despite finding the iframe. Replaced execution-context
evaluation with native DevTools DOM text, computed CSS and box-model inspection,
covering both embedded and out-of-process documents. Local probes confirmed the
same heading, text, colors, four padding edges, nonzero geometry and empty sandbox
in both process arrangements. Fresh hosted verification is required for this
follow-up; exact content, isolation, screenshot and timing requirements remain.
The complete local development smoke, strict typecheck and focused main-process
lint passed with the native DOM/CSS inspection in place.

The next hosted Linux release job exposed a process-fixture heartbeat race after
pipe closure. Its regression now observes the owned descendant's Linux kernel
exit/zombie state before comparing heartbeat samples, within the existing shared
two-second cleanup budget. It still requires closed output, a stopped descendant,
unchanged subsequent heartbeat, a live unrelated process and the original total
duration bound. No production termination deadline changed. All five focused
process-deadline tests passed locally; native Linux execution remains required.

For `f609daa`, complete Windows quality and macOS ARM release verification passed.
Linux development smoke passed; its subsequent packaged smoke read the previous
`<p>HTML content</p>` document while the iframe already held the new srcdoc. The
DOM inspector now prioritizes a live child target over an owner's potentially
stale embedded document during process transitions. Node IDs invalidated by a
document navigation return to the original readiness loop with diagnostics;
unrelated protocol failures still propagate. A real content-replacement probe
and strict typecheck passed locally. This follow-up and the Linux process-fixture
repair require a fresh exact-SHA hosted run.

`f4090a0` passed the Linux process fixture, but native DOM inspection confirmed
that the current child target itself retained default HTML after its srcdoc
attribute changed. The runtime setter now replaces inline srcdoc directly,
without removing it first and scheduling a competing fallback navigation. When
switching to HTTPS embeds, it sets the destination before removing srcdoc's
precedence. Permissions are restricted before either source change; inline
documents keep an empty sandbox and remote embeds retain their existing token
allowlist. Regenerated embedded runtime sources and documented replacement
semantics. Final native confirmation remains required.

`d926370` passed complete non-publishing release verification on Windows x64,
Linux x64 and both macOS architectures, including assembly. Security passed.
Quality still failed HTML inspection in Windows development and Linux packaged
smoke: the owned child document retained default content after the source
attribute changed. The shared React projection now keys the iframe by its HTML
source, giving a changed source a fresh browsing context instead of allowing an
older navigation to commit over it. Its empty sandbox is present at creation;
stable model IDs, selection and geometry remain projected from the same node.
Native smoke assertions, required evidence and deadlines remain unchanged.
This follow-up still requires exact-SHA hosted verification.
Local strict typecheck, focused lint/formatting and all 19 shared component-view
tests passed. The complete development smoke, host package build, packaged smoke
and packaged update smoke also passed with the fresh-context projection.

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
