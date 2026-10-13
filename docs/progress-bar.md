# ProgressBar

`WebProgressBar` is a visual component in Standard. Choose `format` in the Object Inspector:

- `bars`: horizontal bar.
- `dunnet`: donut ring.
- `circus`: filled circular sector.

The names match the initial component options. All formats share `value`, `min`, `max` and `showValue`. The initial range is 0–100, with value 50 and the percentage visible. The graphic scales to the component bounds; circular formats preserve their aspect ratio and stay centered in rectangular bounds. Responsive dimensions, anchors, margins, visibility and enabled state follow the shared visual-component contract.

The project owns a protected, palette-linked `Default ProgressBar` style, with the Aurora field surface, a 1px solid blue/lilac gradient border and 6px corners. Styles expose progress color, track color, donut ring thickness, typography, border radius and the regular visual style properties and states. Ring thickness is 1–20 units in a 100-unit SVG, so it scales with the graphic. Existing format-v2 projects and manifests receive the missing default without replacing custom styles or bindings. Saved styles retain their authored values; the seeded library applies when creating a project or restoring a missing default.

```ts
ProgressBar1.format = 'dunnet';
ProgressBar1.setRange(0, 200);
ProgressBar1.value = 80;
this.ProgressBar1.increment(10);
const percentage: number = ProgressBar1.percentage; // 45
ProgressBar1.showValue = true;
ProgressBar1.reset();
```

`percentage` is read-only. `setRange(min, max)` updates both limits atomically; the range must be finite with `max > min` and a finite difference. Individual `min` and `max` setters validate against the other current boundary. Runtime values are clamped to the range, and non-finite values are rejected. Invalid saved ranges display using 0–100 without rewriting authored properties.

`OnChange` fires once when the effective numeric value changes, including through `increment`, `reset` or range clamping. Format and percentage-label changes do not fire it. `OnClick` uses the shared component event contract. Bindings and `onChange` are disposed through `WebComponent`. Page and reusable instances support both bare and `this.` typed references with Monaco completion and diagnostics.

The browser runtime exports a concrete `WebProgressBar` class and `WebProgressBarFormat` type. The Designer and runtime share browser-safe SVG geometry, with `role="progressbar"`, accessible name, range, current value and percentage text. Preview and Deploy use the synchronized generated runtime and the same component/style CSS, with no Electron dependency.
