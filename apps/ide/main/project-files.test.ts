import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addForm, createForm, removeForm, updateForm } from '@webrad/project-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectFiles,
  defaultUserSources,
  loadProjectFiles,
  resolveInsideProject,
  resolveInsideProjectSecure,
  saveProjectFiles,
} from './project-files';

const temporaryRoots: string[] = [];
const PROJECT_FILE_SUFFIX = '.wrproj';

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('project files', () => {
  it('creates and loads the versioned aggregate without losing user code', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-project-'));
    temporaryRoots.push(parent);
    const session = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const userPath = 'forms/FrmMain.ts';
    await fs.writeFile(path.join(session.rootPath, userPath), '// preserved user code\n', 'utf8');

    const loaded = await loadProjectFiles(session.projectFilePath);
    expect(loaded.project.name).toBe('Project1');
    expect(loaded.project.forms[0]?.name).toBe('FrmMain');
    expect(loaded.userSources[userPath]).toBe('// preserved user code\n');
  });

  it('rejects traversal outside the project root', () => {
    expect(() => resolveInsideProject('C:/safe/project', '../outside.txt')).toThrow(/outside/);
  });

  it('rejects an internal symbolic link that resolves outside the granted root', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-links-'));
    temporaryRoots.push(parent);
    const root = path.join(parent, 'project');
    const outside = path.join(parent, 'outside');
    await fs.mkdir(root);
    await fs.mkdir(outside);
    try {
      await fs.symlink(outside, path.join(root, 'linked'), 'junction');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EPERM') return;
      throw error;
    }

    await expect(resolveInsideProjectSecure(root, 'linked/secret.txt')).rejects.toThrow(/outside/);
  });

  it('moves files retired by form deletion into the recoverable project trash', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-retired-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const otherForm = createForm('FrmOther');
    const withOther = addForm(initial.project, otherForm);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withOther,
      userSources: defaultUserSources(withOther),
    });

    const withoutOther = removeForm(withOther, otherForm.id);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withoutOther,
      userSources: defaultUserSources(withoutOther),
    });

    await expect(
      fs.stat(path.join(initial.rootPath, 'forms', 'FrmOther.wrform')),
    ).rejects.toThrow();
    const archived = await fs.readdir(path.join(initial.rootPath, '.webrad', 'trash'), {
      recursive: true,
    });
    expect(archived.some((entry) => String(entry).endsWith('FrmOther.wrform'))).toBe(true);
    expect(archived.some((entry) => String(entry).endsWith('FrmOther.ts'))).toBe(true);
  });

  it('archives old ownership before a deleted form name is reused', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-reused-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const oldForm = createForm('FrmOther');
    const withOldForm = addForm(initial.project, oldForm);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withOldForm,
      userSources: {
        ...defaultUserSources(withOldForm),
        'forms/FrmOther.ts': '// irreplaceable old source\n',
      },
    });

    const newForm = createForm('FrmOther');
    const withReusedName = addForm(removeForm(withOldForm, oldForm.id), newForm);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withReusedName,
      userSources: defaultUserSources(withReusedName),
    });

    const trashRoot = path.join(initial.rootPath, '.webrad', 'trash');
    const archived = await fs.readdir(trashRoot, { recursive: true });
    const oldSourcePath = archived.find((entry) => String(entry).endsWith('FrmOther.ts'));
    expect(oldSourcePath).toBeDefined();
    await expect(fs.readFile(path.join(trashRoot, String(oldSourcePath)), 'utf8')).resolves.toBe(
      '// irreplaceable old source\n',
    );
    await expect(
      fs.readFile(path.join(initial.rootPath, 'forms', 'FrmOther.ts'), 'utf8'),
    ).resolves.not.toBe('// irreplaceable old source\n');
  });

  it('refuses to overwrite an unowned TypeScript file', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-collision-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const otherForm = createForm('FrmOther');
    const withOther = addForm(initial.project, otherForm);
    const collisionPath = path.join(initial.rootPath, 'forms', 'FrmOther.ts');
    await fs.writeFile(collisionPath, '// user-owned file\n', 'utf8');

    await expect(
      saveProjectFiles({
        rootPath: initial.rootPath,
        project: withOther,
        userSources: defaultUserSources(withOther),
      }),
    ).rejects.toThrow('unowned');
    await expect(fs.readFile(collisionPath, 'utf8')).resolves.toBe('// user-owned file\n');
  });

  it('serializes concurrent saves for the same project root', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-concurrent-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const otherForm = createForm('FrmOther');
    const withOther = addForm(initial.project, otherForm);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withOther,
      userSources: defaultUserSources(withOther),
    });
    const withoutOther = removeForm(withOther, otherForm.id);
    const manifestBlocked = deferred();
    const releaseManifest = deferred();
    const rename = fs.rename.bind(fs);
    let blocked = false;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (!blocked && String(destination).endsWith(PROJECT_FILE_SUFFIX)) {
        blocked = true;
        manifestBlocked.resolve();
        await releaseManifest.promise;
      }
      return rename(source, destination);
    });

    try {
      const deleting = saveProjectFiles({
        rootPath: initial.rootPath,
        project: withoutOther,
        userSources: defaultUserSources(withoutOther),
      });
      await manifestBlocked.promise;
      const restoring = saveProjectFiles({
        rootPath: initial.rootPath,
        project: withOther,
        userSources: defaultUserSources(withOther),
      });
      releaseManifest.resolve();
      await Promise.all([deleting, restoring]);
    } finally {
      renameSpy.mockRestore();
      releaseManifest.resolve();
    }

    const loaded = await loadProjectFiles(initial.projectFilePath);
    expect(loaded.project.forms.map((form) => form.id)).toEqual(
      withOther.forms.map((form) => form.id),
    );
  });

  it('rolls back already-written artifacts when a pre-commit write fails', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-rollback-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const form = initial.project.forms[0]!;
    const changed = updateForm(initial.project, form.id, { caption: 'Changed caption' });
    const rename = fs.rename.bind(fs);
    let injectedFailure = false;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (!injectedFailure && String(destination).endsWith('FrmMain.generated.ts')) {
        injectedFailure = true;
        throw new Error('injected generated-file failure');
      }
      return rename(source, destination);
    });

    try {
      await expect(
        saveProjectFiles({
          rootPath: initial.rootPath,
          project: changed,
          userSources: defaultUserSources(changed),
        }),
      ).rejects.toThrow('injected generated-file failure');
    } finally {
      renameSpy.mockRestore();
    }

    const loaded = await loadProjectFiles(initial.projectFilePath);
    expect(loaded.project.forms[0]?.caption).toBe(form.caption);
  });

  it('rejects noncanonical manifest names and descriptor paths', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-canonical-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const manifestSource = await fs.readFile(initial.projectFilePath, 'utf8');
    const copyPath = path.join(initial.rootPath, 'Copy.wrproj');
    await fs.writeFile(copyPath, manifestSource, 'utf8');
    await expect(loadProjectFiles(copyPath)).rejects.toThrow('must be named');

    const manifest = JSON.parse(manifestSource) as {
      forms: { codeFile: string }[];
    };
    manifest.forms[0]!.codeFile = 'forms/custom.ts';
    await fs.writeFile(initial.projectFilePath, JSON.stringify(manifest), 'utf8');
    await expect(loadProjectFiles(initial.projectFilePath)).rejects.toThrow('codeFile');
  });
});
