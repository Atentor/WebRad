import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { bindComponentEvent, updatePage } from '@webrad/project-model';
import { compileProjectToMemory } from '@webrad/compiler';
import { JSDOM } from 'jsdom';
import {
  createProjectFiles,
  loadProjectFiles,
  saveProjectFiles,
} from '../apps/ide/main/project-files';
import { packageStatus, runPackageOperation } from '../apps/ide/main/package-service';
import { detectNpmToolchain, executeNpm } from '../apps/ide/main/package-toolchain';
import { readPackageTypes } from '../apps/ide/main/package-types';
import { searchNpmRegistry } from '../apps/ide/main/package-registry';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
describe('real per-project NPM integration', () => {
  it('queries the live official search API with pagination', async () => {
    const first = await searchNpmRegistry(
      { requestId: 'live-search-first', query: 'dayjs', offset: 0 },
      new AbortController().signal,
    );
    const next = await searchNpmRegistry(
      { requestId: 'live-search-next', query: 'dayjs', offset: 20 },
      new AbortController().signal,
    );
    expect(first.packages.some((pkg) => pkg.name === 'dayjs')).toBe(true);
    expect(first.packages.length).toBeGreaterThan(0);
    expect(next.offset).toBe(20);
    expect(next.packages.length).toBeGreaterThan(0);
  });
  it('installs real dayjs, reads reachable types, restores the lock, updates, removes and isolates Save As', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-npm-integration-'));
    roots.push(parent);
    let session = await createProjectFiles(path.join(parent, 'first'), 'PackagesIntegration');
    const missing = await runPackageOperation(
      {
        ...session,
        action: 'install',
        name: 'dayjs',
        version: '99999999.0.0',
        requestId: 'missing-version',
      },
      new AbortController().signal,
      () => undefined,
    );
    expect(missing.success).toBe(false);
    expect(missing.error).toContain('NPM exited with code');
    expect((await loadProjectFiles(session.projectFilePath)).project.packages).toBeUndefined();
    const install = await runPackageOperation(
      { ...session, action: 'install', name: 'dayjs', version: '1.11.13', requestId: 'install' },
      new AbortController().signal,
      () => undefined,
    );
    expect(install.success, install.error).toBe(true);
    session = { ...session, project: install.project };
    expect(install.state.dependencies).toEqual([
      expect.objectContaining({ name: 'dayjs', installedVersion: '1.11.13' }),
    ]);
    expect((await loadProjectFiles(session.projectFilePath)).project.packages).toEqual(
      session.project.packages,
    );
    const types = readPackageTypes(session.rootPath, session.project, [
      'dayjs',
      'dayjs/plugin/utc',
    ]);
    expect(types.files['file:///node_modules/dayjs/index.d.ts']).toContain('format(');
    expect(types.files['file:///node_modules/dayjs/plugin/utc.d.ts']).toContain('utc');
    expect(Object.keys(readPackageTypes(session.rootPath, session.project, []).files)).toEqual([
      'file:///node_modules/dayjs/package.json',
    ]);
    const copied = await saveProjectFiles({ ...session, rootPath: path.join(parent, 'second') });
    expect(
      (await packageStatus(copied.rootPath, copied.project, false)).dependencies[0]
        ?.installedVersion,
    ).toBeNull();
    const restored = await runPackageOperation(
      { ...copied, action: 'restore', requestId: 'restore' },
      new AbortController().signal,
      () => undefined,
    );
    expect(restored.success, restored.error).toBe(true);
    expect(restored.state.dependencies[0]?.installedVersion).toBe('1.11.13');
    const update = await runPackageOperation(
      { ...session, action: 'update', name: 'dayjs', version: '1.11.12', requestId: 'update' },
      new AbortController().signal,
      () => undefined,
    );
    expect(update.success, update.error).toBe(true);
    session = { ...session, project: update.project };
    expect(update.state.dependencies[0]?.installedVersion).toBe('1.11.12');
    expect(readPackageTypes(session.rootPath, session.project, ['dayjs']).revision).not.toBe(
      types.revision,
    );
    expect(
      (await packageStatus(copied.rootPath, restored.project, false)).dependencies[0]
        ?.installedVersion,
    ).toBe('1.11.13');
    const scoped = await runPackageOperation(
      {
        ...session,
        action: 'install',
        name: '@types/lodash',
        version: '4.17.20',
        requestId: 'scoped',
      },
      new AbortController().signal,
      () => undefined,
    );
    expect(scoped.success, scoped.error).toBe(true);
    session = { ...session, project: scoped.project };
    expect(scoped.state.dependencies.some((pkg) => pkg.name === '@types/lodash')).toBe(true);
    const axios = await runPackageOperation(
      { ...session, action: 'install', name: 'axios', version: '1.8.4', requestId: 'axios' },
      new AbortController().signal,
      () => undefined,
    );
    expect(axios.success, axios.error).toBe(true);
    session = { ...session, project: axios.project };
    expect(
      readPackageTypes(session.rootPath, session.project, ['axios']).files[
        'file:///node_modules/axios/index.d.ts'
      ],
    ).toContain('AxiosInstance');
    const requests: string[] = [];
    const api = createServer((request, response) => {
      requests.push(request.url ?? '');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ id: 7, name: 'WebRAD Product' }));
    });
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
    const apiAddress = api.address();
    if (apiAddress === null || typeof apiAddress === 'string')
      throw new Error('Missing product API fixture address.');
    let dom: JSDOM | undefined;
    try {
      const page = session.project.pages[0]!;
      const executable = updatePage(
        session.project,
        page.id,
        bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'PageCreate'),
      );
      const compiled = await compileProjectToMemory(executable, {
        packageRoot: session.rootPath,
        target: 'preview',
        debug: true,
        userSources: {
          ...session.userSources,
          'units/Products.ts': `import axios from 'axios';
import dayjs from 'dayjs';
export async function loadProduct(url: string): Promise<string> {
  const response = await axios.get<{ id: number; name: string }>(url);
  return response.data.name + ' ' + dayjs('2026-11-01').format('DD/MM/YYYY');
}`,
          'pages/index.ts': `import { indexGenerated } from './index.generated';
import { loadProduct } from '../units/Products';
export class index extends indexGenerated {
  public async PageCreate(): Promise<void> {
    try { this.element.dataset.packageResult = await loadProduct('http://127.0.0.1:${apiAddress.port}/products'); }
    catch (error) { this.element.dataset.packageError = error instanceof Error ? error.message : String(error); }
  }
}`,
        },
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      expect(compiled.debug?.sourceMap).toContain('__packages/axios/');
      expect(compiled.debug?.sourceMap).toContain('__packages/dayjs/');
      dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
        url: 'http://packages.webrad.test/',
      });
      dom.window.eval(compiled.files['assets/app.js'] ?? '');
      const document = dom.window.document;
      await expect
        .poll(
          () =>
            document.querySelector<HTMLElement>('[data-package-result], [data-package-error]')
              ?.dataset,
          { timeout: 5000 },
        )
        .toMatchObject({ packageResult: 'WebRAD Product 01/11/2026' });
      expect(requests).toEqual(['/products']);
      expect(document.querySelector('[data-package-error]')).toBeNull();
      expect(Reflect.get(dom.window, 'process')).toBeUndefined();
      expect(Reflect.get(dom.window, 'require')).toBeUndefined();
    } finally {
      dom?.window.close();
      api.closeAllConnections();
      await new Promise<void>((resolve) => api.close(() => resolve()));
    }
    const removal = await runPackageOperation(
      { ...session, action: 'remove', name: 'dayjs', requestId: 'remove' },
      new AbortController().signal,
      () => undefined,
    );
    expect(removal.success, removal.error).toBe(true);
    expect(removal.project.packages?.dependencies.dayjs).toBeUndefined();
    expect(
      readPackageTypes(session.rootPath, removal.project, ['dayjs']).warnings.join(' '),
    ).toContain('No TypeScript declarations');
  });

  it('supports cancellation without invoking a shell or starting an already cancelled command', async () => {
    const toolchain = await detectNpmToolchain();
    expect(toolchain.available, toolchain.message).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeNpm(toolchain, ['--version'], process.cwd(), controller.signal, () => undefined),
    ).rejects.toThrow();
  });

  it('cancels a real npm process while its registry connection is pending', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-npm-cancel-'));
    roots.push(root);
    await fs.writeFile(path.join(root, 'package.json'), '{"private":true}');
    const controller = new AbortController();
    const server = createServer(() => controller.abort());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing test registry address.');
    try {
      const result = await executeNpm(
        await detectNpmToolchain(),
        [
          'install',
          'webrad-cancellation-probe',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--fetch-retries=0',
          `--registry=http://127.0.0.1:${address.port}`,
          '--prefix',
          root,
        ],
        root,
        controller.signal,
        () => undefined,
      );
      expect(controller.signal.aborted).toBe(true);
      expect(result.code).not.toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
