# Panel border progress

A Panel can display progress around its rounded border. Enable **Progress > Enable border progress** in the Inspector, and set **Progress (%)** from 0 to 100. Progress starts disabled at 0.

The indicator appears automatically only while enabled and `0 < progressValue < 100`. At 0, 100 or when disabled it disappears. This controls the indicator only; the Panel, background image and children remain visible. Values are determinate and must be supplied by authored code or bindings; enabling the indicator does not start a timer or operation.

```ts
Panel1.progressEnabled = true;
this.Panel1.progressValue = 35;
const showing: boolean = Panel1.progressVisible;
Panel1.progressValue = 100; // Automatically hide the completed indicator.
Panel1.progressValue = 0; // Ready for another operation.
```

Runtime values clamp to 0–100 and reject NaN/Infinity. `progressVisible` is read-only. The Inspector saves the enable flag and initial percentage in the format-v2 property bag. The live percentage stays within each mounted instance, including separate reusable placements.

In **Styles**, select a Panel style and configure **Panel progress** independently of its regular border/background. The transient style preview shows 50% progress so these controls can be reviewed without enabling progress on newly inserted Panels:

- **Progress color** (`panelProgressColor`): Aurora Blue by default.
- **Track color** (`panelProgressTrackColor`): Aurora Border by default; transparent can hide the remaining track.
- **Progress thickness** (`panelProgressThickness`): 3 px by default, configurable from 0.5 to 20 px.

New Default Panel styles link progress colors to the project palette. Existing saved/custom styles are preserved; missing progress settings use Aurora fallbacks. Normal style states apply to these properties.

Designer, style previews, Preview and Deploy share the SVG geometry. Progress starts on the top edge after the top-left corner and travels clockwise. It follows responsive dimensions, per-corner/elliptical border radii and pixel thickness without stretching the stroke. The overlay is excluded from child layout and pointer hit testing. Geometry observers/listeners are released when the progress disappears or the Panel is disposed. No separate component or layout child is persisted.
