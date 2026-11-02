# Packages / NPM

Open a saved project and choose **Project > Packages**, or open **Packages** in
Project Explorer. Search the public NPM registry, select **Install**, or enter a
package name and optional version yourself. Scoped names such as
`@scope/package` are supported. The dialog lists direct dependencies, requested
and installed versions, available latest versions and package descriptions.
Use **Update**, **Remove**, or **Restore Dependencies** for explicit operations.
Progress, process output, cancellation and errors stay in the dialog; the IDE
remains responsive while NPM runs. Cancelling can leave an incomplete installed
tree: restore dependencies before compiling again.

## Requirements and isolation

Install Node.js 20 or newer with NPM 10 or newer and make it available on the system PATH, including when
using a packaged WebRAD installation. The dialog reports missing tools. WebRAD
uses the external Node executable and NPM CLI directly, without a shell. It does
not use Electron as Node or require access to the IDE's development toolchain.

Each project owns its root `package.json`, `package-lock.json` and `node_modules`.
The versioned Project Model embeds direct dependencies and the lockfile in the
`.wrproj`. Save As, copying, importing or moving the project therefore retains
enough information to restore its dependency tree. `node_modules` is local and
does not need to be distributed with the project. Existing projects without
packages continue to open normally. WebRAD refuses to overwrite an unrelated
root package manifest, including its own repository manifest.

Restore uses `npm ci` when a lockfile exists. An inconsistent lockfile is reported
as an error instead of silently replacing the requested dependency versions.
Opening a project never silently installs dependencies. Missing libraries appear
in the package list and as compiler diagnostics; restore them explicitly.

## TypeScript imports

Install `dayjs` and create a Unit named `Clock`:

```typescript
import dayjs from 'dayjs';

export function formattedNow(): string {
  return dayjs().format('DD/MM/YYYY HH:mm:ss');
}
```

Import that Unit in a Page's code and use it in an existing button Interaction:

```typescript
import { formattedNow } from '../units/Clock';

// Inside the Page class:
async Button1Click(sender: WebButton): Promise<void> {
  Message(formattedNow());
}
```

Install `axios` for a browser HTTP request:

```typescript
import axios from 'axios';

export interface Product {
  id: number;
  title: string;
}

export async function loadProducts(): Promise<Product[]> {
  const response = await axios.get<{ products: Product[] }>(
    'https://dummyjson.com/products/category/smartphones',
  );
  return response.data.products;
}
```

Imports work in Pages, Models, Units and Reusable Components. Monaco's existing
TypeScript service reads the installed declaration graph and package metadata;
member completion, hover, signatures and strict diagnostics use those types.
Use Monaco's **Go to Definition** context-menu action or Ctrl+click (Cmd+click on
macOS) to open an installed declaration in a read-only viewer. The viewer loads
only the requested declaration and never saves it as project source. F12 keeps
the IDE's existing Design/Code switching behavior.
Updating or removing a package invalidates its declarations. Packages without
declarations retain TypeScript's missing-declaration diagnostic: install a
corresponding `@types` package when one exists. No package installation creates
untyped component globals or changes authored TypeScript.

## Browser compatibility and distribution

Preview, Debug, Web/PWA and Tauri frontend builds resolve the same project-local
packages. ES modules, compatible CommonJS modules, conditional package exports,
subpath imports and transitive dependencies follow the existing TypeScript and
esbuild pipeline. CSS imports join the application stylesheet; supported static
assets are bundled for browser delivery. Tree shaking and source maps remain
available. Internal `@webrad/runtime`, `@webrad/restgo-sdk`, Units and Models retain
their existing resolution contracts.

Projects opened through a filesystem link or Windows junction use the same
installed declarations and bundles as their canonical folder. Dependency files
must still resolve inside that project's real `node_modules` tree; links outside
the dependency tree remain unsupported.

Exported applications include their bundled dependencies and run without Node.js
or a server-side `node_modules` directory. Native Build retains the existing Tauri
pipeline: these libraries run in its WebView. A successful frontend compilation
does not establish execution on every native target platform.

Node-only packages and Node built-ins such as `node:fs` and `child_process` cannot
run in the browser. WebRAD reports unavailable native APIs rather than injecting
Node polyfills or exposing Electron APIs. A package may still depend on browser
capabilities, network access, CORS, workers or external resources; its own runtime
requirements continue to apply.

`@webrad/*`, `pdf-lib`, `shaka-player` and `@pdf-lib/standard-fonts` are reserved
for WebRAD's existing built-in modules. The manager rejects installing alternative
versions of these names because the compiler retains their embedded aliases.
Other project packages use their own installed versions.

## Security

All NPM lifecycle scripts are disabled for installation, update, removal and
restore. There is no script-enablement switch. Libraries that require an install
script are unsupported by this manager. Never copy package-provided shell commands
into the IDE expecting it to execute them.

Installed dependencies are third-party code and execute in the generated
application when imported. Review package ownership, versions, licenses and
browser behavior. Disabling lifecycle scripts protects the installation step;
it does not make third-party application code trustworthy. Project IPC remains
limited to the active opened project, with validated names, versions and paths.
Package logs redact credentials and registry tokens.

The implementation uses the official [NPM registry API](https://api-docs.npmjs.com/)
for paginated search and the existing [TypeScript bundler module resolution](https://www.typescriptlang.org/tsconfig/moduleResolution)
for package declarations.
