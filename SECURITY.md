# Security

## Report a vulnerability

Do not publish credentials, personal data, customer files, or exploit details in
a public issue. Use **Report a vulnerability** in the repository's
[security area](https://github.com/Atentor/WebRad/security/advisories/new) when
private reporting is enabled. If unavailable, open an issue requesting a private
contact channel without including vulnerability details.

Include the affected version or commit, operating system, a minimal reproduction
using fictional data, and the observed impact in your private report. Revoke or
rotate exposed credentials at their source service.

## Updates and application boundaries

Fixes are developed on `main`. Older releases do not have guaranteed security
maintenance; use the latest available release.

The Electron renderer must keep `nodeIntegration: false`,
`contextIsolation: true`, and `sandbox: true`. Native access uses typed preload
APIs and main-process IPC validation.

Project values, `Env` variables, and exported application API tokens can appear
in browser JavaScript. Administrative credentials and server secrets must stay
outside projects and generated applications.
