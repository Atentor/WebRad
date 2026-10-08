import { useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  createProject,
  deserializeProject,
  serializeProject,
  updateComponentProps,
  updateComponentStyle,
  updatePage,
  updateProjectSettings,
  paletteColorReference,
  projectColorPaletteCss,
} from '@webrad/project-model';
import { ComponentView } from '@webrad/components';
import { ProjectColorPaletteContext } from '../../apps/ide/renderer/src/project-color-palette';
import { ProjectSettingsDialog } from '../../apps/ide/renderer/src/components/ProjectSettingsDialog';
import { ObjectInspector } from '../../apps/ide/renderer/src/components/ObjectInspector';
import { StylesWorkspace } from '../../apps/ide/renderer/src/components/StylesWorkspace';
import '../../apps/ide/renderer/src/theme.css';
import '../../apps/ide/renderer/src/layout.css';
import '../../apps/ide/renderer/src/panels.css';
import '../../apps/ide/renderer/src/designer-chrome.css';

export function Harness(): ReactElement {
  const [project, setProject] = useState(() => {
    const created = createProject('ColorPalette');
    const page = created.pages[0]!;
    const label = defaultComponentRegistry.createComponent('WebLabel', {
      id: 'palette-label',
      parentId: page.rootComponentId,
    });
    return updatePage(created, page.id, addComponent(page, label, page.rootComponentId));
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [compiledCss, setCompiledCss] = useState('');
  const [cssVersion, setCssVersion] = useState('');
  const styleVersion = JSON.stringify(project.styles);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/compile-css', { method: 'POST', body: styleVersion, signal: controller.signal })
      .then((response) => response.text())
      .then((css) => {
        setCompiledCss(css);
        setCssVersion(styleVersion);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [styleVersion]);
  const page = project.pages[0]!;
  const label = page.components.find((node) => node.id === 'palette-label')!;
  return (
    <ProjectColorPaletteContext.Provider value={project.settings.colorPalette}>
      <style data-webrad-color-palette>
        {projectColorPaletteCss(project.settings.colorPalette)}
      </style>
      <output id="css-ready" hidden>
        {cssVersion}
      </output>
      <button id="settings" onClick={() => setSettingsOpen(true)}>
        Settings
      </button>
      <div id="inspector" style={{ width: 320, height: 900, overflow: 'auto', float: 'left' }}>
        <div id="bound-label" className="wr-project-surface">
          <ComponentView node={label} designTime />
        </div>
        <ObjectInspector
          selection={[label]}
          onPropertyChange={(name, value) =>
            setProject(
              updatePage(project, page.id, updateComponentProps(page, label.id, { [name]: value })),
            )
          }
          onEventChange={() => undefined}
          onEventDoubleClick={() => undefined}
        />
      </div>
      <div id="styles" style={{ width: 1100, height: 900, overflow: 'auto', marginLeft: 320 }}>
        <StylesWorkspace
          compiledCss={compiledCss}
          styles={project.styles}
          selectedComponentType="WebButton"
          colorPalette={project.settings.colorPalette}
          onUpdateColorPalette={(colorPalette) =>
            setProject(
              deserializeProject(
                serializeProject(updateProjectSettings(project, { colorPalette })),
              ),
            )
          }
          onCreateStyle={() => null}
          onUpdateStyle={(style) => setProject(updateComponentStyle(project, style.id, style))}
          onDeleteStyle={() => undefined}
        />
      </div>
      <output id="project" hidden>
        {serializeProject(project)}
      </output>
      {settingsOpen && (
        <ProjectSettingsDialog
          projectName="ColorPalette"
          settings={project.settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => {
            setProject(
              deserializeProject(serializeProject(updateProjectSettings(project, settings))),
            );
            setSettingsOpen(false);
          }}
        />
      )}
    </ProjectColorPaletteContext.Provider>
  );
}

const tick = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 40));
};
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function labelled(label: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (element === null) throw new Error(`Missing ${label}`);
  return element;
}
async function click(label: string): Promise<void> {
  labelled(label).click();
  await tick();
}
async function textButton(text: string): Promise<void> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent?.trim() === text,
  );
  if (button === undefined) throw new Error(`Missing button ${text}`);
  button.click();
  await tick();
}
async function setHex(label: string, color: string): Promise<void> {
  const input = labelled(label);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, color);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}
function popup(): HTMLElement {
  const element = document.querySelector<HTMLElement>(':popover-open');
  if (element === null) throw new Error('Native color popover did not open');
  return element;
}

async function smoke(): Promise<void> {
  await tick();
  if (document.body.dataset.renderError) throw new Error(document.body.dataset.renderError);
  await click('Color palette');
  const add = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent?.trim() === 'Add color',
  )!;
  assert(add.disabled, 'Palette exceeded ten colors');
  await setHex('Palette color 1 hex', '#007acc');
  await textButton('Save palette');
  await click('Color palette');
  assert(
    (labelled('Palette color 1 hex') as HTMLInputElement).value === '#007acc',
    'Palette was lost on reopening Styles',
  );
  await textButton('Cancel');
  document.querySelector<HTMLButtonElement>('#settings')!.click();
  await tick();
  assert(
    document.querySelector('#project-settings-tab-colors') === null,
    'Palette configuration remains in Project Settings',
  );
  await textButton('General');
  await click('Predefined colors for Track color');
  const rect = popup().getBoundingClientRect();
  assert(
    rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
    'Popover exceeded viewport',
  );
  assert(popup().querySelectorAll('button').length === 10, 'Popover did not expose ten colors');
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
  );
  assert(
    document.activeElement === popup().querySelectorAll('button')[1],
    'Keyboard navigation missed the next swatch',
  );
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await tick();
  assert(
    document.querySelector(':popover-open') === null &&
      document.querySelector('[role="dialog"]') !== null,
    'Escape closed project settings',
  );
  await click('Predefined colors for Track color');
  await click('Use #007ACC for Track color');
  assert(
    (labelled('Track color') as HTMLInputElement).value === '#007acc',
    'Scrollbar choice did not apply',
  );
  await textButton('Save changes');
  await click('Predefined colors for Color color picker');
  await click('Use #007ACC for Color color picker');
  await textButton('All properties');
  const textCategory = document.querySelector<HTMLButtonElement>(
    '.wr-style-category-summary[aria-label^="Text,"]',
  )!;
  if (textCategory.getAttribute('aria-expanded') !== 'true') {
    textCategory.click();
    await tick();
  }
  await click('Predefined colors for Text color');
  await click('Use #007ACC for Text color');
  const appearance = document.querySelector<HTMLButtonElement>(
    '.wr-style-category-summary[aria-label^="Appearance,"]',
  )!;
  if (appearance.getAttribute('aria-expanded') !== 'true') {
    appearance.click();
    await tick();
  }
  for (const end of ['from', 'to']) {
    const trigger = labelled(`Predefined colors for Background gradient ${end} color`);
    assert(
      trigger.closest('.wr-style-gradient-color-picker') === null,
      'Palette button is grouped with the color value',
    );
    const icon = trigger.querySelector('svg')!;
    assert(
      icon.getBoundingClientRect().width >= 22 && trigger.getBoundingClientRect().width >= 32,
      'Palette icon is too small',
    );
    await click(`Predefined colors for Background gradient ${end} color`);
    await click(`Use #007ACC for Background gradient ${end} color`);
  }
  const project = deserializeProject(document.querySelector('#project')!.textContent!);
  assert(
    project.settings.colorPalette.length === 10 &&
      project.settings.scrollbar.trackColor === paletteColorReference('aurora-blue'),
    'Saved settings mismatch',
  );
  assert(
    project.pages[0]!.components.find((entry) => entry.id === 'palette-label')!.props.color ===
      paletteColorReference('aurora-blue'),
    'Inspector choice was not persisted',
  );
  const style = project.styles.find((entry) => entry.componentType === 'WebButton')!;
  assert(
    style.states.base.textColor === paletteColorReference('aurora-blue'),
    'Style color was not persisted',
  );
  const gradient = style.states.base.backgroundGradient;
  assert(
    typeof gradient === 'object' &&
      'from' in gradient &&
      gradient.from === paletteColorReference('aurora-blue') &&
      gradient.to === paletteColorReference('aurora-blue'),
    'Gradient endpoints were not persisted',
  );
  await click('Color palette');
  await setHex('Palette color 1 name', 'Rose');
  await setHex('Palette color 1 hex', '#e11d48');
  await textButton('Save palette');
  await textButton('All properties');
  const updatedAppearance = document.querySelector<HTMLButtonElement>(
    '.wr-style-category-summary[aria-label^="Appearance,"]',
  )!;
  if (updatedAppearance.getAttribute('aria-expanded') !== 'true') {
    updatedAppearance.click();
    await tick();
  }
  assert(
    (labelled('Color color picker') as HTMLInputElement).value === '#e11d48',
    'Linked Inspector color did not follow palette edit',
  );
  assert(
    (labelled('Background gradient from color') as HTMLInputElement).value === '#e11d48' &&
      (labelled('Background gradient to color') as HTMLInputElement).value === '#e11d48',
    'Linked gradient did not follow palette edit',
  );
  assert(
    getComputedStyle(document.querySelector('#bound-label [data-component-type="WebLabel"]')!)
      .color === 'rgb(225, 29, 72)',
    'Designer component did not follow palette edit',
  );
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = deserializeProject(document.querySelector('#project')!.textContent!);
    if (document.querySelector('#css-ready')!.textContent === JSON.stringify(current.styles)) break;
    await tick();
  }
  const preview = document.querySelector('[data-style-preview] [data-component-type="WebButton"]')!;
  assert(
    getComputedStyle(preview).backgroundImage.includes('225, 29, 72'),
    'Style preview did not follow palette edit',
  );
  const updated = deserializeProject(document.querySelector('#project')!.textContent!);
  assert(
    updated.pages[0]!.components.find((entry) => entry.id === 'palette-label')!.props.color ===
      paletteColorReference('aurora-blue'),
    'Palette edit discarded the component link',
  );
  await click('Predefined colors for Background gradient to color');
  document.body.dataset.evidence = encodeURIComponent(
    JSON.stringify({
      passed: true,
      colors: updated.settings.colorPalette.length,
      project: updated,
    }),
  );
}

flushSync(() =>
  createRoot(document.querySelector('#root')!, {
    onUncaughtError: (error) => {
      document.body.dataset.renderError = String(error);
    },
  }).render(<Harness />),
);
void smoke().catch((error: unknown) => {
  document.body.dataset.evidence = encodeURIComponent(
    JSON.stringify({ passed: false, error: String(error) }),
  );
});
