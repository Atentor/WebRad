# Release review: 2026-10-26

This is a historical review of the checkout on 2026-10-26. Its findings and run
results do not certify the current checkout. At review time, commit
`2881db8f8f0ded3ff30f4a5c0e8927ee4d84ccac` had passed CI and was published as
`v0.0.15`; later local Menu, Designer, and Preview changes lacked matching evidence.

The original review used source, diffs, documentation, and existing GitHub Actions
results. It did not execute tests, smokes, checks, builds, dependency installation,
or installers, and its findings were identified statically. The later authorized
corrections and failed validation are recorded separately below.

## Subsequent validation failed

On explicit request, the 2026-10-26 Windows portable suite with Chrome completed
230 files: **1,764 passed, 2 failed, zero skipped**. Nine of 13 Electron smoke
variants passed; four failed while checking Stop's return from Preview. Typecheck
reported two errors and formatting six files. Icons, embedded sources, lint, and
Windows x64 packaging passed. That run applied no fixes.

Report and diagnostics: `artifacts/test-run-2026-10-26-full/REPORT.md`. This was
local Windows evidence, without hosted confirmation of the final commit; the
checkout remained unapproved for release. See [PLANS.md](../PLANS.md) for later
recorded work.

## Corrections implemented before that validation

All three review findings received local corrections on 2026-10-26:

- F9 accepts clean Save normalization within the same project preparation context
  and captures the build revision after Save. Stop, edits, and project changes
  continue invalidating late results.
- Menu event relaying moved into private `packages/runtime/src/menu-events.ts`,
  without a public package/subpath export. Embedded sources were regenerated with
  `npm.cmd run runtime:sources`.
- Tag preflight/publication now require the latest eligible successful validate
  and security runs for the exact SHA, with full pagination. Pending, cancelled,
  or failed latest runs block despite older success. Four-platform release
  verification and nonpublishing mode remain intact.

The existing GitHub CLI fixture/pagination expectation was updated without
expanding suites. Implementation itself ran no tests, smokes, checks, builds, or
installers. No commit, push, version change, tag, or publication was performed
as part of those local corrections. Implementation and verification are distinct.

## Original findings

### 1. F9 could invalidate itself during Save

Priority P2. The reviewed App.tsx captured a build ID and activated Preview before
`projectController.save()`. Its revision effect could invalidate that ID and
leave Preview during the same Save.

Save legitimately changes revision when `pruneEmptyEventHandlers` removes empty
handlers and `#acceptSavedSession` accepts normalized content. Creating an empty
Interaction handler and pressing F9 without saving could therefore abort/discard
the build and require a second F9.

The correction establishes the revision after Save and distinguishes its clean
normalization from edits/project replacement, preserving Stop invalidation.

### 2. A runtime export was absent from Monaco's contract

Priority P2. `menu.ts` exported `bindWebMenuEventHost`, indirectly exposed by the
package index. The generation filter in `scripts/sync-runtime-sources.mjs` accepted
WebMenu-prefixed symbols and an explicit function list, excluding this helper.
It was therefore absent from `menu-typings.generated.json` and manual declarations.
Regeneration alone could not restore parity. The selected correction keeps event
relaying private rather than introducing a new authored API.

### 3. Tag preflight omitted quality/security gates

Priority P2, preexisting automation gap. `requireVerifiedCommit` checked exact-SHA
release verification but not validate/security. Successful release jobs could
therefore authorize a tag despite a development smoke or secret-scan failure.
The checklist required manual review of all three workflows; automation covered
only part of it. The review did not establish such a failed gate on the cited
published commit. The correction enforces quality/security too, preserving
four-platform assembly, permissions, and stable-tag restrictions.

## Existing evidence consulted

These observations belong only to SHA
`2881db8f8f0ded3ff30f4a5c0e8927ee4d84ccac`:

| Evidence                                                                                        | Recorded result                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Nonpublishing release 40222242490](https://github.com/Atentor/WebRad/actions/runs/40222242490) | Four builds and assemble passed; publish skipped.                                             |
| [Validate 40222242485](https://github.com/Atentor/WebRad/actions/runs/40222242485)              | Windows/Linux jobs passed.                                                                    |
| [Security 40222242515](https://github.com/Atentor/WebRad/actions/runs/40222242515)              | Passed.                                                                                       |
| [Publication 40225939952](https://github.com/Atentor/WebRad/actions/runs/40225939952)           | Four builds, assemble, and publish passed.                                                    |
| [Scheduled security 40347945722](https://github.com/Atentor/WebRad/actions/runs/40347945722)    | Passed on 2026-10-26.                                                                         |
| [Release v0.0.15](https://github.com/Atentor/WebRad/releases/tag/v0.0.15)                       | Published on 2026-10-25 with 11 assets, including platform installers, feeds, and SHA256SUMS. |

The published macOS packages were unsigned. Native automatic updates require the
[documented signing setup](releases.md#optional-macos-signing).

## Packaging and preparation

Static review found no additional forge.config.ts defect: native dependencies,
compiler resources, licenses, isolation, and integrity fuses remained configured.
That does not establish a new package from the reviewed checkout.
`WebRAD-Dev Setup.exe` and independent local version `0.1.12` were intentional;
CI stages the official installer/version from its tag. Neither required a local
version bump. The review's proposed next patch was provisional and must not be
reused without checking already published versions when publication is authorized.

Before a tag, include all implementation/generated/smoke files in the authorized
commit, including PreviewWorkspace, insertion-feedback modules, and private
menu-events.ts. Then obtain final-SHA validate, security, all four release builds,
and assemble evidence. Follow the [release checklist](release-checklist.md);
complete local verification and publishing each require their requested scope.
