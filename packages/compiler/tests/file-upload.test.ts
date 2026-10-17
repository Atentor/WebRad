import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addReusableElement,
  createReusableElement,
  updatePage,
  type PageModel,
} from '@webrad/project-model';
import { compileProjectToMemory } from '../src/index.js';
import {
  fileUploadMethods,
  fileUploadProject,
  fileUploadUserSources,
} from '../../../tests/fixtures/file-upload.js';

function preview(application: string, storageError = false) {
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  let uploaded = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path === '/auth/token') {
      expect(new Headers(options?.headers).get('Authorization')).toBeNull();
      return new Response(
        JSON.stringify({
          token: 'upload-session-jwt',
          expiresAt: '2099-01-01T00:00:00Z',
          user: {
            id: 'upload-user',
            email: 'upload@example.test',
            fullName: 'Upload User',
            avatarUrl: null,
            active: true,
            emailConfirmed: true,
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    expect(path).toBe('/storage/files');
    expect(options?.method).toBe('POST');
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer upload-session-jwt');
    expect(new Headers(options?.headers).get('Content-Type')).toBeNull();
    if (storageError) {
      return new Response(JSON.stringify({ error: 'Storage quota exceeded.' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const form = options?.body;
    if (!(form instanceof dom.window.FormData)) throw new Error('Expected browser multipart data.');
    const file = form.get('file');
    if (!(file instanceof dom.window.File)) throw new Error('Expected the selected browser File.');
    return new Response(
      JSON.stringify({
        id: `uploaded-${String(++uploaded)}`,
        originalName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        isPublic: form.get('isPublic') === 'true',
        downloadUrl: `/storage/files/uploaded-${String(uploaded)}/download`,
        createdAt: '2026-10-09T12:00:00Z',
        updatedAt: '2026-10-09T12:00:00Z',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  });
  Object.defineProperties(dom.window, {
    fetch: { value: fetch },
    Headers: { value: globalThis.Headers },
    XMLHttpRequest: { value: undefined },
  });
  dom.window.eval(application);
  return { dom, fetch };
}

function selectFile(dom: JSDOM, scope: Element, name: string): HTMLInputElement {
  const select = scope.querySelector<HTMLButtonElement>('[data-webrad-name="SelectFile"]');
  if (select === null) throw new Error('Missing authored file selection button.');
  const inputs: HTMLInputElement[] = [];
  const file = new dom.window.File([`contents of ${name}`], name, { type: 'text/plain' });
  const click = vi
    .spyOn(dom.window.HTMLInputElement.prototype, 'click')
    .mockImplementation(function (this: HTMLInputElement) {
      if (this.type !== 'file') throw new Error('Expected native file chooser.');
      inputs.push(this);
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: { length: 1, item: (index: number) => (index === 0 ? file : null) },
      });
      this.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  try {
    select.click();
  } finally {
    click.mockRestore();
  }
  const input = inputs[0];
  if (input === undefined) throw new Error('OpenFile did not open the native chooser.');
  return input;
}

function sendFile(scope: Element): void {
  const button = scope.querySelector<HTMLButtonElement>('[data-webrad-name="SendFile"]');
  if (button === null) throw new Error('Missing upload action.');
  button.click();
}

it.each([false, true])(
  'executes compiled FileUpload selection separately and returns RestGO id/url for isPublic=%s',
  async (isPublic) => {
    const initial = fileUploadProject();
    const project = {
      ...initial,
      pages: initial.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.type === 'WebFileUpload'
            ? { ...component, props: { ...component.props, isPublic } }
            : component,
        ),
      })),
    };
    const page = project.pages[0];
    if (page === undefined) throw new Error('Missing page.');
    const result = await compileProjectToMemory(project, {
      userSources: fileUploadUserSources(page.name),
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    const application = result.files['assets/app.js'] ?? '';
    expect(application).not.toMatch(/require\(["'](?:electron|node:)/u);
    const { dom, fetch } = preview(application);
    try {
      const root = dom.window.document.querySelector<HTMLElement>(
        `[data-webrad-id="${page.rootComponentId}"]`,
      );
      if (root === null) throw new Error('Missing compiled page.');
      const input = selectFile(dom, root, 'example.txt');
      expect(input.accept).toBe('.txt,image/*');
      expect(root.querySelector('[data-webrad-type="WebFileUpload"]')).toBeNull();
      expect(root.querySelector('[data-file-upload-select]')).toBeNull();
      await expect.poll(() => root.dataset.selectedName).toBe('example.txt');
      expect(root.dataset.changeName).toBe('example.txt');
      expect(root.dataset.changeCount).toBe('1');
      expect(JSON.parse(root.dataset.selection ?? '{}')).toEqual({
        name: 'example.txt',
        path: null,
        size: new TextEncoder().encode('contents of example.txt').length,
        extension: '.txt',
      });
      expect(fetch).not.toHaveBeenCalled();
      sendFile(root);
      await expect.poll(() => root.dataset.uploadId).toBe('uploaded-1');
      expect(root.dataset.uploadUrl).toBe(
        'https://restgo.example.test/storage/files/uploaded-1/download',
      );
      expect(root.dataset.uploadPublic).toBe(String(isPublic));
      expect(root.dataset.successId).toBe('uploaded-1');
      expect(root.dataset.completed).toBe('true');
      const body = fetch.mock.calls.find(([url]) => String(url).endsWith('/storage/files'))?.[1]
        ?.body;
      if (!(body instanceof dom.window.FormData)) throw new Error('Missing upload multipart.');
      expect(body.get('isPublic')).toBe(String(isPublic));
      expect(body.get('file')).toBeInstanceOf(dom.window.File);
      expect(JSON.parse(root.dataset.uploadResult ?? '{}')).toMatchObject({
        originalName: 'example.txt',
        contentType: 'text/plain',
        sizeBytes: 23,
        downloadUrl: '/storage/files/uploaded-1/download',
        createdAt: '2026-10-09T12:00:00Z',
        updatedAt: '2026-10-09T12:00:00Z',
      });
      expect(root.dataset.progress).toBe('100');
    } finally {
      dom.window.close();
    }
  },
);

it('reports RestGO upload failure to authored OnError/OnComplete and rejects the method', async () => {
  const project = fileUploadProject();
  const page = project.pages[0];
  if (page === undefined) throw new Error('Missing page.');
  const result = await compileProjectToMemory(project, {
    userSources: fileUploadUserSources(page.name),
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const { dom } = preview(result.files['assets/app.js'] ?? '', true);
  try {
    const root = dom.window.document.querySelector<HTMLElement>(
      `[data-webrad-id="${page.rootComponentId}"]`,
    );
    if (root === null) throw new Error('Missing page.');
    selectFile(dom, root, 'example.txt');
    sendFile(root);
    await expect.poll(() => root.dataset.uploadRejected).toBe('Storage quota exceeded.');
    expect(root.dataset.errorMessage).toBe('Storage quota exceeded.');
    expect(root.dataset.completed).toBe('true');
    expect(root.dataset.successId).toBeUndefined();
    expect(root.dataset.progress).not.toBe('100');
  } finally {
    dom.window.close();
  }
});

it('keeps selection and upload results isolated in two compiled reusable placements', async () => {
  const initial = fileUploadProject();
  const fixturePage = initial.pages[0];
  if (fixturePage === undefined) throw new Error('Missing page.');
  const reusable = createReusableElement('AttachmentPicker');
  const root = reusable.components[0];
  if (root === undefined) throw new Error('Missing reusable root.');
  const children = fixturePage.components.filter(
    (component) => component.id !== fixturePage.rootComponentId,
  );
  const definition = {
    ...reusable,
    components: [
      { ...root, children: children.map((component) => component.id) },
      ...children.map((component) => ({ ...component, parentId: root.id })),
    ],
  };
  let page: PageModel = { ...fixturePage, components: fixturePage.components.slice(0, 1) };
  const hostRoot = page.components[0];
  if (hostRoot === undefined) throw new Error('Missing host root.');
  page = { ...page, components: [{ ...hostRoot, children: [] }] };
  let project = addReusableElement({ ...initial, pages: [page] }, definition);
  for (const [index, name] of ['PickerOne', 'PickerTwo'].entries()) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: name,
        name,
        parentId: page.rootComponentId,
        y: index * 240,
        props: { reusableElementId: definition.id },
      }),
      page.rootComponentId,
    );
  }
  project = updatePage(project, page.id, { components: page.components });
  const result = await compileProjectToMemory(project, {
    userSources: {
      'reusables/AttachmentPicker.ts': `import type { WebFileUpload, WebFileUploadProgressEventDetail } from '@webrad/runtime';
import { AttachmentPickerGenerated } from './AttachmentPicker.generated';
export class AttachmentPicker extends AttachmentPickerGenerated {${fileUploadMethods()}}
`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const { dom, fetch } = preview(result.files['assets/app.js'] ?? '');
  try {
    const pickers = [
      ...dom.window.document.querySelectorAll<HTMLElement>('[data-webrad-name="AttachmentPicker"]'),
    ];
    expect(pickers).toHaveLength(2);
    const first = pickers[0];
    const second = pickers[1];
    if (first === undefined || second === undefined) throw new Error('Missing placements.');
    selectFile(dom, first, 'first.txt');
    await expect.poll(() => first.dataset.selectedName).toBe('first.txt');
    expect(second.dataset.selectedName).toBeUndefined();
    expect(second.querySelector('[data-webrad-type="WebFileUpload"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    sendFile(first);
    await expect.poll(() => first.dataset.uploadId).toBe('uploaded-1');
    expect(second.dataset.uploadId).toBeUndefined();
    selectFile(dom, second, 'second.txt');
    sendFile(second);
    await expect.poll(() => second.dataset.uploadId).toBe('uploaded-2');
    expect(first.dataset.uploadId).toBe('uploaded-1');
    expect(first.dataset.selectedName).toBe('first.txt');
    expect(second.dataset.selectedName).toBe('second.txt');
  } finally {
    dom.window.close();
  }
});
