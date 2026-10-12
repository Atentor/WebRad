import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { parseProject, type WebRadProject } from '@webrad/project-model';
import { DesignerSurface } from '../../apps/ide/renderer/src/components/DesignerSurface';
import '../../apps/ide/renderer/src/theme.css';
import '../../apps/ide/renderer/src/layout.css';
import '../../apps/ide/renderer/src/designer-chrome.css';

let changeProject: (project: WebRadProject) => void;
export function Harness({ initial, css }: { initial: WebRadProject; css: string }) {
  const [project, setProject] = useState(initial);
  useEffect(() => {
    changeProject = setProject;
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
      zoom={100}
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

const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100));
async function run() {
  const project = parseProject(await (await fetch('/project')).json());
  const css = await (await fetch('/project.css')).text();
  const root = createRoot(document.querySelector('#root')!);
  flushSync(() => root.render(<Harness initial={project} css={css} />));
  const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
  const assert = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    if (frame.contentDocument?.querySelector('[data-webrad-id="fixed0"]')) break;
    await pause();
  }
  let cases = 0;
  for (const width of [960, 640, 320]) {
    const surface = document.querySelector<HTMLElement>('.wr-page-surface')!;
    const host = document.querySelector<HTMLElement>('#root')!;
    const chromeWidth = host.getBoundingClientRect().width - surface.getBoundingClientRect().width;
    host.style.width = `${width + chromeWidth}px`;
    frame.style.width = `${width}px`;
    flushSync(() => changeProject({ ...project, pages: [{ ...project.pages[0]!, width }] }));
    await pause();
    await pause();
    for (const mode of ['fixed', 'align-to-parent', 'row', 'column']) {
      for (const [index, ratio] of [16 / 9, 9 / 16, null].entries()) {
        const id = `${mode}${index}`;
        const designer = document.querySelector<HTMLElement>(`[data-component-id="${id}"]`)!;
        const runtime = frame.contentDocument!.querySelector<HTMLElement>(
          `[data-webrad-id="${id}"]`,
        )!;
        const left = designer.getBoundingClientRect();
        const right = runtime.getBoundingClientRect();
        assert(
          Math.abs(left.width - right.width) < 1,
          `${width}/${id}: width differs ${left.width}/${right.width}`,
        );
        assert(
          Math.abs(left.height - right.height) < 1,
          `${width}/${id}: height differs ${left.height}/${right.height}`,
        );
        for (const [label, box] of [
          ['Designer', left],
          ['Preview', right],
        ] as const) {
          assert(box.width > 0, `${width}/${id}/${label}: empty player`);
          assert(
            ratio === null
              ? Math.abs(box.height - 123) < 1
              : Math.abs(box.height - box.width / ratio) < 1,
            `${width}/${id}/${label}: ratio failed (${box.width} x ${box.height})`,
          );
        }
        const media = runtime.querySelector('video')!.getBoundingClientRect();
        assert(
          Math.abs(media.width - runtime.clientWidth) < 1 &&
            Math.abs(media.height - runtime.clientHeight) < 1,
          `${width}/${id}: media does not fill player`,
        );
        cases++;
      }
    }
  }
  const runtime = frame.contentDocument!.querySelector<HTMLElement>('[data-webrad-id="fixed2"]')!;
  for (const [button, ratio] of [
    ['Portrait', 9 / 16],
    ['Landscape', 16 / 9],
    ['Free', null],
  ] as const) {
    frame
      .contentDocument!.querySelector<HTMLButtonElement>(`[data-webrad-name="${button}Button"]`)!
      .click();
    await pause();
    const box = runtime.getBoundingClientRect();
    assert(
      ratio === null
        ? Math.abs(box.height - 123) < 1
        : Math.abs(box.height - box.width / ratio) < 1,
      `Runtime ${button}: dimensions failed`,
    );
    cases++;
  }
  document.body.dataset.evidence = JSON.stringify({ passed: true, cases });
}
void run().catch((error: unknown) => {
  document.body.dataset.evidence = JSON.stringify({
    passed: false,
    error: error instanceof Error ? error.stack : String(error),
  });
});
