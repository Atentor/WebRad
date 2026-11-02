import type { WebRadProject } from '@webrad/project-model';

export function projectPackageManifest(project: WebRadProject): string {
  return `${JSON.stringify(
    {
      name: `webrad-project-${project.id.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')}`,
      version: '1.0.0',
      private: true,
      webradProjectId: project.id,
      dependencies: project.packages?.dependencies ?? {},
    },
    null,
    2,
  )}\n`;
}

export function assertOwnedPackageManifest(text: string, projectId: string): void {
  const manifest: unknown = JSON.parse(text);
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Reflect.get(manifest, 'webradProjectId') !== projectId
  )
    throw new Error(
      'This folder contains an unmanaged package.json. Move the WebRAD project to its own folder before installing packages.',
    );
}
