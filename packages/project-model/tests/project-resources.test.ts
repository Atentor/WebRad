import { describe, expect, it } from 'vitest';
import {
  assembleProject,
  createProject,
  parseProject,
  projectToManifest,
  ProjectAssetSchema,
  serializeProjectManifest,
  deserializeProjectManifest,
} from '../src/index.js';

describe('project resources', () => {
  it('round-trips source identities and binary assets through the manifest', () => {
    const initial = createProject('Resources');
    const project = parseProject({
      ...initial,
      sourceFiles: [
        { id: 'customer', name: 'Customer', kind: 'model' },
        { id: 'helpers', name: 'Helpers', kind: 'unit' },
      ],
      assets: [{ id: 'asset', fileName: 'logo.png', mediaType: 'image/png', base64: 'AP8B' }],
    });
    const manifest = deserializeProjectManifest(
      serializeProjectManifest(projectToManifest(project)),
    );
    expect(assembleProject(manifest, project.pages)).toEqual(project);
    const legacy: Record<string, unknown> = { ...projectToManifest(initial) };
    delete legacy.sourceFiles;
    delete legacy.assets;
    expect(deserializeProjectManifest(JSON.stringify(legacy))).toMatchObject({
      sourceFiles: [],
      assets: [],
    });
  });

  it('rejects unsafe paths, reserved names, invalid base64 and duplicate portable paths', () => {
    const initial = createProject('Resources');
    for (const name of ['../Customer', 'CON', 'class']) {
      expect(() =>
        parseProject({ ...initial, sourceFiles: [{ id: 'file', name, kind: 'model' }] }),
      ).toThrow();
    }
    expect(() =>
      parseProject({
        ...initial,
        sourceFiles: [
          { id: 'a', name: 'Customer', kind: 'model' },
          { id: 'b', name: 'customer', kind: 'model' },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseProject({
        ...initial,
        sourceFiles: [{ id: initial.pages[0]?.id, name: 'Customer', kind: 'model' }],
      }),
    ).toThrow();
    const asset = { id: 'a', fileName: 'image.png', mediaType: 'image/png', base64: 'AP8B' };
    for (const fileName of [
      '../image.png',
      'C:\\image.png',
      'CON.png',
      'image.png.',
      'image\0.png',
    ]) {
      expect(ProjectAssetSchema.safeParse({ ...asset, fileName }).success).toBe(false);
    }
    expect(ProjectAssetSchema.safeParse({ ...asset, base64: 'invalid!' }).success).toBe(false);
    expect(() =>
      parseProject({ ...initial, assets: [asset, { ...asset, id: 'b', fileName: 'IMAGE.PNG' }] }),
    ).toThrow();
  });
});
