# Project format

Every persisted structure carries `formatVersion`. Version 1 uses UTF-8 JSON and separates visual state from TypeScript source.

```text
MyProject/
  MyProject.wrproj
  forms/
    FrmMain.wrform
    FrmMain.generated.ts
    FrmMain.ts
  assets/
    images/
    styles/
  models/
  units/
```

The `.wrproj` manifest contains the project ID, display name, entry form ID, form descriptors, and settings. A `.wrform` contains form metadata and component nodes. Component references use immutable IDs; names are user-facing TypeScript identifiers and are not identities.

Readers validate the complete document before it enters the model. Unknown future versions are rejected with a useful diagnostic. Migrations are explicit functions from one known version to the next. Serialization is deterministic so source-control diffs remain useful.

Generated `.generated.ts` files are replaced atomically. User-authored `.ts` files are changed only from explicit editor state, never by generation; an unowned file collision is rejected instead of overwritten. Form names and descriptor paths are canonical and portable across case-insensitive filesystems.

Saves are serialized per project root. Artifact writes have rollback snapshots, the manifest is the commit point after all referenced files exist, and retired or path-reused artifacts are copied to `.webrad/trash/<timestamp>-<id>/` before replacement. A small `.webrad/pending-cleanup.json` journal makes post-commit removal retryable after interruption.
