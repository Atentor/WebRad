import { z } from 'zod';
import { getPageNameError, portableFileNameKey } from './naming.js';

export interface ProjectSourceFile {
  readonly id: string;
  readonly name: string;
  readonly kind: 'model' | 'unit';
}

export interface ProjectAsset {
  readonly id: string;
  readonly fileName: string;
  readonly mediaType: string;
  /** Portable binary content; decoded into assets/imported on save and build. */
  readonly base64: string;
}

export const MAX_PROJECT_ASSET_BYTES = 20 * 1024 * 1024;

export function projectSourceFilePath(file: ProjectSourceFile): string {
  return `${file.kind === 'model' ? 'models' : 'units'}/${file.name}.ts`;
}

export function projectAssetPath(asset: ProjectAsset): string {
  return `assets/imported/${asset.fileName}`;
}

export function validateProjectResourceIds(
  project: {
    readonly pages: readonly { readonly id: string }[];
    readonly reusableElements: readonly { readonly id: string }[];
    readonly menus?: readonly { readonly id: string }[];
    readonly sourceFiles?: readonly ProjectSourceFile[];
    readonly assets?: readonly ProjectAsset[];
  },
  context: z.RefinementCtx,
): void {
  const ids = new Set(
    [...project.pages, ...project.reusableElements, ...(project.menus ?? [])].map(
      (entry) => entry.id,
    ),
  );
  for (const key of ['sourceFiles', 'assets'] as const) {
    (project[key] ?? []).forEach((entry, index) => {
      if (ids.has(entry.id))
        context.addIssue({
          code: 'custom',
          message: 'Project resource ID conflicts with another document or resource.',
          path: [key, index, 'id'],
        });
      ids.add(entry.id);
    });
  }
}

const sourceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().refine((name) => getPageNameError(name) === undefined, 'Invalid source name.'),
    kind: z.enum(['model', 'unit']),
  })
  .strict();

export const ProjectAssetSchema: z.ZodType<ProjectAsset> = z
  .object({
    id: z.string().min(1),
    fileName: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (name) =>
          !/[\\/<>:"|?*]/u.test(name) &&
          ![...name].some((character) => character.charCodeAt(0) < 32) &&
          !/[. ]$/u.test(name) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name),
        'Invalid portable asset filename.',
      ),
    mediaType: z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu),
    base64: z
      .string()
      .max(Math.ceil(MAX_PROJECT_ASSET_BYTES / 3) * 4)
      .refine(
        (value) =>
          value.length % 4 === 0 &&
          /^[A-Za-z0-9+/]*={0,2}$/u.test(value) &&
          (value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) <=
            MAX_PROJECT_ASSET_BYTES,
        'Invalid base64 asset content.',
      ),
  })
  .strict();

function uniqueResources<T extends { readonly id: string }>(key: (entry: T) => string) {
  return (entries: T[], context: z.RefinementCtx): void => {
    const ids = new Set<string>();
    const paths = new Set<string>();
    entries.forEach((entry, index) => {
      const id = entry.id;
      const path = portableFileNameKey(key(entry));
      if (ids.has(id) || paths.has(path))
        context.addIssue({
          code: 'custom',
          message: 'Duplicate project resource identity or path.',
          path: [index],
        });
      ids.add(id);
      paths.add(path);
    });
  };
}

export const ProjectSourceFilesSchema = z
  .array(sourceSchema)
  .max(1000)
  .superRefine(uniqueResources(projectSourceFilePath))
  .default([]);
export const ProjectAssetsSchema = z
  .array(ProjectAssetSchema)
  .max(100)
  .superRefine(uniqueResources(projectAssetPath))
  .default([]);
