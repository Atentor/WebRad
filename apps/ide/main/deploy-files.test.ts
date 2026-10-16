import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPLOY_MANIFEST, resolveDeploymentDirectory, writeDeployment } from './deploy-files';

const temporaryRoots: string[] = [];

async function fixture(): Promise<{ parent: string; projectRoot: string; destination: string }> {
  // macOS temporary paths may pass through /var -> /private/var.
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-deploy-test-')));
  temporaryRoots.push(parent);
  const projectRoot = path.join(parent, 'source');
  await fs.mkdir(projectRoot);
  return { parent, projectRoot, destination: path.join(parent, 'published') };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    if (!path.resolve(root).startsWith((await fs.realpath(os.tmpdir())) + path.sep))
      throw new Error('Unsafe test cleanup.');
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('hosted application deployment', () => {
  it('writes the Preview layout with binary assets and exact file progress', async () => {
    const { projectRoot, destination } = await fixture();
    const progress: [number, number, string][] = [];
    const result = await writeDeployment({
      projectRoot,
      destination,
      projectId: 'project-1',
      files: { 'index.html': '<html>Hosted</html>', 'assets/app.js': '(() => {})();' },
      binaryFiles: { 'assets/icon.png': Uint8Array.from([0, 255, 42]) },
      onFileWritten: (...event) => progress.push(event),
    });
    expect(result.fileCount).toBe(3);
    expect(progress).toEqual([
      [1, 3, 'index.html'],
      [2, 3, 'assets/app.js'],
      [3, 3, 'assets/icon.png'],
    ]);
    expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe(
      '<html>Hosted</html>',
    );
    expect(await fs.readFile(path.join(destination, 'assets/icon.png'))).toEqual(
      Buffer.from([0, 255, 42]),
    );
    expect((await fs.readdir(destination)).sort()).toEqual(
      [DEPLOY_MANIFEST, 'assets', 'index.html'].sort(),
    );
    const manifest = JSON.parse(
      await fs.readFile(path.join(destination, DEPLOY_MANIFEST), 'utf8'),
    ) as { projectId: string; files: Record<string, string> };
    expect(manifest.projectId).toBe('project-1');
    expect(Object.keys(manifest.files)).toEqual(['index.html', 'assets/app.js', 'assets/icon.png']);
  });

  it('replaces only its managed output and removes stale generated files', async () => {
    const { projectRoot, destination, parent } = await fixture();
    await writeDeployment({
      projectRoot,
      destination,
      projectId: 'owned',
      files: { 'index.html': 'old', 'pages/retired.js': 'old page' },
    });
    for (const directory of ['reusable', 'models', 'units'])
      await fs.mkdir(path.join(destination, directory));
    await writeDeployment({
      projectRoot,
      destination,
      projectId: 'owned',
      files: { 'index.html': 'new', 'assets/app.js': 'new app' },
    });
    expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('new');
    await expect(fs.stat(path.join(destination, 'pages/retired.js'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await fs.readdir(destination)).sort()).toEqual(
      [DEPLOY_MANIFEST, 'assets', 'index.html'].sort(),
    );
    expect((await fs.readdir(parent)).sort()).toEqual(['published', 'source']);
  });

  it('preserves existing unowned files, modified artifacts, and another project output', async () => {
    const { projectRoot, destination } = await fixture();
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, 'keep.txt'), 'authored');
    const deploy = () =>
      writeDeployment({
        projectRoot,
        destination,
        projectId: 'owner',
        files: { 'index.html': 'app' },
      });
    await expect(deploy()).rejects.toThrow('existing files');
    expect(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8')).toBe('authored');
    await fs.unlink(path.join(destination, 'keep.txt'));
    await deploy();
    await expect(
      writeDeployment({
        projectRoot,
        destination,
        projectId: 'other',
        files: { 'index.html': 'other' },
      }),
    ).rejects.toThrow('another project');
    await fs.writeFile(path.join(destination, 'index.html'), 'manual edit');
    await expect(deploy()).rejects.toThrow('modified outside WebRAD');
    expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('manual edit');
  });

  it('refuses extra files and folders introduced into managed output without deleting them', async () => {
    const { projectRoot, destination } = await fixture();
    const options = {
      projectRoot,
      destination,
      projectId: 'owner',
      files: { 'index.html': 'app' },
    };
    await writeDeployment(options);
    await fs.writeFile(path.join(destination, 'server.conf'), 'authored server configuration');
    await expect(writeDeployment(options)).rejects.toThrow('unowned file');
    expect(await fs.readFile(path.join(destination, 'server.conf'), 'utf8')).toBe(
      'authored server configuration',
    );
    await fs.unlink(path.join(destination, 'server.conf'));
    await fs.mkdir(path.join(destination, 'uploads'));
    await expect(writeDeployment(options)).rejects.toThrow('unowned folder');
    expect((await fs.stat(path.join(destination, 'uploads'))).isDirectory()).toBe(true);
  });

  it('preserves the previous output when staging fails and restores it when publication fails', async () => {
    const { projectRoot, destination, parent } = await fixture();
    const options = {
      projectRoot,
      destination,
      projectId: 'owner',
      files: { 'index.html': 'old' },
    };
    await writeDeployment(options);
    await expect(
      writeDeployment({
        ...options,
        files: { 'index.html': 'new' },
        onFileWritten: () => {
          throw new Error('write failed');
        },
      }),
    ).rejects.toThrow('write failed');
    expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('old');
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
      if (String(source).includes('.webrad-deploy-stage-')) throw new Error('publish failed');
      await rename(source, target);
    });
    await expect(writeDeployment({ ...options, files: { 'index.html': 'new' } })).rejects.toThrow(
      'publish failed',
    );
    expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('old');
    expect((await fs.readdir(parent)).sort()).toEqual(['published', 'source']);
  });

  it('rejects source overlap, filesystem roots, the home folder, links, and unsafe artifact paths', async () => {
    const { projectRoot, destination, parent } = await fixture();
    for (const target of [
      projectRoot,
      parent,
      path.parse(projectRoot).root,
      os.homedir(),
      path.join(projectRoot, 'pages/output'),
      path.join(projectRoot, '.webrad/output'),
    ]) {
      await expect(resolveDeploymentDirectory(projectRoot, target)).rejects.toThrow();
    }
    expect(await resolveDeploymentDirectory(projectRoot, 'deploy')).toBe(
      path.join(projectRoot, 'deploy'),
    );
    const linked = path.join(parent, 'linked');
    await fs.symlink(projectRoot, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      resolveDeploymentDirectory(projectRoot, path.join(linked, 'output')),
    ).rejects.toThrow('symbolic links');
    for (const artifact of [
      '../outside.txt',
      '/outside.txt',
      'assets\\outside.txt',
      'assets/../outside.txt',
      DEPLOY_MANIFEST,
      'assets',
      'assets/file.js/child.js',
    ]) {
      const files =
        artifact === 'assets/file.js/child.js'
          ? { 'assets/file.js': 'conflict', [artifact]: 'unsafe' }
          : { [artifact]: 'unsafe' };
      await expect(
        writeDeployment({ projectRoot, destination, projectId: 'owner', files }),
      ).rejects.toThrow();
    }
    await expect(fs.stat(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symbolic link inserted in previously managed output', async () => {
    const { projectRoot, destination, parent } = await fixture();
    const options = {
      projectRoot,
      destination,
      projectId: 'owner',
      files: { 'index.html': 'app' },
    };
    await writeDeployment(options);
    await fs.symlink(
      projectRoot,
      path.join(destination, 'assets/linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(writeDeployment(options)).rejects.toThrow('symbolic link');
    expect(await fs.readFile(path.join(destination, 'index.html'), 'utf8')).toBe('app');
    expect(await fs.readdir(parent)).toContain('source');
  });

  it('serializes concurrent deploys to the same destination', async () => {
    const { projectRoot, destination } = await fixture();
    const common = { projectRoot, destination, projectId: 'owner' };
    await Promise.all([
      writeDeployment({ ...common, files: { 'index.html': 'first' } }),
      writeDeployment({ ...common, files: { 'index.html': 'second' } }),
    ]);
    expect(['first', 'second']).toContain(
      await fs.readFile(path.join(destination, 'index.html'), 'utf8'),
    );
    expect((await fs.readdir(path.dirname(destination))).sort()).toEqual(['published', 'source']);
  });
});
