# Responsive Menu

New configurations use semantic application-theme colors. **Appearance > Follow
application theme** applies the project's colors to an existing Menu while
retaining its dimensions; fixed Light and Dark presets remain available.
Every appearance color supports fixed values and the shared theme color picker.
Open drawers and flyouts inherit live theme changes without rebuilding their
navigation state. See [Application themes](themes.md).

**Navigation > Menu** provides vertical or horizontal navigation, branding,
profile photos, Lucide icons and nested items. **Project > Add Reusable Component

> Responsive menu** creates a shared definition with its own TypeScript class.
> Instances keep separate selection, expanded state, events and profile state.

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
configuration from a reusable placement edits the shared Menu definition.

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

The template provides setUser, setItems and selectItem in reusables/Name.ts.
Existing authored sources are never overwritten. Menu1.member and
this.Menu1.member provide typed completion and diagnostics; internal references
are scoped to each placement.

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

## Persistence and integration

Project format remains version 2; configuration keeps schemaVersion: 1. Project
loading normalizes Menus and single-Menu compositions to automatic layout,
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

The existing Menu smoke covers editing, saved state, desktop/mobile canvas,
compiled F9, collapse, drawer focus/Escape and horizontal popover geometry,
visible hit targets and focus restoration. Execution and other checks require an
explicit validation request; they were not run for this change.

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
  and emits OnSearch on each user text change, including clearing the field.

Bind OnSearch in Interaction. Its typed `CustomEvent<WebMenuSearchEvent>` provides
`event.detail.text` with the original input, including whitespace. The current
value is also available as `Menu1.searchText`. Use `Menu1.searchMode` (`filter` or
`event`) or `configuration.searchMode` to switch modes in TypeScript. Programmatic
searchText/configuration changes do not emit OnSearch, preventing handler loops.
Existing configurations without searchMode normalize to `filter`; schemaVersion
remains 1. The existing Menu smoke now selects/persists event mode and checks
compiled input/clear events while retaining all Menu items. It was not executed.
