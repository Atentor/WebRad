# Project format

Every persisted structure carries `formatVersion`. The current Page-based format is version 2, uses UTF-8 JSON, and separates visual state from TypeScript source.

```text
MyProject/
  MyProject.wrproj
  pages/
    PageMain.wrpage
    PageMain.generated.ts
    PageMain.ts
  assets/
    images/
    styles/
  models/
  units/
```

The `.wrproj` manifest contains the project ID, display name, entry page ID, page descriptors, reusable component styles, and settings. A `.wrpage` contains page metadata and component nodes. Component and style references use immutable IDs; names are user-facing labels and are not identities.

Version 2 removes the page-level `layoutMode`. Each `ComponentNode` instead has a required `layout` object, so the same node declares both how it lays out direct children and how it participates in its parent. `layout.container` contains `mode` (`fixed`, `align-to-parent`, `row`, or `column`), four numeric paddings, `gap`, `wrap`, `justifyContent`, and `alignItems`. `layout.item` contains width and height modes (`fixed`, `stretch`, or `fit-content`), minimum/maximum dimensions, `grow`, `shrink`, horizontal and vertical anchors, and `left`, `right`, `top`, and `bottom` insets. Maximum dimensions are either a non-negative number or `null`; padding, gap, minimum dimensions, and grow are finite non-negative numbers. Insets are finite numbers.

New nodes use a fixed container with zero padding and gap, no wrapping, and `start` alignment. Their item defaults to fixed width and height, zero minimums and insets, `null` maximums, zero grow, shrink enabled, and `start` anchors. `bounds` remains persisted as the fixed-layout fallback (`x`, `y`, `width`, and `height`); it is not a second responsive layout mode.

Reusable styles are stored inline in the manifest as `styles: ComponentStyleModel[]`. Each style has an immutable `id`, a project-unique `name`, one compatible `componentType`, and five structured property maps under `states`: `base`, `hover`, `focus`, `active`, and `disabled`. Every state is always present, even when empty. Values are typed enums, bounded numbers, validated hexadecimal colors, numeric lengths with an explicit `px`, `rem`, `%`, `vw`, or `vh` unit, or a bounded `backgroundGradient` object. A component optionally stores `styleId` in its `.wrpage` node, allowing any number of compatible components to share the same style.

`backgroundGradient` is a safe two-color linear-gradient value: `{ "kind": "linear", "direction": "to-right", "from": "#2563eb", "to": "#7c3aed" }`. Its direction must be one of the eight compass directions from `to-right` through `to-top-right`, and both endpoint colors must be six-digit hexadecimal values. It produces a static `background-image` utility and works in every reusable-style state. `backgroundColor` can coexist as the fallback color beneath the image.

The metadata-driven style editor and compiler share one pure property-to-utility generator; users never need to author Tailwind class strings. The compiler converts saved values into exact Tailwind candidates and automatically applies the appropriate variants to `hover`, `focus`, `active`, and `disabled`. Focus also targets compound controls through `focus-within`, while disabled targets native `:disabled` and the common `aria-disabled` root contract. Tailwind source discovery is disabled, so generated CSS contains only the project catalog's candidates plus Tailwind theme variables. Preflight is intentionally omitted to preserve WebRAD component semantics. Generated applications receive static CSS and have no Tailwind runtime dependency.

The reusable-style property catalog covers CSS layout and alignment, dimensions, spacing, typography, colors and safe two-color linear gradients, borders and focus rings, effects and filters, transforms, transitions, basic built-in animations, interaction, and image fitting. It is distinct from the structural v2 `ComponentNode.layout` contract, which controls responsive container and item behavior. The editor metadata supplies labels, categories, controls, options, applicability, descriptions, and valid defaults. Arbitrary user code, selectors, class lists, raw CSS gradients, and custom keyframes are intentionally outside this format; this keeps persisted candidates bounded, statically compilable, and safe from Tailwind source expansion.

Page documents can be parsed and edited independently while retaining a `styleId`. Cross-document rules are enforced when the aggregate is assembled or saved: style IDs and case-insensitive names must be unique, every component reference must exist, and the style's `componentType` must exactly match the node type. Removing a style through the project-model helper atomically removes it and clears all component references; component IDs and unrelated style IDs remain unchanged.

Readers validate the complete document before it enters the model. Only the current version 2 Page schema is accepted; version 1, incompatible, legacy-shaped, and unknown future documents are rejected instead of migrated. `styles` is required in version 2 manifests and aggregates (new projects initialize it to `[]`). Serialization is deterministic, including the `layout` field order, so source-control diffs remain useful.

Generated `.generated.ts` files are replaced atomically. User-authored `.ts` files are changed only from explicit editor state, never by generation; an unowned file collision is rejected instead of overwritten. Page names and descriptor paths are canonical and portable across case-insensitive filesystems.

Saves are serialized per project root. Artifact writes have rollback snapshots, the manifest is the commit point after all referenced files exist, and retired or path-reused artifacts are copied to `.webrad/trash/<timestamp>-<id>/` before replacement. A small `.webrad/pending-cleanup.json` journal makes post-commit removal retryable after interruption.
