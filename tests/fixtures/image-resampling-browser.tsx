import { useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  parseProject,
  updateComponentProps,
  updatePage,
  type WebRadProject,
} from '@webrad/project-model';
import { WebImage } from '@webrad/runtime';
import { DesignerSurface } from '../../apps/ide/renderer/src/components/DesignerSurface';
import '../../apps/ide/renderer/src/theme.css';
import '../../apps/ide/renderer/src/layout.css';
import '../../apps/ide/renderer/src/designer-chrome.css';

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await pause(30);
  }
  throw new Error('Image display did not reach the expected state.');
}
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

function pixelData(image: HTMLImageElement): Promise<ImageData> {
  return (async () => {
    const bitmap = document.createElement('img');
    const svg = await (await fetch(image.currentSrc)).text();
    const content = new DOMParser().parseFromString(svg, 'image/svg+xml');
    bitmap.src = content.querySelector('image')!.getAttribute('href')!;
    await bitmap.decode();
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.naturalWidth;
    canvas.height = bitmap.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  })();
}

let changeProject: (project: WebRadProject) => void;
let changeZoom: (zoom: number) => void;
export function Harness({ initial, css }: { initial: WebRadProject; css: string }): ReactElement {
  const [project, setProject] = useState(initial);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    changeProject = setProject;
    changeZoom = setZoom;
  }, []);
  const noop = (): void => {};
  return (
    <DesignerSurface
      page={project.pages[0]!}
      styles={project.styles}
      settings={{ ...project.settings, showGrid: false }}
      viewportName="desktop"
      showToolbar={false}
      compiledStylesCss={css}
      selectedIds={[]}
      selectedPaletteType={null}
      zoom={zoom}
      onSelect={noop}
      onAddComponent={noop}
      onMoveComponents={noop}
      onResizeComponent={noop}
      onDeleteSelection={noop}
      onCopy={noop}
      onPaste={noop}
      onUndo={noop}
      onRedo={noop}
      onBringToFront={noop}
      onSendToBack={noop}
      onZoomChange={noop}
    />
  );
}

async function run(): Promise<void> {
  document.body.dataset.stage = 'mount';
  const project = parseProject(await (await fetch('/project')).json());
  const css = await (await fetch('/project.css')).text();
  const root = createRoot(document.querySelector('#root')!);
  flushSync(() => root.render(<Harness initial={project} css={css} />));
  const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
  const designer = (id: string): HTMLImageElement =>
    document.querySelector<HTMLImageElement>(`img[data-component-id="${id}"]`)!;
  const preview = (id: string): HTMLImageElement =>
    frame.contentDocument!.querySelector<HTMLImageElement>(`img[data-webrad-id="${id}"]`)!;
  const ready = (image: HTMLImageElement | null): boolean =>
    Boolean(
      image?.complete &&
      image.srcset.startsWith('blob:') &&
      image.currentSrc === image.srcset.split(' ')[0],
    );
  await until(() =>
    ['image', 'contain', 'cover', 'fill', 'rectangular'].every(
      (id) => ready(designer(id)) && ready(preview(id)),
    ),
  );
  document.body.dataset.stage = 'pixels';
  for (const id of ['image', 'contain', 'cover', 'fill', 'rectangular']) {
    const left = await pixelData(designer(id));
    const right = await pixelData(preview(id));
    assert(
      left.width === right.width && left.height === right.height,
      `${id}: bitmap size differs`,
    );
    assert(
      left.data.every((value, index) => value === right.data[index]),
      `${id}: Designer/Preview pixels differ`,
    );
    assert(
      designer(id).naturalWidth === (id === 'rectangular' ? 300 : 256) &&
        preview(id).naturalWidth === (id === 'rectangular' ? 300 : 256) &&
        designer(id).naturalHeight === (id === 'rectangular' ? 173 : 256) &&
        preview(id).naturalHeight === (id === 'rectangular' ? 173 : 256),
      `${id}: intrinsic size changed`,
    );
    assert(
      designer(id).src.endsWith(id === 'rectangular' ? '/rectangular.png' : '/pattern.png') &&
        preview(id).src.endsWith(id === 'rectangular' ? '/rectangular.png' : '/pattern.png'),
      `${id}: original src changed`,
    );
    assert(getComputedStyle(designer(id)).filter === 'none', `${id}: display blur present`);
  }
  const primary = await pixelData(designer('image'));
  assert(primary.width === 64 && primary.height === 64, 'Unexpected display bitmap dimensions');
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 30; x++) {
      assert(
        Math.abs((primary.data[(y * 64 + x) * 4] ?? 0) - 128) <= 1,
        'Fine detail still aliases',
      );
    }
  }
  assert(
    primary.data[(31 * 64 + 63) * 4] === 0 && primary.data[(32 * 64 + 63) * 4] === 255,
    'A sharp large edge was blurred',
  );
  for (const id of ['native', 'vector', 'animated', 'remote', 'none']) {
    assert(designer(id).complete && designer(id).naturalWidth > 0, `${id}: native image failed`);
    assert(
      !designer(id).hasAttribute('srcset') && !preview(id).hasAttribute('srcset'),
      `${id}: native fallback not preserved`,
    );
  }

  // Runtime width/height changes execute through authored typed component code.
  document.body.dataset.stage = 'resize';
  const beforeResize = preview('image').currentSrc;
  frame.contentDocument!.querySelector<HTMLButtonElement>('[data-webrad-id="resize"]')!.click();
  await until(() => ready(preview('image')) && preview('image').currentSrc !== beforeResize);
  assert(preview('image').style.width === '130px', 'Typed runtime width assignment failed');
  assert(preview('image').naturalWidth === 256, 'Resize changed intrinsic dimensions');
  let page = project.pages[0]!;
  page = {
    ...page,
    components: page.components.map((node) =>
      node.id === 'image' ? { ...node, bounds: { ...node.bounds, width: 130, height: 130 } } : node,
    ),
  };
  let resized = updatePage(project, page.id, page);
  const beforeDesignerResize = designer('image').currentSrc;
  flushSync(() => changeProject(resized));
  await until(
    () => ready(designer('image')) && designer('image').currentSrc !== beforeDesignerResize,
  );
  assert(
    (await pixelData(designer('image'))).width === (await pixelData(preview('image'))).width,
    'Resize parity failed',
  );
  const beforeZoom = designer('image').currentSrc;
  flushSync(() => changeZoom(75));
  await until(() => ready(designer('image')) && designer('image').currentSrc !== beforeZoom);
  assert((await pixelData(designer('image'))).width === 96, 'Designer zoom bitmap mismatch');
  const afterZoom = designer('image').currentSrc;
  flushSync(() => changeZoom(100));
  await until(() => ready(designer('image')) && designer('image').currentSrc !== afterZoom);
  assert(
    (await pixelData(designer('image'))).width === 128,
    'Designer restored zoom bitmap mismatch',
  );

  document.body.dataset.stage = 'replace';
  const previousDesigner = designer('image').currentSrc;
  const previousPreview = preview('image').currentSrc;
  frame.contentDocument!.querySelector<HTMLButtonElement>('[data-webrad-id="replace"]')!.click();
  page = updateComponentProps(resized.pages[0]!, 'image', { src: '/red.png' });
  resized = updatePage(resized, page.id, page);
  flushSync(() => changeProject(resized));
  await until(
    () =>
      designer('image').src.endsWith('/red.png') &&
      ready(designer('image')) &&
      designer('image').currentSrc !== previousDesigner &&
      preview('image').src.endsWith('/red.png') &&
      ready(preview('image')) &&
      preview('image').currentSrc !== previousPreview,
  );
  const red = await pixelData(designer('image'));
  assert(
    red.data[0] === 255 && red.data[1] === 0 && red.data[2] === 0,
    'Source update displays stale pixels',
  );
  assert((await pixelData(preview('image'))).data[0] === 255, 'Compiled source update failed');

  const standalone = document.createElement('img');
  document.body.dataset.stage = 'cleanup';
  standalone.style.cssText = 'width:64px;height:64px;object-fit:contain';
  standalone.src = '/pattern.png';
  document.body.append(standalone);
  const component = new WebImage(standalone);
  await until(() => standalone.currentSrc.startsWith('blob:'));
  const temporary = standalone.currentSrc;
  component.dispose();
  assert(!standalone.hasAttribute('srcset'), 'Dispose did not restore the original image');
  await fetch(temporary).then(
    () => {
      throw new Error('Temporary bitmap was not released');
    },
    () => undefined,
  );
  standalone.remove();

  document.body.dataset.evidence = encodeURIComponent(
    JSON.stringify({
      passed: true,
      cases: 10,
      resized: true,
      replaced: true,
      zoom: true,
      cleanup: true,
    }),
  );
}

void run().catch((error: unknown) => {
  document.body.dataset.evidence = encodeURIComponent(
    JSON.stringify({ passed: false, error: `${document.body.dataset.stage}: ${String(error)}` }),
  );
});
