import { z } from 'zod';

/** Only registry names and versions/ranges/tags; never paths, URLs or CLI options. */
export const NpmPackageNameSchema = z
  .string()
  .max(214)
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/,
    'Use an NPM package name such as dayjs or @scope/package.',
  )
  .refine(
    (name) =>
      !['node_modules', 'favicon.ico', '__proto__', 'constructor', 'prototype'].includes(name) &&
      !name.startsWith('@webrad/'),
    'This package name is reserved.',
  )
  .refine(
    (name) => !['pdf-lib', 'shaka-player', '@pdf-lib/standard-fonts'].includes(name),
    'This module is bundled with WebRAD. Installing an alternative version is unsupported because the compiler preserves its built-in module.',
  );

export const NpmPackageVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z0-9*~^<>=|+., -]+$/,
    'Use a registry version, range or tag. URLs, local paths and CLI options are unsupported.',
  )
  .refine((version) => !version.startsWith('-'), 'A package version cannot be a CLI option.');

export interface ProjectPackages {
  readonly version: 1;
  readonly dependencies: Readonly<Record<string, string>>;
  /** Portable NPM lock JSON. node_modules is restored explicitly and never serialized. */
  readonly lockfile: string | null;
}

export function parseNpmLockfile(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid package-lock.json.');
  const lock = value as Record<string, unknown>;
  if (![2, 3].includes(Number(lock.lockfileVersion)))
    throw new Error('Packages require an NPM lockfile version 2 or 3.');
  if (typeof lock.packages !== 'object' || lock.packages === null || Array.isArray(lock.packages))
    throw new Error('The NPM lockfile has no package records.');
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (
      key !== '' &&
      (!key.startsWith('node_modules/') || key.split('/').includes('..') || key.includes('\\'))
    )
      throw new Error('The NPM lockfile contains an unsafe package path.');
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new Error('The NPM lockfile contains an invalid package record.');
    const record = entry as Record<string, unknown>;
    if (record.link === true) throw new Error('Linked/local packages are not supported.');
    if (record.resolved !== undefined) {
      const url = new URL(String(record.resolved));
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('Package tarballs must use HTTPS without embedded credentials.');
    }
  }
  return lock;
}

export const ProjectPackagesSchema: z.ZodType<ProjectPackages> = z
  .object({
    version: z.literal(1),
    dependencies: z.record(NpmPackageNameSchema, NpmPackageVersionSchema),
    lockfile: z.string().max(20_000_000).nullable(),
  })
  .strict()
  .superRefine((packages, context) => {
    if (Object.keys(packages.dependencies).length > 500)
      context.addIssue({
        code: 'custom',
        message: 'A project supports at most 500 direct packages.',
      });
    if (packages.lockfile !== null) {
      try {
        const lock = parseNpmLockfile(packages.lockfile);
        const root = (lock.packages as Record<string, Record<string, unknown>>)[''];
        const dependencies = root?.dependencies ?? {};
        if (
          JSON.stringify(Object.entries(packages.dependencies).sort()) !==
          JSON.stringify(Object.entries(dependencies).sort())
        )
          throw new Error(
            'The NPM lockfile does not match the project dependencies. Restore or reinstall the affected package.',
          );
      } catch (error) {
        context.addIssue({
          code: 'custom',
          path: ['lockfile'],
          message: error instanceof Error ? error.message : 'Invalid NPM lockfile.',
        });
      }
    }
  });
