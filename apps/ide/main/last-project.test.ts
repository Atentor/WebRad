import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LastProjectStore } from './last-project';
import { createProjectFiles } from './project-files';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-last-project-')));
  temporaryRoots.push(root);
  return root;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('last project application state', () => {
  it('reopens the saved project and user sources from disk in a new application session', async () => {
    const root = await temporaryRoot();
    const userData = path.join(root, 'preferences');
    const session = await createProjectFiles(path.join(root, 'CustomerPortal'), 'CustomerPortal');
    await fs.writeFile(path.join(session.rootPath, 'pages', 'PageMain.ts'), '// user code\n');
    await new LastProjectStore(userData).remember(session.projectFilePath);

    const restored = await new LastProjectStore(userData).restore();

    expect(restored?.rootPath).toBe(session.rootPath);
    expect(restored?.project.id).toBe(session.project.id);
    expect(restored?.userSources['pages/PageMain.ts']).toBe('// user code\n');
    expect(JSON.parse(await fs.readFile(path.join(userData, 'last-project.json'), 'utf8'))).toEqual(
      {
        formatVersion: 1,
        projectFilePath: session.projectFilePath,
      },
    );
  });

  it('keeps the latest successful operation when preference writes overlap', async () => {
    const root = await temporaryRoot();
    const userData = path.join(root, 'preferences');
    const first = await createProjectFiles(path.join(root, 'First'), 'First');
    const last = await createProjectFiles(path.join(root, 'Last'), 'Last');
    const store = new LastProjectStore(userData);

    await Promise.all([
      store.remember(first.projectFilePath),
      store.remember(last.projectFilePath),
    ]);

    expect((await new LastProjectStore(userData).restore())?.project.name).toBe('Last');
    expect(await fs.readdir(userData)).toEqual(['last-project.json']);
  });

  it('starts without a project when no previous application state exists', async () => {
    const root = await temporaryRoot();
    await expect(
      new LastProjectStore(path.join(root, 'preferences')).restore(),
    ).resolves.toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    '{broken JSON',
    JSON.stringify({ formatVersion: 2, projectFilePath: path.resolve('Project.wrproj') }),
    JSON.stringify({ formatVersion: 1, projectFilePath: '../Project.wrproj' }),
    JSON.stringify({
      formatVersion: 1,
      projectFilePath: path.resolve('Project.wrproj'),
      extra: true,
    }),
  ])('ignores invalid application state: %s', async (contents) => {
    const root = await temporaryRoot();
    await fs.writeFile(path.join(root, 'last-project.json'), contents);

    await expect(new LastProjectStore(root).restore()).resolves.toBeNull();
  });

  it('keeps manual startup available when the last project was removed or corrupted', async () => {
    const root = await temporaryRoot();
    const store = new LastProjectStore(path.join(root, 'preferences'));
    const session = await createProjectFiles(path.join(root, 'Portal'), 'Portal');
    await store.remember(session.projectFilePath);
    await fs.writeFile(session.projectFilePath, '{invalid project');

    await expect(store.restore()).resolves.toBeNull();
    expect(await fs.readFile(session.projectFilePath, 'utf8')).toBe('{invalid project');
    await fs.rm(session.rootPath, { recursive: true });
    await expect(store.restore()).resolves.toBeNull();
  });

  it('does not fail project operations when the application state cannot be written', async () => {
    const root = await temporaryRoot();
    const inaccessibleUserData = path.join(root, 'preferences');
    await fs.writeFile(inaccessibleUserData, 'existing file');
    const store = new LastProjectStore(inaccessibleUserData);

    await expect(store.remember(path.join(root, 'Portal.wrproj'))).resolves.toBeUndefined();
    await expect(store.remember(path.join(root, 'Later.wrproj'))).resolves.toBeUndefined();
    expect(await fs.readFile(inaccessibleUserData, 'utf8')).toBe('existing file');
    expect(console.warn).toHaveBeenCalledWith(
      '[PROJECT] Could not remember the last project.',
      expect.any(Error),
    );
  });
});
