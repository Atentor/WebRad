# Charts

**Charts** is a visual, browser-only component with doughnut, pie, grouped or
stacked bars, horizontal bars, line, area, radar and polar-area presentations.
Insert it from the palette and use **Configure Charts** in the Inspector or
double-click the component to open its editor.

The **Examples & Tutorial** project includes an editable chart on its **Data**
page. It observes the bundled projects request alongside the Data Grid and
Repeating Group, plots project progress and reports the selected point through
the typed `OnPointClick` handler. Its data works without an external service.

## Sources and configuration

One chart supports up to **five series**, each with its own name, color and
API Client binding. The limit applies to series, not response rows. For each
series choose an **API Client**, **endpoint**, **response list**, **label field**
and numeric **value field**. Lists and fields come from the endpoint's saved
response schema. Test or import the endpoint's response contract in the API
Client editor before configuring its chart binding. Paths use JSON Pointer;
field paths are relative to one list item. An empty field path selects a scalar
list item itself.

The chart observes completed endpoint executions; it does not initiate requests.
For example, execute `await this.ApiClient1.LoadSales.execute()` in the page's
OnCreate handler. A bound chart updates when that endpoint finishes, including
results already available when the binding is attached. Each series can observe
a different endpoint or client. Generated reusable instances use their own local
clients and subscriptions. Responses and selected points are transient runtime
state and are never saved in the project.

Missing fields, nulls, booleans, nonnumeric values and nonfinite measurements do
not become zero-valued points. Empty responses produce an empty series. Circular
charts omit negative values, show the excluded count and retain those values in
the accessible data table. Cartesian charts support negative values; Radar uses
an explicit minimum-to-maximum scale when negatives are present. Categories align
by label and occurrence across series, so the second occurrence of a duplicate
label aligns with the second occurrence in another series. Missing categories
break line/radar segments instead of becoming zero. Multiple circular series
appear as individual charts, with category shades derived from each series
color. Zero values remain in the table and legend.

The editor provides chart type, title, subtitle, series colors, legend position,
grid and data-label visibility, smooth lines, stacked bars/areas, doughnut hole
size, value precision, prefix/suffix and the empty-state message. **Appearance →
Fonts & colors** selects the general text font and a separate legend font from
the eight local project font families. Text, title, subtitle and legend colors
can be selected independently; Reset restores inheritance. **Title icon** opens
the shared Lucide gallery, including search and the option to remove the icon.
The icon appears beside a nonempty title and follows its color.

The same configuration renders in the Designer, editor preview, compiled Preview
and exported browser application. Selected font files and their licenses are
included in generated output. Shared **Styles** supply typography when no chart
override is selected, plus surface, border, radius and shadow. The protected **Default
Charts** style follows the project theme and uses Roboto. Designer and the editor
show an explicitly identified sample illustration; Preview and exports show
actual data or the configured empty state.

**Save chart** saves one undoable `chartsConfig` change. Cancel and Escape discard
the draft. Changing a source selects compatible endpoint/list/field defaults so
incompatible mappings cannot silently carry over. Compilation reports missing
clients/endpoints, stale response paths and nonnumeric value fields.

## Typed runtime and interactions

`Charts1` and `this.Charts1` are concrete `WebCharts` instances in page and
reusable code. Monaco exposes the same public types as generated applications:

```ts
import type { WebCharts, WebChartPointEventDetail } from '@webrad/runtime';

public async Charts1PointClick(
  sender: WebCharts,
  event: CustomEvent<WebChartPointEventDetail>,
): Promise<void> {
  const { label, value, seriesId, seriesName, index } = event.detail;
  this.SelectedLabel.caption = `${seriesName}: ${label} = ${value}`;
  await this.ApiClient1.LoadDetails.execute({ query: { label, value } });
}
```

Use **OnPointClick** for point activation. Its detail includes `label` (string),
`value` (number), `seriesId`, `seriesName` and the point `index`. The instance also
exposes `selectedLabel`, `selectedValue` and `selectedSeriesId`, and a typed
`onPointClick` callback setter. Points support
mouse/touch activation and Enter/Space. OnClick, OnMouseEnter and OnMouseLeave
remain available as ordinary mouse events.

`chartsConfig: WebChartsConfiguration` updates presentation; `data` reads or
sets up to five `WebChartSeriesData` series containing `{ label, value }` points.
`clear()` clears transient chart data. `bindApiClient(client, operationId,
seriesId)` observes a series and returns an unsubscribe function. Generated code
creates the configured bindings and releases them during disposal; handwritten
temporary bindings should also release their returned disposers. Runtime
assignments do not edit the saved model.

The SVG uses the same shared projection in Designer and generated applications,
with responsive geometry, accessible point labels and value tooltips. Runtime
rendering does not require a chart library, external scripts, Electron or Node.

## Persistence

`WebCharts.props.chartsConfig` stores a strict version-1 configuration with
`type`, presentation settings and zero to five `series`. Each series persists
stable `id`, `name`, `color`, `apiClientId`, `operationId`, `listPath`,
`labelField` and `valueField`. Series IDs survive edits and identify click
events. Duplicate series IDs are invalid. This is an additive project-format-v2
component; existing project content and user-authored TypeScript stay intact.

Optional `fontFamily` and `legendFontFamily` use a supported font ID or `inherit`;
`textColor`, `titleColor`, `subtitleColor` and `legendColor` use a six-digit hex
color or `null` for inheritance. `titleIcon` is a Lucide name or `null`. Existing
version-1 chart configurations materialize inherited font/color defaults and no
title icon; no project or chart format-version change is required.
