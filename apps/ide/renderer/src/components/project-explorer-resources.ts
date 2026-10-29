import { projectAssetPath, type WebRadProject } from '@webrad/project-model';

export function projectResourceGroups(project: WebRadProject) {
  return [
    {
      label: 'Models',
      entries: (project.sourceFiles ?? [])
        .filter((file) => file.kind === 'model')
        .map((file) => ({ id: file.id, label: file.name, path: `models/${file.name}.ts` })),
    },
    {
      label: 'Units',
      entries: (project.sourceFiles ?? [])
        .filter((file) => file.kind === 'unit')
        .map((file) => ({ id: file.id, label: file.name, path: `units/${file.name}.ts` })),
    },
    {
      label: 'Assets',
      entries: (project.assets ?? []).map((asset) => ({
        id: asset.id,
        label: asset.fileName,
        path: projectAssetPath(asset),
      })),
    },
  ];
}
