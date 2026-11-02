import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NpmPackageNameSchema,
  NpmPackageVersionSchema,
  ProjectPackagesSchema,
} from '@webrad/project-model';
import { createProjectFiles, loadProjectFiles, saveProjectFiles } from './project-files';
import { assertSafePackageTree, npmOperationArguments } from './package-service';
import { createPackageLogFilter, redactPackageLog } from './package-toolchain';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('project package safety and persistence', () => {
  it('accepts scoped registry packages and rejects shell, path, URL and reserved names', () => {
    expect(NpmPackageNameSchema.parse('@types/lodash')).toBe('@types/lodash');
    for (const name of ['../dayjs', 'dayjs;whoami', '--prefix', '@webrad/runtime', '__proto__'])
      expect(NpmPackageNameSchema.safeParse(name).success).toBe(false);
    for (const name of ['pdf-lib', 'shaka-player', '@pdf-lib/standard-fonts']) {
      expect(() => NpmPackageNameSchema.parse(name)).toThrow('bundled with WebRAD');
      expect(() => npmOperationArguments({ action: 'install', name }, '/project', false)).toThrow(
        'bundled with WebRAD',
      );
    }
    for (const version of [
      'https://example.com/pkg.tgz',
      'file:../secret',
      '--prefix=/tmp',
      'latest;whoami',
    ])
      expect(NpmPackageVersionSchema.safeParse(version).success).toBe(false);
    expect(
      npmOperationArguments(
        { action: 'install', name: '@types/lodash', version: '^4.17.0' },
        '/project with spaces',
        false,
      ),
    ).toEqual([
      'install',
      '@types/lodash@^4.17.0',
      '--save-exact',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--global=false',
      '--bin-links=false',
      '--workspaces=false',
      '--package-lock=true',
      '--registry=https://registry.npmjs.org',
      '--prefix',
      '/project with spaces',
    ]);
    expect(npmOperationArguments({ action: 'restore' }, '/project', true)[0]).toBe('ci');
  });

  it('rejects linked, unsafe and inconsistent lock records', () => {
    const lock = {
      lockfileVersion: 3,
      packages: {
        '': { dependencies: { dayjs: '1.11.0' } },
        'node_modules/dayjs': {
          version: '1.11.0',
          resolved: 'https://registry.npmjs.org/dayjs/-/dayjs-1.11.0.tgz',
        },
      },
    };
    const packages = {
      version: 1,
      dependencies: { dayjs: '1.11.0' },
      lockfile: JSON.stringify(lock),
    };
    expect(ProjectPackagesSchema.safeParse(packages).success).toBe(true);
    expect(
      ProjectPackagesSchema.safeParse({ ...packages, dependencies: { dayjs: '1.10.0' } }).success,
    ).toBe(false);
    expect(
      ProjectPackagesSchema.safeParse({
        ...packages,
        lockfile: JSON.stringify({ ...lock, packages: { '../outside': { link: true } } }),
      }).success,
    ).toBe(false);
    expect(
      ProjectPackagesSchema.safeParse({
        ...packages,
        lockfile: JSON.stringify({
          ...lock,
          packages: { 'node_modules/dayjs': { resolved: 'file:../outside' } },
        }),
      }).success,
    ).toBe(false);
  });

  it('preserves portable dependencies across Save As and reopening while never copying node_modules', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-packages-persistence-'));
    roots.push(parent);
    const session = await createProjectFiles(path.join(parent, 'source'), 'PackageProject');
    const packages = {
      version: 1 as const,
      dependencies: { dayjs: '1.11.0' },
      lockfile: JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { dependencies: { dayjs: '1.11.0' } },
          'node_modules/dayjs': {
            version: '1.11.0',
            resolved: 'https://registry.npmjs.org/dayjs/-/dayjs-1.11.0.tgz',
          },
        },
      }),
    };
    const saved = await saveProjectFiles({ ...session, project: { ...session.project, packages } });
    expect((await loadProjectFiles(saved.projectFilePath)).project.packages).toEqual(packages);
    const copied = await saveProjectFiles({ ...saved, rootPath: path.join(parent, 'copy') });
    expect((await loadProjectFiles(copied.projectFilePath)).project.packages).toEqual(packages);
    expect(
      JSON.parse(await fs.readFile(path.join(copied.rootPath, 'package.json'), 'utf8')),
    ).toMatchObject({
      private: true,
      webradProjectId: session.project.id,
      dependencies: packages.dependencies,
    });
    expect(await fs.readFile(path.join(copied.rootPath, 'package-lock.json'), 'utf8')).toBe(
      packages.lockfile,
    );
    await expect(fs.stat(path.join(copied.rootPath, 'node_modules'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('protects existing unowned manifests including the IDE package.json', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-unowned-packages-'));
    roots.push(root);
    const session = await createProjectFiles(root, 'UnownedProject');
    const manifest = '{"name":"unrelated","private":true}\n';
    await fs.writeFile(path.join(root, 'package.json'), manifest, 'utf8');
    await expect(
      saveProjectFiles({
        ...session,
        project: { ...session.project, packages: { version: 1, dependencies: {}, lockfile: null } },
      }),
    ).rejects.toThrow('unmanaged package.json');
    expect(await fs.readFile(path.join(root, 'package.json'), 'utf8')).toBe(manifest);
  });

  it('redacts credentials from registry and process errors', () => {
    expect(
      redactPackageLog(
        'https://user:secret@example.com authorization=BearerSecret token=npm_abcdefghijklmnopqrstuvwxyz',
      ),
    ).not.toContain('secret');
    expect(redactPackageLog('npm_abcdefghijklmnopqrstuvwxyz')).toBe('[redacted]');
    expect(redactPackageLog('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature')).toBe(
      'Authorization: [redacted]',
    );
    expect(redactPackageLog('Authorization=Basic dXNlcjpzZWNyZXQ=')).toBe(
      'Authorization=[redacted]',
    );
  });

  it('redacts credentials split across stdout/stderr chunks and discards oversized lines', () => {
    const messages: string[] = [];
    const filter = createPackageLogFilter((stream, message) => {
      expect(['stdout', 'stderr']).toContain(stream);
      messages.push(message);
    });
    filter.write('stdout', 'Authorization: Bea');
    filter.write('stderr', 'token=npm_abcdef');
    filter.write('stdout', 'rer eyJhbGci.payload.secret');
    expect(messages).toEqual([]);
    filter.write('stdout', '\nnormal output\n');
    filter.write('stderr', 'ghijklmnopqrstuvwxyz');
    filter.flush();
    expect(messages.join('')).toContain('Authorization: [redacted]');
    expect(messages.join('')).toContain('token=[redacted]');
    expect(messages.join('')).not.toContain('payload');
    const length = messages.length;
    filter.write('stdout', `Authorization: Bearer ${'x'.repeat(70_000)}`);
    filter.write('stdout', 'secret-tail\nnext line\n');
    filter.flush();
    expect(messages.slice(length).join('')).toBe('[Long package log line omitted]\nnext line\n');
  });

  it('rejects existing dependency directory links before npm can write outside the project', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-package-link-'));
    roots.push(parent);
    const root = path.join(parent, 'project');
    const outside = path.join(parent, 'outside');
    await fs.mkdir(root);
    await fs.mkdir(outside);
    await fs.symlink(
      outside,
      path.join(root, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(assertSafePackageTree(root)).rejects.toThrow('link outside');
    await fs.unlink(path.join(root, 'node_modules'));
    await fs.mkdir(path.join(root, 'node_modules'));
    await fs.symlink(
      outside,
      path.join(root, 'node_modules', 'dayjs'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(assertSafePackageTree(root)).rejects.toThrow('link outside');
  });
});
