import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProject } from '@webrad/project-model';
import { afterEach, describe, expect, it } from 'vitest';
import { invalidatePackageTypes, readPackageTypes } from './package-types';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      invalidatePackageTypes(root);
      await fs.rm(root, { recursive: true, force: true });
    }),
  );
});

describe('package declaration snapshot limits', () => {
  it('rejects one oversized declaration before loading it into the editor snapshot', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-types-limit-'));
    roots.push(root);
    const directory = path.join(root, 'node_modules', 'huge-types');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'huge-types', version: '1.0.0', types: 'index.d.ts' }),
    );
    const declaration = path.join(directory, 'index.d.ts');
    await fs.writeFile(declaration, 'export declare const value: string;');
    await fs.truncate(declaration, 20_000_001);
    const project = {
      ...createProject('TypeLimit'),
      packages: { version: 1 as const, dependencies: { 'huge-types': '1.0.0' }, lockfile: null },
    };
    expect(() => readPackageTypes(root, project, ['huge-types'])).toThrow('20 MB / 3000 files');
  });
});
