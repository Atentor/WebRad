import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  parseProject,
  type CurrentRowBinding,
  type RepeatingGroupConfiguration,
  type WebRadProject,
} from '@webrad/project-model';
import { DesignerSurface } from '../../apps/ide/renderer/src/components/DesignerSurface';
import { RepeatingGroupConfigurationDialog } from '../../apps/ide/renderer/src/components/RepeatingGroupConfigurationDialog';
import { CurrentRowBindingsDialog } from '../../apps/ide/renderer/src/components/CurrentRowBindingsDialog';
import '../../apps/ide/renderer/src/theme.css';
import '../../apps/ide/renderer/src/layout.css';
import '../../apps/ide/renderer/src/designer-chrome.css';

declare global {
  interface Window {
    reviewRowEditor: (kind: 'configuration' | 'bindings', theme: 'light' | 'dark') => void;
  }
}

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

const pause = (duration = 50): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, duration));
const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

async function run() {
  const project = parseProject(await (await fetch('/project')).json());
  const css = await (await fetch('/project.css')).text();
  flushSync(() =>
    createRoot(document.querySelector('#root')!).render(<Harness initial={project} css={css} />),
  );
  const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (frame.contentDocument?.querySelector('[data-webrad-name="Name0"]')?.textContent === 'Ana')
      break;
    await pause();
  }
  const runtimeDocument = frame.contentDocument!;
  let cases = 0;
  for (const width of [960, 640, 320]) {
    const surface = document.querySelector<HTMLElement>('.wr-page-surface')!;
    const host = document.querySelector<HTMLElement>('#root')!;
    const chromeWidth = host.getBoundingClientRect().width - surface.getBoundingClientRect().width;
    host.style.width = `${width + chromeWidth}px`;
    frame.style.width = `${width}px`;
    flushSync(() => changeProject({ ...project, pages: [{ ...project.pages[0]!, width }] }));
    await pause(120);
    for (const [index, mode] of ['fixed', 'align-to-parent', 'row', 'column'].entries()) {
      const designerGroup = document.querySelector<HTMLElement>(
        `[data-component-id="group-${mode}"]`,
      )!;
      const runtimeGroup = runtimeDocument.querySelector<HTMLElement>(
        `[data-webrad-id="group-${mode}"]`,
      )!;
      const designerPanel = document.querySelector<HTMLElement>(
        `[data-component-id="panel-${mode}"]`,
      )!;
      const runtimePanels = [
        ...runtimeGroup.querySelectorAll<HTMLElement>(`[data-webrad-name="Panel${index}"]`),
      ];
      assert(
        runtimePanels.length === 2,
        `${mode}: expected two row panels, got ${runtimePanels.length}`,
      );
      assert(
        Math.abs(
          designerGroup.getBoundingClientRect().width - runtimeGroup.getBoundingClientRect().width,
        ) < 1,
        `${width}/${mode}: group width differs`,
      );
      cases++;
      for (const panel of runtimePanels) {
        assert(
          Math.abs(
            designerPanel.getBoundingClientRect().width - panel.getBoundingClientRect().width,
          ) < 1,
          `${width}/${mode}: panel width differs (${designerPanel.getBoundingClientRect().width}/${panel.getBoundingClientRect().width})`,
        );
        assert(
          panel.getBoundingClientRect().right <= runtimeGroup.getBoundingClientRect().right + 1,
          `${width}/${mode}: template exceeds group width`,
        );
        cases++;
      }
      const names = [
        ...runtimeGroup.querySelectorAll<HTMLElement>(`[data-webrad-name="Name${index}"]`),
      ];
      assert(
        names.map((element) => element.textContent).join(',') === 'Ana,Bruno',
        `${mode}: wrong row bindings`,
      );
      assert(runtimeGroup.querySelectorAll('thead,th').length === 0, `${mode}: unexpected header`);
    }
  }
  const names = [...runtimeDocument.querySelectorAll<HTMLElement>('[data-webrad-name="Name2"]')];
  names[1]!.click();
  await pause();
  assert(
    names[0]!.textContent === 'Ana' && names[1]!.textContent === 'Label Bruno',
    'this.Name affected another row',
  );
  assert(
    runtimeDocument.querySelector('[data-webrad-name="Result"]')!.textContent === '2',
    'CurrentRow wrong or root write lost',
  );
  const columnNames = [
    ...runtimeDocument.querySelectorAll<HTMLElement>('[data-webrad-name="Name3"]'),
  ];
  runtimeDocument.querySelectorAll<HTMLButtonElement>('[data-webrad-name="Choose3"]')[1]!.click();
  await pause(150);
  assert(
    columnNames[0]!.textContent === 'Ana' && columnNames[1]!.textContent === 'Selected Bruno',
    'Arrow callback used another row',
  );
  assert(
    runtimeDocument.querySelector('[data-webrad-name="Result"]')!.textContent === 'Async Bruno:1',
    'Arrow callback lost row context',
  );
  runtimeDocument.querySelector<HTMLButtonElement>('[data-webrad-name="Choose2"]')!.click();
  runtimeDocument.querySelector<HTMLButtonElement>('[data-webrad-name="Reload"]')!.click();
  await pause(300);
  assert(
    runtimeDocument.querySelector('[data-webrad-name="Result"]')!.textContent === 'Async Ana:2',
    'Async row context or private page field changed',
  );
  assert(
    [...runtimeDocument.querySelectorAll('[data-webrad-name="Name2"]')]
      .map((element) => element.textContent)
      .join(',') === 'Ana updated,Bruno updated',
    'reload did not replace both rows',
  );
  const ids = [...runtimeDocument.querySelectorAll<HTMLElement>('[data-webrad-id]')].map(
    (element) => element.dataset.webradId,
  );
  assert(new Set(ids).size === ids.length, 'Repeated physical IDs');
  cases += 7;
  const dialogHost = document.body.appendChild(document.createElement('div'));
  const dialogRoot = createRoot(dialogHost);
  const group = project.pages[0]!.components.find((node) => node.id === 'group-row')!;
  let savedConfiguration: RepeatingGroupConfiguration | undefined;
  flushSync(() =>
    dialogRoot.render(
      <RepeatingGroupConfigurationDialog
        component={group}
        availableComponents={project.pages[0]!.components}
        onClose={() => {}}
        onSave={(value) => {
          savedConfiguration = value;
        }}
      />,
    ),
  );
  const changeSelect = (label: string, value: string): void => {
    const select = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    flushSync(() => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  changeSelect('Repeating Group API Client', '');
  assert(
    document.querySelector<HTMLSelectElement>('[aria-label="Repeating Group operation"]')!.disabled,
    'Unbound operation not disabled',
  );
  changeSelect('Repeating Group API Client', 'customers-api');
  changeSelect('Repeating Group row height', 'dynamic');
  flushSync(() =>
    document
      .querySelector<HTMLFormElement>('.wr-repeating-group-configuration-dialog form')!
      .requestSubmit(),
  );
  assert(
    savedConfiguration?.apiClientId === 'customers-api' &&
      savedConfiguration?.listPath === '/customers' &&
      savedConfiguration?.rowHeightMode === 'dynamic',
    'Browser configuration did not save selected source',
  );
  let savedBindings: readonly CurrentRowBinding[] | undefined;
  const label = project.pages[0]!.components.find((node) => node.id === 'name-row')!;
  flushSync(() =>
    dialogRoot.render(
      <CurrentRowBindingsDialog
        component={label}
        group={group}
        availableComponents={project.pages[0]!.components}
        onClose={() => {}}
        onSave={(value) => {
          savedBindings = value;
        }}
      />,
    ),
  );
  changeSelect('Current row Caption', '/id');
  flushSync(() =>
    document
      .querySelector<HTMLFormElement>('.wr-current-row-bindings-dialog form')!
      .requestSubmit(),
  );
  assert(
    savedBindings?.some(
      (binding) => binding.property === 'caption' && binding.fieldPath === '/id',
    ) === true,
    'Browser property binding did not save',
  );
  dialogRoot.unmount();
  dialogHost.remove();
  let reviewRoot: Root | undefined;
  let reviewHost: HTMLElement | undefined;
  window.reviewRowEditor = (kind, theme) => {
    reviewRoot?.unmount();
    reviewHost?.remove();
    document.documentElement.dataset.theme = theme;
    reviewHost = document.body.appendChild(document.createElement('div'));
    reviewRoot = createRoot(reviewHost);
    flushSync(() =>
      reviewRoot!.render(
        kind === 'configuration' ? (
          <RepeatingGroupConfigurationDialog
            component={group}
            availableComponents={project.pages[0]!.components}
            onClose={() => {}}
            onSave={() => {}}
          />
        ) : (
          <CurrentRowBindingsDialog
            component={label}
            group={group}
            availableComponents={project.pages[0]!.components}
            onClose={() => {}}
            onSave={() => {}}
          />
        ),
      ),
    );
  };
  cases += 3;
  document.body.dataset.evidence = JSON.stringify({ passed: true, cases });
}
void run().catch((error: unknown) => {
  document.body.dataset.evidence = JSON.stringify({
    passed: false,
    error: error instanceof Error ? error.stack : String(error),
  });
});
