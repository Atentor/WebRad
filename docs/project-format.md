# Project format

Every persisted structure carries `formatVersion`. The current Page-based format is version 1, uses UTF-8 JSON, and separates visual state from TypeScript source.

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

Reusable styles are stored inline in the manifest as `styles: ComponentStyleModel[]`. Each style has an immutable `id`, a project-unique `name`, one compatible `componentType`, and five structured property maps under `states`: `base`, `hover`, `focus`, `active`, and `disabled`. Every state is always present, even when empty. Values are typed enums, bounded numbers, validated hexadecimal colors, or numeric lengths with an explicit `px`, `rem`, `%`, `vw`, or `vh` unit. A component optionally stores `styleId` in its `.wrpage` node, allowing any number of compatible components to share the same style.

The metadata-driven style editor and compiler share one pure property-to-utility generator; users never need to author Tailwind class strings. The compiler converts saved values into exact Tailwind candidates and automatically applies the appropriate variants to `hover`, `focus`, `active`, and `disabled`. Focus also targets compound controls through `focus-within`, while disabled targets native `:disabled` and the common `aria-disabled` root contract. Tailwind source discovery is disabled, so generated CSS contains only the project catalog's candidates plus Tailwind theme variables. Preflight is intentionally omitted to preserve WebRAD component semantics. Generated applications receive static CSS and have no Tailwind runtime dependency.

The property catalog covers layout and alignment, dimensions, spacing, typography, colors, borders and focus rings, effects and filters, transforms, transitions, basic built-in animations, interaction, and image fitting. The editor metadata supplies labels, categories, controls, options, applicability, descriptions, and valid defaults. Arbitrary user code, selectors, class lists, gradients, and custom keyframes are intentionally outside this format; this keeps persisted candidates bounded, statically compilable, and safe from Tailwind source expansion.

Page documents can be parsed and edited independently while retaining a `styleId`. Cross-document rules are enforced when the aggregate is assembled or saved: style IDs and case-insensitive names must be unique, every component reference must exist, and the style's `componentType` must exactly match the node type. Removing a style through the project-model helper atomically removes it and clears all component references; component IDs and unrelated style IDs remain unchanged.

Readers validate the complete document before it enters the model. Only the current version 1 Page schema is accepted; incompatible, legacy-shaped, and unknown future documents are rejected instead of migrated. `styles` is required in version 1 manifests and aggregates (new projects initialize it to `[]`). Serialization is deterministic so source-control diffs remain useful.

Generated `.generated.ts` files are replaced atomically. User-authored `.ts` files are changed only from explicit editor state, never by generation; an unowned file collision is rejected instead of overwritten. Page names and descriptor paths are canonical and portable across case-insensitive filesystems.

Saves are serialized per project root. Artifact writes have rollback snapshots, the manifest is the commit point after all referenced files exist, and retired or path-reused artifacts are copied to `.webrad/trash/<timestamp>-<id>/` before replacement. A small `.webrad/pending-cleanup.json` journal makes post-commit removal retryable after interruption.
