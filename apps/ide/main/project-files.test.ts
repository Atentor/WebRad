import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addComponent,
  addComponentStyle,
  addPage,
  addReusableElement,
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  createComponentStyle,
  createDefaultComponentLayout,
  createPage,
  createReusableElement,
  removePage,
  setComponentStyle,
  updatePage,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectFiles,
  defaultUserSources,
  loadProjectFiles,
  resolveInsideProject,
  resolveInsideProjectSecure,
  resolveNewProjectRoot,
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
  it('creates a project in a named child of a non-empty selected parent folder', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-project-parent-'));
    temporaryRoots.push(parent);
    await fs.writeFile(path.join(parent, 'existing-download.txt'), 'keep', 'utf8');

    const rootPath = resolveNewProjectRoot(parent, 'CustomerPortal');
    const session = await createProjectFiles(rootPath, 'CustomerPortal');

    expect(session.rootPath).toBe(path.join(parent, 'CustomerPortal'));
    await expect(fs.stat(path.join(parent, 'existing-download.txt'))).resolves.toBeDefined();
    await expect(fs.stat(session.projectFilePath)).resolves.toBeDefined();
  });

  it('does not permit a project name to escape the selected parent folder', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-project-parent-'));
    temporaryRoots.push(parent);

    expect(() => resolveNewProjectRoot(parent, '../outside')).toThrow(
      'not portable in a file name',
    );
  });

  it('creates and loads the versioned aggregate without losing user code', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-project-'));
    temporaryRoots.push(parent);
    const session = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const userPath = 'pages/PageMain.ts';
    await fs.writeFile(path.join(session.rootPath, userPath), '// preserved user code\n', 'utf8');

    const manifest = JSON.parse(await fs.readFile(session.projectFilePath, 'utf8')) as {
      formatVersion: number;
      pages: { pageFile: string }[];
      styles: { id: string; componentType: string; preset?: string }[];
    };
    expect(manifest.formatVersion).toBe(CURRENT_PROJECT_FORMAT_VERSION);
    expect(manifest.styles).toHaveLength(12);
    const defaultPageStyle = manifest.styles.find(
      (style) => style.componentType === 'WebPage' && style.preset === 'default',
    );
    expect(defaultPageStyle).toBeDefined();
    const pageFile = manifest.pages[0]?.pageFile;
    expect(pageFile).toBeDefined();
    if (pageFile === undefined) return;
    const pageDocument = JSON.parse(
      await fs.readFile(path.join(session.rootPath, ...pageFile.split('/')), 'utf8'),
    ) as { formatVersion: number; components: { id: string; styleId?: string }[] };
    expect(pageDocument.formatVersion).toBe(CURRENT_PAGE_FORMAT_VERSION);
    expect(pageDocument.components[0]?.styleId).toBe(defaultPageStyle?.id);

    const loaded = await loadProjectFiles(session.projectFilePath);
    expect(loaded.project.name).toBe('Project1');
    expect(loaded.project.pages[0]?.name).toBe('PageMain');
    expect(loaded.userSources[userPath]).toBe('// preserved user code\n');
  });

  it('restores Default Popup when loading a project created before its Aurora style existed', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-legacy-popup-style-'));
    temporaryRoots.push(parent);
    const session = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const manifest = JSON.parse(await fs.readFile(session.projectFilePath, 'utf8')) as {
      pages: { pageFile: string }[];
      styles: { componentType: string; preset?: string }[];
    };
    manifest.styles = manifest.styles.filter(
      (style) => !(style.componentType === 'WebPopup' && style.preset === 'default'),
    );
    const pageFile = manifest.pages[0]?.pageFile;
    if (pageFile === undefined) throw new Error('Expected a persisted page document.');
    const pagePath = path.join(session.rootPath, ...pageFile.split('/'));
    const page = JSON.parse(await fs.readFile(pagePath, 'utf8')) as {
      rootComponentId: string;
      components: ({
        id: string;
        children: string[];
      } & Record<string, unknown>)[];
    };
    const root = page.components.find((component) => component.id === page.rootComponentId);
    if (root === undefined) throw new Error('Expected a persisted page root.');
    root.children.push('legacy-popup-id');
    page.components.push({
      id: 'legacy-popup-id',
      type: 'WebPopup',
      name: 'Popup1',
      parentId: page.rootComponentId,
      layout: createDefaultComponentLayout(),
      bounds: { x: 120, y: 80, width: 360, height: 220 },
      props: { modal: true, visible: false, collapseWhenHidden: true, enabled: true },
      events: { OnShow: null, OnHide: null, OnClose: null },
      children: [],
    });
    await fs.writeFile(session.projectFilePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.writeFile(pagePath, `${JSON.stringify(page, null, 2)}\n`, 'utf8');

    const loaded = await loadProjectFiles(session.projectFilePath);
    const defaultPopupStyle = loaded.project.styles.find(
      (style) => style.componentType === 'WebPopup' && style.preset === 'default',
    );
    const panelIndex = loaded.project.styles.findIndex(
      (style) => style.componentType === 'WebPanel' && style.preset === 'default',
    );
    const popupIndex = loaded.project.styles.findIndex(
      (style) => style.id === defaultPopupStyle?.id,
    );

    expect(defaultPopupStyle).toMatchObject({
      name: 'Default Popup',
      id: `${loaded.project.id}:default-style:WebPopup`,
    });
    expect(popupIndex).toBe(panelIndex + 1);
    expect(
      loaded.project.pages[0]?.components.find((component) => component.id === 'legacy-popup-id')
        ?.styleId,
    ).toBeUndefined();

    await saveProjectFiles({
      rootPath: loaded.rootPath,
      project: loaded.project,
      userSources: loaded.userSources,
    });
    const persistedManifest = JSON.parse(await fs.readFile(session.projectFilePath, 'utf8')) as {
      styles: { componentType: string; preset?: string }[];
    };
    expect(
      persistedManifest.styles.filter(
        (style) => style.componentType === 'WebPopup' && style.preset === 'default',
      ),
    ).toHaveLength(1);
  });

  it('persists reusable styles inline and component references in page documents', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-styles-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const page = initial.project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    const withButtonPage = addComponent(page, {
      id: 'button-id',
      type: 'WebButton',
      name: 'Button1',
      parentId: page.rootComponentId,
      layout: createDefaultComponentLayout(),
      bounds: { x: 16, y: 16, width: 120, height: 36 },
      props: { caption: 'Save', visible: true, enabled: true },
      events: { OnClick: null },
      children: [],
    });
    const style = createComponentStyle('Primary Button', 'WebButton', {
      idFactory: () => 'style-id',
      states: {
        base: {
          borderRadius: 'md',
          backgroundColor: '#2563eb',
          paddingLeft: { value: 16, unit: 'px' },
          paddingRight: { value: 16, unit: 'px' },
          paddingTop: { value: 8, unit: 'px' },
          paddingBottom: { value: 8, unit: 'px' },
          textColor: '#ffffff',
        },
        hover: { backgroundColor: '#1d4ed8' },
      },
    });
    const withButton = updatePage(initial.project, page.id, withButtonPage);
    const withStyle = addComponentStyle(withButton, style);
    const project = setComponentStyle(withStyle, page.id, 'button-id', style.id);

    const saved = await saveProjectFiles({
      rootPath: initial.rootPath,
      project,
      userSources: defaultUserSources(project),
    });
    const manifest = JSON.parse(await fs.readFile(saved.projectFilePath, 'utf8')) as {
      styles: unknown[];
      pages: { pageFile: string }[];
    };
    expect(manifest.styles).toEqual(expect.arrayContaining([style]));
    expect(manifest.styles).toHaveLength(initial.project.styles.length + 1);
    const pageFile = manifest.pages[0]?.pageFile;
    expect(pageFile).toBeDefined();
    if (pageFile === undefined) return;
    const persistedPage = JSON.parse(
      await fs.readFile(path.join(saved.rootPath, ...pageFile.split('/')), 'utf8'),
    ) as { components: { id: string; styleId?: string }[] };
    expect(
      persistedPage.components.find((component) => component.id === 'button-id')?.styleId,
    ).toBe(style.id);

    const loaded = await loadProjectFiles(saved.projectFilePath);
    expect(loaded.project).toEqual(project);
  });

  it('persists reusable definitions in the manifest and restores instance references', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-reusable-elements-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const reusableDefinition = createReusableElement('CustomerCard', {
      idFactory: (() => {
        let sequence = 0;
        return () => `customer-card-${String((sequence += 1))}`;
      })(),
      width: 240,
      height: 96,
    });
    const withReusableDefinition = addReusableElement(initial.project, reusableDefinition);
    const page = withReusableDefinition.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    const reusableInstance = defaultComponentRegistry.createComponent('WebReusableElement', {
      id: 'customer-card-instance',
      name: 'CustomerCardInstance',
      parentId: page.rootComponentId,
      x: 24,
      y: 36,
      props: {
        reusableElementId: reusableDefinition.id,
        placement: 'floating',
        floatingHorizontalAnchor: 'right',
        floatingVerticalAnchor: 'bottom',
        floatingZIndex: 220,
      },
    });
    const project = updatePage(
      withReusableDefinition,
      page.id,
      addComponent(page, reusableInstance, page.rootComponentId),
    );

    const saved = await saveProjectFiles({
      rootPath: initial.rootPath,
      project,
      userSources: defaultUserSources(project),
    });
    const manifest = JSON.parse(await fs.readFile(saved.projectFilePath, 'utf8')) as {
      reusableElements: {
        id: string;
        name: string;
        rootComponentId: string;
        components: { id: string }[];
      }[];
    };

    expect(manifest.reusableElements).toHaveLength(1);
    expect(manifest.reusableElements[0]).toMatchObject({
      id: reusableDefinition.id,
      name: reusableDefinition.name,
      rootComponentId: reusableDefinition.rootComponentId,
    });
    expect(manifest.reusableElements[0]?.components.map((component) => component.id)).toEqual(
      reusableDefinition.components.map((component) => component.id),
    );
    expect(saved.userSources['reusables/CustomerCard.ts']).toContain(
      'export class CustomerCard extends CustomerCardGenerated',
    );
    await expect(
      fs.readFile(path.join(saved.rootPath, 'reusables', 'CustomerCard.generated.ts'), 'utf8'),
    ).resolves.toContain('extends WebReusableElementInstance');

    const loaded = await loadProjectFiles(saved.projectFilePath);
    expect(loaded.project.reusableElements).toEqual(project.reusableElements);
    expect(loaded.userSources['reusables/CustomerCard.ts']).toContain(
      'export class CustomerCard extends CustomerCardGenerated',
    );
    expect(
      loaded.project.pages[0]?.components.find((component) => component.id === reusableInstance.id)
        ?.props.reusableElementId,
    ).toBe(reusableDefinition.id);
  });

  it('preserves an owned authored source when the request source map omits it', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-owned-source-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const sourcePath = path.join(initial.rootPath, 'pages', 'PageMain.ts');
    const source = '// irreplaceable authored source\r\n';
    await fs.writeFile(sourcePath, source, 'utf8');

    const saved = await saveProjectFiles({
      rootPath: initial.rootPath,
      project: initial.project,
      userSources: {},
    });

    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe(source);
    expect(saved.userSources).toEqual({ 'pages/PageMain.ts': source });
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

  it('moves files retired by page deletion into the recoverable project trash', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-retired-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const otherPage = createPage('PageOther');
    const withOther = addPage(initial.project, otherPage);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withOther,
      userSources: defaultUserSources(withOther),
    });

    const withoutOther = removePage(withOther, otherPage.id);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withoutOther,
      userSources: defaultUserSources(withoutOther),
    });

    await expect(
      fs.stat(path.join(initial.rootPath, 'pages', 'PageOther.wrpage')),
    ).rejects.toThrow();
    const archived = await fs.readdir(path.join(initial.rootPath, '.webrad', 'trash'), {
      recursive: true,
    });
    expect(archived.some((entry) => String(entry).endsWith('PageOther.wrpage'))).toBe(true);
    expect(archived.some((entry) => String(entry).endsWith('PageOther.ts'))).toBe(true);
  });

  it('archives old ownership before a deleted page name is reused', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-reused-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const oldPage = createPage('PageOther');
    const withOldPage = addPage(initial.project, oldPage);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withOldPage,
      userSources: {
        ...defaultUserSources(withOldPage),
        'pages/PageOther.ts': '// irreplaceable old source\n',
      },
    });

    const newPage = createPage('PageOther');
    const withReusedName = addPage(removePage(withOldPage, oldPage.id), newPage);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withReusedName,
      userSources: defaultUserSources(withReusedName),
    });

    const trashRoot = path.join(initial.rootPath, '.webrad', 'trash');
    const archived = await fs.readdir(trashRoot, { recursive: true });
    const oldSourcePath = archived.find((entry) => String(entry).endsWith('PageOther.ts'));
    expect(oldSourcePath).toBeDefined();
    await expect(fs.readFile(path.join(trashRoot, String(oldSourcePath)), 'utf8')).resolves.toBe(
      '// irreplaceable old source\n',
    );
    await expect(
      fs.readFile(path.join(initial.rootPath, 'pages', 'PageOther.ts'), 'utf8'),
    ).resolves.not.toBe('// irreplaceable old source\n');
  });

  it('refuses to overwrite an unowned TypeScript file', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-collision-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const otherPage = createPage('PageOther');
    const withOther = addPage(initial.project, otherPage);
    const collisionPath = path.join(initial.rootPath, 'pages', 'PageOther.ts');
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
    const otherPage = createPage('PageOther');
    const withOther = addPage(initial.project, otherPage);
    await saveProjectFiles({
      rootPath: initial.rootPath,
      project: withOther,
      userSources: defaultUserSources(withOther),
    });
    const withoutOther = removePage(withOther, otherPage.id);
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
    expect(loaded.project.pages.map((page) => page.id)).toEqual(
      withOther.pages.map((page) => page.id),
    );
  });

  it('rolls back already-written artifacts when a pre-commit write fails', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-rollback-'));
    temporaryRoots.push(parent);
    const initial = await createProjectFiles(path.join(parent, 'Project1'), 'Project1');
    const page = initial.project.pages[0]!;
    const changed = updatePage(initial.project, page.id, { caption: 'Changed caption' });
    const rename = fs.rename.bind(fs);
    let injectedFailure = false;
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (!injectedFailure && String(destination).endsWith('PageMain.generated.ts')) {
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
    expect(loaded.project.pages[0]?.caption).toBe(page.caption);
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
      pages: { pageFile: string; generatedFile: string; codeFile: string }[];
    };
    manifest.pages[0]!.codeFile = 'pages/custom.ts';
    await fs.writeFile(initial.projectFilePath, JSON.stringify(manifest), 'utf8');
    await expect(loadProjectFiles(initial.projectFilePath)).rejects.toThrow('codeFile');

    const formerPaths = JSON.parse(manifestSource) as typeof manifest;
    formerPaths.pages[0]!.pageFile = 'forms/PageMain.wrform';
    formerPaths.pages[0]!.generatedFile = 'forms/PageMain.generated.ts';
    formerPaths.pages[0]!.codeFile = 'forms/PageMain.ts';
    await fs.writeFile(initial.projectFilePath, JSON.stringify(formerPaths), 'utf8');
    await expect(loadProjectFiles(initial.projectFilePath)).rejects.toThrow('pageFile');
  });
});
