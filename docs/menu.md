# Responsive Menu

New configurations use semantic application-theme colors. **Appearance > Follow
application theme** applies the project's colors to an existing Menu while
retaining its dimensions; fixed Light and Dark presets remain available.
Every appearance color supports fixed values and the shared theme color picker.
Open drawers and flyouts inherit live theme changes without rebuilding their
navigation state. See [Application themes](themes.md).

**Navigation > Menu** provides vertical or horizontal navigation, branding,
profile photos, Lucide icons and nested items. Drag Menu from the component
palette, select it and click the canvas, or double-click it to insert. The first
insertion creates a shared `MainMenu` definition automatically; subsequent
insertions use the first definition in the project's **Menus** collection.
Creating a reusable component is unnecessary.

**Add reusable component** creates a blank visual composition. The obsolete
**Responsive menu** option is no longer offered; with only one available
template, the dialog omits the Template selector. Existing reusable Menus remain
supported.

The Inspector's **Menu definition** selector chooses a different definition.
**New menu…** creates and links an independent definition; **Duplicate menu**
copies the selected definition and its authored TypeScript, then links the
placement to the copy. Changing a definition is undoable and preserves the
placement ID and page event bindings.

The Project Explorer's **Menus** folder opens each definition for Design,
Interaction and Code. Its toolbar supports adding, duplicating and deleting
definitions; F2 renames them. A definition cannot be deleted while a page or
reusable component still references it. Existing standalone Menus and authored
reusable Menu compositions remain supported without automatic conversion.

## Automatic placement

WebRAD owns responsiveness and placement. Standalone Menus and reusable
compositions containing only a Menu always float outside the parent layout.
The supported controls are:

- **Desktop orientation**: vertical sidebar or horizontal bar.
- **Horizontal side**: left, center or right.
- **Vertical side**: top, center or bottom.
- **Width** for a vertical sidebar; **Height** for a horizontal bar.
- Minimum/maximum width and height under **Menu size**.
- **Margin top/right/bottom/left**: independent outer spacing in pixels on the
  Menu or reusable placement.

A sidebar fills the viewport height; its default preferred width is 288 px.
A horizontal bar fills the viewport width; its default preferred height is 80 px.
Size constraints can reduce either dimension while preserving the selected edge.
Effective dimensions reserve space for each side's margin on both axes. The
selected edge or center remains active; legacy coordinate offsets remain zero.
For reusable Menus, Margin belongs to the placement and is not duplicated on the
inner Menu. Runtime Menu.marginTop, marginRight, marginBottom and marginLeft
updates refresh the managed layout. Menu.margin remains a TypeScript shorthand
for setting all sides; existing shared values remain a fallback for unset sides.

The Inspector hides generic responsive sizing modes, grow/shrink, anchors,
insets, coordinates, placement and breakpoint controls for these components.
Canvas selection and configuration remain available; position/resize gestures
are disabled because the component owns its layout.

Below 768 CSS pixels, navigation becomes a 48 px trigger with the brand caption.
The modal drawer follows the selected horizontal side, uses the instance's
preferred width and size constraints, and occupies at most 92% of the viewport.
It traps focus, locks page scrolling and closes through its button, backdrop or
Escape. WebRAD owns the breakpoint and effective drawer width.

Designer uses the simulated page width for the breakpoint. A narrow reusable
editing surface does not itself force mobile mode. Designer, Preview and browser
runtime share the layout policy and selection geometry.

## Configuration

Open **Menu configuration > Configure Menu** or double-click the Menu. Opening
configuration from a shared placement edits its Menu definition. The dialog
identifies the definition and its placement count. Items, appearance, behavior
and the selected component style are shared; margins, position, size, visibility
and enabled state belong to each placement. Open **Edit shared menu** to author
the definition's interactions, or open it through the Explorer. Shared edits
have their undo history in the definition document.

- **Items**: stable IDs, icons, descriptions, badges, destinations, visibility,
  disabled state, ordering and nested levels.
- **Brand & user**: logo, photo, name, description and presence. Images accept
  Project Assets paths; profiles without photos use initials.
- **Appearance**: light/dark themes, colors, spacing, icons, indentation and
  collapsed width. Component Style controls corners, shadow and typography.
- **Behavior & layout**: orientation, collapse behavior, accordion, search,
  initial selection, text and closure after selection. Mobile layout is automatic.

The preview switches between desktop and mobile. Save Menu records one command;
Cancel and Escape discard the draft. F9 runs the compiled application.

In **Brand & user > User profile**, enable **Show user profile** and **Bind to
current RestGO user** to use the application's authenticated SDK session. Enable
and configure the project's RestGO integration first. The profile shows the
user's full name (or email), email as the description, session photo (or initials)
and online status. It updates after session restoration, login, user updates and
logout; without an authenticated session, the profile is hidden. Each mounted
Menu releases its subscription on disposal. No IDE account is used.

Manual name, description, photo and status controls are disabled while bound,
but their saved values remain available when binding is turned off. Designer and
the configuration preview use those manual values as samples. `OnUserClick`
receives the displayed session profile. In TypeScript, set
`Menu1.user = { ...Menu1.user, visible: true, bindToCurrentUser: true }`.
`Menu1.user` and `Menu1.configuration` retain the saved configuration; session
identity is a runtime projection and is never written into the Project Model.

### Built-in user settings

Enable **Brand & user > User profile > Enable user settings** to add an accessible
settings button beside the user profile. Enabling it also enables the visible
profile and RestGO binding; unbinding disables settings. This is opt-in for new
and existing Menus (`user.settings`, default `false`). Only the settings icon is
interactive; the photo, name and description are informational and have no hover
action or keyboard tab stop. With built-in settings enabled, the icon opens the
account editor. Otherwise, clicking the icon raises `OnUserClick` for authored
profile actions.

When **Enable user settings** is selected, **User settings language** offers
**English** (`en`) and **Português** (`pt-BR`). The choice is saved as
`user.settingsLanguage` in the shared Menu configuration and applies to the
account dialog, settings-icon accessibility label, validation and feedback/error
messages in Preview and browser exports. The dialog exposes the matching HTML
`lang`. Older configurations default to English. Names, email addresses, file
names and other user data are preserved as authored or returned by the SDK.

With user settings enabled, **Email confirmation URL** and **Password reset URL**
select the public pages opened from the respective email links. Both accept an
absolute HTTP(S) URL without embedded credentials; blank uses the RestGO server
default. They persist as `user.emailConfirmationUrl` and `user.passwordResetUrl`,
including when settings are temporarily disabled. The confirmation URL applies to
manual resend and automatic confirmation after profile/email edits; the reset URL
applies to the editor's password-recovery action. Neither changes the API base URL.

RestGO adds `#email_confirmation_token=...` or `#reset_token=...` to the link. The
destination must be publicly accessible. Any compiled WebRAD page with RestGO
enabled automatically consumes `email_confirmation_token` from the URL, confirms
the email without requiring login and removes the token from the address. No
page handler or Menu placement is required. Password reset remains an explicit
`confirmPasswordReset()` flow because it needs a new password. Supply the
destination page URL, not a token placeholder. Custom confirmation destinations
require the matching updated RestGo self-service endpoints.

The responsive native dialog has Profile and Security tabs, keyboard navigation,
focus trapping, status/error messages and full-screen mobile presentation. It
edits the current user's full name/email, previews and saves/removes their photo,
changes their password, requests confirmation/reset email and signs out. User ID,
activation and email-confirmation state are displayed as server-controlled data.
Changing email or password requires the current password, revokes all sessions
and asks the user to sign in again. Photo operations are saved separately from
profile fields. Secrets remain transient and are cleared when the dialog closes.

The compact editor keeps the active form's submit button and Close action in a
fixed footer while the form body scrolls. Save profile is enabled only when name
or email differs from the loaded values. The email verification badge sits beside
the email label; other account metadata is available in collapsed **Account
details**. Email/password safety guidance appears when changing email. Photo
selection uses a compact toolbar with separate preview/save/cancel actions.
Feedback appears inside the padded footer only during requests or after an action;
there is no persistent synchronization message. Mobile controls retain touch-sized
targets, safe-area spacing and inputs sized to avoid focus zoom.

This requires the updated RestGo backend exposing `PUT /auth/profile` and
`POST /auth/profile/email-confirmation`; older backends return a visible error.
An `administrator permission required` response means the request reached the
administrative authorization middleware despite a recognized user session. Check
that the configured instance has the new self-service routes deployed and that
its proxy forwards them correctly. Granting administrator credentials to the
application is not a remedy. The editor displays an account-action-unavailable
message for this legacy response.
Only the user's JWT session is sent. No administrative API token is used.
Use typed `Menu1.openUserSettings()` / `Menu1.closeUserSettings()` to control the
editor when the option is enabled. It is available in compiled Preview and browser
exports; the Designer/configuration preview remains a sample without account access.

## Submenus

Vertical/mobile branches expand in the scrollable navigation flow. Horizontal
branches use native manual popovers in the browser top layer. They remain Menu
DOM descendants for events, inherited styles and instance isolation, while
escaping ancestor overflow clipping and stacking contexts.

The first level opens below or above its trigger according to available space.
Nested levels open right or left. Positioning follows resize, scrolling and the
visual viewport; bounds are clamped and long branches scroll independently.
The horizontal navigation bar can scroll when its items exceed available space.

Horizontal branches start closed and require an explicit opening action. Only
one sibling branch remains expanded; closing it also closes its descendants.
Outside pointer actions, focus leaving the Menu and Escape close the appropriate
branch. ArrowDown opens a top-level branch and focuses its first enabled item;
Escape restores focus to the owner. Controls expose aria-expanded/aria-controls;
the selected destination exposes aria-current="page".

## Reuse and TypeScript

Each native definition owns `menus/Name.ts` and a separate
`menus/Name.generated.ts`. Its authored class extends the generated class, which
extends `WebMenu`: `this` is the Menu itself. Bind shared events on the root in
Interaction. Custom fields, methods and subscriptions belong to each physical
placement, and the saved configuration is applied before the authored
constructor runs. Override `dispose()` and call `super.dispose()` to release
custom subscriptions.

Page and reusable declarations expose the concrete authored Menu class,
including its custom public methods. `Menu1.member` and `this.Menu1.member`
provide completion, hover, signatures and diagnostics through the ordinary
instance-scoped language contract. Compilation retrieves the existing mounted
instance rather than constructing another Menu wrapper. Renaming and duplicating
definitions use TypeScript AST edits for the authored class and generated import;
existing authored files remain separate from regenerated files.

Every Menu event runs its shared handler first, followed by the handler on the
containing page or reusable scope. Both receive the same cancelable event. The
page handler still runs after shared cancellation and sees
`event.defaultPrevented`. Either handler can synchronously cancel automatic
selection/navigation. Asynchronous continuations are not awaited. Runtime
changes to selection, search, expansion, collapse, items or profile affect only
that physical instance.

Legacy reusable Menu templates keep their `reusables/Name.ts` class, helper
methods and internal child references. They are not rewritten into native
definitions because authored constructors and references may depend on that
composition.

WebMenu and its configuration/item/event types are exported by @webrad/runtime.
Properties include configuration, items, brand, user, appearance, orientation,
selectedItemId, collapsed, searchText, floatingHorizontalAnchor (left/center/right) and
floatingVerticalAnchor (top/center/bottom). placement and floatingZIndex are read-only.
Configuration getters return copies; runtime changes remain transient.

Methods include findItem, updateItem, expandItem, collapseItem, toggleItem,
focusItem, activateItem, open, close and toggle. Events include OnItemClick,
OnSelectionChange, OnItemToggle, OnCollapseChange, OnOpen, OnClose, OnBrandClick
and OnUserClick. OnItemClick receives CustomEvent<WebMenuItemEvent> with item,
itemId and path; synchronous event.preventDefault() cancels selection/navigation.
Page destinations use stable IDs and WebPageRouter; selection follows routing.
External links can open with noopener,noreferrer.

### Interaction on a reusable placement

Select a reusable Menu placed on a page and open **Interaction**. It exposes the
same nine events as its internal Menu: OnSearch, OnItemClick, OnSelectionChange,
OnItemToggle, OnCollapseChange, OnOpen, OnClose, OnBrandClick and OnUserClick.
Double-click an event to author a typed handler in the page's TypeScript. Its
sender is the page's `WebReusableElement`; `event.detail` retains the same Menu
detail type and fields, including `itemId`, `item` and `path` for OnItemClick.

Shared behavior can still be authored on the internal Menu in the reusable
definition. Each interaction invokes that internal handler first, then the
handler on the placement in its containing page or reusable definition. Both
receive the same cancelable event and detail; cancellation in the internal
handler remains visible as `event.defaultPrevented` in the placement handler,
which still runs. Either handler can synchronously call `event.preventDefault()`
to cancel automatic selection/navigation. Handlers start synchronously in this
order; asynchronous continuations are not awaited by the browser interaction.

Bindings are isolated per placement and released with the mounted page. The relay
is internal to the runtime; authored code uses the registered typed events,
without a separate public binding helper.
Existing definitions, authored code and stable IDs are preserved. Ordinary
reusable components without the single-Menu composition do not expose Menu
interactions. The binding is saved on the placement's existing `events` map;
no project format change is required.

## Persistence and integration

Menu SVG sizing and state selectors are retained in Preview and exports even
when the project has no standalone Icons component. The shared `wr-icon-graphic`
class is not exclusively owned by `WebIcon` during CSS pruning; each selector's
containing control determines whether it is needed. Visible Menu icons use the
configured `appearance.iconSize` (20px by default); disclosure chevrons use 16px.
Collapse/expand, mobile drawers, theme changes and horizontal flyouts preserve
these dimensions. Existing smoke interactions assert the actual rendered SVG
geometry across these states; execution requires a validation request.

Project format remains version 2; configuration keeps schemaVersion: 1. Native
definitions are stored once in the manifest's additive `menus` array, whose
documents have exactly one `WebMenu` root. Placements store only
`props.menuDefinitionId`, layout and their own event bindings. Designer and the
compiler resolve configuration and style from that stable reference; the saved
placement does not contain a configuration copy. Shared orientation and collapse
are projected without rewriting placement geometry or resetting page history.
Missing definitions, conflicting
document identities, invalid styles, invalid theme colors and unknown destination
pages fail model validation. Older projects load with an empty collection.

Project loading normalizes Menus and single-Menu compositions to automatic layout,
preserving IDs, content, images, styles and authored TypeScript. Legacy responsive
settings are replaced. mobileBreakpoint/drawerWidth remain accepted legacy
fields but normalize to managed defaults; effective drawer size is computed at
runtime. The placement side supersedes legacy drawerSide. Save persists the
normalized model.

The narrow repair for invalid legacy WebPanel root props.borderWidth: 0 remains.
The parser limits menus to 1,000 items and 12 levels, rejecting duplicate IDs,
missing destination pages, invalid icons and executable URL protocols. Registry,
Designer and runtime projections are browser-safe. runtime:sources regenerates
embedded runtime files and Monaco declarations.

The existing Menu smoke covers native palette insertion and drag, shared
definition persistence and authored TypeScript, typed internal/page handlers and
independent search/collapse in two compiled placements. It also covers editing,
saved state, desktop/mobile canvas,
compiled F9, collapse, drawer focus/Escape and horizontal popover geometry,
visible hit targets and focus restoration. It also creates a reusable Menu and
two dragged placements through the IDE, authors internal/page typed handlers,
checks persisted bindings and verifies execution order, isolation and cancellation
in compiled F9. Both smoke runners require this evidence. Execution and other
checks require an explicit validation request; they were not run for this change.

Default Menu has no outer shadow. Project loading updates the exact original
seeded base (zero border, 16 px radius, medium shadow) to shadow none, preserving
style IDs, other states and customized styles. Save persists this adjustment.

Menu navigation and horizontal flyouts use the global scrollbar appearance from
**Project Settings**, including dimensions, track/thumb colors, borders, radii
and hover/active states in compiled Preview and generated applications. The
mobile drawer follows the same settings. Menu CSS does not override scrollbar
width; Firefox retains the global standard-property fallback and forced colors
retain the browser's accessible appearance.

## Application theme switch

**Show theme switch** in **Configure Menu > Behavior & layout** is enabled by
default for new Menus. Existing saved choices are preserved; disable it to hide
the switch. This option displays
an icon-only sun/moon button in the header, opposite the logo. Its accessible
name and tooltip describe the action. It switches
between the application's Light and Dark themes through `Theme.toggle()`, using
the project's remembering preference. It also works in horizontal menus,
collapsed sidebars and mobile drawers. Switching keeps the drawer open and
preserves focus, search text, selection and expanded branches. Theme changes
made elsewhere update the control's icon and accessible action label.

The configurator's interactive preview switches only its local Light/Dark
appearance. It does not change the IDE theme, project settings or the running
application's theme. Designer projections display the control without executing
it. Menus with fixed appearance colors retain those colors; enable
**Follow application theme** in Appearance to make the Menu colors follow it.

`configuration.themeToggle` and the typed `Menu1.themeToggle` property control
visibility. Omitted legacy values normalize to `false`; `schemaVersion` remains

1. Monaco declarations and generated runtime sources include the option.

## Search behavior and OnSearch

Enable **Show menu search** in **Behavior & layout**, then choose **Search behavior**:

- **Filter menu items** (default): filters labels/descriptions locally and expands
  matching paths. It does not trigger OnSearch.
- **Only trigger OnSearch**: leaves item visibility and expanded branches unchanged
  and emits OnSearch when the user presses **Enter** in the search field. Typing,
  pasting and clearing only update the current text; they do not emit the event.
  Enter can submit an empty field or resubmit the same text. Holding Enter and
  confirming an active input-method composition do not submit repeated searches.

Focus outlines the complete rounded search field, including its icon and text
input, using the configured Menu accent. The input has no separate focus ring;
its scoped focus/focus-visible reset takes precedence over the project's generic
control focus style.
The outline does not change the field's dimensions and disappears on blur;
Designer/configurator projections, Preview and exports use the shared CSS.

Bind OnSearch in Interaction. Its typed `CustomEvent<WebMenuSearchEvent>` provides
`event.detail.text` with the original input, including whitespace. The current
value is also available as `Menu1.searchText`. Use `Menu1.searchMode` (`filter` or
`event`) or `configuration.searchMode` to switch modes in TypeScript. Programmatic
searchText/configuration changes do not emit OnSearch, preventing handler loops.
Existing configurations without searchMode normalize to `filter`; schemaVersion
remains 1. The existing Menu smoke selects/persists event mode and checks Enter
submission, silent typing/clearing, explicit resubmission and composition/repeat
suppression while retaining all Menu items. It was not executed.
