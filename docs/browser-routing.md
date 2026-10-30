# Browser page routing

Generated applications use History routing over HTTP/HTTPS by default. `Navigate('PageCustomers')` resolves a page name or stable ID and changes the URL without reloading the application. `Navigate('/pagecustomers')` also resolves its automatic page path. Back and Forward restore the corresponding page, including its normal lifecycle and component cleanup.

Select **Project settings > Build and publishing > Browser routing**:

- **History (clean URLs)** uses `history.pushState`, `history.replaceState` and `popstate`.
- **Hash (static hosting compatibility)** uses fragment paths such as `#/pagecustomers`. Choose this when the host cannot serve an application fallback.

File URLs and other non-HTTP protocols always use Hash, including local native delivery. HTTP Preview serves compiled routes and unknown document paths under its temporary publication token so the router can display the mandatory 404 page. Missing assets retain real HTTP errors. Revoking a Preview revokes all of these paths.

## Page paths

Every project has a mandatory initial page named `index`, with fixed route `/index`. Its name is read-only, and the page cannot be deleted or replaced as the entry page. The mandatory `404` page also has a read-only name and disabled deletion; its route is fixed at `/404`. Other page paths are derived automatically from the page name in lowercase: `PageCustomers` becomes `/pagecustomers`. Renaming a page changes its route. There is no Route path setting in the Inspector. The `assets` path is reserved. Duplicate or invalid automatic paths fail compilation with a model diagnostic.

Project loading removes legacy root `props.routePath` values; custom paths are no longer used. The authored root exposes the actual automatic path as read-only `this.routePath: string`. Use `Navigate` to navigate. Existing Hash links using page names or IDs remain readable in Hash mode.

`Navigate(destination, { replace: true })` replaces the current history entry. `newWindow` and `target` produce the corresponding route URL. External destinations retain normal browser navigation. Existing query parameters are preserved for internal navigation.

## Page not found

New and existing projects include an editable mandatory page named `404`. Its visual content, events and browser title can be customized normally. The source file is `pages/404.ts`; its authored class is `Page404`, extending `Page404Generated` from `./404.generated`. Monaco and compiled applications share this class mapping; the page root remains `this`.

An unmatched URL automatically displays this page and replaces the address with `/404` (or `#/404` in Hash mode), respecting the application base path. The same resolution runs on startup, Back/Forward and internal `Navigate` calls. An empty initial URL or `index.html` still opens `index`; external destinations retain normal browser behavior. The redirect replaces an invalid history entry to avoid a Back loop.

This is client-side routing: the host must deliver the application shell for unknown document paths before the application can handle them. It does not generate a server HTTP 404 response.

## Hosting and subdirectories

**Application base path** is `/` by default. Set it to `/portal/` when publishing at `https://example.com/portal/`. It must start and end with `/`; intermediate segments use letters, digits, underscores or hyphens. Generated HTML sets its resource base to this directory so scripts, styles and imported assets resolve when opening nested routes directly.

Configure the host to serve the application's `index.html` for page routes. For Nginx, a root deployment can use:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
location /assets/ {
    try_files $uri =404;
}
```

For a `/portal/` deployment, use a corresponding `location /portal/` with fallback `/portal/index.html`, and keep missing files under `/portal/assets/` as 404. Preserve API endpoints and other server routes outside this fallback. Without it, refreshing or directly opening `/pagecustomers` may return a server 404. Choose Hash when host configuration is unavailable.

History routing does not provide server rendering or automatic search indexing. Existing format-v2 projects without routing settings acquire `routingMode: 'history'` and `routingBasePath: '/'` when parsed; choose Hash explicitly to retain fragment navigation.
