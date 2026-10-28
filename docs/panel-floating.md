# Floating Panel

Set a Panel's **Placement** to `floating` in the Object Inspector to overlay page
content without reserving space in its parent layout. It follows page scrolling.
`in-flow` retains normal container layout and is the fallback for older projects.

- **Floating alignment**: `none`, `top`, `bottom`, `left`, `right`, or `client`.
- **Floating horizontal anchor**: `left`, `center`, or `right` on an unaligned axis.
- **Floating vertical anchor**: `top`, `center`, or `bottom` on an unaligned axis.
- **Floating layer**: integer `z-index`, initially `100`.

Edge alignments control position while preserving **Responsive width** and
**Responsive height**: `fixed` uses the saved dimension, `stretch` uses available
page space, and `fit-content` follows content, including child changes. Minimum
and maximum sizes, margins, offsets, and child layout still apply. The resulting
size remains anchored to the selected edge.

`client` uses the page origin with the same sizing rules. Set both axes to
`stretch` to fill the page, subject to limits and margins. Floating Panels overlay
other content; grow/shrink distribute space only among in-flow siblings.

The Designer offers resize handles only on `fixed` axes and retains the aligned
edge. `none`, also the fallback for missing `floatingAlignment`, restores free
positioning. X/Y then represent edge distances or center offsets according to the
anchors. Responsive modes still apply. The Designer supports selection, movement,
resizing, and child editing in the overlay.

Panel also supports **Aspect ratio** (`none`, `1:1`, `4:3`, `3:4`, `16:9`,
`9:16`). Fixed ratios derive height from width while retaining the floating
anchor. Saved height rules resume when the ratio is `none`. See
[Aspect ratios](aspect-ratio.md).

Page and reusable instances expose the same typed properties:

```ts
Panel1.placement = 'floating';
Panel1.floatingAlignment = 'top';

// Stretch on both axes fills the page's client area.
Panel1.floatingAlignment = 'client';

// Return to free positioning with anchors.
Panel1.floatingAlignment = 'none';
this.Panel1.floatingHorizontalAnchor = 'right';
Panel1.floatingVerticalAnchor = 'bottom';
Panel1.floatingZIndex = 200;

// Return the same Panel and its children to its original container.
Panel1.placement = 'in-flow';
```

Options persist in `ComponentNode.props` without a format-version change. The
Registry declares `supportsFloatingPlacement` and Inspector metadata. Runtime
Panels use `position: absolute` in an internal page layer outside intermediate
containers, avoiding their transforms and overflow clipping. The layer follows
the page lifecycle. Floating reusable components retain viewport-fixed placement.

Existing coverage lives in `tests/panel-floating.test.ts` (model, Registry,
language API, and compilation) and `tests/panel-floating.browser.test.ts`
(Designer, Preview, export, scrolling, anchors, and placement). The Electron smoke
covers palette insertion, Inspector persistence, projection, F9, scrolling, and
alignment interactions. The later alignment modes were implemented without
running validation; these coverage descriptions are not new execution evidence.
