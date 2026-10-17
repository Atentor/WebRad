import { z } from 'zod';

export const DEFAULT_RELEASE_REPOSITORY = 'Atentor/WebRad';
export const stableVersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const assetNameSchema = z
  .string()
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/);
export const updateTargetSchema = z
  .object({
    platform: z.enum(['win32', 'linux', 'darwin']),
    arch: z.enum(['x64', 'arm64']),
    kind: z.enum(['squirrel', 'deb', 'rpm', 'mac']),
    file: assetNameSchema,
    size: z
      .number()
      .int()
      .min(1)
      .max(2 * 1024 ** 3),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signed: z.boolean(),
  })
  .strict();
export const updateManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    version: stableVersionSchema,
    publishedAt: z.iso.datetime(),
    targets: z.array(updateTargetSchema).min(1).max(16),
  })
  .strict();
export type UpdateTarget = z.infer<typeof updateTargetSchema>;
export type UpdateManifest = z.infer<typeof updateManifestSchema>;

export function releaseRepository(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error('Invalid public release repository.');
  }
  return value;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = stableVersionSchema.parse(candidate).split('.').map(BigInt);
  const installed = stableVersionSchema.parse(current).split('.').map(BigInt);
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index]! > installed[index]!;
  }
  return false;
}

export function releaseAssetUrl(repository: string, version: string, file: string): string {
  return `https://github.com/${releaseRepository(repository)}/releases/download/v${stableVersionSchema.parse(version)}/${encodeURIComponent(assetNameSchema.parse(file))}`;
}

export function latestManifestUrl(repository: string): string {
  return `https://github.com/${releaseRepository(repository)}/releases/latest/download/webrad-update.json`;
}

export function parseUpdateManifest(input: unknown): UpdateManifest {
  const manifest = updateManifestSchema.parse(input);
  const keys = new Set<string>();
  for (const target of manifest.targets) {
    const key = `${target.platform}/${target.arch}/${target.kind}`;
    if (keys.has(key)) throw new Error('Duplicate update target.');
    keys.add(key);
    const extension =
      target.kind === 'mac' ? '.zip' : target.kind === 'squirrel' ? '.nupkg' : `.${target.kind}`;
    if (
      !target.file.endsWith(extension) ||
      (target.kind === 'mac' && target.platform !== 'darwin') ||
      (target.kind === 'squirrel' && target.platform !== 'win32') ||
      (['deb', 'rpm'].includes(target.kind) && target.platform !== 'linux')
    ) {
      throw new Error('Update artifact does not match its platform.');
    }
  }
  return manifest;
}
