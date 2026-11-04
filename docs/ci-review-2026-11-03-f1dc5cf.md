# CI review: f1dc5cf

Candidate: `f1dc5cfa51f9051ae74c2998be044d5dd57566f0`
(`Fix Date smoke cleanup and probe overlap`).

## Hosted evidence

- [Release 41738666945](https://github.com/Atentor/WebRad/actions/runs/41738666945):
  Windows x64, Linux x64, macOS Intel and macOS ARM64 failed at
  `npm run test:portable`. Icons, generated runtime sources, strict typecheck,
  lint and formatting passed on each platform. Packaging, packaged/update smokes,
  distributables, assembly and publication were skipped.
- [Validate 41738666837](https://github.com/Atentor/WebRad/actions/runs/41738666837):
  Windows and Ubuntu failed inside the portable tests of `npm run validate`.
  Their generated-source checks, typecheck and lint passed; the later formatting,
  packaging and smoke steps were not reached.
- [Security 41738666918](https://github.com/Atentor/WebRad/actions/runs/41738666918)
  passed both secret scanning and production dependency auditing.

All six test runs reported the same single failure in
`apps/ide/main/native-build-ipc.test.ts:233`, with 1,768 passing tests and 43
optional skips. The assertion expected two pending prerequisite calls but saw one.
Original job logs are retained in `artifacts/ci-f1dc5cf/job-<id>.log`:

| Job                 | ID           | First failed step                   |
| ------------------- | ------------ | ----------------------------------- |
| Windows release     | 126274419094 | `npm run test:portable`             |
| Linux release       | 126274419223 | `npm run test:portable`             |
| macOS Intel release | 126274419224 | `npm run test:portable`             |
| macOS ARM64 release | 126274419246 | `npm run test:portable`             |
| Ubuntu quality      | 126274308094 | `npm run validate` (portable tests) |
| Windows quality     | 126274308484 | `npm run validate` (portable tests) |

## Cause and correction

The fixture manually controls when each mocked prerequisite inspection settles.
It started a replacement, then waited for two probes before resolving the first.
The production handler now deliberately waits for the cancelled task to settle
before starting its replacement, allowing the cancelled process tree to exit.
The fixture therefore waited for an event it prevented from happening.

The existing test now awaits the first signal's cancellation and asserts that
only one probe has started while cleanup is pending. It then resolves the first
mock, observes stale-result rejection, waits for the replacement and verifies
that its signal stays live and its report is returned. The rejection expectation
is attached before cancellation can settle the first request.

Production inspection serialization and authorization checks remain intact.
No retries, longer timeouts, worker changes, weakened assertions or release gate
changes were introduced. This change updates the existing fixture to the current
behavior and does not add a test suite.

## Verification limits

No local tests, validation, builds or packaging were requested or executed.
Reading the source and diff establishes the fixture sequencing correction;
it does not establish passing execution. The corrected commit still requires
hosted validation and native release verification on all four platforms,
including the previously blocked Date cleanup and Windows smoke timing paths.
No commit, push, tag, version increment, installer or publication was performed.
