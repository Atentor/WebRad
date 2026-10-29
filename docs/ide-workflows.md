# IDE editing and navigation

The Project Model remains the source of truth for applied project changes.
Form drafts are temporary editing state and do not replace the saved project.

## Applying and saving changes

Project Settings uses **Apply changes**. RestGo connection settings use
**Apply configuration**. Both actions update the project; use **Save** or
Ctrl+S afterwards to persist it. Endpoint edits are saved to the selected
RestGo server through their own editor.

The toolbar shows **Pending edits** while a connection, endpoint, project settings
or Inspector field draft still needs attention. RestGo drafts also mark its document.
Closing or replacing a project protects pending RestGo drafts. Closing the
native window checks editor drafts independently of project changes: return to
the editor, explicitly discard all changes, or cancel. Saving the project never
pretends to save a remote endpoint draft. Project Settings also protects its
draft when closing with Escape or the close button.

Settings validation opens the relevant section and focuses its field. Errors
remain associated with their controls. Explorer renaming similarly retains an
invalid name for correction; use the visible apply/cancel actions or Enter/Escape.

## Keyboard and precise editing

- Explorer uses one tab stop. Up/Down move between visible entries, Right/Left
  expand or collapse folders, Home/End jump to the first/last entry, and typing
  selects matching names. F2 renames a supported document; the toolbar also
  exposes Rename.
- Project Settings uses vertical tabs with Up/Down and Home/End. Document view
  tabs use Left/Right and Home/End.
- Focus a workbench divider and use the arrow keys to resize its panel. Shift
  changes the step; Home/End use the minimum/maximum size.
- Enter inserts the focused palette component into the selected container.
- Numeric editors retain incomplete text while typing and identify invalid
  values beside the field. ListBox items retain line breaks while editing;
  blur or Ctrl+Enter applies the list.
- Save and Preview also confirm the focused field, including when invoked from
  a native menu shortcut. Invalid numeric text keeps the editor open with an
  inline error, and a mixed selection retains its individual values on Escape.
- Resize handles retain a usable pointer area at every Designer zoom level.

Explorer search reports matching counts, hides empty groups and explains empty
results with a clear action. Clearing search restores the existing folder state.

## Events, Menus and styles

Editing an event for a multiple selection applies to all selected components
that support it. One history transaction undoes the complete binding change.
The Menu configurator provides local undo for deleting a subtree, preserving
other draft changes.

Light/Dark style overrides show inherited values and their origin. Creating an
override starts from the effective value; clearing it restores inheritance.
The build dialog identifies the target/configuration that produced its result,
even after selecting a different target for the next build.

## Problems and Preview

Live TypeScript diagnostics update the issue count without reopening Problems
while typing. The issues button opens Problems on demand; explicit failed
operations still show their diagnostics.

Preview stays exclusive until **Stop**. Build failures show error messages and
source locations; Stop returns to Problems and selects a navigable error.
Background project updates preserve a running Preview snapshot. If they change
an in-flight build, Preview explains that it must be stopped and started again.
The address displays only the current application route and follows router,
History and Hash navigation without rebuilding or reloading the application.

Route reporting is injected only into in-memory IDE Preview publications. A
parent/iframe message handshake uses the exact target origin. The host accepts
only messages from the current Preview iframe at its publication origin and
validates the route payload. This grants no IDE IPC access to generated code;
exported applications contain no Preview reporting bridge.
