# Aurora Workspace

Open [AuroraWorkspace.wrproj](AuroraWorkspace.wrproj) in the IDE and press **F9**.
The same project is available under **New Project → Examples & Tutorial**; each
new project receives independent IDs/files. Use **Stop** to return from Preview.

The example contains 20 visual and five nonvisual component types across 13
pages, using the original **Default** styles. Group has no style; reusable
placements project their definition's Panel/child styles. Authored `pages/*.ts`
and `reusables/*.ts` remain separate from `*.generated.ts`; visual models live in
`.wrproj` and `.wrpage` files.

## Shared navigation and layout

Open **Reusable Components → AuroraMenu** to edit navigation shared by all pages.
Each uses a `Navigation` placement. **FeatureCard** remains a separate reusable
with isolated progress. Without RestGo, Menu shows the editable **Demo user**
profile under **Brand & user**. With RestGo, it follows the authenticated user or
shows **Guest**. Clicking the profile opens the account flow.

The vertical Menu occupies the left side. `PageContent` and the `AuroraSidebar`
Unit adjust content clearance for desktop/mobile navigation. Native control
layout is preserved, top-level Panels use available width, and long messages use
read-only Default Text Areas. Page width accounts for vertical scrollbars to
avoid horizontal overflow in Preview/exports.

FeatureCards use ring ProgressBars (`dunnet`). Data rows alternate `bars`,
`dunnet`, and filled `circus` using the JSON `progressFormat` field through Current
Row bindings, while retaining each project's progress value.

## Pages

| Page                               | Demonstration                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview (`index`)                 | Page, Menu, Panel, Group, Label, Button, Icons, ProgressBar, and two isolated FeatureCards.                                                                    |
| Forms                              | Edit, Text Area, Check Box, Toggle, Combo Box, List Box; Review profile opens a Popup and Restore example values resets local fields. No profile data is sent. |
| Data                               | Data Grid and Repeating Group share local JSON through API Client; cell/row selection and Reload example data work locally.                                    |
| Media                              | Local SVG Image, interactive favorite Icons, DASH sample Video Player, and Stop playback.                                                                      |
| Nonvisual → API Client / PokeAPI   | Typed [PokéAPI v2](https://pokeapi.co/docs/v2) calls, 12-item pagination, name/ID search, details, and session memory cache; internet required.                |
| Nonvisual → Timer                  | Editable interval/loop, Start/Stop/Restart, event-driven counter/progress; stops on page hide.                                                                 |
| Nonvisual → File / Video Upload    | Local selection, explicit private RestGo upload, real progress, video pause/resume/cancel; requires your connection/login to send.                             |
| Nonvisual → Report Builder         | Title/recipient/notes parameters, real in-browser PDF modal preview and download.                                                                              |
| RestGO → Registration / Sign in    | Real registration with password confirmation, login, and Remember; registration does not log in automatically.                                                 |
| RestGO → Email / Password recovery | Token confirmation, recovery request, and password reset.                                                                                                      |
| RestGO → Profile / Avatar          | OnUnauthenticated protection, user lookup, avatar upload/removal.                                                                                              |
| RestGO → Session / Logout          | CurrentUser, validation, refresh, expiration, events, logout; tokens are not displayed.                                                                        |
| `404`                              | Unknown-route page with Menu and return to Overview.                                                                                                           |

## Data, services, and media

Data, SVG, DASH manifest, four media segments, and attribution live under
`assets/imported/` and are included in exports. Data/Media, Timer, Report Builder,
and local file selection work without a backend. PokéAPI starts only on explicit
action and caches successful responses for the page session.

Uploads and account operations use your **RestGo integration → Connection** and
application session. Registration, email, and sessions are real; the server must
permit public registration and have email delivery configured. Login passwords
are cleared after attempts and never saved in the model. Menu reflects the same
identity used by uploads. Profile name/email are read-only; avatar changes use
the SDK. See the [account-flow guide](../../docs/aurora-restgo-account.md).

The ten-second Sintel excerpt is credited to Blender Foundation under CC BY 3.0.
Keep [aurora-media-license.txt](assets/imported/aurora-media-license.txt) with
redistributed/exported media. The SVG and JSON records are repository-authored
MIT assets.

The example is materialized through normal project generators. Its documentation
update does not establish new test, smoke, typecheck, or build results.
