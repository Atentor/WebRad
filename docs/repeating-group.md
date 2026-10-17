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

## Runtime and persistence

The public browser class exports `repeatingGroupConfig`, `rows`, `rowCount`, `getRow(index)`, `bindApiClient(client)` and `subscribeRows(listener)`. Setting `rows` also supports authored data using the group's generated row type. Each row exposes its element, typed component lookup and physical component IDs. Every visual instance exposes `currentRowBindings`; removing or replacing a binding restores the previous static value of the removed property, independently in each row.

Format-v2 projects persist a version-1 `props.repeatingGroupConfig` object with the selected API Client/operation IDs, list path, height policy, gap and empty message. Template descendants persist `props.currentRowBindings` as `{ property, fieldPath }[]`. Logical component IDs remain stable; runtime physical IDs distinguish repeated rows and reusable placements. Copying a group together with its API Client remaps the client reference to the copied instance.

Row replacement and disposal release event bindings, child component resources, layout observers and reusable instances. Unsubscribing is idempotent, and cleanup continues for remaining row listeners and native component events when an authored disposer throws. Browser runtime code has no Designer, Node.js or Electron dependency.

## Validation

Coverage includes schema validation and round trips, Registry metadata, command history and clipboard references, row insertion bounds, runtime binding removal and failure-safe teardown, native TypeScript completion/diagnostics and compiled Preview execution. The opt-in Chromium test compares Designer and compiled Preview geometry at 960, 640 and 320 pixels in all four container layout modes with both fixed and automatic row heights, checks fitted group width/height in each mode, and checks per-row method/arrow events, private page state and asynchronous context during reload. It also reviews both editor dialogs at those widths in light/dark themes, checking overflow, footer visibility and initial focus:

```powershell
$env:WEBRAD_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd test -- tests/repeating-group.browser.test.ts --maxWorkers=1 --reporter=dot
```

Run `npm.cmd run runtime:sources` after changing runtime code and `npm.cmd run runtime:sources:check` to verify compiler and Monaco parity.
