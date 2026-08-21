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

The `.wrproj` manifest contains the project ID, display name, entry page ID, page descriptors, and settings. A `.wrpage` contains page metadata and component nodes. Component references use immutable IDs; names are user-facing TypeScript identifiers and are not identities.

Readers validate the complete document before it enters the model. Only the current version 1 Page schema is accepted; incompatible and unknown future documents are rejected instead of migrated. Serialization is deterministic so source-control diffs remain useful.

Generated `.generated.ts` files are replaced atomically. User-authored `.ts` files are changed only from explicit editor state, never by generation; an unowned file collision is rejected instead of overwritten. Page names and descriptor paths are canonical and portable across case-insensitive filesystems.

Saves are serialized per project root. Artifact writes have rollback snapshots, the manifest is the commit point after all referenced files exist, and retired or path-reused artifacts are copied to `.webrad/trash/<timestamp>-<id>/` before replacement. A small `.webrad/pending-cleanup.json` journal makes post-commit removal retryable after interruption.
