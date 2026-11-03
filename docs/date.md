# Date

Add **Date** from the Standard palette. It creates a `WebDate` instance named
`Date1`. Set **Mode** in the Inspector to `date` or `datetime`. The same saved
properties drive the Designer, compiled Preview/Debug, reusable placements and
generated browser applications.

## Inspector

| Property          | Behavior                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| Mode              | `date` (default) or `datetime`, using local calendar fields.               |
| Date format       | `dd/MM/yyyy` (default), `MM/dd/yyyy`, or `yyyy-MM-dd`.                     |
| Show seconds      | Adds `:ss` in datetime mode; otherwise time precision is minutes.          |
| Value             | Empty, `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm[:ss]`. Display follows the mask. |
| Minimum / Maximum | Inclusive limits in the same canonical format; empty removes a limit.      |
| Required          | An empty field fails validity when enabled and editable.                   |
| Read Only         | Prevents typing and calendar changes while allowing text selection.        |
| Show calendar     | Shows the calendar button. Alt+ArrowDown opens the calendar.               |
| Placeholder       | Empty shows the current mask; a custom string overrides the hint.          |
| Accessible label  | Empty uses the component name.                                             |

The mask inserts separators during typing, paste and deletion. Impossible dates,
incomplete values, invalid leap days, invalid times and nonexistent local times
during daylight-saving changes remain invalid; they do not roll into another
month or hour. Date-only values use the start of the local day, including zones
where midnight advances during a daylight-saving change. Years are 0001–9999.
ISO values pasted into the field are displayed using the selected mask.

The component owns its calendar popup. It measures the full date field and uses
the same width with a **260px minimum for the popup only**. Both edges align when
the field is at least 260px wide; for narrower fields, the popup keeps its left
edge aligned and extends to the right without resizing the input. It opens
below the field, flips above when needed, and stays inside the viewport near an
edge. Position follows scrolling, resizing and visual-viewport changes. The
browser's Popover top layer prevents ancestor overflow from clipping it; older
browsers fall back to a fixed overlay. Calendar colors use the project theme.
Changing text direction or language is not required for positioning.

Month/year navigation, localized month/week labels, keyboard day navigation,
Today and Clear are provided. In date mode, selecting a day commits and closes.
In datetime mode, select a day, edit hour/minute/optional second, and choose Apply.
Draft time changes do not raise component Input/Change events. A changed committed
value raises each event once. Limits disable unavailable dates and prevent an
invalid date-time from being applied. Escape, clicking outside or moving focus
outside closes without applying; Escape restores focus to the button.

`showPicker()` opens the component popup and returns `false` for disabled,
read-only, detached, hidden or inert controls. It retains its existing public
name. The masked text API and typed values are unchanged. Input, Change, Focus,
Blur, KeyDown and KeyUp remain available in the Events tab.

The earlier `dir="rtl"` workaround was insufficient: Chromium derives the date
input's internal direction from its locale in
[ComputedTextDirection](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/html/forms/multiple_fields_temporal_input_type_view.cc),
then passes that to the native chooser. The component popup now owns its position.
Runtime/visual execution of this replacement has not been requested or run.

**Default Date** is a protected, editable field style matching Edit, with normal
focus/disabled states and project Light/Dark and preset support. Existing
projects receive only the missing default style, inheriting their default Edit
paint and theme overrides; saved IDs and existing styles remain stable. Internal
inputs inherit the root's typography, colors and alignment.

## Typed code

Both bare instance names and `this.` are supported in page and reusable code.
If the component is renamed to `date1`, these same APIs become `date1.date` and
`date1.datetime`. Ordinary lexical shadowing still applies.

```ts
// Date-only field.
Date1.mode = 'date';
Date1.value = '2026-11-03';
const day: Date | null = Date1.date;
const canonicalDay: string = Date1.value; // "2026-11-03"
const display: string = Date1.text; // "03/11/2026"

// Date and time field, with seconds.
Date1.mode = 'datetime';
Date1.showSeconds = true;
Date1.datetime = new Date(2026, 10, 3, 14, 30, 15);
const appointment: Date | null = this.Date1.datetime;
const canonicalTime: string = Date1.value; // "2026-11-03T14:30:15"

Date1.min = '2026-01-01T00:00:00';
Date1.max = '2026-12-31T23:59:59';
Date1.required = true;
if (!Date1.reportValidity()) return;

// Check required and range constraints before saving/API submission.
if (Date1.valid) {
  const payload = { appointment: Date1.value };
  // Pass payload to your configured API operation.
  void payload;
}

Date1.setNow();
Date1.clear();
Date1.date = null; // Also clears the field.
```

`.date` and `.datetime` are readable and writable `Date | null` properties.
Each read returns a fresh object; mutating it does not change the control.
`.date` drops time, while `.datetime` includes the selected time and returns the
start of the day in date mode. Setting `.date` resets the time. Switching to date
mode drops time; changing the display format preserves complete values. Turning
off seconds drops seconds. Programmatic assignments do not fire Input or Change.

`.text` exposes the displayed draft. `.value` is canonical, or empty for an empty,
incomplete or impossible draft. Typed getters return `null` for those drafts.
A complete date outside the configured range still has a canonical value and
typed getters; use `.valid`, `checkValidity()` or `reportValidity()` before saving.
`.validationMessage` explains invalid editable fields. Disabled/read-only fields
are excluded from native validity checks. Assigning malformed canonical `.value`,
`.min` or `.max`, or an invalid `Date`, throws `RangeError`.

Limits are compared at the active precision. A date-only limit in datetime mode
means the start of that day; use an explicit time for the end of a day. Reversed
limits make nonempty values invalid. Assigning an out-of-range value preserves it
for correction instead of silently clamping it.

Values use the browser's local calendar and time zone. There is no implicit UTC
conversion or application-time-zone conversion. For date-only API fields, send
`.value` instead of `date.toISOString()`, which converts an instant to UTC.
When an API explicitly requires a UTC instant, validate the field and convert
`.datetime` explicitly.

## Public API

In addition to the ordinary component visibility, geometry, spacing, focus and
event APIs, `WebDate` exposes `mode`, `dateFormat`, `showSeconds`, `mask` (read-only),
`value`, `text`, `date`, `datetime`, `min`, `max`, `required`, `readOnly`, `placeholder`,
`showCalendar`, `accessibleLabel`, `enabled`, `tabIndex`, `valid` and
`validationMessage` (read-only), `checkValidity()`, `reportValidity()`, `clear()`,
`setNow()`, `showPicker()`, `onInput` and `onChange`.

Runtime declarations are generated from the real class. The runtime retains one
instance per DOM element so authored page/reusable construction preserves the
mounted configuration, listeners and value. Each placement owns its own element
and state. Disposal removes listeners and releases that instance.

Implementation and smoke definitions are present; tests, typecheck, lint,
browser/Electron smokes and builds have not been run for this addition.
