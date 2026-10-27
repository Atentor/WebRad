# Toggle

`WebToggle` is a visual control without a label or `caption`, available under
**Standard → Toggle**. `checked` persists in the Project Model. Enabled state,
visibility, focus, tab order, geometry, responsive layout, and Current Row
bindings follow the shared component contract.

Its runtime class wraps a native button with `role="switch"`, `aria-checked`,
and an accessible name derived from the component name. Click, Space, and Enter
toggle state and emit `OnChange`; disabled controls do not toggle. `OnClick`,
`OnFocus`, and `OnBlur` are also registered. Assigning `checked` in code does not
emit `OnChange`.

```ts
Toggle1.checked = true;
this.Toggle1.enabled = false;
Toggle1.focus();
Toggle1.onChange = (sender) => {
  this.Status1.caption = sender.checked ? 'On' : 'Off';
};
```

Bare and `this` references are typed in pages and reusables, isolated per placement.
`click()` performs native activation. Mounted and generated wrappers share
activation to prevent duplicate toggles/events. `dispose()` removes subscriptions;
the final reference releases activation.

The protected **Default Toggle** style supports interaction states. Custom styles
can set the unchecked background, border, radius, shadow, focus, `toggleCheckedColor`
(checked track), and `toggleThumbColor` (thumb), including theme-linked colors.
The thumb follows state and respects reduced motion. Saved styles and links are
preserved; projects/manifests missing the default receive deterministic IDs/names
with collision handling. These style properties are additions to format v2.

The Data Grid configurator offers **Cell type → Toggle**. It projects the field's
boolean value without changing response data; an unselected field appears off.
Use `OnCellClick` for application logic, as with Checkbox cells. Data Grid styles
also expose `toggleCheckedColor` and `toggleThumbColor`.

The Registry declares `WebToggle` in `WebDataGrid.styleDependencies`. The compiler
retains transitive CSS even without a standalone Toggle, preserving cell rendering
in Preview and exports.
