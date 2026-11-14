# Repeating Group

`WebRepeatingGroup` renders a vertical list with one editable template per item. It has no header or column definitions. Its children form the template, using the same component tree and responsive layout rules as a Panel.

## Authoring and API data

1. Add **Repeating Group** from the component palette.
2. Open its configuration and select an API Client, operation and response list from the operation's saved response schema.
3. Place components inside the template. Nested Panels, images, labels, buttons and other visual controls retain their ordinary sizing, anchors, alignment, wrapping and container layouts.
4. Select a template component and configure **Current row** to bind its writable visual properties to fields of the selected list item.
5. Execute the API operation in authored code, for example `await ApiClient1.Load.execute()`.

The group observes completed results and never starts a request on its own. Re-executing the operation updates the rows. An empty result displays the configured empty message. Data remains transient; the project saves the component template, response contract and declarative bindings.

The group's item layout controls its size within its parent. Its container layout controls components inside each row. Row height can follow content or use a fixed height, with optional minimum/maximum height and spacing between rows. A fixed height or maximum height creates an internal row scroll area when necessary. With an item width of Fit contents, each mounted row measures its children after attachment, including fixed/anchored children and flow layouts. The Designer's fitted height includes the complete editable row shell; runtime fitted height includes all rendered rows and their gaps.

Binding paths use item-relative JSON Pointers, including escaped property names. String properties accept scalar string, number or boolean values as text. Boolean and numeric properties require matching schema fields. Null or absent values use an empty string, `false` or zero as appropriate. Rendering assigns typed component properties and never inserts response data as HTML. Binding editors group values by their Registry category, show the static fallback, and identify unavailable sources and fields.

## Events and typed row values

Opening an event on a template component creates an additional typed `CurrentRow` parameter. Its value type comes from the bound API operation's response schema:

```ts
import type { WebButton } from '@webrad/runtime';
import type { RepeatingGroup1CurrentRow } from './PageMain.generated';

public async Button1Click(
  sender: WebButton,
  event: Event,
  CurrentRow: RepeatingGroup1CurrentRow,
): Promise<void> {
  this.selectedCustomerId = CurrentRow.value.id;
  Label1.text = CurrentRow.value.name;
  await ApiClient1.Load.execute();
  this.SelectedName.text = CurrentRow.value.name;
}
```

`CurrentRow.index` is zero-based. `CurrentRow.value` remains associated with the original event across `await`, even when the group receives a new response. Page variables and private fields belong to the real authored page; each row owns separate component instances. Both `Label1.member` and `this.Label1.member` in a row event resolve to that event's row. Local variables with the same name retain normal TypeScript shadowing.

Methods and arrow/function property handlers retain the clicked row's component instances. Outside assigned row events, a generated template-component accessor refers to the first row and throws when no row exists. Use `RepeatingGroup1.getRow(index).component<WebLabel>('stable-component-id')` to choose a particular row explicitly. Helper methods can receive the typed `CurrentRow` parameter and use its `component` method when they need explicit row access.

Monaco offers completion and diagnostics for saved response fields and typed component members. Generated source and declarations contain row aliases; authored files remain separate. When changing the response list or schema, reopen assigned events to update their generated parameter imports as needed.

## Calculated component values

Select a visual component inside a Repeating Group and create its `OnCalcRow`
interaction. The synchronous handler runs for that component's physical
instance in each row, after its `Current row` bindings have been applied and
before the next paint. It runs again when rows are recreated or that component's
row bindings are changed. A component nested in another container uses the
nearest Repeating Group's typed `CurrentRow`.

For a Label, the generated handler declares `value` and `setValue` from the
event detail. For example, if the response schema has an `active` boolean, add:

```ts
setValue(CurrentRow.value.active ? 'Active' : 'Inactive');
```

The shortcut targets the component's primary property and enforces its type:
Label and Button captions, Image source, Edit/TextArea/Date/ComboBox/ListBox
value, HTML content and Line caption accept strings; CheckBox and Toggle accept
booleans; ProgressBar accepts a number; Icons accepts a Lucide icon name.
`value` is the property's value after bindings and before calculation. A
component without a primary scalar property,
such as Panel or Group, still exposes `OnCalcRow` and its typed `sender`, but has
no `setValue` shortcut. All component properties can be set through `sender`:

```ts
sender.visible = CurrentRow.value.active;
```

Leaving a property unchanged retains its bound or static value. Calculated
component values do not modify the API response or another row. Keep the handler
fast and synchronous; `setValue` calls after an `await` are ignored. The event
is available on template descendants, including descendants of nested Panels.
Moving an assigned calculation outside its Repeating Group requires removing or
relocating that event binding. The Inspector retains an assigned interaction so
it can be cleared; the compiler reports the missing row context until then.

## Runtime and persistence

The public browser class exports `repeatingGroupConfig`, `rows`, `rowCount`, `getRow(index)`, `bindApiClient(client)` and `subscribeRows(listener)`. Setting `rows` also supports authored data using the group's generated row type. Each row exposes its element, typed component lookup and physical component IDs. Every visual instance exposes `currentRowBindings`; removing or replacing a binding restores the previous static value of the removed property, independently in each row.

Format-v2 projects persist a version-1 `props.repeatingGroupConfig` object with the selected API Client/operation IDs, list path, height policy, gap and empty message. Template descendants persist `props.currentRowBindings` as `{ property, fieldPath }[]` and `OnCalcRow` as an ordinary component event binding. Calculated values remain transient. Logical component IDs remain stable; runtime physical IDs distinguish repeated rows and reusable placements. Copying a group together with its API Client remaps the client reference to the copied instance.

Row replacement and disposal release event bindings, child component resources, layout observers and reusable instances. Unsubscribing is idempotent, and cleanup continues for remaining row listeners and native component events when an authored disposer throws. Browser runtime code has no Designer, Node.js or Electron dependency.

## Validation

Existing coverage includes schema validation and round trips, Registry metadata, command history and clipboard references, row insertion bounds, runtime binding removal and failure-safe teardown, native TypeScript completion/diagnostics and compiled Preview execution. The `OnCalcRow` addition and its updated Electron interaction have not been validated. The opt-in Chromium test compares Designer and compiled Preview geometry at 960, 640 and 320 pixels in all four container layout modes with both fixed and automatic row heights, checks fitted group width/height in each mode, and checks per-row method/arrow events, private page state and asynchronous context during reload. It also reviews both editor dialogs at those widths in light/dark themes, checking overflow, footer visibility and initial focus:

```powershell
$env:WEBRAD_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd test -- tests/repeating-group.browser.test.ts --maxWorkers=1 --reporter=dot
```

Run `npm.cmd run runtime:sources` after changing runtime code and `npm.cmd run runtime:sources:check` to verify compiler and Monaco parity.
