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
  videoBackend,
  videoUploadMethods,
  videoUploadProject,
  videoUploadUserSources,
} from '../../../tests/fixtures/video-upload';

function preview(application: string) {
  const backend = videoBackend({ conflictAfterFirstChunk: true });
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test',
  });
  Object.defineProperties(dom.window, {
    fetch: { value: backend.fetcher },
    Headers: { value: Headers },
    Blob: { value: Blob },
    File: { value: File },
    crypto: { value: globalThis.crypto },
    XMLHttpRequest: { value: undefined },
  });
  dom.window.URL.createObjectURL = URL.createObjectURL;
  dom.window.URL.revokeObjectURL = URL.revokeObjectURL;
  dom.window.HTMLMediaElement.prototype.load = () => undefined;
  const create = dom.window.document.createElement.bind(dom.window.document);
  dom.window.document.createElement = ((name: string, options?: ElementCreationOptions) => {
    const element = create(name, options);
    if (element instanceof dom.window.HTMLVideoElement) {
      Object.defineProperty(element, 'duration', { value: 1 });
      queueMicrotask(() => element.dispatchEvent(new dom.window.Event('loadedmetadata')));
    }
    return element;
  }) as typeof dom.window.document.createElement;
  dom.window.eval(application);
  return { dom, ...backend };
}
async function select(dom: JSDOM, scope: HTMLElement) {
  const select = scope.querySelector<HTMLButtonElement>('[data-webrad-name="ChooseVideo"]')!;
  const click = vi
    .spyOn(dom.window.HTMLInputElement.prototype, 'click')
    .mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        value: { item: () => new File(['0123456789abcdef'], 'aula.webm', { lastModified: 123 }) },
      });
      this.dispatchEvent(new dom.window.Event('change'));
    });
  try {
    select.click();
    await expect.poll(() => scope.dataset.selection).toBeDefined();
  } finally {
    click.mockRestore();
  }
}
async function send(dom: JSDOM, scope: HTMLElement) {
  scope.querySelector<HTMLButtonElement>('[data-webrad-name="SendVideo"]')!.click();
  await expect.poll(() => scope.dataset.pauseOnce).toBe('done');
  await expect.poll(() => scope.dataset.uploadError).toContain('aborted');
  scope.querySelector<HTMLButtonElement>('[data-webrad-name="ResumeVideo"]')!.click();
  await expect.poll(() => scope.dataset.video).toBeDefined();
  scope.querySelector<HTMLButtonElement>('[data-webrad-name="WaitVideo"]')!.click();
  await expect.poll(() => scope.dataset.ready).toBeDefined();
}
it('compiles and executes typed bare/this video selection, pause/resume and readiness in Preview', async () => {
  const project = videoUploadProject();
  const result = await compileProjectToMemory(project, {
    userSources: videoUploadUserSources(project.pages[0]!.name),
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const { dom, uploads } = preview(result.files['assets/app.js'] ?? '');
  try {
    const root = dom.window.document.querySelector<HTMLElement>('[data-webrad-page-id]')!;
    expect(root.querySelector('[data-webrad-type="WebVideoUpload"]')).toBeNull();
    await select(dom, root);
    expect(uploads.size).toBe(0);
    await send(dom, root);
    expect(uploads.size).toBe(1);
    expect(uploads.get('upload-1')?.content.toString()).toBe('0123456789abcdef');
  } finally {
    dom.window.close();
  }
});
it('creates isolated video instances in two compiled reusable placements', async () => {
  const initial = videoUploadProject();
  const page = initial.pages[0]!;
  const definition = createReusableElement('VideoPicker');
  const root = definition.components[0]!;
  const children = page.components.filter((entry) => entry.id !== page.rootComponentId);
  const reusable = {
    ...definition,
    components: [
      { ...root, children: children.map((entry) => entry.id) },
      ...children.map((entry) => ({ ...entry, parentId: root.id })),
    ],
  };
  let host: PageModel = { ...page, components: [{ ...page.components[0]!, children: [] }] };
  for (const name of ['FirstPicker', 'SecondPicker'])
    host = addComponent(
      host,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        name,
        parentId: host.rootComponentId,
        props: { reusableElementId: reusable.id },
      }),
      host.rootComponentId,
    );
  const project = updatePage(addReusableElement(initial, reusable), host.id, {
    components: host.components,
  });
  const result = await compileProjectToMemory(project, {
    userSources: {
      'reusables/VideoPicker.ts': `import type { WebVideoUpload, WebVideoUploadProgressEventDetail } from '@webrad/runtime';
import { VideoPickerGenerated } from './VideoPicker.generated'; export class VideoPicker extends VideoPickerGenerated {${videoUploadMethods()}}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const { dom, uploads } = preview(result.files['assets/app.js'] ?? '');
  try {
    const scopes = dom.window.document.querySelectorAll<HTMLElement>(
      '[data-webrad-name="VideoPicker"]',
    );
    expect(scopes).toHaveLength(2);
    await select(dom, scopes[0]!);
    await send(dom, scopes[0]!);
    expect(scopes[1]!.dataset.selection).toBeUndefined();
    expect(scopes[1]!.dataset.video).toBeUndefined();
    await select(dom, scopes[1]!);
    await send(dom, scopes[1]!);
    expect(uploads.size).toBe(2);
    expect(scopes[0]!.dataset.ready).toBe('video-1');
    expect(scopes[1]!.dataset.ready).toBe('video-2');
  } finally {
    dom.window.close();
  }
});
