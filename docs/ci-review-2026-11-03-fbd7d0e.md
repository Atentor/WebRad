# GitHub validation review: fbd7d0e

Reviewed the latest `main` push at exact commit
`fbd7d0ee04794c4962483a47ab9aa884da6aa4f2` (`Fix CI formatting and Interaction
test fixture`). The local checkout matched that commit and was initially clean.
This review supersedes the release status in the
[previous review](ci-review-2026-11-02-d9207b2.md).

The previous formatting and Interaction fixture failures are resolved in the
hosted evidence. All six native jobs passed their code checks, portable tests
and application packaging. Two distinct Electron failures now block the release:
the Login mobile font size in five jobs and Monaco syntax highlighting in the
Linux packaged application. Security and release preflight passed.

## Observed jobs and artifacts

| Workflow                                                               | Job             | Job ID       | First failure                            |
| ---------------------------------------------------------------------- | --------------- | ------------ | ---------------------------------------- |
| [release](https://github.com/Atentor/WebRad/actions/runs/41569409213)  | Windows x64     | 125698644069 | Packaged Login mobile input font size    |
| release                                                                | Linux x64       | 125698644120 | Packaged Monaco TypeScript highlighting  |
| release                                                                | macOS Intel     | 125698644175 | Packaged Login mobile input font size    |
| release                                                                | macOS ARM64     | 125698644066 | Packaged Login mobile input font size    |
| [validate](https://github.com/Atentor/WebRad/actions/runs/41569409180) | Windows quality | 125698569604 | Development Login mobile input font size |
| validate                                                               | Linux quality   | 125698569172 | Development Login mobile input font size |

All six portable suites reported 203 passed files and 38 skipped files, with
1,769 passed tests and 43 skipped tests. These are results for the original SHA,
not execution evidence for the new local corrections. Icons, generated sources,
strict TypeScript, lint and formatting also passed on every target. Both native
macOS viewport steps passed. Both jobs in
[security](https://github.com/Atentor/WebRad/actions/runs/41569409165) passed.

Downloaded and inspected all six original smoke archives, including their raw
logs, `failure.json`, retained project models and screenshots:

| Artifact                        | Artifact ID |
| ------------------------------- | ----------- |
| release-smoke-win32-x64         | 13201013004 |
| release-smoke-linux-x64         | 13200269174 |
| release-smoke-darwin-x64        | 13201407633 |
| release-smoke-darwin-arm64      | 13201416560 |
| validation-smoke-windows-latest | 13200334731 |
| validation-smoke-ubuntu-24.04   | 13200897862 |

The six decoded job logs, job/artifact metadata, ZIP files and extracted original
contents are retained under `artifacts/ci-fbd7d0e/`. No independent renderer
exception or crash was found before the recorded failures. The Node runner's
`triggerUncaughtException` propagates its failed smoke result. Deliberate
`embed.webrad.invalid` navigation errors belong to the HTML isolation fixture;
the five jobs that reached it recorded the required HTML projection success.

## Login: project typography overrides the mobile minimum

All five Login failures have the same evidence:

```json
{
  "bodyWidth": [278, 278],
  "fontSize": "14px",
  "inputWidth": 238,
  "minHeight": "44px",
  "padding": "20px",
  "panelWidth": 280,
  "width": 390
}
```

The 390 px viewport, panel/input widths, 20 px padding and 44 px minimum height
meet the existing assertions. Only the font size violates the 16 px mobile
minimum. The retained models contain the new Default Edit style with explicit
14 px typography. Its Tailwind utility belongs to the later `utilities` layer,
so it overrides the mobile font-size rule in the `components` layer regardless
of that rule's selector specificity. This is a runtime style-cascade defect.

The correction makes structured WebEdit font-size utilities combine the authored
value with `--wr-edit-min-font-size`, defaulting to zero. Login sets that floor
to 16 px in its existing narrow-container and coarse-pointer rules. Larger
authored sizes, theme/state overrides and desktop typography remain effective;
saved project styles are unchanged. Designer, configuration previews, compiled
Preview and generated applications use the same projection. The embedded
runtime sources were regenerated.

The shared Login smoke and both runners now require the explicit
`mobile fields at least 16px type and 44px height;` evidence. Their actual
font-size, touch-height, geometry and overflow assertions remain unchanged.

## Monaco: initialize syntax before creating the first model

Only Linux packaged stopped at the TypeScript highlighting assertion. The last
sample contained seven source lines and 24 spans, all with neutral `mtk1` syntax
classes. Bracket colors were present, but keywords and types had no syntax
highlighting. The original artifact contains no language/provider state or
tokenizer exception, so it does not establish the exclusive underlying Monaco
state. Linux development and the other packaged platforms passed that phase.

CodeEditor's project-model synchronization effect can run while the React Monaco
loader is pending, before `beforeMount` or its later extra-library effect. It
previously relied on another caller configuring Monaco first. The normal App
open-session path also configures Monaco through workspace cleanup, so this
ordering observation does not prove the Linux run actually lacked setup.
Synchronization and the package-definition viewer now explicitly configure
Monaco before touching models, enforcing the invariant at each creation
boundary. Setup remains idempotent. TypeScript metadata and the official Monarch grammar have one eager
owner; the redundant lazy grammar registration is removed, while the semantic
TypeScript worker, strict diagnostics and language services retain their lazy
activation.

The existing real Electron assertion retains its token-class/color counts and
20-second deadline, and also requires TypeScript model language. Failure
diagnostics now include the editor's native language attribute, resource and
visibility/focus/size state. Existing setup mocks and expectations follow the
new registration API. These changes harden syntax initialization and provide
missing evidence; the original Linux cause and the effect of this mitigation
remain unconfirmed until corrected hosted execution.

## Remaining release gate

No tests, validation checks, builds, packaging or new smoke runs were requested
or executed locally. Runtime-source generation and corrective formatting writes
are implementation steps, not validation. The edits are uncommitted; no push,
tag, version change, installer generation or publication was performed.

The failed hosted jobs stopped before updater checks and distributable
generation. Quality's later packaged smokes did not run; release assembly was
skipped and branch publication was skipped. Missing later evidence identifies
unexecuted interactions rather than additional proven failures.

Release readiness requires the final corrected SHA to pass validate, security,
all four native release targets and assembly, with publication skipped for the
non-publishing verification. A tag requires that exact-SHA verification and
separate publication authorization; the original failed SHA is not releasable.
