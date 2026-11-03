# GitHub validation review: 70dbbec

The reviewed push is exact commit
`70dbbec44d04e2bb79ce3d512cfbcabbfdc4028a` (`Fix Login mobile styles and Monaco
startup`). Its release and validate workflows reached Electron after passing
code checks, formatting, portable tests and application packaging. Security
passed. The latest failures have a common, confirmed smoke-inspection defect.

All jobs have finished. The six failures are:

| Workflow | Target      | Job ID       |
| -------- | ----------- | ------------ |
| release  | Linux x64   | 125842271086 |
| release  | Windows x64 | 125842271124 |
| release  | macOS ARM64 | 125842271140 |
| release  | macOS Intel | 125842271178 |
| validate | Linux       | 125842071286 |
| validate | Windows     | 125842070881 |

Release preflight passed. Assembly and publication were skipped after the native
failures. Both security jobs passed.

## First functional failure

[Release](https://github.com/Atentor/WebRad/actions/runs/41613804410) and
[validate](https://github.com/Atentor/WebRad/actions/runs/41613804463) report the
same TypeScript-highlighting timeout. The captured evidence now has:

- 46 syntax spans, four token classes and seven colors;
- all five expected keywords: `import`, `export`, `class`, `extends`, `async`;
- the expected generated page class, event handler and hidden inlay hints;
- a visible editor with nonzero width and height;
- `languageId: null` and `resource: null`.

The rendered syntax meets the original highlighting assertions. The new native
language assertion added in the previous correction fails because its DOM
inspection reads the wrong element. This is a defect introduced by that smoke
change, not evidence of another failed tokenizer in these runs. The Login
workflow is later and was not reached, so its mobile correction is still
unverified by these executions.

## DOM ownership and correction

The installed Monaco implementation distinguishes the caller's editor container
from its child View root:

- `CodeEditorWidget` keeps the caller-provided container in `_domElement` and
  places `data-mode-id` on that container.
- It places `data-uri` on the View root, which carries `.monaco-editor`.

The previous inspection read `data-mode-id` directly from `.monaco-editor` and
looked for `data-uri` below it. Both therefore returned null even while native
TypeScript tokens were painted correctly.

The correction scopes the sample to the primary workspace's
`.wr-code-workspace .wr-monaco-host .monaco-editor`, reads language from that
view's nearest `[data-mode-id]` ancestor, and reads resource from the view's own
`data-uri`. Tokens, geometry and both attributes come from the same primary
editor. Portaled package/definition viewers are excluded.

The required `languageId === 'typescript'`, token-class/color counts, keywords,
inlay-hint checks and 20-second deadline remain intact. No runtime behavior,
retry, timeout or CI gate is changed. Both development and packaged runners use
the same corrected smoke interaction.

## Evidence and verification boundary

Original job logs, metadata and downloaded/extracted smoke archives are retained
under `artifacts/ci-70dbbec/`. All six archives were downloaded, including release
Linux `13220532980`, Windows `13220817780`, macOS ARM64 `13220932092`, macOS
Intel `13221151801`, and validate Linux `13220626950`/Windows `13220752641`.
The code fix was reviewed against the installed
Monaco source and independently against the retained failures. No additional
renderer exception or crash was found in the inspected failing workflows.
Native prerequisite cancellation messages are separate from the Monaco failure.

Each of the six portable suites reported 203 passed files, 38 skipped files,
1,769 passed tests and 43 skipped tests. Those results cover the original SHA,
not the local smoke correction. Later missing evidence follows the stopped
workflow and is not a list of independent component failures.

The source correction requires a new commit's hosted execution to establish
that the smoke proceeds through Login and all later workflows. Monitoring an
old run or rerunning its unchanged SHA cannot validate a local patch. Publishing
requires the unchanged exact-SHA validate, security, four-platform release and
assembly gates. No tag, version change, installer generation or publication is
part of this source correction. Local tests/builds/smokes were not requested.
