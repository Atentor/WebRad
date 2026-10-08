import { describe, expect, it } from 'vitest';
import {
  addReusableElement,
  createProject,
  createReusableElement,
  deserializeProject,
  findDefaultComponentStyle,
  paletteColorReference,
  projectColorPaletteCss,
  resolvePaletteColor,
  serializeProject,
  safeParseProject,
  updateComponentProps,
  updateComponentStyleState,
  updatePage,
  updateProjectSettings,
} from '../src/index.js';

const blue = paletteColorReference('aurora-blue');

function boundProject() {
  let project = createProject('PaletteBindings');
  const page = project.pages[0]!;
  project = updatePage(
    project,
    page.id,
    updateComponentProps(page, page.rootComponentId, {
      backgroundColor: blue,
      borderColor: '#2563eb',
    }),
  );
  let reusable = createReusableElement('ThemePanel');
  reusable = updateComponentProps(reusable, reusable.rootComponentId, { backgroundColor: blue });
  project = addReusableElement(project, reusable);
  const style = findDefaultComponentStyle(project.styles, 'WebButton')!;
  project = updateComponentStyleState(project, style.id, 'hover', {
    textGradient: { kind: 'linear', direction: 'to-right', from: blue, to: '#ffffff' },
  });
  return updateProjectSettings(project, {
    scrollbar: { ...project.settings.scrollbar, trackColor: blue },
  });
}

describe('linked project palette', () => {
  it('seeds ten Aurora colors and binds default solids, gradients and embedded grid controls', () => {
    const project = createProject('Aurora');
    expect(project.settings.colorPalette).toHaveLength(10);
    expect(new Set(project.settings.colorPalette.map((color) => color.id)).size).toBe(10);
    expect(
      findDefaultComponentStyle(project.styles, 'WebButton')?.states.base.backgroundGradient,
    ).toMatchObject({ from: blue, to: paletteColorReference('aurora-violet') });
    expect(findDefaultComponentStyle(project.styles, 'WebLabel')?.states.base.textColor).toBe(
      paletteColorReference('aurora-graphite'),
    );
    expect(
      findDefaultComponentStyle(project.styles, 'WebDataGrid')?.states.base
        .dataGridCheckboxAccentColor,
    ).toBe(blue);
  });

  it('retains links when entries change name, value or order without binding equal custom colors', () => {
    const original = boundProject();
    const colors = [...original.settings.colorPalette]
      .reverse()
      .map((entry) =>
        entry.id === 'aurora-blue' ? { ...entry, name: 'Rose', color: '#e11d48' } : entry,
      );
    const project = deserializeProject(
      serializeProject(updateProjectSettings(original, { colorPalette: colors })),
    );
    expect(project.pages[0]?.components[0]?.props).toMatchObject({
      backgroundColor: blue,
      borderColor: '#2563eb',
    });
    expect(project.reusableElements[0]?.components[0]?.props.backgroundColor).toBe(blue);
    expect(project.settings.scrollbar.trackColor).toBe(blue);
    expect(
      findDefaultComponentStyle(project.styles, 'WebButton')?.states.hover.textGradient,
    ).toMatchObject({ from: blue });
    expect(resolvePaletteColor(blue, project.settings.colorPalette)).toBe('#e11d48');
    expect(projectColorPaletteCss(project.settings.colorPalette)).toContain(
      '--wr-palette-aurora-blue: #e11d48;',
    );
    expect(resolvePaletteColor(blue, original.settings.colorPalette)).toBe('#2563eb');
  });

  it('detaches deleted identities at their last color across pages, reusables, states and scrollbars', () => {
    const original = boundProject();
    const changed = updateProjectSettings(original, {
      colorPalette: original.settings.colorPalette.map((entry) =>
        entry.id === 'aurora-blue' ? { ...entry, color: '#e11d48' } : entry,
      ),
    });
    const removed = updateProjectSettings(changed, {
      colorPalette: changed.settings.colorPalette.filter((entry) => entry.id !== 'aurora-blue'),
    });
    expect(removed.pages[0]?.components[0]?.props.backgroundColor).toBe('#e11d48');
    expect(removed.reusableElements[0]?.components[0]?.props.backgroundColor).toBe('#e11d48');
    expect(removed.settings.scrollbar.trackColor).toBe('#e11d48');
    expect(
      findDefaultComponentStyle(removed.styles, 'WebButton')?.states.base.backgroundGradient,
    ).toMatchObject({ from: '#e11d48' });
    expect(
      findDefaultComponentStyle(removed.styles, 'WebButton')?.states.hover.textGradient,
    ).toMatchObject({ from: '#e11d48' });
    expect(serializeProject(removed)).not.toContain(blue);
  });

  it('rejects missing identities in each project-owned color scope and unsafe variable names', () => {
    const project = boundProject();
    const missing = paletteColorReference('missing');
    const style = project.styles[0]!;
    for (const candidate of [
      {
        ...project,
        settings: {
          ...project.settings,
          scrollbar: { ...project.settings.scrollbar, trackColor: missing },
        },
      },
      {
        ...project,
        styles: [
          {
            ...style,
            states: { ...style.states, base: { ...style.states.base, textColor: missing } },
          },
          ...project.styles.slice(1),
        ],
      },
      {
        ...project,
        pages: project.pages.map((page) => ({
          ...page,
          components: page.components.map((node) => ({
            ...node,
            props: { ...node.props, backgroundColor: missing },
          })),
        })),
      },
      {
        ...project,
        reusableElements: project.reusableElements.map((page) => ({
          ...page,
          components: page.components.map((node) => ({
            ...node,
            props: { ...node.props, backgroundColor: missing },
          })),
        })),
      },
    ])
      expect(safeParseProject(candidate).success).toBe(false);
    expect(() => paletteColorReference('blue);color:red')).toThrow();
    expect(
      safeParseProject({ ...project, settings: { ...project.settings, colorPalette: ['#2563eb'] } })
        .success,
    ).toBe(false);
  });
});
