import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, bindComponentEvent, updateProjectSettings } from '@webrad/project-model';
import { fileUploadMethods, fileUploadProject } from './fixtures/file-upload';
import { withChromium } from './chromium';

const browserPath = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browserPath !== undefined)(
  'runs nonvisual OpenFile/SendToRestGO with native metadata, full RestGO results and real upload progress in Chromium Preview',
  async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-upload-browser-'));
    const resolvedRoot = path.resolve(temporaryRoot);
    if (!resolvedRoot.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`))
      throw new Error('Invalid fixture directory.');
    const filePath = path.join(temporaryRoot, 'relatório.txt');
    const contents = 'Conteúdo real do arquivo selecionado.\n'.repeat(8192);
    await fs.writeFile(filePath, contents, 'utf8');
    let previewHtml = '';
    const uploads: { id: string; isPublic: boolean; content: string; name: string }[] = [];
    const user = {
      id: 'upload-user',
      email: 'upload@example.test',
      fullName: 'Upload User',
      avatarUrl: null,
      active: true,
      emailConfirmed: true,
    };
    const backend = createServer((request, response) => {
      void (async () => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        response.setHeader('Access-Control-Expose-Headers', 'Retry-After');
        if (request.method === 'OPTIONS') {
          response.writeHead(204);
          response.end();
          return;
        }
        const json = (status: number, value: unknown): void => {
          response.writeHead(status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(value));
        };
        if (pathname === '/backend/auth/token') {
          expect(request.headers.cookie).toBeUndefined();
          json(200, { token: 'upload-browser-jwt', expiresAt: '2099-01-01T00:00:00Z', user });
          return;
        }
        if (pathname === '/backend/auth/session') {
          json(200, { success: true, user });
          return;
        }
        if (pathname === '/backend/storage/files') {
          expect(request.headers.authorization).toBe('Bearer upload-browser-jwt');
          expect(request.headers.cookie).toBeUndefined();
          expect(request.headers.origin).toBeTruthy();
          expect(request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/u);
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const body = await new Request('http://localhost/backend/storage/files', {
            method: 'POST',
            headers: { 'Content-Type': String(request.headers['content-type']) },
            body: Buffer.concat(chunks),
          }).formData();
          const file = body.get('file');
          if (!(file instanceof File)) throw new Error('Missing multipart file.');
          const id = `file-${String(uploads.length + 1)}`;
          const isPublic = body.get('isPublic') === 'true';
          uploads.push({ id, isPublic, content: await file.text(), name: file.name });
          json(201, {
            id,
            ownerId: user.id,
            ownerEmail: user.email,
            originalName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            isPublic,
            createdAt: '2026-10-09T12:00:00Z',
            updatedAt: '2026-10-09T12:00:00Z',
            downloadUrl: `/storage/files/${id}/download`,
          });
          return;
        }
        const stored = uploads.find((entry) => pathname.includes(`/${entry.id}/`));
        if (!stored || (!stored.isPublic && !request.headers.authorization))
          json(401, { error: 'Authentication required' });
        else {
          response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end(stored.content);
        }
      })().catch((error: unknown) => {
        response.writeHead(500, { 'Content-Type': 'text/plain' });
        response.end(error instanceof Error ? error.message : String(error));
      });
    });
    const application = createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        request.url === '/preview'
          ? previewHtml
          : '<!doctype html><html><body style="margin:0"><iframe title="Compiled F9 Preview" style="width:100%;height:500px;border:0" src="/preview"></iframe></body></html>',
      );
    });
    await Promise.all([
      new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => application.listen(0, '127.0.0.1', resolve)),
    ]);
    const backendAddress = backend.address();
    const appAddress = application.address();
    if (
      !backendAddress ||
      typeof backendAddress === 'string' ||
      !appAddress ||
      typeof appAddress === 'string'
    )
      throw new Error('Missing fixture ports.');
    const baseUrl = `http://127.0.0.1:${String(backendAddress.port)}`;
    const appUrl = `http://127.0.0.1:${String(appAddress.port)}`;
    try {
      const initial = fileUploadProject();
      let page = initial.pages[0];
      if (!page) throw new Error('Missing upload page.');
      page = {
        ...page,
        components: page.components.map((component) =>
          component.type === 'WebButton'
            ? {
                ...component,
                bounds: { ...component.bounds, x: 24, width: 240 },
                props: { ...component.props, icon: 'upload' },
              }
            : component,
        ),
      };
      page = addComponent(
        page,
        defaultComponentRegistry.createComponent('WebLabel', {
          id: 'upload-percentage',
          name: 'UploadPercentage',
          parentId: page.rootComponentId,
          x: 24,
          y: 220,
          width: 240,
          props: { caption: 'Aguardando envio' },
        }),
        page.rootComponentId,
      );
      page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'login');
      page = bindComponentEvent(page, 'send-file', 'OnClick', 'sendPublic');
      page = bindComponentEvent(page, 'file-upload', 'OnProgress', 'showProgress');
      const project = updateProjectSettings(
        { ...initial, pages: [page] },
        {
          restGo: { ...initial.settings.restGo, baseUrl: `${baseUrl}/backend` },
        },
      );
      const compiled = await compileProjectToMemory(project, {
        userSources: {
          [`pages/${page.name}.ts`]: `import type { WebFileUpload, WebFileUploadProgressEventDetail } from '@webrad/runtime';
import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  ${fileUploadMethods()}
  public async login(): Promise<void> {
    const login = await RestGO.login('upload@example.test', 'upload-fixture-password');
    this.element.dataset.authenticated = String(login.sucess);
  }
  public showProgress(sender: WebFileUpload, event: CustomEvent<WebFileUploadProgressEventDetail>): void {
    this.uploadProgress(sender, event);
    UploadPercentage.caption = event.detail.percentage === null ? 'Enviando...' : Math.round(event.detail.percentage) + '%';
  }
  public async sendPublic(): Promise<void> {
    try {
      const result = await FileUpload1.SendToRestGO({ isPublic: this.FileUpload1.isPublic });
      this.element.dataset.uploadId = result.id;
      this.element.dataset.uploadUrl = result.url;
      this.element.dataset.uploadPublic = String(result.isPublic);
      this.element.dataset.uploadResult = JSON.stringify(result);
      this.FileUpload1.isPublic = true;
    } catch (error) {
      this.element.dataset.uploadRejected = error instanceof Error ? error.message : String(error);
    }
  }
}`,
        },
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      previewHtml = compiled.previewHtml ?? '';
      await withChromium(browserPath!, appUrl, async (send) => {
        await send('Page.enable');
        await send('Network.enable');
        await send('Network.setCookie', {
          url: baseUrl,
          name: 'dashboard',
          value: 'fixture-cookie',
        });
        await send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 0,
          downloadThroughput: 10 * 1024 * 1024,
          uploadThroughput: 128 * 1024,
        });
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
          });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return (result.result as { value?: unknown } | undefined)?.value;
        };
        const frameDocument = "document.querySelector('iframe').contentDocument";
        const root = `${frameDocument}.querySelector('.wr-webpage')`;
        await expect
          .poll(() => evaluate(`${root}?.dataset.authenticated`), { timeout: 15_000 })
          .toBe('true');
        expect(
          await evaluate(
            `${frameDocument}.querySelector('[data-webrad-type="WebFileUpload"]') === null`,
          ),
        ).toBe(true);
        await send('Page.setInterceptFileChooserDialog', { enabled: true });
        const choose = async (): Promise<void> => {
          await evaluate(
            `${frameDocument}.querySelector('[data-webrad-id="select-file"]').click()`,
          );
          const input = await send('Runtime.evaluate', {
            expression: `${frameDocument}.querySelector('[data-file-upload-input]')`,
          });
          const objectId = (input.result as { objectId?: string } | undefined)?.objectId;
          if (!objectId) throw new Error('Missing native file chooser.');
          await send('DOM.setFileInputFiles', { objectId, files: [filePath] });
        };
        await choose();
        await expect.poll(() => evaluate(`${root}.dataset.selectedName`)).toBe('relatório.txt');
        expect(JSON.parse(String(await evaluate(`${root}.dataset.selection`)))).toEqual({
          name: 'relatório.txt',
          path: null,
          size: Buffer.byteLength(contents),
          extension: '.txt',
        });
        expect(uploads).toHaveLength(0);
        expect(
          await evaluate(`${frameDocument}.querySelector('[data-file-upload-input]') === null`),
        ).toBe(true);
        await evaluate(`${frameDocument}.querySelector('[data-webrad-id="send-file"]').click()`);
        await expect
          .poll(() => evaluate(`${root}.dataset.uploadId`), { timeout: 15_000 })
          .toBe('file-1');
        const first = JSON.parse(String(await evaluate(`${root}.dataset.uploadResult`)));
        expect(first).toEqual({
          id: 'file-1',
          ownerId: user.id,
          ownerEmail: user.email,
          originalName: 'relatório.txt',
          contentType: 'text/plain',
          sizeBytes: Buffer.byteLength(contents),
          isPublic: false,
          createdAt: '2026-10-09T12:00:00Z',
          updatedAt: '2026-10-09T12:00:00Z',
          downloadUrl: '/storage/files/file-1/download',
          url: `${baseUrl}/backend/storage/files/file-1/download`,
        });
        const progress = JSON.parse(String(await evaluate(`${root}.dataset.progressEvents`))) as {
          percentage: number | null;
          loaded: number;
          total: number | null;
          lengthComputable: boolean;
        }[];
        expect(
          progress.some(
            (entry) =>
              entry.percentage !== null &&
              entry.percentage > 0 &&
              entry.percentage < 100 &&
              entry.lengthComputable &&
              entry.loaded > 0 &&
              entry.total !== null,
          ),
        ).toBe(true);
        expect(
          await evaluate(
            `${frameDocument}.querySelector('[data-webrad-id="upload-percentage"]').textContent`,
          ),
        ).toBe('100%');
        expect((await fetch(first.url)).status).toBe(401);
        expect(
          (await fetch(first.url, { headers: { Authorization: 'Bearer upload-browser-jwt' } }))
            .status,
        ).toBe(200);
        await choose();
        await expect.poll(() => evaluate(`${root}.dataset.changeCount`)).toBe('2');
        expect(uploads).toHaveLength(1);
        await evaluate(`${frameDocument}.querySelector('[data-webrad-id="send-file"]').click()`);
        await expect
          .poll(() => evaluate(`${root}.dataset.uploadId`), { timeout: 15_000 })
          .toBe('file-2');
        expect(await evaluate(`${root}.dataset.uploadPublic`)).toBe('true');
        expect(await evaluate(`${root}.dataset.completed`)).toBe('true');
        expect(uploads[1]).toEqual({
          id: 'file-2',
          isPublic: true,
          content: contents,
          name: 'relatório.txt',
        });
        expect(await (await fetch(`${baseUrl}/backend/storage/files/file-2/download`)).text()).toBe(
          contents,
        );
        if (process.env.WEBRAD_FILE_UPLOAD_SCREENSHOT) {
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            path.resolve(process.env.WEBRAD_FILE_UPLOAD_SCREENSHOT),
            Buffer.from(String(screenshot.data), 'base64'),
          );
        }
      });
    } finally {
      await Promise.all(
        [backend, application].map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
      );
      await fs.rm(resolvedRoot, { recursive: true, force: true });
    }
  },
  60_000,
);
