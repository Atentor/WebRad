# Contributing to WebRAD

Read the [engineering rules](AGENTS.md) and [architecture](docs/architecture.md)
before changing package boundaries. The versioned Project Model is the source
of truth; Designer and browser runtime responsibilities must stay separate.

## Set up the environment

Use Node.js 26.12.1 or newer and npm 12.2.1 or newer, as declared in
[package.json](package.json):

```sh
npm ci
npm start
```

On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. Local
development does not require GitHub tokens, Apple credentials, or a RestGo server.
Optional tests document their browser or external service requirements.

## Submit a change

1. Describe the problem in an issue or pull request and keep the change focused.
2. Preserve user-authored TypeScript. Programmatic edits to it must use the
   TypeScript AST.
3. Write documentation in English. Update relevant guides and `PLANS.md` when
   behavior or persistent formats change. Keep component model, Registry,
   Designer, runtime, Monaco, and compiler contracts aligned.
4. Before submitting, verify the relevant scope. Runtime changes require
   regenerating embedded sources with `npm run runtime:sources`. The complete
   root check is `npm run validate`; interface, runtime, compiler, or Electron
   changes also need relevant smokes described in the [README](README.md).
   Agents follow the [explicit validation policy](AGENTS.md#agent-validation-policy)
   and report unexecuted checks instead of running them automatically.
5. Explain the resulting behavior, verification performed, and platform limits
   in the pull request. Distinguish real browser/Electron evidence from code
   review or tests without a UI. Ordinary contributions do not include installer
   generation, version bumps, or release publication.

Do not commit credentials, customer data, `.env` files, local preferences,
temporary screenshots, or build artifacts. Use fictional example data. Report
vulnerabilities through the [security policy](SECURITY.md).

Branch protection, required checks, and private vulnerability reporting are
GitHub settings that maintainers must review; versioned workflows do not enable
them automatically.

## License

Contributions to original WebRAD code are accepted under the [MIT license](LICENSE).
Preserve third-party notices and record their origins in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
