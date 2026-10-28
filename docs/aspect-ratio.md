# Component aspect ratios

Panel, Group and HTML expose **Aspect ratio** under **Size & position** in the
Visual Inspector. Choose `none` for free dimensions, or `1:1`, `4:3`, `3:4`,
`16:9` or `9:16` to derive height from width. New components and older nodes
without the property use `none`.

Fixed ratios use the same structural layout projection in the Designer,
compiled Preview and exported browser applications. They take precedence over
saved height, minimum/maximum height, vertical stretch, growth and Fit content.
These saved rules are retained; selecting `none` restores them without changing
the component's identity, children, markup or other properties. Width sizing and
its limits continue to apply. Use **Responsive width = stretch** when the
component should follow the available parent width.

While a ratio is fixed, height controls are read-only and the Designer offers
horizontal resize handles where width is manually resizable. Changing width
updates the displayed height without overwriting the saved free height. A
floating Panel retains its vertical anchor as its ratio-controlled size changes.
Page and reusable definition roots continue to fill their owning surface.
The reusable root Panel's ratio control is therefore read-only.

## Typed runtime API

`WebPanel`, `WebGroup` and `WebHtml` expose `aspectRatio: WebAspectRatio` through
the usual scoped component contract:

```ts
Panel1.aspectRatio = '16:9';
this.Group1.aspectRatio = '1:1';
Html1.aspectRatio = '4:3';

// Restore the saved height rules.
Html1.aspectRatio = 'none';
```

Runtime changes are transient and do not rewrite the saved Project Model.
Unsupported values throw a `TypeError` and receive normal Monaco diagnostics.
The public `WEB_ASPECT_RATIOS` constant contains the six supported values.
Video Player retains its existing `none`, `16:9` and `9:16` API and Inspector
choices while sharing the layout engine.

## Persistence

The value is saved as `component.props.aspectRatio`, independently of the
component's saved `bounds.height` and responsive item layout. The project schema
validates the enum for Panel, Group and HTML. Missing values mean `none`; no
format-version migration is required. Inspector edits use ordinary reversible
property commands.
