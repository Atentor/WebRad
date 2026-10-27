# Report Builder

`WebReportBuilder` is a **Nonvisual** component. Double-click it in the Designer
or use **Report template** in the Inspector to open the maximized editor.
The versioned JSON template persists in `props.reportTemplate`. **Save template**
applies an undoable project change; **Cancel** discards the draft. Save the project
to persist it. **Export JSON** writes a portable `.report.json` file. **Import JSON**
and **Import URL** validate the replacement before changing the draft.

## Editor

Elements are **Text**, **Image**, **Line**, **Group**, and **Repeater**. Text sources
include constants, parameters, API Client response fields, current-row fields,
and page number/count. Images accept fixed URLs, parameters, or fields; PDF
rendering supports PNG/JPEG, including data URLs. Lines are graphic elements.

**Title**, **Detail**, and **Summary** appear once in the document flow. **Page
header** and **Page footer** reserve space on every page. Repeaters expand list
records and can contain nested Repeaters with their own **Header**, **Row template**,
and **Footer**. Key grouping and aggregate functions are not implemented.

The editor anchors Page footer to the paper's bottom margin for the selected
size, orientation, zoom, and band height. Summary follows Detail immediately;
unused space remains between Summary and Page footer, matching PDF flow.

Drag palette elements into a band or Repeater section. Palette clicks do not
insert elements. **Edit row template**, **Edit header**, **Edit footer**, and
**Report outline** select nested sections. Drop highlighting identifies the target.
Repeaters are unavailable in page headers/footers. Coordinates respect zoom,
scrolling, and section bounds. Insertion/movement snap to an invisible **8 px grid
at 100%**; resizing snaps right/bottom edges. Stored geometry uses millimeters
(8 px equals 8/3 mm in the editor). Inspector coordinates remain freely editable;
arrow keys move by 0.5 mm, or 5 mm with Shift. Editing has its own undo/redo until
saved. List and field choices come from saved API Client schemas and never execute
requests.

### Group

**Group** contains Text, Image, Line, Repeater, or nested Groups with local X/Y
coordinates. It also works in Repeater row templates and header/footer columns.
Children inherit the current record without creating a data source. Repeater
restrictions still apply inside Groups in page headers/footers.

**Group appearance** sets transparent/solid backgrounds, border color, width,
solid/dashed style, and **Group corner radius**. Width/radius use millimeters and
follow zoom. Borders render inside without moving children. Radius is visually
limited to half the width/height; children retain rectangular boxes without corner
clipping. **Edit group contents**, the canvas label, and outline enter the group;
**Back to group** returns to its container. Move, resize, duplicate, and undo/redo
preserve the tree and bindings.

JSON uses `type: 'group'`, `children`, and optional `appearance` with
`backgroundColor`, `borderColor`, `borderWidth`, `borderStyle`, and `borderRadius`,
retaining `schemaVersion: 1`. Defaults are transparent background, solid 0.2 mm
border, and zero radius. PDF backgrounds/corners are vector graphics drawn before
children. Nested Repeaters can expand a Group's PDF height; the complete Group
stays on one page and must fit the printable area.

### Repeater sections, appearance, and records

Enable **Header**/**Footer** and set their heights in the Inspector. Each prints
once before/after that Repeater's records, even for an empty list. They differ
from page headers/footers. The main component height remains one row-template
height; the canvas adds section heights and expands containers as necessary.

**Header columns** and **Footer columns** independently define 1–24 columns and
millimeter **column gaps**. Each column owns content printed once per section.
Drop into a column or use **Column** to move an element. Coordinates are column
local. Changing count/gaps adjusts child widths. Removing columns retains their
content below remaining content and increases section height as needed. Undo/redo
preserves the complete change.

Body **Columns** also accepts 1–24. **Row gap**/**Column gap** set spacing.
**Fill order** fills across rows or down columns; **Rows per block** limits each
block, with zero distributing all records across the configured columns. Body
columns are editable projections of one shared row tree. Dropping into any cell
updates that common template using cell-local coordinates. The project preserves
stable child IDs. Header/footer columns have independent contents. Column-count
and gap changes proportionally adapt row child geometry without changing bindings.

**Appearance** controls transparent/solid backgrounds, borders, and row/column
dividers. Widths and gaps use millimeters and render as vectors in the PDF.
Nested Repeaters can use independent API results or **Parent row list**, with a
JSON Pointer such as `/orders`. Their body fields use inner records; header/footer
fields can use the outer record. Schema choices follow the corresponding scope
without making requests.

Optional schema-v1 fields are `header`/`footer` (`height`, `elements`, `columns`,
`columnGap`), `layout` (`columns`, `rows`, `columnGap`, `fill`), `appearance`, and
`source.scope` (`api`/`row`). Direct header/footer children can set zero-based
`column`, defaulting to zero. `children` accepts every report element, including
Repeater. Missing options retain one column, no extra sections, and no painting
or dividers. Duplication, parameter renaming, and copied API Client remapping
traverse all sections and nesting levels.

**Parameters** defines names, types, and defaults: text, number, boolean, or ISO
date text such as `2026-10-14`; null is accepted. Renaming updates draft bindings.
**Page setup** selects A4/Letter, orientation, and margins. Geometry uses
millimeters; font size and line width use PDF points.

## Generate from code

Execute API Client operations explicitly first. Generation snapshots successful
responses and parameters; it never executes or refreshes API Clients.
With `Title` (text) and `Period` (date) declared in the template:

```ts
await ApiClient1.Load.execute();
ReportBuilder1.Parameters.Set('Title', 'Active customers');
this.ReportBuilder1.Parameters.Set('Period', '2026-10-14');
ReportBuilder1.previewMode = 'modal';
ReportBuilder1.fileName = 'customers.pdf';
const result = await ReportBuilder1.Generate();
// result.blob: Blob; result.pageCount: number; result.fileName: string
```

`previewMode` supports `modal`, `new-tab`, and `download`, also per call:

```ts
await ReportBuilder1.Generate({ previewMode: 'download', fileName: 'customers.pdf' });
const result = await ReportBuilder1.GeneratePDF(); // Bytes without opening UI.
const bytes = await result.blob.arrayBuffer();
```

Call `Generate()` directly from user activation to open a new tab. Awaiting other
work first can trigger popup blocking. Runtime reserves the tab before PDF
creation. `ClosePreview()` closes the modal; closing/disposal releases object URLs
and resources.

Both generation methods accept an abort `signal` and per-call `parameters`.
`Parameters.Get(name)` reads values; `Parameters.Clear(name)` restores one default,
and `Parameters.Clear()` restores all. `OnGenerate` receives options and supports
synchronous `event.preventDefault()`. `OnSuccess` supplies `WebReportResult` in
`event.detail`; `OnError` supplies an `Error`. Errors also reject the promise.

## External templates and runtime replacement

`LoadTemplate()` accepts an HTTP(S) URL, `Blob`/`File`, `WebReportTemplate` object,
or JSON text. Validation precedes replacement; failures retain the current
template. The latest concurrent load wins. JSON is limited to 5 MiB; external URLs
are subject to CORS.

```ts
await ReportBuilder1.LoadTemplate('https://example.com/templates/customers.report.json');
ReportBuilder1.Parameters.SetValue('ExternalTitle', 'Active customers');
await ReportBuilder1.Generate();
```

`Set`/`Get` offer name/type completion from the IDE's saved template. For external
parameter names, use `SetValue(name, value)` and `GetValue(name)`, validated against
the loaded template at runtime. Existing values survive replacement only when
name and type match. `SaveTemplate()` returns JSON without replacing defaults
with transient parameter values.

Bindings use stable client/operation IDs. Portable templates can also use component
names for `apiClientId` and operation names for `operationId`. Generated code
registers both in page/reusable scope. External templates can bind explicitly:

```ts
ReportBuilder1.bindApiClient('Customers', ApiClient1);
```

Use absolute image URLs in hosted templates; relative paths resolve against the
application, not the template URL.

## Pagination and limits

PDFs are generated in-browser with bundled pdf-lib 1.17.1, without a CDN. Titles,
summary, and repeated rows respect printable space. A complete row, including
expanded nested lists, is never split across pages. Multicolumn row height uses
the tallest record. Headers, footers, and page counts follow final pagination.

Text wraps within its width. Content exceeding configured height fails explicitly;
increase height or reduce font size. Oversized rows also fail. Put fixed elements
above/below Repeaters; repeated elements belong in their child trees. Initial
Helvetica supports Western European characters; other scripts require additional
font support.

Limits are 16 nesting levels, 100,000 expanded records per band, and 10,000 pages.
External templates cannot execute scripts. HTTP results, generated PDFs, runtime
parameter values, and preview state do not persist in the Project Model.

## Existing verification tooling

`npm run smoke:report-builder` exercises PDF generation and report-window isolation
in real Electron. Browser suites `tests/report-builder.browser.test.ts` and
`tests/report-builder-editor.browser.test.ts` use `WEBRAD_BROWSER_PATH` for Chrome/
Chromium and cover compiled PDFs and visual editing.

`tests/report-repeater.browser.test.ts` covers nesting, parent/child fields,
appearance, native palette insertion, save/reopen, and the same template in
compiled Preview. Captures/PDF output use `out/report-builder-review/nested-*`.
Run validation only within the explicitly requested scope.
