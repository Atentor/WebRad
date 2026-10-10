import { describe, expect, it } from 'vitest';

import {
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  COMPONENT_STYLE_PROPERTY_NAMES,
  DEFAULT_COMPONENT_LAYOUT,
  DEFAULT_PROJECT_SCROLLBAR_STYLE,
  FutureFormatVersionError,
  ModelUpdateError,
  ProjectValidationError,
  UnsupportedFormatVersionError,
  addComponent,
  addComponentStyle,
  addPage,
  addReusableElement,
  applyDefaultComponentStyle,
  assembleProject,
  bindComponentEvent,
  createDefaultComponentLayout,
  createComponentStyle,
  createPage,
  createProject,
  createReusableElement,
  createSequentialName,
  deserializePage,
  deserializeProject,
  deserializeProjectManifest,
  findDefaultComponentStyle,
  getPageNameError,
  isValidTypeScriptIdentifier,
  projectToManifest,
  removeComponent,
  removeComponentStyle,
  removeReusableElement,
  renameComponent,
  renamePage,
  safeDeserializeProject,
  safeParseComponentStyle,
  safeParsePage,
  safeParseProject,
  serializePage,
  setComponentStyle,
  serializeProject,
  serializeProjectManifest,
  updateComponentBounds,
  updateComponentProps,
  updateComponentStyle,
  updateComponentStyleState,
  updatePage,
  updateProjectSettings,
  validateComponentName,
  type ComponentNode,
  type ComponentStyleModel,
  type IdFactory,
} from '../src/index.js';

function idSequence(...values: readonly string[]): IdFactory {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error('Test ID sequence exhausted.');
    index += 1;
    return value;
  };
}

function component(
  id: string,
  type: string,
  name: string,
  parentId: string | null,
  props: Readonly<Record<string, unknown>> = {},
): ComponentNode {
  return {
    id,
    type,
    name,
    parentId,
    layout: createDefaultComponentLayout(),
    bounds: { x: 8, y: 8, width: 100, height: 32 },
    props,
    events: { OnClick: null },
    children: [],
  };
}

describe('project factories', () => {
  it('persists stable palette identities and rejects the obsolete string-array format', () => {
    const original = createProject('Palette');
    expect(original.settings.colorPalette).toHaveLength(10);
    const colors = Array.from({ length: 10 }, (_, index) => ({
      id: `color-${index}`,
      name: `Color ${index}`,
      color: `#${index.toString(16).padStart(6, '0')}`,
    }));
    const updated = updateProjectSettings(original, { colorPalette: colors });
    expect(original.settings.colorPalette).toHaveLength(10);
    expect(deserializeProject(serializeProject(updated)).settings.colorPalette).toEqual(colors);
    const manifest = deserializeProjectManifest(
      serializeProjectManifest(projectToManifest(updated)),
    );
    expect(assembleProject(manifest, updated.pages).settings.colorPalette).toEqual(colors);
    for (const colorPalette of [
      [...colors, '#ffffff'],
      ['red'],
      ['#123'],
      ['#gg0000'],
      [17],
      null,
      [{ id: 'test', name: 'Color', color: '#123' }],
      [{ id: 'test', name: '', color: '#ffffff' }],
      [colors[0], colors[0]],
    ]) {
      expect(
        safeParseProject({ ...updated, settings: { ...updated.settings, colorPalette } }).success,
      ).toBe(false);
    }
  });

  it('creates a complete aggregate with an entry page and WebPage root', () => {
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'page-id', 'root-id'),
    });

    expect(project).toMatchObject({
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      id: 'project-id',
      name: 'CustomerApp',
      entryPage: 'page-id',
      settings: {
        applicationName: 'CustomerApp',
        applicationDescription: '',
        locale: 'pt-BR',
        timeZone: 'America/Sao_Paulo',
        seo: {
          canonicalUrl: '',
          keywords: '',
          allowIndexing: true,
          socialTitle: '',
          socialDescription: '',
          socialImage: null,
        },
        environment: 'development',
        environmentVariables: [],
        gridSize: 8,
        snapToGrid: true,
        showGrid: true,
        outputDirectory: 'dist',
      },
    });
    expect(project.settings.scrollbar).toEqual(DEFAULT_PROJECT_SCROLLBAR_STYLE);
    expect(project.pages).toHaveLength(1);
    expect(project.styles).toHaveLength(12);
    expect(project.styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ componentType: 'WebPage', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebPanel', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebPopup', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebLabel', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebEdit', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebTextArea', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebButton', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebCheckBox', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebComboBox', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebImage', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebListBox', preset: 'default' }),
        expect.objectContaining({ componentType: 'WebDataGrid', preset: 'default' }),
      ]),
    );
    expect(project.pages[0]).toMatchObject({
      formatVersion: CURRENT_PAGE_FORMAT_VERSION,
      id: 'page-id',
      name: 'PageMain',
      rootComponentId: 'root-id',
    });
    expect(project.pages[0]?.components[0]).toMatchObject({
      id: 'root-id',
      type: 'WebPage',
      name: 'PageMain',
      parentId: null,
      layout: {
        container: { mode: 'fixed' },
        item: { width: 'fixed', height: 'fixed' },
      },
    });
    expect(project.pages[0]?.components[0]?.styleId).toBe(
      findDefaultComponentStyle(project.styles, 'WebPage')?.id,
    );
    expect(findDefaultComponentStyle(project.styles, 'WebDataGrid')?.states.base).toMatchObject({
      dataGridHeaderBackgroundColor: '#e0e7ff',
      dataGridHeaderTextColor: '#1e3a8a',
      dataGridFooterBackgroundColor: '#f8fafc',
      dataGridFooterTextColor: 'var(--wr-palette-aurora-graphite)',
      dataGridButtonContentMode: 'text-icon',
      dataGridButtonIconPosition: 'left',
      dataGridButtonIconSize: { value: 16, unit: 'px' },
      dataGridButtonIconColor: 'current',
      dataGridButtonBackgroundColor: '#e0e7ff',
      dataGridButtonTextColor: '#1e3a8a',
      dataGridButtonBorderColor: '#c7d2fe',
      dataGridButtonBorderWidth: { value: 1, unit: 'px' },
      dataGridButtonBorderStyle: 'solid',
      dataGridButtonBorderRadius: { value: 6, unit: 'px' },
      dataGridButtonPaddingX: { value: 8, unit: 'px' },
      dataGridButtonPaddingY: { value: 4, unit: 'px' },
      dataGridButtonFontWeight: 'semibold',
      dataGridCheckboxAccentColor: 'var(--wr-palette-aurora-blue)',
      dataGridCheckboxSize: { value: 16, unit: 'px' },
      dataGridCheckboxTextColor: 'var(--wr-palette-aurora-graphite)',
      dataGridCheckboxFontWeight: 'medium',
      dataGridCheckboxGap: { value: 6, unit: 'px' },
    });
    expect(findDefaultComponentStyle(project.styles, 'WebPopup')?.states.base).toMatchObject({
      borderRadius: { value: 6, unit: 'px' },
      boxShadow: 'md',
      textColor: 'var(--wr-palette-aurora-ink)',
    });
    const defaultCheckBox = findDefaultComponentStyle(project.styles, 'WebCheckBox');
    expect(defaultCheckBox).toBeDefined();
    if (defaultCheckBox !== undefined) {
      expect(defaultCheckBox.states.base).not.toHaveProperty('backgroundColor');
      expect(defaultCheckBox.states.base).not.toHaveProperty('backgroundGradient');
      expect(defaultCheckBox.states.base).not.toHaveProperty('borderWidth');
      expect(defaultCheckBox.states.base).not.toHaveProperty('borderStyle');
      expect(defaultCheckBox.states.base).not.toHaveProperty('borderColor');
      expect(defaultCheckBox.states.base).not.toHaveProperty('borderGradient');
    }
  });

  it('binds every newly added page root to the default WebPage style', () => {
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'page-id', 'root-id'),
    });
    const page = createPage('PageSettings', idSequence('settings-page-id', 'settings-root-id'));
    const updated = addPage(project, page);

    expect(updated.pages[1]?.components[0]?.styleId).toBe(
      findDefaultComponentStyle(updated.styles, 'WebPage')?.id,
    );
  });

  it('normalizes retired Popup caption and message properties from version 2 documents', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const root = page.components[0];
    if (root === undefined) throw new Error('Expected a page root.');
    const legacyPopup = component('popup-id', 'WebPopup', 'Popup1', root.id, {
      caption: 'Legacy title',
      message: 'Legacy message',
      modal: true,
      visible: false,
      collapseWhenHidden: true,
      enabled: true,
    });
    const legacyDocument = {
      ...page,
      components: [{ ...root, children: [legacyPopup.id] }, legacyPopup],
    };

    const restored = deserializePage(JSON.stringify(legacyDocument));
    const popup = restored.components.find((node) => node.id === legacyPopup.id);
    expect(popup?.props).toEqual({
      modal: true,
      visible: false,
      collapseWhenHidden: true,
      enabled: true,
    });

    const persisted = deserializePage(serializePage(restored));
    const persistedPopup = persisted.components.find((node) => node.id === legacyPopup.id);
    expect(persistedPopup?.props).not.toHaveProperty('caption');
    expect(persistedPopup?.props).not.toHaveProperty('message');
  });

  it('restores the protected Default Popup style for older v2 libraries without restyling nodes', () => {
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'page-id', 'root-id'),
    });
    const legacy = JSON.parse(serializeProject(project)) as {
      styles: ComponentStyleModel[];
      pages: {
        rootComponentId: string;
        components: ComponentNode[];
      }[];
    };
    const page = legacy.pages[0];
    if (page === undefined) throw new Error('Expected a legacy page.');
    const popup = component('popup-id', 'WebPopup', 'Popup1', page.rootComponentId, {
      modal: true,
      visible: false,
      collapseWhenHidden: true,
      enabled: true,
    });
    const userPopupStyle = createComponentStyle('Default Popup', 'WebPopup', {
      idFactory: () => 'project-id:default-style:WebPopup',
      states: { base: { backgroundColor: '#334155' } },
    });
    legacy.styles = legacy.styles.filter(
      (style) => !(style.componentType === 'WebPopup' && style.preset === 'default'),
    );
    legacy.styles.push(userPopupStyle);
    page.components = [
      ...page.components.map((node) =>
        node.id === page.rootComponentId
          ? { ...node, children: [...node.children, popup.id] }
          : node,
      ),
      popup,
    ];

    const restored = deserializeProject(JSON.stringify(legacy));
    const defaultPopupStyle = findDefaultComponentStyle(restored.styles, 'WebPopup');
    const panelIndex = restored.styles.findIndex(
      (style) => style.componentType === 'WebPanel' && style.preset === 'default',
    );
    const popupIndex = restored.styles.findIndex((style) => style.id === defaultPopupStyle?.id);

    expect(defaultPopupStyle).toMatchObject({
      id: 'project-id:default-style:WebPopup-2',
      name: 'Default Popup 2',
      componentType: 'WebPopup',
      preset: 'default',
      states: {
        base: {
          borderRadius: { value: 6, unit: 'px' },
          boxShadow: 'md',
          textColor: '#0f172a',
        },
      },
    });
    expect(popupIndex).toBe(panelIndex + 1);
    expect(restored.styles.find((style) => style.id === userPopupStyle.id)).toEqual(userPopupStyle);
    expect(
      restored.pages[0]?.components.find((node) => node.id === popup.id)?.styleId,
    ).toBeUndefined();
    expect(
      applyDefaultComponentStyle(
        component('new-popup-id', 'WebPopup', 'Popup2', page.rootComponentId),
        restored.styles,
      ).styleId,
    ).toBe(defaultPopupStyle?.id);
    expect(deserializeProject(serializeProject(restored))).toEqual(restored);
  });

  it('persists general settings and materializes defaults for existing v2 projects', () => {
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'page-id', 'root-id'),
    });
    const updated = updateProjectSettings(project, {
      applicationName: 'Customer Portal',
      applicationDescription: 'Customer self-service area.',
      locale: 'en-US',
      timeZone: 'America/New_York',
      applicationIcon: {
        fileName: 'customer.svg',
        mediaType: 'image/svg+xml',
        dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      },
      seo: {
        canonicalUrl: 'https://portal.example.test',
        keywords: 'customers, support',
        allowIndexing: false,
        socialTitle: 'Customer Portal',
        socialDescription: 'Self-service for customers.',
        socialImage: {
          fileName: 'portal-share.png',
          mediaType: 'image/png',
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9NwAAAABJRU5ErkJggg==',
        },
      },
      environment: 'production',
      environmentVariables: [
        {
          name: 'API_BASE_URL',
          values: {
            development: 'http://localhost:3000',
            production: 'https://api.example.test',
          },
        },
      ],
      scrollbar: {
        ...project.settings.scrollbar,
        width: 14,
        height: 12,
        trackColor: '#eef2ff',
        thumbColor: '#818cf8',
        thumbHoverColor: '#6366f1',
        thumbActiveColor: '#4f46e5',
      },
    });

    expect(updated.settings).toMatchObject({
      applicationName: 'Customer Portal',
      applicationDescription: 'Customer self-service area.',
      locale: 'en-US',
      timeZone: 'America/New_York',
      applicationIcon: expect.objectContaining({ fileName: 'customer.svg' }),
      seo: expect.objectContaining({
        canonicalUrl: 'https://portal.example.test',
        allowIndexing: false,
        socialImage: expect.objectContaining({ fileName: 'portal-share.png' }),
      }),
      environment: 'production',
      environmentVariables: [expect.objectContaining({ name: 'API_BASE_URL' })],
      scrollbar: {
        width: 14,
        height: 12,
        trackColor: '#eef2ff',
        thumbColor: '#818cf8',
        thumbHoverColor: '#6366f1',
        thumbActiveColor: '#4f46e5',
      },
    });
    expect(deserializeProject(serializeProject(updated)).settings.scrollbar).toEqual(
      updated.settings.scrollbar,
    );

    const legacy = JSON.parse(serializeProject(project)) as {
      readonly settings: Record<string, unknown>;
    };
    delete legacy.settings.applicationName;
    delete legacy.settings.applicationDescription;
    delete legacy.settings.locale;
    delete legacy.settings.timeZone;
    delete legacy.settings.applicationIcon;
    delete legacy.settings.seo;
    delete legacy.settings.environment;
    delete legacy.settings.environmentVariables;
    delete legacy.settings.scrollbar;
    const restored = deserializeProject(JSON.stringify(legacy));

    expect(restored.settings).toMatchObject({
      applicationName: 'CustomerApp',
      applicationDescription: '',
      locale: 'pt-BR',
      timeZone: 'America/Sao_Paulo',
      applicationIcon: null,
      seo: {
        canonicalUrl: '',
        keywords: '',
        allowIndexing: true,
        socialTitle: '',
        socialDescription: '',
        socialImage: null,
      },
      environment: 'development',
      environmentVariables: [],
      scrollbar: DEFAULT_PROJECT_SCROLLBAR_STYLE,
    });

    const partialScrollbarProject = JSON.parse(serializeProject(project)) as {
      readonly settings: Record<string, unknown>;
    };
    partialScrollbarProject.settings.scrollbar = { thumbColor: '#3b82f6', thumbBorderWidth: 3 };
    expect(deserializeProject(JSON.stringify(partialScrollbarProject)).settings.scrollbar).toEqual({
      ...DEFAULT_PROJECT_SCROLLBAR_STYLE,
      thumbColor: '#3b82f6',
      thumbBorderWidth: 3,
    });

    const invalidScrollbar = safeParseProject({
      ...updated,
      settings: {
        ...updated.settings,
        scrollbar: {
          ...updated.settings.scrollbar,
          width: 5,
          thumbColor: 'blue',
        },
      },
    });
    expect(invalidScrollbar.success).toBe(false);
    if (!invalidScrollbar.success) {
      expect(invalidScrollbar.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['settings', 'scrollbar', 'width'] }),
          expect.objectContaining({ path: ['settings', 'scrollbar', 'thumbColor'] }),
        ]),
      );
    }

    const urlBasedSeoProject = JSON.parse(serializeProject(updated)) as {
      readonly settings: { readonly seo: Record<string, unknown> };
    };
    delete urlBasedSeoProject.settings.seo.socialImage;
    urlBasedSeoProject.settings.seo.socialImageUrl = 'https://cdn.example.test/legacy-share.png';
    expect(
      deserializeProject(JSON.stringify(urlBasedSeoProject)).settings.seo.socialImage,
    ).toBeNull();

    const stagingProject = JSON.parse(serializeProject(updated)) as {
      readonly settings: Record<string, unknown>;
    };
    stagingProject.settings.environment = 'staging';
    stagingProject.settings.environmentVariables = [
      {
        name: 'API_BASE_URL',
        values: {
          development: 'http://localhost:3000',
          staging: 'https://staging.example.test',
          production: 'https://api.example.test',
        },
      },
    ];

    expect(deserializeProject(JSON.stringify(stagingProject)).settings).toMatchObject({
      environment: 'production',
      environmentVariables: [
        {
          name: 'API_BASE_URL',
          values: {
            development: 'http://localhost:3000',
            production: 'https://staging.example.test',
          },
        },
      ],
    });
  });

  it('uses crypto UUIDs by default', () => {
    const page = createPage('PageMain');
    expect(page.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(page.rootComponentId).not.toBe(page.id);
  });

  it('materializes an independent fixed responsive-layout contract for each component', () => {
    const first = createDefaultComponentLayout();
    const second = createDefaultComponentLayout();
    const project = createProject('CustomerApp', {
      idFactory: idSequence('project-id', 'page-id', 'root-id'),
    });

    expect(first).toEqual(DEFAULT_COMPONENT_LAYOUT);
    expect(second).toEqual(DEFAULT_COMPONENT_LAYOUT);
    expect(first).not.toBe(second);
    expect(first.container).not.toBe(second.container);
    expect(first.item).not.toBe(second.item);
    expect(project.pages[0]?.components[0]?.layout).toEqual(DEFAULT_COMPONENT_LAYOUT);
  });

  it('persists per-item alignment, validates it and restores auto for documents without it', () => {
    const page = createPage('AlignmentPage');
    const button = component(
      'alignment-button',
      'WebButton',
      'AlignedButton',
      page.rootComponentId,
    );
    const saved = addComponent(
      page,
      {
        ...button,
        layout: { ...button.layout, item: { ...button.layout.item, alignSelf: 'end' } },
      },
      page.rootComponentId,
    );
    expect(
      deserializePage(serializePage(saved)).components.find((node) => node.id === button.id)?.layout
        .item.alignSelf,
    ).toBe('end');
    const legacy = {
      ...saved,
      components: saved.components.map((node) => {
        const item = { ...node.layout.item };
        delete item.alignSelf;
        return { ...node, layout: { ...node.layout, item } };
      }),
    };
    expect(
      deserializePage(JSON.stringify(legacy)).components.every(
        (node) => node.layout.item.alignSelf === 'auto',
      ),
    ).toBe(true);
    expect(
      safeParsePage({
        ...saved,
        components: saved.components.map((node) => ({
          ...node,
          layout: { ...node.layout, item: { ...node.layout.item, alignSelf: 'middle' } },
        })),
      }).success,
    ).toBe(false);
  });

  it('allows portable display names for projects while page names remain identifiers', () => {
    const project = createProject('Customer App', idSequence('project-id', 'page-id', 'root-id'));
    expect(project.name).toBe('Customer App');
    expect(() =>
      createProject('../CustomerApp', idSequence('project-id', 'page-id', 'root-id')),
    ).toThrow('portable');
    expect(() => createPage('Customer Page')).toThrow('TypeScript identifier');
    expect(getPageNameError('CON')).toContain('reserved Windows device');
    expect(() => createPage('CON')).toThrow(ProjectValidationError);
  });

  it('creates reusable styles with five structured visual states', () => {
    const style = createComponentStyle('Primary Button', 'WebButton', {
      idFactory: idSequence('style-id'),
      states: {
        base: { borderRadius: 'lg', backgroundColor: '#2563eb' },
        hover: { backgroundColor: '#1d4ed8' },
      },
    });

    expect(style).toEqual({
      id: 'style-id',
      name: 'Primary Button',
      componentType: 'WebButton',
      states: {
        base: { borderRadius: 'lg', backgroundColor: '#2563eb' },
        hover: { backgroundColor: '#1d4ed8' },
        focus: {},
        active: {},
        disabled: {},
      },
    });
  });

  it('accepts only safe structured two-color linear background gradients', () => {
    const valid = createComponentStyle('Gradient Button', 'WebButton', {
      idFactory: idSequence('style-gradient'),
      states: {
        base: {
          backgroundGradient: {
            kind: 'linear',
            direction: 'to-bottom-right',
            from: '#2563eb',
            to: '#7c3aed',
          },
        },
      },
    });

    expect(safeParseComponentStyle(valid).success).toBe(true);
    for (const backgroundGradient of [
      {
        kind: 'radial',
        direction: 'to-right',
        from: '#2563eb',
        to: '#7c3aed',
      },
      {
        kind: 'linear',
        direction: 'to-center',
        from: '#2563eb',
        to: '#7c3aed',
      },
      {
        kind: 'linear',
        direction: 'to-right',
        from: 'rgb(37, 99, 235)',
        to: '#7c3aed',
      },
      {
        kind: 'linear',
        direction: 'to-right',
        from: '#2563eb',
        to: '#7c3aed',
        css: 'url(https://example.invalid)',
      },
    ]) {
      expect(
        safeParseComponentStyle({
          ...valid,
          states: { ...valid.states, base: { backgroundGradient } },
        }).success,
      ).toBe(false);
    }
  });

  it('keeps color and gradient properties mutually exclusive per state', () => {
    const valid = createComponentStyle('Exclusive Background', 'WebButton', {
      idFactory: idSequence('style-exclusive-background'),
      states: {
        base: { backgroundColor: '#2563eb' },
      },
    });

    const gradient = {
      kind: 'linear',
      direction: 'to-right',
      from: '#2563eb',
      to: '#7c3aed',
    } as const;
    for (const base of [
      { textColor: '#2563eb', textGradient: gradient },
      { backgroundColor: '#2563eb', backgroundGradient: gradient },
      { borderColor: '#2563eb', borderGradient: gradient },
    ]) {
      expect(
        safeParseComponentStyle({
          ...valid,
          states: { ...valid.states, base },
        }).success,
      ).toBe(false);
    }
  });

  it('keeps the semantic button presentation on the base style state', () => {
    const valid = createComponentStyle('Icon Button', 'WebButton', {
      idFactory: idSequence('style-icon-button'),
      states: {
        base: {
          buttonContentMode: 'text-icon',
          buttonIconPosition: 'right',
          buttonIconSize: { value: 24, unit: 'px' },
          buttonIconColor: '#f59e0b',
        },
        hover: {
          buttonIconSize: { value: 20, unit: 'px' },
          buttonIconColor: '#38bdf8',
        },
      },
    });
    expect(safeParseComponentStyle(valid).success).toBe(true);
    expect(
      safeParseComponentStyle({
        ...valid,
        states: { ...valid.states, hover: { buttonContentMode: 'icon' } },
      }).success,
    ).toBe(false);
    expect(
      safeParseComponentStyle({
        ...valid,
        componentType: 'WebLabel',
        states: { ...valid.states, base: { buttonIconSize: { value: 24, unit: 'px' } } },
      }).success,
    ).toBe(false);
  });

  it('publishes Data Grid-only line, header, and footer visual properties on the base state', () => {
    const dataGridDefinitions = COMPONENT_STYLE_PROPERTY_DEFINITIONS.filter((definition) =>
      definition.name.startsWith('dataGrid'),
    );
    expect(dataGridDefinitions.map(({ name, category }) => ({ name, category }))).toEqual([
      { name: 'dataGridHorizontalLineVisibility', category: 'Data Grid Lines' },
      { name: 'dataGridHorizontalLineColor', category: 'Data Grid Lines' },
      { name: 'dataGridHorizontalLineWidth', category: 'Data Grid Lines' },
      { name: 'dataGridHorizontalLineStyle', category: 'Data Grid Lines' },
      { name: 'dataGridVerticalLineVisibility', category: 'Data Grid Lines' },
      { name: 'dataGridVerticalLineColor', category: 'Data Grid Lines' },
      { name: 'dataGridVerticalLineWidth', category: 'Data Grid Lines' },
      { name: 'dataGridVerticalLineStyle', category: 'Data Grid Lines' },
      { name: 'dataGridHeaderBackgroundColor', category: 'Data Grid Header' },
      { name: 'dataGridHeaderTextColor', category: 'Data Grid Header' },
      { name: 'dataGridHeaderBorderColor', category: 'Data Grid Header' },
      { name: 'dataGridHeaderBorderWidth', category: 'Data Grid Header' },
      { name: 'dataGridHeaderBorderStyle', category: 'Data Grid Header' },
      { name: 'dataGridHeaderHeight', category: 'Data Grid Header' },
      { name: 'dataGridHeaderPaddingX', category: 'Data Grid Header' },
      { name: 'dataGridHeaderPaddingY', category: 'Data Grid Header' },
      { name: 'dataGridHeaderFontWeight', category: 'Data Grid Header' },
      { name: 'dataGridFooterBackgroundColor', category: 'Data Grid Footer' },
      { name: 'dataGridFooterTextColor', category: 'Data Grid Footer' },
      { name: 'dataGridFooterBorderColor', category: 'Data Grid Footer' },
      { name: 'dataGridFooterBorderWidth', category: 'Data Grid Footer' },
      { name: 'dataGridFooterBorderStyle', category: 'Data Grid Footer' },
      { name: 'dataGridFooterHeight', category: 'Data Grid Footer' },
      { name: 'dataGridFooterPaddingX', category: 'Data Grid Footer' },
      { name: 'dataGridFooterPaddingY', category: 'Data Grid Footer' },
      { name: 'dataGridFooterFontWeight', category: 'Data Grid Footer' },
      { name: 'dataGridButtonContentMode', category: 'Data Grid Button' },
      { name: 'dataGridButtonIconPosition', category: 'Data Grid Button' },
      { name: 'dataGridButtonIconSize', category: 'Data Grid Button' },
      { name: 'dataGridButtonIconColor', category: 'Data Grid Button' },
      { name: 'dataGridButtonBackgroundColor', category: 'Data Grid Button' },
      { name: 'dataGridButtonTextColor', category: 'Data Grid Button' },
      { name: 'dataGridButtonBorderColor', category: 'Data Grid Button' },
      { name: 'dataGridButtonBorderWidth', category: 'Data Grid Button' },
      { name: 'dataGridButtonBorderStyle', category: 'Data Grid Button' },
      { name: 'dataGridButtonBorderRadius', category: 'Data Grid Button' },
      { name: 'dataGridButtonPaddingX', category: 'Data Grid Button' },
      { name: 'dataGridButtonPaddingY', category: 'Data Grid Button' },
      { name: 'dataGridButtonFontWeight', category: 'Data Grid Button' },
      { name: 'dataGridCheckboxAccentColor', category: 'Data Grid Checkbox' },
      { name: 'dataGridCheckboxSize', category: 'Data Grid Checkbox' },
      { name: 'dataGridCheckboxTextColor', category: 'Data Grid Checkbox' },
      { name: 'dataGridCheckboxFontWeight', category: 'Data Grid Checkbox' },
      { name: 'dataGridCheckboxGap', category: 'Data Grid Checkbox' },
    ]);
    expect(
      dataGridDefinitions.every(
        (definition) =>
          definition.componentTypes?.length === 1 &&
          definition.componentTypes[0] === 'WebDataGrid' &&
          definition.stateNames?.length === 1 &&
          definition.stateNames[0] === 'base',
      ),
    ).toBe(true);

    const valid = createComponentStyle('Grid Appearance', 'WebDataGrid', {
      idFactory: idSequence('style-grid-appearance'),
      states: {
        base: {
          dataGridHorizontalLineVisibility: 'show',
          dataGridHorizontalLineColor: '#0ea5e9',
          dataGridHorizontalLineWidth: { value: 2, unit: 'px' },
          dataGridHorizontalLineStyle: 'dashed',
          dataGridVerticalLineVisibility: 'hide',
          dataGridVerticalLineColor: '#a855f7',
          dataGridVerticalLineWidth: { value: 1, unit: 'rem' },
          dataGridVerticalLineStyle: 'dotted',
          dataGridHeaderBackgroundColor: '#e2e8f0',
          dataGridHeaderTextColor: '#0f172a',
          dataGridHeaderBorderColor: '#cbd5e1',
          dataGridHeaderBorderWidth: { value: 2, unit: 'px' },
          dataGridHeaderBorderStyle: 'solid',
          dataGridHeaderHeight: { value: 44, unit: 'px' },
          dataGridHeaderPaddingX: { value: 12, unit: 'px' },
          dataGridHeaderPaddingY: { value: 6, unit: 'px' },
          dataGridHeaderFontWeight: 'bold',
          dataGridFooterBackgroundColor: '#f1f5f9',
          dataGridFooterTextColor: '#0f172a',
          dataGridFooterBorderColor: '#cbd5e1',
          dataGridFooterBorderWidth: { value: 1, unit: 'px' },
          dataGridFooterBorderStyle: 'double',
          dataGridFooterHeight: 'auto',
          dataGridFooterPaddingX: { value: 14, unit: 'px' },
          dataGridFooterPaddingY: { value: 7, unit: 'px' },
          dataGridFooterFontWeight: 'medium',
          dataGridButtonContentMode: 'text-icon',
          dataGridButtonIconPosition: 'right',
          dataGridButtonIconSize: { value: 20, unit: 'px' },
          dataGridButtonIconColor: '#f59e0b',
          dataGridButtonBackgroundColor: '#dbeafe',
          dataGridButtonTextColor: '#1e3a8a',
          dataGridButtonBorderColor: '#93c5fd',
          dataGridButtonBorderWidth: { value: 1, unit: 'px' },
          dataGridButtonBorderStyle: 'solid',
          dataGridButtonBorderRadius: { value: 8, unit: 'px' },
          dataGridButtonPaddingX: { value: 10, unit: 'px' },
          dataGridButtonPaddingY: { value: 5, unit: 'px' },
          dataGridButtonFontWeight: 'semibold',
          dataGridCheckboxAccentColor: '#2563eb',
          dataGridCheckboxSize: { value: 18, unit: 'px' },
          dataGridCheckboxTextColor: '#334155',
          dataGridCheckboxFontWeight: 'medium',
          dataGridCheckboxGap: { value: 7, unit: 'px' },
        },
      },
    });
    expect(safeParseComponentStyle(valid).success).toBe(true);
    expect(safeParseComponentStyle({ ...valid, componentType: 'WebButton' }).success).toBe(false);
    expect(
      safeParseComponentStyle({
        ...valid,
        states: { ...valid.states, hover: { dataGridHeaderTextColor: '#0f172a' } },
      }).success,
    ).toBe(false);
  });

  it('publishes one valid and useful editor default for every style property', () => {
    expect(COMPONENT_STYLE_PROPERTY_DEFINITIONS.map(({ name }) => name)).toEqual(
      COMPONENT_STYLE_PROPERTY_NAMES,
    );
    for (const definition of COMPONENT_STYLE_PROPERTY_DEFINITIONS) {
      expect(definition.description.length, definition.name).toBeGreaterThan(0);
      const result = safeParseComponentStyle({
        id: `style-${definition.name}`,
        name: `Style ${definition.label}`,
        componentType: definition.componentTypes?.[0] ?? 'WebButton',
        states: {
          base: { [definition.name]: definition.defaultValue },
          hover: {},
          focus: {},
          active: {},
          disabled: {},
        },
      });
      expect(result.success, definition.name).toBe(true);
    }
  });
});

describe('name validation', () => {
  it('accepts TypeScript identifiers and rejects reserved or malformed names', () => {
    expect(isValidTypeScriptIdentifier('BTNMostrar')).toBe(true);
    expect(isValidTypeScriptIdentifier('ação')).toBe(true);
    expect(isValidTypeScriptIdentifier('2Buttons')).toBe(false);
    expect(isValidTypeScriptIdentifier('two-buttons')).toBe(false);
    expect(isValidTypeScriptIdentifier('class')).toBe(false);
  });

  it('generates the first available sequential name and validates uniqueness', () => {
    expect(createSequentialName('Button', ['Button1', 'Button2', 'Button4'])).toBe('Button3');
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const withButton = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId),
    );

    expect(validateComponentName('Button1', withButton).valid).toBe(false);
    expect(validateComponentName('Button1', withButton, 'button-id').valid).toBe(true);
    expect(() => renameComponent(withButton, 'button-id', 'PageMain')).toThrow(ModelUpdateError);
    expect(validateComponentName('show', withButton, 'button-id')).toMatchObject({
      valid: false,
      reason: expect.stringContaining('runtime API'),
    });
    expect(() => renameComponent(withButton, 'button-id', 'show')).toThrow('runtime API');
    for (const inheritedMember of [
      'backgroundColor',
      'borderColor',
      'caption',
      'collapseWhenHidden',
      'color',
      'height',
      'layoutMode',
      'margin',
      'alignSelf',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'pageName',
      'tabIndex',
      'width',
      'x',
      'y',
    ]) {
      expect(validateComponentName(inheritedMember, withButton, 'button-id')).toMatchObject({
        valid: false,
        reason: expect.stringContaining('runtime API'),
      });
    }

    const collidingDocument = {
      ...withButton,
      components: withButton.components.map((node) =>
        node.id === 'button-id' ? { ...node, name: 'element' } : node,
      ),
    };
    const collisionResult = safeParsePage(collidingDocument);
    expect(collisionResult.success).toBe(false);
    if (!collisionResult.success) {
      expect(
        collisionResult.error.issues.some((issue) => issue.message.includes('runtime API')),
      ).toBe(true);
    }
  });
});

describe('zod validation', () => {
  it('requires complete valid responsive layout data on every component', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const root = page.components[0];
    expect(root).toBeDefined();
    if (root === undefined) return;

    const missingLayout = { ...root } as Record<string, unknown>;
    delete missingLayout.layout;
    expect(safeParsePage({ ...page, components: [missingLayout] }).success).toBe(false);

    const invalidMaximum = {
      ...page,
      components: [
        {
          ...root,
          layout: {
            ...root.layout,
            item: { ...root.layout.item, minWidth: 100, maxWidth: 99 },
          },
        },
      ],
    };
    expect(safeParsePage(invalidMaximum).success).toBe(false);
  });

  it('detects duplicate names and broken parent/child links without throwing', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const invalid = {
      ...page,
      components: [
        ...page.components,
        component('button-a', 'WebButton', 'Duplicate', page.rootComponentId),
        component('button-b', 'WebButton', 'Duplicate', 'missing-parent'),
      ],
    };
    const result = safeParsePage(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('unique'))).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes('Unknown parent'))).toBe(
        true,
      );
    }
  });

  it('rejects components that are disconnected from the page root', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const orphan = component('orphan-id', 'WebButton', 'OrphanButton', null);
    const result = safeParsePage({ ...page, components: [...page.components, orphan] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('reachable'))).toBe(true);
    }
  });

  it('rejects non-JSON props, unknown fields, and invalid entry pages', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const root = project.pages[0]?.components[0];
    expect(root).toBeDefined();
    const invalidProps = {
      ...project,
      pages: [
        {
          ...project.pages[0],
          components: [{ ...root, props: { callback: () => undefined } }],
        },
      ],
      extra: true,
    };
    expect(safeParseProject(invalidProps).success).toBe(false);
    expect(safeParseProject({ ...project, entryPage: 'missing' }).success).toBe(false);
  });

  it('rejects page names that collide on case-insensitive portable filesystems', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const collidingPage = createPage('pagemain', idSequence('other-page', 'other-root'));
    const result = safeParseProject({ ...project, pages: [...project.pages, collidingPage] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('portable'))).toBe(true);
    }
  });

  it('throws a useful validation error from strict parsers', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    expect(() => serializeProject({ ...project, entryPage: 'missing' })).toThrow(
      ProjectValidationError,
    );
  });

  it('accepts style references in isolated pages and validates them in the aggregate', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const referencedPage = addComponent(page, {
      ...component('button-id', 'WebButton', 'Button1', page.rootComponentId),
      styleId: 'style-id',
    });

    expect(safeParsePage(referencedPage).success).toBe(true);
    const unknownStyle = safeParseProject({ ...project, pages: [referencedPage] });
    expect(unknownStyle.success).toBe(false);
    if (!unknownStyle.success) {
      expect(
        unknownStyle.error.issues.some((issue) =>
          issue.message.includes('Unknown component style'),
        ),
      ).toBe(true);
    }

    const incompatibleStyle = createComponentStyle('Label Style', 'WebLabel', {
      idFactory: idSequence('style-id'),
    });
    const incompatible = safeParseProject({
      ...project,
      pages: [referencedPage],
      styles: [incompatibleStyle],
    });
    expect(incompatible.success).toBe(false);
    if (!incompatible.success) {
      expect(
        incompatible.error.issues.some((issue) => issue.message.includes('not WebButton')),
      ).toBe(true);
    }
  });

  it('rejects duplicate style IDs and case-insensitive names', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const first = createComponentStyle('Primary', 'WebButton', idSequence('style-id'));
    const duplicateId = createComponentStyle('Secondary', 'WebButton', idSequence('style-id'));
    const duplicateName = createComponentStyle('primary', 'WebLabel', idSequence('other-style'));
    const result = safeParseProject({
      ...project,
      styles: [first, duplicateId, duplicateName],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('Duplicate component style ID')),
      ).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes('must be unique'))).toBe(
        true,
      );
    }
  });

  it('allows one protected default style per component type', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const existing = findDefaultComponentStyle(project.styles, 'WebButton');
    expect(existing).toBeDefined();
    if (existing === undefined) return;

    const duplicate = safeParseProject({
      ...project,
      styles: [
        ...project.styles,
        {
          ...existing,
          id: 'another-default-button-style',
          name: 'Another Default Button',
        },
      ],
    });

    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues.some((issue) => issue.message.includes('already exists'))).toBe(
        true,
      );
    }
  });

  it('rejects unsafe, out-of-range, inapplicable, and legacy style values', () => {
    const valid = createComponentStyle('Primary', 'WebButton', idSequence('style-id'));
    const invalidValues = [
      { backgroundColor: 'rgb(1, 2, 3)' },
      { opacity: 101 },
      { paddingLeft: { value: -1, unit: 'px' } },
      { marginLeft: { value: 1_000_001, unit: 'px' } },
      { objectFit: 'cover' },
    ];

    for (const base of invalidValues) {
      expect(
        safeParseComponentStyle({
          ...valid,
          states: { ...valid.states, base },
        }).success,
      ).toBe(false);
    }
    expect(
      safeParseComponentStyle({
        id: 'legacy-style',
        name: 'Legacy',
        componentType: 'WebButton',
        classes: { base: 'bg-red-500' },
      }).success,
    ).toBe(false);
  });
});

describe('reusable elements', () => {
  it('normalizes a legacy v2 project without reusableElements to an empty collection', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const legacy = JSON.parse(serializeProject(project)) as Record<string, unknown>;
    delete legacy.reusableElements;

    const parsed = deserializeProject(JSON.stringify(legacy));

    expect(parsed.reusableElements).toEqual([]);
    expect(serializeProject(parsed)).toContain('"reusableElements": []');
  });

  it('accepts a page instance that references a registered reusable definition', () => {
    const initial = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const reusable = createReusableElement(
      'Navigation',
      idSequence('navigation-id', 'navigation-root-id'),
    );
    const withReusable = addReusableElement(initial, reusable);
    const page = withReusable.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    const pageWithInstance = addComponent(
      page,
      component(
        'navigation-instance-id',
        'WebReusableElement',
        'Navigation1',
        page.rootComponentId,
        {
          reusableElementId: reusable.id,
        },
      ),
    );
    const project = updatePage(withReusable, page.id, () => pageWithInstance);

    const parsed = safeParseProject(project);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.reusableElements).toEqual([
      expect.objectContaining({ id: reusable.id, name: 'Navigation' }),
    ]);
    expect(
      parsed.data.pages[0]?.components.find((node) => node.id === 'navigation-instance-id')?.props,
    ).toMatchObject({
      reusableElementId: reusable.id,
      placement: 'in-flow',
      floatingHorizontalAnchor: 'left',
      floatingVerticalAnchor: 'top',
      floatingZIndex: 100,
    });
  });

  it('rejects invalid reusable placement settings in the aggregate model', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const reusable = createReusableElement(
      'Navigation',
      idSequence('navigation-id', 'navigation-root-id'),
    );
    const withReusable = addReusableElement(project, reusable);
    const page = withReusable.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    const pageWithInvalidInstance = addComponent(
      page,
      component(
        'invalid-floating-instance-id',
        'WebReusableElement',
        'InvalidFloating',
        page.rootComponentId,
        {
          reusableElementId: reusable.id,
          placement: 'viewport',
          floatingHorizontalAnchor: 'middle',
          floatingVerticalAnchor: 'middle',
          floatingZIndex: 1.5,
        },
      ),
    );

    const result = safeParseProject({ ...withReusable, pages: [pageWithInvalidInstance] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.filter((issue) =>
          issue.message.includes('reusable component floating'),
        ),
      ).toHaveLength(3);
      expect(result.error.issues.some((issue) => issue.message.includes('placement must be'))).toBe(
        true,
      );
    }
  });

  it('rejects an instance that references an unknown reusable definition', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const pageWithInvalidInstance = addComponent(
      page,
      component(
        'missing-instance-id',
        'WebReusableElement',
        'MissingReusable',
        page.rootComponentId,
        {
          reusableElementId: 'missing-reusable-id',
        },
      ),
    );

    const result = safeParseProject({ ...project, pages: [pageWithInvalidInstance] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('Unknown reusable component ID'),
        ),
      ).toBe(true);
    }
  });

  it('rejects cyclic reusable references', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const navigation = createReusableElement(
      'Navigation',
      idSequence('navigation-id', 'navigation-root-id'),
    );
    const accountMenu = createReusableElement(
      'AccountMenu',
      idSequence('account-menu-id', 'account-menu-root-id'),
    );
    const navigationWithAccountMenu = addComponent(
      navigation,
      component(
        'navigation-account-instance-id',
        'WebReusableElement',
        'AccountMenu1',
        navigation.rootComponentId,
        { reusableElementId: accountMenu.id },
      ),
    );
    const accountMenuWithNavigation = addComponent(
      accountMenu,
      component(
        'account-navigation-instance-id',
        'WebReusableElement',
        'Navigation1',
        accountMenu.rootComponentId,
        { reusableElementId: navigation.id },
      ),
    );

    const result = safeParseProject({
      ...project,
      reusableElements: [navigationWithAccountMenu, accountMenuWithNavigation],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('cannot reference each other recursively'),
        ),
      ).toBe(true);
    }
  });

  it('blocks removal while a reusable definition still has an instance', () => {
    const initial = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const reusable = createReusableElement(
      'Navigation',
      idSequence('navigation-id', 'navigation-root-id'),
    );
    const withReusable = addReusableElement(initial, reusable);
    const page = withReusable.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const projectWithInstance = updatePage(
      withReusable,
      page.id,
      addComponent(
        page,
        component(
          'navigation-instance-id',
          'WebReusableElement',
          'Navigation1',
          page.rootComponentId,
          { reusableElementId: reusable.id },
        ),
      ),
    );

    expect(() => removeReusableElement(projectWithInstance, reusable.id)).toThrow(
      'still used by 1 instance',
    );
    expect(projectWithInstance.reusableElements).toHaveLength(1);
  });
});

describe('serialization', () => {
  it('round-trips a nonvisual File Upload configuration and handlers without visual styles or runtime selection state', () => {
    const project = createProject('Files');
    const page = project.pages[0];
    if (page === undefined) throw new Error('Missing page.');
    const upload = applyDefaultComponentStyle(
      {
        ...component('file-upload-id', 'WebFileUpload', 'FileUpload1', page.rootComponentId, {
          accept: '.pdf',
          isPublic: false,
          enabled: true,
        }),
        events: {
          OnChange: 'ArquivoSelecionado',
          OnSuccess: 'ArquivoEnviado',
          OnProgress: 'ArquivoProgresso',
          OnError: null,
          OnComplete: null,
        },
      },
      project.styles,
    );
    const updated = updatePage(project, page.id, addComponent(page, upload, page.rootComponentId));
    const restored = deserializeProject(serializeProject(updated));
    expect(restored.pages[0]?.components.find((node) => node.id === upload.id)).toEqual(upload);
    expect(upload.styleId).toBeUndefined();
    expect(findDefaultComponentStyle(restored.styles, 'WebFileUpload')).toBeUndefined();
    expect(
      restored.pages[0]?.components.find((node) => node.id === upload.id)?.props,
    ).not.toHaveProperty('selectedFile');
    expect(
      deserializePage(serializePage(restored.pages[0]!)).components.find(
        (node) => node.id === upload.id,
      ),
    ).toEqual(upload);
  });

  it('round-trips a Popup child relationship and its responsive container layout', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    const popup = {
      ...component('popup-id', 'WebPopup', 'Popup1', page.rootComponentId),
      layout: {
        ...createDefaultComponentLayout(),
        container: {
          ...createDefaultComponentLayout().container,
          mode: 'column' as const,
          gap: 12,
          paddingTop: 16,
          paddingRight: 16,
          paddingBottom: 16,
          paddingLeft: 16,
        },
      },
    };
    const withPopup = addComponent(page, popup, page.rootComponentId);
    const withPopupChild = addComponent(
      withPopup,
      component('popup-button-id', 'WebButton', 'PopupButton1', popup.id),
      popup.id,
    );
    const projectWithPopup = updatePage(project, page.id, withPopupChild);

    const restored = deserializeProject(serializeProject(projectWithPopup));
    const restoredPage = restored.pages[0];
    const restoredPopup = restoredPage?.components.find((node) => node.id === popup.id);
    const restoredChild = restoredPage?.components.find((node) => node.id === 'popup-button-id');

    expect(restoredPopup?.children).toEqual(['popup-button-id']);
    expect(restoredPopup?.layout.container).toMatchObject({
      mode: 'column',
      gap: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
    });
    expect(restoredChild?.parentId).toBe(popup.id);
  });

  it('round-trips structured gradients in their stable field order', () => {
    const initial = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const project = addComponentStyle(
      initial,
      createComponentStyle('Gradient Button', 'WebButton', {
        idFactory: idSequence('style-gradient'),
        states: {
          base: {
            backgroundGradient: {
              to: '#7c3aed',
              from: '#2563eb',
              direction: 'to-bottom-right',
              kind: 'linear',
            },
          },
        },
      }),
    );

    const serialized = serializeProject(project);
    const gradientOffset = serialized.indexOf('"backgroundGradient"');
    expect(gradientOffset).toBeGreaterThanOrEqual(0);
    expect(serialized.indexOf('"kind"', gradientOffset)).toBeLessThan(
      serialized.indexOf('"direction"', gradientOffset),
    );
    expect(serialized.indexOf('"direction"', gradientOffset)).toBeLessThan(
      serialized.indexOf('"from"', gradientOffset),
    );
    expect(serialized.indexOf('"from"', gradientOffset)).toBeLessThan(
      serialized.indexOf('"to"', gradientOffset),
    );
    expect(deserializeProject(serialized)).toEqual(project);
  });

  it('round-trips deterministically and sorts arbitrary property keys', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const first = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId, {
        zeta: 1,
        alpha: 2,
      }),
    );
    const second = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId, {
        alpha: 2,
        zeta: 1,
      }),
    );
    const firstProject = updatePage(project, page.id, () => first);
    const secondProject = updatePage(project, page.id, () => second);
    const serialized = serializeProject(firstProject);

    expect(serialized).toBe(serializeProject(secondProject));
    expect(serialized.endsWith('\n')).toBe(true);
    expect(deserializeProject(serialized)).toEqual(firstProject);
  });

  it('rejects the former Form-shaped contract at the current format version', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = project.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;

    expect(() =>
      deserializeProject(
        JSON.stringify({
          formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
          id: project.id,
          name: project.name,
          entryForm: project.entryPage,
          forms: [page],
          settings: project.settings,
        }),
      ),
    ).toThrow(ProjectValidationError);

    expect(() =>
      deserializeProjectManifest(
        JSON.stringify({
          formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
          id: project.id,
          name: project.name,
          entryForm: project.entryPage,
          forms: [
            {
              id: page.id,
              name: page.name,
              formFile: `forms/${page.name}.wrform`,
              generatedFile: `forms/${page.name}.generated.ts`,
              codeFile: `forms/${page.name}.ts`,
            },
          ],
          settings: project.settings,
        }),
      ),
    ).toThrow(ProjectValidationError);

    expect(() =>
      deserializePage(
        JSON.stringify({
          ...page,
          components: page.components.map((component) =>
            component.id === page.rootComponentId ? { ...component, type: 'WebForm' } : component,
          ),
        }),
      ),
    ).toThrow(ProjectValidationError);
  });

  it('requires the current inline styles collection without legacy fallback', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const projectWithoutStyles = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    delete projectWithoutStyles.styles;
    expect(() => deserializeProject(JSON.stringify(projectWithoutStyles))).toThrow(
      ProjectValidationError,
    );

    const manifestWithoutStyles = JSON.parse(
      serializeProjectManifest(projectToManifest(project)),
    ) as Record<string, unknown>;
    delete manifestWithoutStyles.styles;
    expect(() => deserializeProjectManifest(JSON.stringify(manifestWithoutStyles))).toThrow(
      ProjectValidationError,
    );
  });

  it('rejects unsupported versions and safely reports malformed JSON', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    expect(() => deserializeProject(JSON.stringify({ ...project, formatVersion: 1 }))).toThrow(
      UnsupportedFormatVersionError,
    );
    expect(() => deserializeProject(JSON.stringify({ ...project, formatVersion: 0 }))).toThrow(
      UnsupportedFormatVersionError,
    );
    expect(() => deserializeProject(JSON.stringify({ ...project, formatVersion: 99 }))).toThrow(
      FutureFormatVersionError,
    );
    const malformed = safeDeserializeProject('{not json');
    expect(malformed.success).toBe(false);
    if (!malformed.success) expect(malformed.error.message).toContain('Invalid JSON');
  });

  it('creates a portable manifest and reassembles the aggregate', () => {
    const initial = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const project = addComponentStyle(
      initial,
      createComponentStyle('Primary Button', 'WebButton', idSequence('style-id')),
    );
    const manifest = projectToManifest(project);

    expect(manifest.pages[0]).toEqual({
      id: 'page-id',
      name: 'PageMain',
      pageFile: 'pages/PageMain.wrpage',
      generatedFile: 'pages/PageMain.generated.ts',
      codeFile: 'pages/PageMain.ts',
    });
    expect(manifest.styles).toEqual(project.styles);
    const serialized = serializeProjectManifest(manifest);
    const parsedManifest = deserializeProjectManifest(serialized);
    expect(assembleProject(parsedManifest, project.pages)).toEqual(project);
  });
});

describe('immutable update helpers', () => {
  it('updates props, bounds, events, and names while retaining the component ID', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const initial = addComponent(
      page,
      component('button-id', 'WebButton', 'Button1', page.rootComponentId, { caption: 'Button' }),
    );
    const renamed = renameComponent(initial, 'button-id', 'BTNGravar');
    const moved = updateComponentBounds(renamed, 'button-id', { x: 420, y: 300 });
    const captioned = updateComponentProps(moved, 'button-id', { caption: 'Gravar' });
    const bound = bindComponentEvent(captioned, 'button-id', 'OnClick', 'BTNGravarClick');
    const button = bound.components.find((candidate) => candidate.id === 'button-id');

    expect(button).toMatchObject({
      id: 'button-id',
      name: 'BTNGravar',
      bounds: { x: 420, y: 300 },
      props: { caption: 'Gravar' },
      events: { OnClick: 'BTNGravarClick' },
    });
    expect(initial.components.find((candidate) => candidate.id === 'button-id')).toMatchObject({
      name: 'Button1',
      bounds: { x: 8, y: 8 },
      props: { caption: 'Button' },
      events: { OnClick: null },
    });
  });

  it('removes a component subtree without mutating the original page', () => {
    const page = createPage('PageMain', idSequence('page-id', 'root-id'));
    const withPanel = addComponent(
      page,
      component('panel-id', 'WebPanel', 'Panel1', page.rootComponentId),
    );
    const withLabel = addComponent(
      withPanel,
      component('label-id', 'WebLabel', 'Label1', 'panel-id'),
    );
    const removed = removeComponent(withLabel, 'panel-id');

    expect(withLabel.components).toHaveLength(3);
    expect(removed.components.map((candidate) => candidate.id)).toEqual(['root-id']);
    expect(removed.components[0]?.children).toEqual([]);
  });

  it('renames a page and its root without changing either stable ID', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const renamed = renamePage(project, 'page-id', 'PageCustomers');

    expect(renamed.pages[0]).toMatchObject({
      id: 'page-id',
      name: 'PageCustomers',
      rootComponentId: 'root-id',
    });
    expect(renamed.pages[0]?.components[0]).toMatchObject({
      id: 'root-id',
      name: 'PageCustomers',
    });
    expect(() => renamePage(project, 'page-id', 'pagemain')).toThrow('more than case');
  });

  it('creates, updates, assigns, and safely removes styles without mutating prior state', () => {
    const initial = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = initial.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const withButton = updatePage(
      initial,
      page.id,
      addComponent(page, component('button-id', 'WebButton', 'Button1', page.rootComponentId)),
    );
    const style = createComponentStyle('Primary', 'WebButton', idSequence('style-id'));
    const withStyle = addComponentStyle(withButton, style);
    const assigned = setComponentStyle(withStyle, page.id, 'button-id', style.id);
    const withBase = updateComponentStyleState(assigned, style.id, 'base', {
      borderRadius: 'md',
      backgroundColor: '#2563eb',
      textColor: '#ffffff',
      transitionProperty: 'colors',
      transitionDuration: 150,
    });
    const updated = updateComponentStyleState(withBase, style.id, 'hover', {
      backgroundColor: '#1d4ed8',
    });
    const renamed = updateComponentStyle(updated, style.id, { name: 'Primary Action' });

    expect(renamed.styles.find((candidate) => candidate.id === style.id)).toMatchObject({
      id: 'style-id',
      name: 'Primary Action',
      states: {
        base: {
          borderRadius: 'md',
          backgroundColor: '#2563eb',
          textColor: '#ffffff',
          transitionProperty: 'colors',
          transitionDuration: 150,
        },
        hover: { backgroundColor: '#1d4ed8' },
      },
    });
    expect(renamed.pages[0]?.components.find((node) => node.id === 'button-id')?.styleId).toBe(
      'style-id',
    );
    expect(withStyle.pages[0]?.components.find((node) => node.id === 'button-id')?.styleId).toBe(
      undefined,
    );
    expect(() => updateComponentStyle(renamed, style.id, { id: 'replacement-id' })).toThrow(
      'immutable',
    );
    expect(() => updateComponentStyle(renamed, style.id, { componentType: 'WebLabel' })).toThrow(
      'not WebButton',
    );

    const removed = removeComponentStyle(renamed, style.id);
    expect(removed.styles).toEqual(initial.styles);
    expect(removed.pages[0]?.components.find((node) => node.id === 'button-id')).not.toHaveProperty(
      'styleId',
    );
    expect(renamed.styles).toHaveLength(initial.styles.length + 1);
  });

  it('keeps the seeded default styles available for future component insertion', () => {
    const project = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const defaultButton = findDefaultComponentStyle(project.styles, 'WebButton');
    expect(defaultButton).toBeDefined();
    if (defaultButton === undefined) return;

    expect(defaultButton.states.base).toMatchObject({
      buttonContentMode: 'text-icon',
      buttonIconPosition: 'left',
      buttonIconSize: { value: 16, unit: 'px' },
    });

    expect(() => removeComponentStyle(project, defaultButton.id)).toThrow(
      'Default component styles cannot be removed',
    );
    expect(() =>
      updateComponentStyle(project, defaultButton.id, { componentType: 'WebLabel' }),
    ).toThrow('must keep its component type');
  });

  it('rejects incompatible assignments and supports explicit unbinding', () => {
    const initial = createProject('Project1', idSequence('project-id', 'page-id', 'root-id'));
    const page = initial.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    const withButton = updatePage(
      initial,
      page.id,
      addComponent(page, component('button-id', 'WebButton', 'Button1', page.rootComponentId)),
    );
    const labelStyle = createComponentStyle('Label', 'WebLabel', idSequence('label-style'));
    const buttonStyle = createComponentStyle('Button', 'WebButton', idSequence('button-style'));
    const withStyles = addComponentStyle(addComponentStyle(withButton, labelStyle), buttonStyle);

    expect(() => setComponentStyle(withStyles, page.id, 'button-id', labelStyle.id)).toThrow(
      'not WebButton',
    );
    const assigned = setComponentStyle(withStyles, page.id, 'button-id', buttonStyle.id);
    const cleared = setComponentStyle(assigned, page.id, 'button-id', null);
    expect(cleared.pages[0]?.components.find((node) => node.id === 'button-id')).not.toHaveProperty(
      'styleId',
    );
  });
});
