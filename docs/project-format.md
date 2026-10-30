# Project format

Panel, Group and HTML optionally store `props.aspectRatio` as `none`, `1:1`,
`4:3`, `3:4`, `16:9` or `9:16`. Missing values mean free sizing (`none`).
The ratio does not replace saved `bounds.height` or responsive height rules;
those values resume when the ratio is disabled. See [Aspect ratios](aspect-ratio.md).

The Project Explorer's **Duplicate selected project item** action copies the active
page, reusable component, Model, Unit or Asset and opens the copy. Names use the
first available `Copy`, `Copy2`, etc. suffix (before asset extensions). Documents
receive new document/component IDs while retaining component names, handlers,
properties, shared styles and reusable references. Authored code is copied;
document/model class names and generated imports are adjusted with the TypeScript
AST. Copied pages receive their own default route. References to other documents,
assets and resources remain unchanged. Save persists the copy normally.

## New project templates

**File > New Project** offers **Blank project** (the default) and **Examples &
Tutorial**, each with a visual preview. Its independent **Application theme**
selector offers **Aurora**, **Prism**, **Flat** and **WebRAD**, each with Light and Dark
palettes. The choice is materialized into `settings.themes` and Default styles;
no preset identifier or new project format is required. Template previews follow
the selected theme. The name, location hint and creation actions remain visible
while the template/theme options scroll. Creation failures are separate from
project-name validation. The Aurora tutorial demonstrates the registered visual
and nonvisual components, using only the protected **Default**
styles. It creates `index`, `Forms`, `Data`, `Media`, `Pokemon`, `Timer`, `Files`,
`Reports`, `RestGoAccount`, `RestGoRecovery`, `RestGoProfile`, `RestGoSession`
and the mandatory `404` page (13 total), plus the
`FeatureCard` and `AuroraMenu` reusable definitions and ordinary authored TypeScript files for
their behavior. Group has no style support; reusable placements render their
definition's Default Panel and child styles. No custom style is added or seeded
Default style changed with the Aurora preset; Prism and Flat materialize their
own Default style appearance. All elements remain editable through the Designer,
Inspector, Styles and Code.

All project templates and theme presets seed Default Button with left-aligned
content: the icon precedes the caption, with `justifyContent: 'start'` and
`textAlign: 'left'`. The existing icon/text gap and vertical centering remain.
All four presets share Roboto Medium (500) button text and 27px icons. Aurora
and Prism retain their gradients and adaptive foreground colors; Prism Light
brightens its violet/coral fills on hover. WebRAD retains neutral IDE button
fills and uses its editable Selection color for a distinct pressed state.
This is saved style metadata, so Designer and compiled applications use the
same alignment and users can customize it in Styles. The bundled examples use
this alignment as well; existing user projects retain their saved styles.

Cards (Panel) and buttons use 8px corners in every template and theme preset,
including Data Grid cell buttons. The creation previews and bundled examples
use the same radius. Other controls retain their theme-specific corners.

WebRAD materializes the IDE palette, square controls and scrollbars, 8px cards
and buttons, and Light/Dark typography overrides. The `fontFamily: 'ide'` style value uses
the same system font stack as the IDE, without embedding font binaries. A zero
component border radius also projects square nested Menu controls and Data Grid
toggles; nonzero radii retain their normal component appearance.

Flat pairs near-white Light surfaces with neutral graphite Dark surfaces and
balanced blue accents. Blue buttons share their normal, hover and active colors
in both modes, with hover lighter than normal. Primary and accent buttons use
white text in Light and Dark, with Roboto Medium (500) and 27px icons for Default Button.
Turquoise accents
and status colors remain vivid,
with independent Light/Dark colors for text, borders, focus and interaction
states. Its Default cards and buttons use 8px corners, including Data Grid cell
buttons; other Flat controls retain 6px corners.
Surfaces remain solid and shadows are removed. The preset is materialized only
when creating a project; existing saved theme colors and style values remain
project-owned.

A materialized copy is available at
[`examples/aurora-workspace/AuroraWorkspace.wrproj`](../examples/aurora-workspace/AuroraWorkspace.wrproj),
with [a page and interaction guide](../examples/aurora-workspace/README.md).

The overview includes two independent FeatureCard placements with working
progress buttons. Forms demonstrates Edit, Text Area, Check Box, Toggle, Combo
Box and List Box, with a review button opening a populated native Popup. It does
not submit profile values to a server. Data uses a real API Client operation to
load the bundled `aurora-projects.json` asset into a Data Grid and Repeating
Group, with typed cell/row selection handlers. Media includes a bundled SVG,
an interactive favorite icon, a playable ten-second local DASH sample in
Video Player and an HTML component with a local HTML/CSS document. Select
`EmbeddedHtml` and edit its HTML property to customize the card; its accessible
title and typed `WebHtml` instance use the ordinary component contract. Menu
links use stable page IDs, including its mobile drawer.

Menu configuration stores `mobileIconPosition` as `left` or `right`. The Menu
configuration dialog exposes it under **Behavior & layout → Mobile icon position**.
It positions the hamburger icon on the selected side of the mobile navigation
bar, independently of the drawer side. Older configurations without this field
default to `left`. The modal preview, Designer, compiled Preview and exported
applications use the same runtime rendering.

The **Nonvisual** menu section opens four additional examples:

- **API Client / PokeAPI** (`Pokemon`): typed `ListPokemon` and `GetPokemon`
  requests to the public [PokéAPI v2](https://pokeapi.co/docs/v2). List requests
  use `limit=12` and `offset`; detail requests accept a name or numeric ID.
  Successful responses are cached in memory for that page instance. Network
  errors remain visible, and leaving the page aborts outstanding requests.
- **Timer**: editable interval and Loop, Start/Stop/Restart controls and real
  OnStart/OnTimer/OnStop feedback. Leaving the page stops its Timer.
- **File / Video Upload** (`Files`): local file/video selection and explicit
  private RestGO uploads, real transfer progress, video pause/resume/cancel and
  a runtime account login. Sending requires the project's own RestGO Connection
  and user account. No credentials or server are bundled with the template.
- **Report Builder** (`Reports`): an editable saved PDF layout with typed
  Title/PreparedFor/Notes parameters, real modal preview and download. Generation
  runs locally and requires no API response or server.

The separate **RestGO** menu demonstrates the application's account lifecycle:
registration and login, email confirmation and password recovery, a protected
profile with avatar upload/removal, session validation/renewal and logout. It
uses only the configured RestGO server and the SDK's public account methods.
`AuroraAccount` is an ordinary project Unit that projects session identity into
the menu and account panels without displaying credential values. The authored
`AuroraMenu` reusable class owns each placement's menu subscription until that
instance is disposed. `AuroraSidebar` owns the page's viewport/menu layout listeners.
The protected profile binds `OnUnauthenticated`; all account pages expose typed
`OnLogin`/`OnLogout` feedback. See [the complete account flow](aurora-restgo-account.md).

Reusable FeatureCards display donut ProgressBars. Data rows alternate `bars`,
`dunnet` and `circus` through a Current row binding from `format` to the bundled
JSON's `/progressFormat` string field; their numeric values remain bound to
`/progress`. Circular controls have enough height to display their percentage.

Navigation is a vertical Menu fixed to the left, 264px wide on desktop, with
the user section enabled and the editable example profile "Demo user". Each
page places the shared **AuroraMenu** reusable as `Navigation`; menu items,
appearance, profile defaults and user-click behavior are edited once through
**Reusable Components > AuroraMenu**. FeatureCard is a separate reusable and
does not contain the application sidebar. Each
page fills the available document width, excluding the vertical scrollbar, so
vertical scrolling does not introduce horizontal scrolling in the responsive
Workspace. Preview and generated applications share this page sizing rule. Each
page's transparent `PageContent` group reserves its horizontal footprint. The
typed `units/AuroraSidebar.ts` binding adjusts that clearance for the mobile
trigger, subscribes only while the page is visible and is disposed with the
page. Native controls retain their Registry layout defaults: only containers
receive row/column child layout. Top-level Panels stretch across the content;
Panels inside rows use flexible fixed-width tracks. Static paragraphs compose
short Default Labels, respecting the Default Label's single-line behavior.
Dynamic status messages and longer summary values use readonly Default Text
Areas so full messages remain accessible without changing the Default styles.

The eight Project Assets include JSON records, the original SVG illustration,
the DASH manifest and four media segments, and `aurora-media-license.txt` with
Sintel attribution and license links. They are saved, reopened and exported with
the project. The original visual/Data/Media examples and Timer/PDF generation
run without an external API or media host. The Pokemon example requires internet
access; account actions and sending files/videos require a configured RestGO
server, with an authenticated session where the endpoint requires one.
PokéAPI requests and file/video uploads start only through explicit actions;
RestGO account pages also observe the SDK's session restoration and validation.
Preserve its media
attribution when distributing the sample. See [third-party notices](../THIRD_PARTY_NOTICES.md).

The creation IPC accepts an optional, allowlisted `templateId` (`blank` or
`aurora-workspace`); omission selects blank. The main process validates this
selection before opening the native destination picker. Templates are composed
in the Component Registry package, then saved through the normal project-file
transaction into the empty project-named directory. Initial template TypeScript
is supplied only during creation and never reapplied when opening or saving an
existing project. No template ID, new format version, remote assets or additional
runtime dependency is persisted. The saved model and authored source files are
the complete project. Template construction also rejects an incomplete visual
catalogue so newly registered visuals cannot be silently omitted from the demo.

## Persisted component metadata

The additive `menus` collection stores shared Menu definitions inline in the
format-2 manifest. Each definition has the visual-document shape and exactly one
`WebMenu` root containing its configuration, style reference and shared event
bindings. Its immutable document ID is referenced by placement
`props.menuDefinitionId`; placements do not persist a configuration copy.
Dimensions, margins, anchors, visibility, enabled state and page event bindings
remain on the placement. The compiler and Designer resolve the shared values
without changing the saved model. The canonical placement layout is independent
of shared orientation so definition edits do not reset page command history.

Definitions own `menus/Name.ts` and `menus/Name.generated.ts`. Authored and
generated files participate in the same owned-file, atomic save/archive and
Save As workflow as pages and reusable definitions. Renaming retains document,
root and item IDs and updates the authored class/generated import through the
TypeScript AST. Duplication assigns new document/root IDs and copies authored
logic. Loading an older manifest supplies an empty collection; legacy standalone
Menus and authored reusable compositions are preserved. Deleting a referenced
definition or saving a missing link is rejected.

Menu profile configuration accepts the optional `user.bindToCurrentUser` boolean.
Missing values normalize to `false`, preserving manual profiles in older projects.
When enabled, runtime projects the application's RestGO session into the profile;
authenticated identity is never serialized. The manual profile values remain saved
for editing and design previews. Menu schema 1 and project format 2 are unchanged.

`WebMenu.props.configuration` stores a `schemaVersion: 1` menu with stable-ID
recursive items, brand/profile data, appearance and responsive behavior. Menus
may enable the optional application Light/Dark action through the configuration's
`themeToggle` boolean. Missing legacy values normalize to `false`; the action
uses the runtime Theme service and does not alter navigation state. Pages
use stable IDs. Project format 2 is unchanged; a shared parser validates menus
and the project parser verifies page references. Custom styles remain intact
when the protected Menu style is materialized. Reusable templates create ordinary
definitions and separate `reusables/Name.ts` files. New placements inherit the
definition dimensions and root item sizing modes. See [Menu](menu.md).

Imported API Client operations may include optional `restGoSource: { apiId, parameterNames }`. The API ID identifies the RestGO publication/method; parameter names record the last imported input set so catalog updates can remove obsolete generated inputs without deleting unrelated fields. This contains no SQL, values or credentials. It is saved with the operation in pages and reusable definitions; project format 2 and API Client schema 1 remain unchanged. Older imports are matched by their stable `restgo-` IDs or exact published route. The Component Registry projects this metadata out of generated browser constructor options. See [API Client synchronization](api-client.md#updating-imported-restgo-apis).

Visual style `fontFamily` values include `sans`, `serif`, `mono`, `roboto`,
`open-sans`, `jetbrains-mono`, `inter`, `lato`, `montserrat`, `poppins` and `nunito`.
These stable IDs are validated in every style state. Font bytes are compiler
resources, so this additive catalog requires no format-version change and does
not rewrite saved styles. See [Project fonts](fonts.md).

`settings.themes` is the single color source in format 2: `{ initialMode: 'light' | 'dark' | 'system', rememberChoice: boolean, colors, customColors }`. `colors` contains every role in `THEME_COLOR_NAMES`, each with `{ light, dark }` values accepting six-digit hexadecimal colors or custom color references. Semantic references use `var(--wr-theme-<role>)`. Roles cannot reference other roles, preventing cycles.

`customColors` contains up to 100 `{ id, name, light, dark }` entries. IDs are unique stable lowercase slugs (up to 64 characters), names contain 1–40 characters, and both values are six-digit hexadecimal colors. **Styles > Themes** edits semantic and custom colors together with Save/Cancel. **Same** writes identical values for fixed colors; otherwise Light and Dark are independent. The shared picker writes `var(--wr-theme-custom-<id>)`. Renaming or reordering preserves links; literal edits unlink individual fields. New projects have semantic Default styles; Aurora and Flat start without custom colors, while Prism includes adaptive Coral, Mint and Sunshine colors. Restore Aurora resets semantic roles without replacing custom colors.

Legacy `settings.colorPalette` lists of up to ten `{ id, name, color }` entries are consumed on loading and moved to `settings.themes.customColors`, preserving IDs/names with `light = dark = color`. The old property is omitted when saving. Existing `var(--wr-palette-<id>)` references remain supported through aliases to the migrated custom theme variables, including in authored TypeScript. A project with neither Themes nor a palette materializes the legacy Aurora entries and semantic defaults. Invalid legacy entries, duplicate identities, and the obsolete string-array shape are rejected. Missing Themes defaults to initial Light with remembering enabled; saved styles are preserved.

Theme settings and references are retained by serialization, manifests, assembly and settings updates. Aggregate and manifest validation reject missing custom identities across styles, theme values, scrollbars, pages and reusable definitions. Removing a fixed custom color detaches links at its last saved value. Theme-specific fields detach to their corresponding value; removal of an adaptive color still used by a shared field is rejected atomically to preserve both appearances. Designer, Styles and compiled applications use the same CSS variables; generated applications require no Designer or Electron dependency. Project format remains 2.

Styles may persist optional `themeOverrides: { light?: { base?, hover?, focus?, active?, disabled? }, dark?: { base?, hover?, focus?, active?, disabled? } }`. Every supplied state uses the same property schema, component applicability and mutually exclusive paint rules as Shared `states`. Overrides merge per property before CSS generation; clearing an override inherits Shared. IDs and bindings remain stable. New projects opt into semantic Default colors, while conversion of saved Default styles and scrollbars is an explicit Themes save option. See [Application themes](themes.md).

Visual component property bags may include `margin`, a finite numeric outer spacing in pixels applied equally to all four sides, and independent `marginTop`, `marginRight`, `marginBottom`, and `marginLeft` overrides. These optional properties do not change the version-2 format or component IDs. Each saved side overrides the shared margin on that side, including explicit zero. Absent values preserve existing style margins, or inherit the shared margin when present. Inspector fallbacks are not persisted until edited.

Version-2 `layout.item` may include `alignSelf` (`auto`, `start`, `center`, `end`, or `stretch`) for individual cross-axis alignment in row/column parents. Parsing a document without this field materializes `auto`; new components use that default. Explicit values override `layout.container.alignItems` on the parent for that item only. Serialization preserves the field in the structural layout section; component IDs and format versions remain unchanged.

Every persisted structure carries `formatVersion`. The current Page-based format is version 2, uses UTF-8 JSON, and separates visual state from TypeScript source.

```text
MyProject/
  MyProject.wrproj
  pages/
    index.wrpage
    index.generated.ts
    index.ts
    404.wrpage
    404.generated.ts
    404.ts
  reusables/
    CustomerCard.generated.ts
    CustomerCard.ts
  assets/
    imported/
      logo.png
    images/
    styles/
  models/
    Customer.ts
  units/
    Helpers.ts
```

## Models, Units, and imported assets

The Project menu provides **Add Model**, **Add Unit**, and **Import Asset...**. Models and Units are authored TypeScript modules, listed in the Explorer and opened directly in Monaco. Models start with an exported class; Units start with an empty module. Their `sourceFiles` manifest entries contain stable `id`, validated `name`, and `kind` (`model` or `unit`). Paths are derived as `models/<Name>.ts` and `units/<Name>.ts`. Authored content remains on disk and in the source map, separate from generated files. Pages, reusable components, Models, and Units share the project language graph; use ordinary relative TypeScript imports such as `../models/Customer`.

Imported assets are selected through the main process native file picker, with a 20 MB limit per file. Each `assets` manifest entry stores a stable `id`, portable `fileName`, `mediaType`, and `base64` content. The manifest owns this binary snapshot so unsaved changes, Save As, and Build use the same content. Save materializes the bytes under `assets/imported/<fileName>`; Build emits the same relative path. The isolated HTTP Preview serves these assets within its publication token and revokes them together with the page. Use that application-relative URL in image sources, fetches, or CSS; the asset view provides its encoded URL. Files with a duplicate portable name are rejected rather than replaced. Existing unowned files are protected by the project save transaction. External edits to a materialized asset do not replace its manifest snapshot.

Both collections default to empty when loading earlier version-2 projects. This is an additive version-2 extension; no format version changes or generated browser runtime dependencies are introduced.

The `.wrproj` manifest contains the project ID, display name, entry page ID, page descriptors, reusable visual definitions, reusable component styles, source-file descriptors, imported asset snapshots, and settings. A `.wrpage` contains page metadata and component nodes. Component and style references use immutable IDs; names are user-facing labels and are not identities.

## General project settings

`settings` stores the application-facing `applicationName`, `applicationDescription`, `locale`, and `timeZone`, alongside the existing Designer grid settings and `outputDirectory`. The application name is the default document title; the description and locale are emitted to both compiled and Preview HTML as optional description metadata and the `lang` attribute. The configured IANA time zone is emitted as `data-webrad-time-zone` on the root HTML element so generated application code can use the same project default without reading IDE state.

The mandatory entry page is named `index`, including its root component, and always uses the automatic `/index` route. Project parsing normalizes legacy entry names and routes while preserving IDs. Opening a legacy project adapts its page class and generated-base import through the TypeScript AST, remaps the source key and debugger breakpoints, and persists the migration on the next save. A conflicting page or reusable name `index` must be renamed before migration; loading rejects the collision without overwriting authored files. The entry page cannot be renamed, deleted or replaced. A second mandatory page named `404` is materialized with deterministic, collision-free IDs when absent, including in existing projects, and persisted on the next save. Its root also uses the name `404`, uses the automatic `/404` route, and cannot be renamed or deleted. The exceptional numeric name is allowed only for pages and WebPage roots; other components still require TypeScript identifiers. Code generation and Monaco map this page to the valid class `Page404` while retaining `pages/404.ts` and `pages/404.generated.ts` filenames. Its content and events remain editable. This normalization keeps the existing format version.

The page root's optional `props.browserTitle` string overrides the browser tab title. Select the page in the Object Inspector and edit **Identity > Browser title**. New pages default to an empty string; older pages may omit the property. Empty or whitespace-only values use `settings.applicationName`, preserving the existing title. The value is independent from the page name, caption, and stable ID, is saved in `.wrpage`, and supports ordinary property undo/redo. Compiled HTML and Preview start with the entry page's title; navigation applies the destination page's title and restores the application name for blank pages. Page code can read or write the typed `this.browserTitle: string` property, including during `OnCreate`/`OnShow`; changing an inactive page does not replace the active page's browser title. This additive property does not change the page or project format version or social/PWA metadata.

`applicationName` defaults to the project display name for new projects. Existing valid v2 aggregates and manifests receive deterministic defaults for all general settings during parsing, then write their canonical values on the next serialization; this additive compatibility rule does not change `formatVersion`. The grid size, visibility, and snapping values are consumed directly by the Designer projection.

`settings.scrollbar` is the application-wide scrollbar style. It stores independent vertical and horizontal thicknesses (`width` and `height`); track color, border color, border width, and radius (`trackColor`, `trackBorderColor`, `trackBorderWidth`, and `trackBorderRadius`); thumb normal, hover, and active colors plus its border and radius (`thumbColor`, `thumbHoverColor`, `thumbActiveColor`, `thumbBorderColor`, `thumbBorderWidth`, and `thumbBorderRadius`); and the `cornerColor` used where horizontal and vertical scrollbars meet. New projects link these colors to theme roles while retaining `width` and `height` `10`, one-pixel track and two-pixel thumb borders, and radius `8`. Older valid v2 projects materialize the original fixed Aurora colors if scrollbar settings are absent and retain saved colors otherwise. Existing projects can explicitly adopt theme-linked scrollbar colors in Styles > Themes. Both shapes serialize canonically without changing format version 2.

The compiler emits this style into generated `assets/app.css`, and Preview uses the same compiled CSS. WebKit-family browsers receive the complete track, thumb, hover, active, corner, border, radius, and axis-size projection through scrollbar pseudo-elements. Firefox progressively applies the supported thumb/track colors and its closest native thickness, so its browser-controlled scrollbar geometry may differ while retaining the configured colors.

`settings.environment` selects `development` or `production` for Preview and generated builds. `settings.environmentVariables` stores unique uppercase names with a string value for each of those environments. The active values are emitted to browser code as the readonly global `Env`, so authored page and reusable code can use `Env.API_BASE_URL`; Monaco receives a generated declaration with completion and type checking for every configured name. These values are part of browser JavaScript and must never contain passwords, private tokens, or other secrets. Older valid v2 projects default to `development` and an empty variable collection; a previously active `staging` value migrates to `production`.

`settings.applicationIcon` is either `null` or a portable `fileName`, SVG/PNG `mediaType`, and base64 `dataUrl`. Project Settings accepts SVG and PNG icons up to 1 MB. Preview embeds the selected icon directly, while a generated build emits it as `assets/icons/application.svg` or `assets/icons/application.png` and references it as the document favicon. Existing valid v2 projects default to no application icon.

`settings.seo` stores optional search and social-sharing metadata: `canonicalUrl`, comma-separated `keywords`, `allowIndexing`, optional `socialTitle` and `socialDescription`, plus an optional portable `socialImage`. A social image contains its original `fileName`, PNG/JPEG `mediaType`, and base64 `dataUrl`; Project Settings accepts local PNG or JPEG images up to 5 MB and recommends 1200 × 630 px. Preview embeds it directly, while a generated build emits it as `assets/images/social-share.png` or `assets/images/social-share.jpg`. Generated and Preview HTML emit the canonical URL, keywords, a `noindex, nofollow` directive when indexing is disabled, and Open Graph/Twitter card tags. Social title and description fall back to the application name and description; a social image selects the `summary_large_image` Twitter card. Existing valid v2 projects receive empty metadata with indexing enabled during parsing; the brief URL-based social-image field is discarded because it is not portable.

## Build, Deploy, and PWA settings

The format-v2 `settings.build` record contains `deployDirectory` (an empty, absolute native, or project-relative destination), `environment` (`production` by default), `minify` (`true`), and `sourceMaps` (`false`). Deploy uses this environment's public `Env` values without changing `settings.environment`, which continues to control Build/F9. The existing project-relative `settings.outputDirectory` is the internal Build destination. Settings are saved transactionally with the Project Model; saving settings does not run Deploy.

The format-v2 `settings.pwa` record contains `enabled` (`false`), `shortName` (empty, falling back to the application name), `display` (`standalone`, `fullscreen`, or `minimal-ui`), `orientation` (`any`, `portrait`, or `landscape`), hexadecimal `themeColor` and `backgroundColor`, and `offline` (`true`). PWA identity and description use General settings. Icons use the existing application icon, converted to 192 and 512 pixel PNG files; a generic application icon is generated when no icon is selected. These records have strict validation and canonical serialization.

**Project > Deploy** uses the Preview's output structure: `index.html`, `assets/app.js`, and `assets/app.css`. Pages, reusable elements, Models, Units and used libraries are compiled into the single classic JavaScript bundle, with unused code removed. Their authoring folders and JavaScript chunks are not exported. Imported assets, icons, sharing images and licenses remain below `assets/`; source maps are optional. No `.wrproj`, `.wrpage`, or authored TypeScript is published. All pages stay available to dynamic navigation. A scoped `.webrad-deploy.json` file tracks generated files and hashes so subsequent deployments can replace generated output and remove obsolete generated folders while preserving unrelated files.

With PWA enabled, Deploy also generates `manifest.webmanifest`, installation icons, and `service-worker.js`. Application-relative URLs work at the host root or inside a subfolder. Serve the folder over HTTPS (localhost also works for development), with JavaScript, CSS, PNG and manifest MIME types. Offline mode caches only the generated application shell, including root/index navigation with query parameters; authentication, API responses and external media remain online operations. Disabling PWA emits a small retirement worker that removes this application's previous registration and cache. Preview does not register a service worker. Installation controls remain browser-owned.

## Native Application settings

`settings.nativeApplication` is additive to project format version 2. Aggregate and `.wrproj` parsing materialize independent defaults for omitted records and nested fields; invalid types, unknown fields and private signing fields are rejected. Existing project/page/component IDs and authored files remain unchanged. New projects and legacy projects without this record inherit the application name from General settings. Subsequent edits to the native name are independent of the web title.

The canonical record has this shape (the displayed name is an example):

```json
{
  "applicationName": "Portal",
  "identifier": "com.webrad.application",
  "version": "0.1.0",
  "description": "",
  "publisher": "",
  "icon": null,
  "desktop": {
    "width": 1024,
    "height": 768,
    "minWidth": 320,
    "minHeight": 240,
    "resizable": true,
    "fullscreen": false,
    "maximizable": true
  },
  "mobile": {
    "orientation": "auto",
    "fullscreen": false,
    "statusBar": true,
    "safeArea": true,
    "icon": null,
    "splashScreen": null
  },
  "build": {
    "platform": "windows",
    "architecture": "host",
    "outputDirectory": "native-dist",
    "configuration": "release",
    "bundleFormat": "nsis"
  },
  "security": { "networkOrigins": [] },
  "signing": {
    "windowsCertificateThumbprint": "",
    "appleSigningIdentity": "",
    "appleTeamId": "",
    "appleNotarizationProfile": "",
    "androidKeystorePathEnvironmentVariable": "",
    "androidKeystorePasswordEnvironmentVariable": "",
    "androidKeyAliasEnvironmentVariable": "",
    "androidKeyPasswordEnvironmentVariable": "",
    "iosExportMethod": "debugging"
  }
}
```

`identifier` is a portable reverse-DNS value such as `com.example.portal`, with letter-led alphanumeric segments. `version` is numeric `major.minor.patch`. `icon`, `mobile.icon` and `mobile.splashScreen` use the same bounded SVG/PNG snapshot shape as `settings.applicationIcon`. Desktop dimensions are positive integers no larger than 32768; minimums cannot exceed initial dimensions. Mobile orientation is `portrait`, `landscape` or `auto`. Persisting a platform preference does not establish native support for every visual option; unsupported generation options receive an explicit build diagnostic.

Build platforms are `web`, `windows`, `linux`, `macos`, `android` and `ios`; configurations are `debug` and `release`. Formats are platform-specific: `web`; Windows `exe` (raw executable), `nsis` (EXE installer), `msi`; Linux `deb`, `rpm`, `appimage`; macOS `app`, `dmg`; Android `apk`, `aab`; iOS `ios-app`, `ipa`. Architecture selection uses the exported compatibility helpers: host/x64/x86/arm64 on Windows, host/x64/arm64 on Linux, host/x64/arm64/universal on macOS, arm64/armv7/x64/x86 on Android, and arm64/arm64-simulator/x64 on iOS. Web uses `host`; IPA requires arm64 device. Host/toolchain restrictions are checked separately from this portable model.

`outputDirectory` is an absolute or project-relative filesystem path, bounded to 4096 characters and excluding control characters. It does not grant filesystem access: Electron main still requires its own native directory capability, verifies paths and creates a new result folder. Intermediate/cache paths are not persisted here.

`security.networkOrigins` contains up to 100 exact HTTP(S)/WS(S) origins, without credentials, resource paths, queries, fragments, backslashes or wildcard hosts. A trailing slash normalizes to the URL origin. The main process may add origins from saved static API/RestGO endpoints; dynamically authored endpoints require explicit configuration. This CSP setting does not bypass server CORS.

Signing fields identify certificates already present in the OS store/keychain or uppercase environment-variable names. The Windows thumbprint is hexadecimal and Apple Team ID has ten uppercase letters/digits. Android passwords and keystore values are resolved only by the build host. `iosExportMethod` is `debugging`, `release-testing` or `app-store-connect`. Never add certificates, private keys, passwords or administrative RestGO tokens to this record, browser environment variables or frontend assets. See [Native Build](native-build.md).

## RestGO project settings

The RestGo workspace configures the instance and session, while **Dynamic API version** is selected per operation in API Client. Each saved operation may contain `apiVersion`, a positive safe integer or `null`. A selected version prefixes the relative database/endpoint path with `/v{version}` (replacing an existing leading version segment); omitted/null leaves the saved path unchanged. The browser tester and generated applications use the same path builder. Use an instance base URL without a version suffix. The historical `settings.restGo.apiVersion` remains readable and preserved for compatibility with authored SDK calls, but is no longer edited in the connection settings and does not control API Client operations. The additive operation field keeps format version 2 and API Client schema version 1 compatible.

`settings.restGo` stores the public native RestGO connection and session policy:

```json
{
  "enabled": false,
  "baseUrl": "",
  "apiToken": "",
  "apiVersion": 1,
  "defaultDatabase": "",
  "persistSession": true,
  "sessionStorage": "local",
  "storageKey": "webrad-restgo-session"
}
```

These are deterministic defaults for new projects and older valid version-2 aggregates/manifests that omit the additive setting. Partial legacy settings materialize missing fields; unknown fields and invalid values are rejected. `formatVersion` remains 2. Enabled integration requires an absolute HTTP(S) instance URL without credentials, query, fragment, or backslashes. A reverse-proxy path is allowed. `apiVersion` is a positive safe integer, `defaultDatabase` is optional and restricted to a portable slug, and `sessionStorage` is `local`, `session`, or `memory`.

`apiToken` is an optional application API token, stored as a string with an empty default. It is trimmed and limited to 4096 printable ASCII characters without spaces or a `Bearer` prefix. Older projects that omit it remain compatible with format version 2. The single **RestGo integration** settings section edits this value together with the connection and session policy. The compiler includes a configured value in browser output: it is not a server secret. Automatic dynamic API calls use the raw token when no user session exists, then use `Bearer <JWT>` during a session; logout restores the raw-token selection. Signup and login always omit `Authorization`, including when a token or session exists. Applications using only public signup/login can leave this value empty. This authentication behavior requires no project-format change; the server must allow public registration. Explicit credential modes and other endpoint contracts remain unchanged.

The manifest never includes user JWTs, refresh tokens, administrative credentials, or SDK response data. The runtime stores one atomic browser record containing `baseUrl`, `token`, `expiresAt`, and the optional paired `refreshToken`/`refreshExpiresAt`, bound to the normalized RestGO instance URL. Restoration validates the credential or renews an expired JWT against the server before exposing a user identity. Legacy JWT-only records remain readable; records with incomplete refresh pairs are discarded. Persisted credentials for another instance are never sent to the current server. No project-format migration is required for refresh support: renewal is enabled automatically by the SDK.

`WebApiClient.props.apiClientConfig` retains configuration schema version 1. Its additive optional `connection` accepts `custom`, `restgo-session`, `restgo-api-token` or `restgo-public`; omission has the original custom behavior and remains omitted when existing configurations are parsed. RestGo-bound clients obtain their fixed URL prefix from `settings.restGo.baseUrl`; the component's saved `baseUrl` is only used by custom mode. Operation endpoints cannot use absolute or protocol-relative URLs, backslashes, fragments, whitespace, decoded dot-path traversal, encoded separators, or malformed URL encoding to replace or escape that prefix. Enabled `Authorization` entries in either default or operation headers are invalid in bound mode. Session mode requires the SDK's current user JWT, application-token mode exclusively reads the browser-visible `settings.restGo.apiToken`, and public mode omits authorization and cookies. The automatic user JWT, authenticated session, temporary test JWT/API Token, selected upload files, and response samples remain transient and are never added to the saved configuration.

The RestGo workspace exclusively edits the saved `settings.restGo` record. Its administrator token is separate main-process session data, with optional OS-encrypted persistence in the local IDE profile. The project manifest contains no administrative credential or copied server catalog. Importing a published API stores only its existing operation contract (relative database/endpoint path, method, version, input parameters and selected response schema); an API Client uses one authentication mode. This is an additive schema-v1 configuration change, requiring no project-format increment.

Operation `method` remains an arbitrary valid HTTP token rather than a closed enum. The editor's standard catalogue contains GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, CONNECT, and TRACE; browsers reject CONNECT, TRACE, and TRACK at execution. `body.kind` supports `none`, `json`, `text`, `form-urlencoded`, and the additive `form-data` value. For either form kind, `body.content` stores URL-encoded text fields such as `name=Cliente&tag=novo&tag=ativo`; multipart execution turns those repeated fields into browser `FormData`. File/Blob values are only supplied programmatically at runtime and are never persisted. These additions retain project format version 2 and stable operation/component IDs.

Body templates use `<name>` placeholders in `body.content`. The additive optional `body.parameters` stores up to 200 unique `{ "name": "idinstancia", "type": "integer" }` definitions; supported types are `string`, `number`, `integer`, `boolean`, `object`, `array`, and `null`. Names are derived from the current template, repeated placeholders share one definition, and deleted names are pruned when saving the editor. Parameter types are persisted, while all test values remain outside the Project Model. Existing bodies without definitions keep their original shape; placeholders without an explicit definition default to `string`. Runtime `execute(name, { parameters: values })` resolves the template with JSON-safe escaping and validates types before sending. An explicit `options.body` overrides the configured template. This remains project format 2 / API Client schema 1.

API Client configuration schema version 1 accepts zero to 100 operations. Removing the final endpoint persists `operations: []`; normalization and compilation preserve that empty collection instead of restoring a default request. New clients still start with one default operation. A Data Grid referencing a removed operation continues to report its existing missing-operation validation error.

## ComboBox configuration

Static ComboBoxes persist `items: string[]` and optional `values: string[]`. A non-empty `values` array has one key per label, paired by index. An absent or empty array uses each label as its key. `value` remains the selected string key; the separate `values` collection is available in the concrete runtime class and Monaco. The registry opens one transactional multiline editor for both lists, and compilation rejects a non-empty array with a mismatched count.

`WebComboBox.props.comboBoxConfig` is either `null` (static `items`) or a strict version 1 object: `{ schemaVersion: 1, apiClientId, operationId, listPath, displayField, keyField }`. Client and operation references use stable IDs within the same page or reusable definition. `listPath` is a response-relative JSON Pointer to a saved list node; `displayField` and `keyField` are pointers relative to one list item. An empty field pointer selects a scalar item itself. Labels and keys must reference saved scalar fields; nested objects are traversable, while arrays nested inside another item are excluded. Static items remain saved when binding the API, so switching back restores them. API results are runtime state and are never serialized. An API binding uses the saved string `value` as its initial selected key; design-time `selectedIndex` is available for static items. The compiler validates references and all three paths before emitting Preview.

## Reusable visual components

`reusableElements: ReusableElementModel[]` is stored inline in the manifest. A reusable element deliberately uses the same document shape as a page (`formatVersion`, immutable `id`, `name`, `caption`, dimensions, component nodes, and `rootComponentId`) so it can use the normal Designer, history, bounds, responsive-layout contract, events, and typed code-behind. It is nevertheless a definition, not a page: its root must be `WebPanel`, it has no route, page descriptor, or `.wrpage`. Its deterministic sources are `reusables/<Name>.generated.ts` and `reusables/<Name>.ts`; its document ID and portable name must be unique across both pages and reusable definitions.

A placement is an ordinary `ComponentNode` of type `WebReusableElement`. It contains no copied definition children; its required `props.reusableElementId` points to the immutable definition ID. The placement owns its own name, bounds, v2 `layout`, visibility, and placement settings, while the referenced definition owns the shared visual hierarchy. This distinction lets one definition be placed many times without a later definition edit being copied into prior instances.

Older valid version-2 project aggregates and manifests that do not contain `reusableElements` are normalized to an empty collection during parsing. Their next deterministic serialization writes the empty collection; this additive compatibility rule does not change `formatVersion`.

Aggregate validation checks every `WebReusableElement` reference in pages and reusable definitions. A reference must be non-empty and name an existing definition. Definitions may use other definitions, but their reference graph must be acyclic, including direct self-references. The project-model removal helper refuses to remove a definition while any page or reusable definition still references it; callers must first remove or repoint every placement. References are stable IDs, so renaming a definition does not change its placements.

`WebReusableElement.props.placement` is `in-flow` by default. In-flow instances use the normal v2 item/container responsive rules of their parent. `placement: "floating"` turns only that placement into a viewport-owned overlay: its `bounds.width` and `bounds.height` remain the instance dimensions, and `bounds.x`/`bounds.y` become offsets from `floatingHorizontalAnchor` (`left`, `center`, or `right`) and `floatingVerticalAnchor` (`top`, `center`, or `bottom`). `floatingZIndex` is a finite integer layer. A floating instance is `position: fixed`, does not consume parent flow, and does not alter the definition's shared layout. Browser mounting places its element in a page-owned sibling overlay layer outside the styled page tree, so a transformed or clipped parent cannot make the viewport overlay local.

At browser mount time the runtime expands a placement into a transient instance tree. Definition node IDs remain immutable template IDs in the Project Model; physical browser/runtime IDs are scoped as `<placement-id>:<template-node-id>` (and compose for nested placements). Each mounted definition also exposes an explicit mapping from its template IDs to physical IDs. Thus two placements of one definition never share a DOM element, component object, event subscription, or mutable code-behind state, even if a physical scoped ID needs a collision suffix. The transient nodes retain their template ID for diagnostics/inspection and are never written back to the project.

The compiler generates a `WebReusableElementInstance` base class for each definition and creates one user-authored class instance per placement. It exposes the definition's visual controls as typed fields, including a tray-authored `WebPopup`, creates its DOM-less nonvisual components, and binds every persisted event in exactly the same way as a generated page class. The IDE therefore provides Design, Code, Preview, nonvisual palette insertion, and event-handler creation for a reusable definition. A host page still sees only the `WebReusableElement` wrapper; definition descendants remain encapsulated inside the reusable class.

Version 2 removes the page-level `layoutMode`. Each `ComponentNode` instead has a required `layout` object, so the same node declares both how it lays out direct children and how it participates in its parent. `layout.container` contains `mode` (`fixed`, `align-to-parent`, `row`, or `column`), four numeric paddings, `gap`, `wrap`, `justifyContent`, and `alignItems`. `layout.item` contains width and height modes (`fixed`, `stretch`, or `fit-content`), minimum/maximum dimensions, `grow`, `shrink`, horizontal and vertical anchors, and `left`, `right`, `top`, and `bottom` insets. Maximum dimensions are either a non-negative number or `null`; padding, gap, minimum dimensions, and grow are finite non-negative numbers. Insets are finite numbers.

`fit-content` is content-driven rather than a request to compress descendants. Its browser projection starts from the intrinsic `max-content` size, never flex-shrinks the fit axis, and applies the persisted minimum/maximum constraints. For containers with fixed or anchored children (which do not take part in native intrinsic sizing), runtime and Designer measure the rendered child envelope and grow the projected element dynamically. Those measured pixels are transient browser/editor state; they never alter `bounds` or the persisted Project Model. A page root may also use a fit axis, in which case its design canvas and generated page grow around content instead of pinning that axis to the viewport. An in-flow reusable definition gets the same temporary intrinsic floor while its fit placement is measured, except on an axis with an explicit maximum: that maximum remains authoritative and caps both the placement and its definition root. Designer measurements are scoped to each rendered reusable placement, so nested definitions do not collide when a template is used more than once.

Fit-content measurements are deferred while the target or an ancestor has `display: none`, including a closed Popup. The projection retains its intrinsic or last measured size until visible; an unmeasurable zero rectangle must not compress a nested Row Group's buttons when the Popup opens. Hidden children inside a visible container still collapse out of its measured envelope.

New nodes use a fixed container with zero padding and gap, no wrapping, and `start` alignment. Their item defaults to fixed width and height, zero minimums and insets, `null` maximums, zero grow, shrink enabled, and `start` anchors. `bounds` remains persisted as the fixed-layout fallback (`x`, `y`, `width`, and `height`); it is not a second responsive layout mode.

Reusable styles are stored inline in the manifest as `styles: ComponentStyleModel[]`. Each style has an immutable `id`, a project-unique `name`, one compatible visual `componentType`, an optional `preset`, and five structured property maps under `states`: `base`, `hover`, `focus`, `active`, and `disabled`. Every state is always present, even when empty. `preset: "default"` identifies a protected built-in default; a project may contain at most one such style for any component type. Its name and state maps can be customized, but its preset and component type cannot change and it cannot be deleted. Values are typed enums, bounded numbers, validated hexadecimal colors, numeric lengths with an explicit `px`, `rem`, `%`, `vw`, or `vh` unit, or a bounded gradient object. A component optionally stores `styleId` in its `.wrpage` node, allowing any number of compatible visual components to share the same style.

`WebPopup` is an ordinary visual, child-owning `ComponentNode` for serialization and style compatibility, so its `styleId` references a `WebPopup` style exactly as it would for a canvas-presented component. Its `visual: true`, `designerPresentation: "tray"`, and child-container behavior belong to the registered component definition rather than to per-node persisted data: the Designer represents the Popup in the nonvisual tray and opens a centered floating editor when it is selected, while the compiler emits the Popup and its normal child hierarchy in the browser DOM model. The Popup is a pure floating container with one inner child host: it has no `caption` or `message` property, header, or message shell. Its resolved style classes apply directly to the native dialog root through the same visual-style pipeline as every other visual component. The Popup's persisted width and height define the floating window; it has no persisted page position or layout-item behavior. Its saved `layout.container` controls the inner child host, using the same responsive rules as any other container. The runtime turns that DOM node into a native `<dialog>` when shown; browser open/top-layer state is runtime state, not a second persisted page-layout element.

`WebButton` styles collect their icon controls in the `Icon` editor group. The base-state-only presentation properties are `buttonContentMode` (`text`, `text-icon`, or `icon`) and `buttonIconPosition` (`left`, `right`, `top`, or `bottom`); changing a button's content structure on hover or focus would be unstable. `buttonIconColor` and `buttonIconSize` are `WebButton`-only properties available in every style state. Color defaults to `current`, so the icon inherits the text color until overridden; size is an explicit non-negative `px` or `rem` length and defaults to `16px`. The component node owns its individual `icon` prop, selected from the local SVG catalogue shared with the IDE chrome; it defaults to `add` and can be changed independently even when several buttons share a style. The visual picker shows each canonical icon once, searches by icon ID or label, and recognizes common aliases such as `log in` and `door enter`; it includes authentication and door-direction icons such as `login`, `logout`, `door-in`, and `door-out`. New projects set the Default Button presentation to text and icon with a left 16px icon, and icon-only buttons retain their caption as their accessible name.

`textGradient`, `backgroundGradient`, and `borderGradient` share one safe two-color linear-gradient value: `{ "kind": "linear", "direction": "to-right", "from": "#2563eb", "to": "#7c3aed" }`. Its direction must be one of the eight compass directions from `to-right` through `to-top-right`, and both endpoint colors must be six-digit hexadecimal values. Background and border gradients produce static CSS utilities; text gradients target the component's caption element, preserving its background paint. A border gradient is rendered as two background layers — an inner fill clipped to the padding box and the gradient clipped to the border box — over a transparent solid border. This respects the configured border width and radius on native controls as well as ordinary elements, unlike `border-image`. Text gradients are available to labels, buttons, and checkbox captions. Within one state, each gradient is mutually exclusive with its same-target solid color (`textColor`, `backgroundColor`, or `borderColor`), preventing redundant declarations.

The metadata-driven style editor and compiler share one pure property-to-utility generator; users never need to author Tailwind class strings. The compiler converts saved values into exact Tailwind candidates and automatically applies the appropriate variants to `hover`, `focus`, `active`, and `disabled`. Focus also targets compound controls through `focus-within`, while disabled targets native `:disabled` and the common `aria-disabled` root contract. Tailwind source discovery is disabled, so generated CSS contains only the project catalog's candidates plus Tailwind theme variables. Preflight is intentionally omitted to preserve WebRAD component semantics. Generated applications receive static CSS and have no Tailwind runtime dependency.

The reusable-style property catalog covers CSS layout and alignment, dimensions, spacing, typography, button icon presentation, color, and size, solid colors and safe two-color linear gradients for text/background/border, borders and focus rings, effects and filters, transforms, transitions, basic built-in animations, interaction, and image fitting. `WebDataGrid` also has base-state-only, component-exclusive `Data Grid Lines`, `Data Grid Header`, `Data Grid Footer`, `Data Grid Button`, and `Data Grid Checkbox` groups. Each line axis has visibility, color, width, and style, while header and footer each have independent background/text colors, separator border color/width/style, height, horizontal/vertical padding, and font weight. The button group controls cell-button background, text, border color/width/style/radius, horizontal/vertical padding, font weight, content mode, icon position, icon size, and icon color. Its `dataGridButtonContentMode` values (`text`, `text-icon`, and `icon`) apply to every button cell; icon-only captions remain available to assistive technology. Icon sizing is drawn inside a fixed, centered cell-button icon slot, so changing `dataGridButtonIconSize` never changes or vertically offsets the button's layout dimensions. The checkbox group controls the native checkbox accent color and control size plus the fixed caption's text color, font weight, and gap from the control. A missing line-visibility style value defers to the component's `dataGridConfig`; an explicit style value is shared by every compatible grid that references the style. It is distinct from the structural v2 `ComponentNode.layout` contract, which controls responsive container and item behavior. The editor metadata supplies labels, categories, controls, options, applicability, descriptions, and valid defaults. Arbitrary user code, selectors, class lists, raw CSS gradients, and custom keyframes are intentionally outside this format; this keeps persisted candidates bounded, statically compilable, and safe from Tailwind source expansion.

Page documents can be parsed and edited independently while retaining a `styleId`. Cross-document rules are enforced when the aggregate is assembled or saved: style IDs and case-insensitive names must be unique, every component reference must exist, and the style's `componentType` must exactly match the node type. Removing a user-created style through the project-model helper atomically removes it and clears all component references; protected default styles instead remain available for future compatible visual insertion, including tray-authored visual types. Component IDs and unrelated style IDs remain unchanged.

`WebDataGrid.props.dataGridConfig` is a schema-versioned object. Version 2 persists the API binding (`apiClientId`, `operationId`, and `listPath`), header/footer visibility and stickiness, and an ordered collection of stable-ID columns. Each column stores its header/footer text, an optional item-relative JSON Pointer, cell kind (`text`, `image`, `button`, `checkbox`, or `toggle`), optional fixed caption, header/cell alignment, and a width rule: either a fixed pixel width or a dynamic grid track with a minimum, optional maximum, and relative `flex` share. An empty `fieldPath` represents no field selection, allowing a column such as a static action button to render without reading a row value. For a `button`, a non-empty `fixedCaption` replaces the selected row field value as the displayed button text; its nullable `buttonIcon` accepts only names from the closed `WebButton` icon catalogue. Caption and icon are independent, so a button may render caption-only, icon-only, or both. For a `checkbox`, `fixedCaption` adds a fixed label beside the boolean control without changing the bound checked state. `toggle` displays the field boolean with the label-free `WebToggle` appearance, shares the readonly-data and `OnCellClick` contract of checkbox cells, and ignores captions/icons. `fixedCaption` is ignored by text, image, and toggle cells, while `buttonIcon` is ignored by every non-button cell. Existing version 2 columns written before these fields were introduced normalize `fixedCaption` to an empty string and `buttonIcon` to `null`, so the additions do not require a schema-version increment. The grid also stores fixed or content-dynamic row sizing, minimum/maximum row heights, cell padding, wrapping, row stripes, grid lines, and an empty-state message. It contains no returned API data. Reusable styles intentionally persist the visual overrides for grid lines, header/footer, cell buttons, and cell checkboxes in the manifest's compatible `ComponentStyleModel`, rather than duplicating them in this per-instance data configuration. The cell-button override includes its shared content and icon presentation (`dataGridButtonContentMode`, `dataGridButtonIconPosition`, `dataGridButtonIconSize`, and `dataGridButtonIconColor`), which applies to every button column that uses the style. Strict v1 values are upgraded to v2 as part of component/page parsing, so deserialized pages expose one canonical v2 shape and their next serialization persists v2; this preserves source bindings and stable column IDs without changing the page format. Aggregate compiler validation requires the referenced API Client and operation to be on the same page and requires `listPath` to resolve to a `list` node in that operation's saved response contract.

Readers validate the complete document before it enters the model. Only the current version 2 Page schema is accepted; version 1, incompatible, legacy-shaped, and unknown future documents are rejected instead of migrated. Targeted additive normalizations within valid version 2 documents remain supported: legacy `WebPopup.props.caption` and `WebPopup.props.message` are discarded on read, so their next serialization writes the pure-container contract. `styles` is required in version 2 manifests and aggregates. New projects initialize it with protected Aurora defaults for the standard visual component types, including `WebPopup`, each marked `preset: "default"`. A valid version 2 library created before Popup styling gains its protected `Default Popup` entry on read, inserted after `Default Panel` and persisted on the next save; existing Popup nodes keep their current `styleId` (or remain unstyled), while later Popup insertion uses that default automatically. Serialization is deterministic, including the `preset` and `layout` field order, so source-control diffs remain useful.

`WebFileUpload` is nonvisual in version 2. Its property bag contains `accept`, `enabled` and `isPublic`; selections, API responses and byte progress remain runtime-only. The service has no visual properties, `styleId` or reusable style. Its node retains the generic model bounds/layout for structural consistency, while the Designer represents it in the nonvisual tray. Authored code uses `OpenFile()`, `SendToRestGO()` and `Clear()`, with typed `OnProgress` event bindings stored in `events`. There is no compatibility or migration layer for the earlier visual File Upload model or method names.

`WebReportBuilder` is another nonvisual version-2 component. Its `props` contain `previewMode` (`modal`, `new-tab`, `download`), `fileName` and `reportTemplate`. The report template has its own `schemaVersion: 1`, independent of the project version: a name, A4/Letter paper settings and millimetre margins, typed parameter definitions/defaults, and bands with stable IDs. Each band has a kind, height and positioned Text, Image, Line or Repeater elements. Text/image value sources are discriminated as static, parameter, ApiClient response field, current row field or system page value. Repeaters reference a client, operation and list JSON Pointer. Optional `source.scope: 'row'` selects a list relative to the enclosing record instead; omitted/`api` uses the loaded API response. Recursive `children` use coordinates relative to one record column; optional `header`/`footer` store a height and an `elements` tree relative to that section. Optional `layout` stores integer `columns`/`rows`, `columnGap` and `fill: 'rows' | 'columns'`; zero rows means automatic. Optional `appearance` stores nullable background color, border color/width/style, row/column divider flags and line color/width. Repeater heights, spacing and stroke widths use millimetres. Missing optional fields preserve the original one-column, unpainted layout without extra sections. Validation caps nesting at 16 levels, validates every section's local geometry and retains global ID uniqueness. Fixed page bands cannot contain repeaters. Names and IDs of all saved elements survive property edits.

Header/Footer sections additionally support optional `columns` (integer 1–24) and `columnGap` (millimetres). Their direct elements may store a zero-based `column`; omitted means the first column. Each section column owns distinct content and local X/Y coordinates, validated against that column's width. Column counts/gaps are independent of the record grid. These additive fields retain template version 1 and preserve existing single-column sections.

Report elements also support `type: 'group'` with recursive `children` in local coordinates and optional `appearance`: nullable `backgroundColor`, `borderColor`, millimetre `borderWidth`/`borderRadius` and `borderStyle: 'solid' | 'dashed'`. Omitted appearance defaults to transparent fill, a solid 0.2 mm border and zero radius. Groups inherit their enclosing record context and can contain any report element, including other Groups and Repeaters; fixed page-band restrictions still apply recursively. A Group placed directly in a Header/Footer column owns the `column` field; its children do not. The shared 16-level container-depth and global ID-uniqueness rules include Groups. These additive fields retain report schema version 1.

The public browser-safe report parser validates both project templates and imported `.report.json` files, including geometry, parameter types/names, unique IDs, supported versions and row scope. ApiClient references use stable component IDs; copying a report together with its client remaps those IDs, including response fields inside rows, while portable client-name references stay unchanged. User-filled parameter values, response snapshots, generated PDF bytes, Blob URLs and preview state remain transient. No top-level project-format bump or migration is needed. See [Report Builder](report-builder.md).

Generated `.generated.ts` files are replaced atomically. User-authored `.ts` files are changed only from explicit editor state, never by generation; an unowned file collision is rejected instead of overwritten. Page and reusable source paths are deterministic, canonical, and portable across case-insensitive filesystems.

Saves are serialized per project root. Artifact writes have rollback snapshots, the manifest is the commit point after all referenced files exist, and retired or path-reused artifacts are copied to `.webrad/trash/<timestamp>-<id>/` before replacement. A small `.webrad/pending-cleanup.json` journal makes post-commit removal retryable after interruption.

The Project Explorer trash button deletes the selected page, reusable component, Model, Unit or imported Asset after confirmation. Delete on a focused item uses the same confirmation. The last page cannot be deleted; reusable components already placed in documents retain the existing reference validation. Removing a Model or Unit also removes its authored source and breakpoints from the active project; imports and other authored references are not rewritten. Removal is persisted on Save, when the retired files are archived through the transaction above.

# Debugger preferences

Format-v2 manifests may include optional `debugger` metadata with its own `version: 1`, `breakpoints`, `watches`, and `pauseOnExceptions` fields. Breakpoints contain a project-relative authored `.ts` path, a one-based line and optional column, `enabled`, and an optional JavaScript `condition`. Watches are expressions evaluated in the selected paused frame. The exception policy is `none`, `uncaught`, or `all`. Preferences are validated and saved with the Project Model; transient execution state is excluded. Projects without this field retain their existing format. See [the debugger](debugger.md).

# Image empty state

`WebImage.props.placeholder` stores the fixed empty-image choice: `image` (default) or `user`.
Missing values in existing projects use `image`. A null, empty or whitespace-only `src` displays
the chosen muted gray SVG in Designer and compiled Preview; a nonempty source takes precedence.
The runtime exposes `placeholder: WebImagePlaceholder` and accepts `src = null`, while reading
`src` returns an empty string for the empty state. The SVG is a rendering projection and is never
saved into the authored source property or imported assets.

# Video Player aspect ratio

`WebVideoPlayer.props.aspectRatio` optionally stores `none`, `16:9`, or `9:16` in format-v2 documents. Missing values behave as `none`; new components persist that default. Fixed ratios project height from the responsive width through the shared structural layout, overriding vertical sizing and limits without rewriting saved bounds or layout rules. Disabling the ratio restores those saved rules. Runtime assignments affect only the mounted instance. This additive property requires no format-version change.

Protected Aurora Default styles seed `states.base.fontFamily: "roboto"`. Project
and manifest parsing normalizes omitted or `sans` base fonts on these defaults
to `roboto`. Explicit alternative families, interaction-state overrides, user
styles and component bindings are preserved. The next save persists this
normalization without a format-version change. See [Project fonts](fonts.md).

# Video Player default style

Format-v2 project and manifest loading restores a missing protected `Default Video Player` Aurora style with deterministic collision-safe ID/name and links matching colors to the actual project palette. Existing default/custom styles and component `styleId` bindings remain unchanged. New Video Player insertion uses the ordinary default-style binding; an existing unstyled player can select the restored style in the Inspector.

# Panel border progress

`WebPanel.props` may persist `progressEnabled` (boolean, default false) and `progressValue` (finite percentage from 0 to 100, default 0). Indicator visibility is derived as enabled and strictly between 0 and 100; no `progressVisible` field or child component is persisted. Panel styles support `panelProgressColor`, `panelProgressTrackColor` and `panelProgressThickness` (0.5–20 px) in their normal state maps. New default styles link the two colors to Aurora Blue/Border and seed 3 px thickness; saved styles are preserved and missing fields use browser Aurora fallbacks. This is an additive format-v2 extension. See [Panel border progress](panel-progress.md).

# Empty event handlers on save

Save, Save All and Save As prune bound event-handler methods whose bodies contain only whitespace from authored page and reusable TypeScript classes. AST ranges identify the declarations; unrelated source bytes are preserved. Every event referencing a removed method in that document is persisted as `null`, so the Inspector returns to its unbound state. Component IDs do not change and the project format remains version 2.

Methods containing statements or comments, unbound helpers, decorated/static methods, overloads and methods with parameter initializers are preserved. Malformed source is left unchanged. Cleanup is prepared in the existing transactional save payload; failed saves and canceled Save As operations retain the in-memory source and bindings. Edits made while saving are reconciled through the existing revision loop before the project is marked saved.

# ProgressBar

`WebProgressBar.props` persists `format` (`bars`, `dunnet`, or `circus`), finite `min`, `max` and `value`, and boolean `showValue`, alongside shared visual/layout properties. Display values are clamped to valid ranges; invalid saved ranges project to 0–100 without rewriting the model. Geometry and computed percentages are derived values. Styles persist `progressColor`, `progressTrackColor` and `progressThickness` (1–20 SVG units), with the regular visual states. Format-v2 projects and manifests restore the protected, palette-linked `Default ProgressBar` style using collision-safe identities while preserving custom styles and component bindings. See [ProgressBar](progress-bar.md) for the public runtime API.

## Icons (Lucide)

`WebIcon.props` persists `icon` (canonical Lucide name), `mode` (`icon` or
`button`), `accessibleLabel` (string), `strokeWidth` (finite, greater than 0 and
at most 24), and the shared visual/layout properties. There is no `caption`.
SVG nodes and catalogue data are generated from the pinned Lucide dependency,
not stored in individual projects. This is an additive format-v2 component;
missing protected `Default Icons` styles are restored with collision-safe IDs
and names, preserving custom styles and component bindings. See
[Icons](icons.md) for the runtime API, events and accessibility contract.
The original seeded focus ring in a protected Default Icons style is cleared
when loading projects/manifests; custom styles and authored effects are retained.

## Browser routes

Format v2 settings add `routingMode` (`history` by default, or `hash`) and `routingBasePath` (`/` by default). Page paths are derived from lowercase page names; the mandatory routes are `/index` and `/404`. Loading removes obsolete root `props.routePath` values, preserving component IDs. Custom route configuration is no longer supported. See [Browser routing](browser-routing.md) for path validation, compatibility and hosting requirements.
