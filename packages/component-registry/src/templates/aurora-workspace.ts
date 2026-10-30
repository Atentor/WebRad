import {
  createDefaultApiClientConfiguration,
  applyDefaultComponentStyle,
  createDefaultDataGridConfiguration,
  createDefaultChartsConfiguration,
  createDefaultRepeatingGroupConfiguration,
  createPage,
  createProject,
  createReusableElement,
  defaultIdFactory,
  parseProject,
  type ApiClientResponseSchema,
  type ComponentStyleModel,
  type PageModel,
  type ProjectAsset,
  type WebRadProject,
} from '@webrad/project-model';
import { createDefaultWebMenuConfiguration } from '@webrad/runtime/menu-model';
import { defaultComponentRegistry } from '../mvp-components.js';
import { REUSABLE_COMPONENT_TEMPLATES } from '../reusable-templates.js';
import assets from './aurora-assets.json';
import { AURORA_DEMO_SOURCES } from './aurora-sources.js';
import { htmlControls } from './aurora-html.js';
import {
  fileControls,
  pokemonControls,
  reportControls,
  timerControls,
} from './aurora-nonvisual.js';
import {
  AURORA_RESTGO_PAGES,
  restGoAccountControls,
  restGoRecoveryControls,
  restGoProfileControls,
  restGoSessionControls,
} from './aurora-restgo.js';
import {
  button,
  composeDemoDocument,
  padding,
  panel,
  row,
  text,
  paragraph,
  status,
  sidebarContent,
  type DemoNode,
} from './demo-layout.js';

function projectResponseSchema(): ApiClientResponseSchema {
  return {
    version: 1,
    root: {
      id: defaultIdFactory(),
      name: 'Response',
      path: '',
      kind: 'object',
      fieldType: 'object',
      nullable: false,
      children: [
        {
          id: defaultIdFactory(),
          name: 'projects',
          path: '/projects',
          kind: 'list',
          fieldType: 'list',
          nullable: false,
          children: ['name', 'owner', 'status', 'progress', 'progressFormat'].map((name) => ({
            id: defaultIdFactory(),
            name,
            path: `/projects/*/${name}`,
            kind: 'field' as const,
            fieldType: name === 'progress' ? ('number' as const) : ('string' as const),
            nullable: false,
            children: [],
          })),
        },
      ],
    },
  };
}

function navigationMenu(name: string, pages: readonly PageModel[], activeId: string): DemoNode {
  const defaults = createDefaultWebMenuConfiguration();
  const home = pages[0];
  if (!home) throw new Error('Demo home is missing.');
  return {
    type: 'WebMenu',
    name: 'Navigation',
    width: 264,
    height: 640,
    events: { OnUserClick: 'OpenRestGoAccount' },
    props: {
      floatingHorizontalAnchor: 'left',
      floatingVerticalAnchor: 'top',
      configuration: {
        ...defaults,
        orientation: 'vertical',
        collapsible: false,
        selectedItemId: activeId,
        user: {
          ...defaults.user,
          visible: true,
          name: 'Demo user',
          description: 'Aurora Workspace',
        },
        brand: {
          ...defaults.brand,
          caption: name,
          subtitle: 'Aurora component showcase',
          page: home.id,
        },
        items: [
          ...pages.slice(0, 4).map((page, index) => ({
            id: page.id,
            page: page.id,
            label: ['Overview', 'Forms', 'Data', 'Media'][index] ?? page.name,
            icon: (['house', 'square-pen', 'table', 'play'] as const)[index] ?? 'house',
          })),
          {
            id: 'aurora-nonvisual',
            label: 'Nonvisual',
            icon: 'layers',
            expanded: true,
            children: pages.slice(4, 8).map((page, index) => ({
              id: page.id,
              page: page.id,
              label:
                ['API Client / PokeAPI', 'Timer', 'File / Video Upload', 'Report Builder'][index] ??
                page.name,
              icon: ['globe', 'timer', 'upload', 'file-text'][index] ?? 'layers',
            })),
          },
          {
            id: 'aurora-restgo',
            label: 'RestGO',
            icon: 'user',
            expanded: true,
            children: pages
              .filter((page) => AURORA_RESTGO_PAGES.some((name) => name === page.name))
              .map((page, index) => ({
                id: page.id,
                page: page.id,
                label:
                  [
                    'Registration / Sign in',
                    'Email / Password recovery',
                    'Profile / Avatar',
                    'Session / Logout',
                  ][index] ?? page.name,
                icon: ['user-plus', 'mail', 'user-round', 'log-out'][index] ?? 'user',
              })),
          },
        ],
      },
    },
  };
}

function sharedNavigation(
  name: string,
  pages: readonly PageModel[],
  styles: readonly ComponentStyleModel[],
): PageModel {
  const template = REUSABLE_COMPONENT_TEMPLATES.find((entry) => entry.id === 'navigation-menu');
  if (!template) throw new Error('Responsive menu template is missing.');
  const definition = template.create('AuroraMenu');
  const spec = navigationMenu(name, pages, pages[0]?.id ?? '');
  return {
    ...definition,
    width: 264,
    components: definition.components.map((node) =>
      node.type === 'WebMenu'
        ? applyDefaultComponentStyle(
            {
              ...node,
              name: 'Menu',
              bounds: { ...node.bounds, width: 264 },
              props: { ...node.props, ...spec.props },
              events: { ...node.events, ...spec.events },
            },
            styles,
          )
        : node.id === definition.rootComponentId
          ? { ...node, bounds: { ...node.bounds, width: 264 } }
          : node,
    ),
  };
}

function navigationPlacement(definitionId: string): DemoNode {
  return {
    type: 'WebReusableElement',
    name: 'Navigation',
    width: 264,
    height: 640,
    props: {
      reusableElementId: definitionId,
      floatingHorizontalAnchor: 'left',
      floatingVerticalAnchor: 'top',
    },
  };
}

function featureCard(styles: readonly ComponentStyleModel[]): PageModel {
  return composeDemoDocument(
    createReusableElement('FeatureCard', { width: 440, height: 312 }),
    styles,
    [
      row('CardHeading', [
        {
          type: 'WebIcon',
          name: 'CardIcon',
          width: 28,
          height: 28,
          item: { width: 'fixed' },
          props: { icon: 'layers', accessibleLabel: 'Reusable component' },
        },
        {
          ...text('CardTitle', 'REUSABLE CARD', 30),
          width: 144,
          item: { width: 'fixed', grow: 1, shrink: true },
        },
      ]),
      text('CardStatus', 'This instance: 50%', 28),
      {
        type: 'WebProgressBar',
        name: 'CardProgress',
        width: 88,
        height: 88,
        props: { value: 50, format: 'dunnet' },
        item: { width: 'fixed', alignSelf: 'center' },
      },
      button('AdvanceButton', 'Advance this instance', 'AdvanceProgress', 'add'),
    ],
    { ...padding, gap: 12 },
  );
}

function overview(
  reusableId: string,
  visualCount: number,
  nonvisualCount: number,
): readonly DemoNode[] {
  return [
    panel('WelcomePanel', [
      text('WelcomeHeading', 'AURORA COMPONENT SHOWCASE', 30),
      paragraph(
        'WelcomeText',
        'Explore ' +
          visualCount +
          ' visual and ' +
          nonvisualCount +
          ' nonvisual components in a working example. Every styled component uses its original Default style.',
      ),
      row('ExploreActions', [
        button('ExploreForms', 'Explore the form', 'OpenForm', 'user'),
        button('ExploreData', 'Explore the data', 'OpenData', 'table'),
        button('ExploreMedia', 'Explore the media', 'OpenMedia', 'play'),
      ]),
    ]),
    text('ReusableHeading', 'SHARED DESIGN / INDEPENDENT STATE', 30),
    paragraph(
      'ReusableDescription',
      'These two cards share one FeatureCard definition. Advance either card to see its state change independently.',
    ),
    row(
      'ReusableExamples',
      ['FirstFeature', 'SecondFeature'].map((name) => ({
        type: 'WebReusableElement',
        name,
        width: 440,
        height: 312,
        props: { reusableElementId: reusableId },
        item: { width: 'fixed', minWidth: 220, grow: 1, shrink: true },
      })),
    ),
    row('CatalogPanels', [
      panel('ControlsCatalog', [
        text('ControlsTitle', 'FORM CONTROLS', 30),
        paragraph(
          'ControlsList',
          'Label, Edit, Text Area, Button, Check Box, Toggle, Combo Box, List Box and Popup.',
        ),
        paragraph(
          'ControlsDetail',
          'Change the example profile, adjust preferences and open a real summary dialog.',
        ),
      ]),
      panel('CompositionCatalog', [
        text('CompositionTitle', 'LAYOUT, DATA AND MEDIA', 30),
        paragraph(
          'CompositionList',
          'Page, Panel, Group, Reusable Component, Menu, ProgressBar, Icons, Image, HTML, Data Grid, Charts, Repeating Group and Video Player.',
        ),
        paragraph(
          'CompositionDetail',
          'Bundled data and media work locally. Nonvisual pages add a live PokeAPI client, Timer, file and video uploads, and PDF reports.',
        ),
      ]),
    ]),
  ];
}

function formControls(): readonly DemoNode[] {
  return [
    text('FormsHeading', 'PROFILE / FORM CONTROLS', 30),
    paragraph(
      'FormsIntro',
      'Edit the example values, then review the summary. This demonstration keeps values in the current page session.',
    ),
    row('ProfileColumns', [
      panel(
        'ProfileFields',
        [
          text('NameLabel', 'Name', 24),
          {
            type: 'WebEdit',
            name: 'NameEdit',
            height: 38,
            props: { value: 'Alex Morgan', placeholder: 'Your name' },
          },
          text('EmailLabel', 'Email', 24),
          {
            type: 'WebEdit',
            name: 'EmailEdit',
            height: 38,
            props: {
              value: 'alex@example.com',
              inputType: 'email',
              placeholder: 'you@example.com',
            },
          },
          text('TeamLabel', 'Team / Combo Box', 24),
          {
            type: 'WebComboBox',
            name: 'TeamCombo',
            height: 38,
            props: {
              items: ['Design', 'Development', 'Support'],
              values: ['design', 'development', 'support'],
              selectedIndex: 1,
              value: 'development',
            },
            events: { OnChange: 'PreferenceChanged' },
          },
          text('NotesLabel', 'Notes / Text Area', 24),
          {
            type: 'WebTextArea',
            name: 'NotesEdit',
            height: 112,
            props: { value: 'A workspace built with the Default component styles.', rows: 4 },
          },
        ],
        540,
      ),
      panel(
        'ProfilePreferences',
        [
          text('PreferencesHeading', 'PREFERENCES', 30),
          {
            type: 'WebCheckBox',
            name: 'UpdatesCheck',
            height: 40,
            props: { caption: 'Receive email updates', checked: true },
            events: { OnChange: 'PreferenceChanged' },
          },
          row('Availability', [
            {
              type: 'WebToggle',
              name: 'AvailableToggle',
              width: 48,
              height: 26,
              item: { width: 'fixed' },
              props: { checked: true },
              events: { OnChange: 'PreferenceChanged' },
            },
            {
              ...text('AvailableLabel', 'Available for new projects', 32),
              width: 230,
              item: { width: 'fixed', grow: 1, shrink: true },
            },
          ]),
          text('InterestLabel', 'Favorite feature / List Box', 30),
          {
            type: 'WebListBox',
            name: 'InterestList',
            height: 142,
            props: {
              items: ['Designer', 'Typed code', 'Preview', 'Reusable components'],
              selectedIndex: 0,
            },
            events: { OnChange: 'PreferenceChanged' },
          },
        ],
        340,
      ),
    ]),
    row('FormActions', [
      button('ReviewButton', 'Review profile', 'ReviewProfile', 'check'),
      button('ResetButton', 'Restore example values', 'ResetProfile', 'refresh'),
    ]),
    status('FormStatus', 'Change the controls above, then review your profile.', 56),
    {
      type: 'WebPopup',
      name: 'ProfilePopup',
      width: 380,
      height: 480,
      item: { width: 'fixed', height: 'fit-content', maxWidth: 380 },
      container: { ...padding, gap: 12 },
      children: [
        text('SummaryHeading', 'PROFILE SUMMARY', 30),
        text('SummaryName', 'Name', 36),
        text('SummaryEmail', 'Email', 36),
        text('SummaryTeam', 'Team', 32),
        status('SummaryPreferences', 'Preferences', 56),
        text('SummaryInterest', 'Favorite feature', 36),
        status('SummaryNotes', 'Notes', 72),
        button('CloseSummaryButton', 'Close summary', 'CloseSummary', 'close'),
      ],
    },
  ];
}

function dataControls(): readonly DemoNode[] {
  const clientId = defaultIdFactory();
  const operationId = defaultIdFactory();
  const api = createDefaultApiClientConfiguration();
  const request = api.operations[0];
  const grid = createDefaultDataGridConfiguration();
  const column = grid.columns[0];
  if (!request || !column) throw new Error('Default data configuration is incomplete.');
  return [
    text('DataHeading', 'PROJECTS / DATA COMPONENTS', 30),
    paragraph(
      'DataIntro',
      'Data Grid, Charts and Repeating Group share the same example projects from a bundled JSON asset, loaded through a real API Client request.',
    ),
    button('ReloadProjects', 'Reload example data', 'LoadProjects', 'refresh'),
    status('DataStatus', 'Open Preview to load the bundled example projects.', 44),
    panel('GridPanel', [
      text('GridHeading', 'DATA GRID / SELECT ANY CELL', 30),
      {
        type: 'WebDataGrid',
        name: 'ProjectsGrid',
        height: 300,
        props: {
          dataGridConfig: {
            ...grid,
            apiClientId: clientId,
            operationId,
            listPath: '/projects',
            columnCount: 4,
            wrapText: true,
            columns: ['name', 'owner', 'status', 'progress'].map((name) => ({
              ...column,
              id: defaultIdFactory(),
              header:
                name === 'progress'
                  ? 'Progress (%)'
                  : name.slice(0, 1).toUpperCase() + name.slice(1),
              fieldPath: '/' + name,
              minWidth: 120,
            })),
          },
        },
        events: { OnCellClick: 'SelectGridProject' },
      },
    ]),
    panel('ChartsPanel', [
      text('ChartsHeading', 'CHARTS / PROJECT PROGRESS', 30),
      {
        type: 'WebCharts',
        name: 'ProjectsChart',
        height: 320,
        props: {
          chartsConfig: {
            ...createDefaultChartsConfiguration(),
            title: 'Project progress',
            subtitle: 'Select a bar to inspect a project.',
            valueSuffix: '%',
            showLabels: true,
            series: [
              {
                id: defaultIdFactory(),
                name: 'Progress',
                color: '#6366f1',
                apiClientId: clientId,
                operationId,
                listPath: '/projects',
                labelField: '/name',
                valueField: '/progress',
              },
            ],
          },
        },
        events: { OnPointClick: 'SelectChartProject' },
      },
    ]),
    status(
      'SelectedProject',
      'Select a grid cell, chart point or repeated card to inspect a project.',
      48,
    ),
    panel('RepeaterPanel', [
      text('RepeaterHeading', 'REPEATING GROUP', 48),
      {
        type: 'WebRepeatingGroup',
        name: 'ProjectsRepeater',
        height: 460,
        props: {
          repeatingGroupConfig: {
            ...createDefaultRepeatingGroupConfiguration(),
            apiClientId: clientId,
            operationId,
            listPath: '/projects',
            minRowHeight: 220,
            gap: 12,
          },
        },
        container: { mode: 'column', gap: 10, ...padding },
        children: [
          {
            ...text('ProjectName', 'Customer portal', 28),
            props: {
              caption: 'Customer portal',
              autoSize: false,
              currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
            },
          },
          {
            ...text('ProjectOwner', 'Alex Morgan', 24),
            props: {
              caption: 'Alex Morgan',
              autoSize: false,
              currentRowBindings: [{ property: 'caption', fieldPath: '/owner' }],
            },
          },
          {
            type: 'WebProgressBar',
            name: 'ProjectProgress',
            height: 48,
            props: {
              value: 75,
              currentRowBindings: [
                { property: 'value', fieldPath: '/progress' },
                { property: 'format', fieldPath: '/progressFormat' },
              ],
            },
          },
          button('SelectProjectButton', 'Select this project', 'SelectRepeatedProject', 'check'),
        ],
      },
    ]),
    {
      type: 'WebApiClient',
      id: clientId,
      name: 'DemoData',
      props: {
        apiClientConfig: {
          ...api,
          operations: [
            {
              ...request,
              id: operationId,
              name: 'LoadProjects',
              path: 'assets/imported/aurora-projects.json',
              responseSchema: projectResponseSchema(),
            },
          ],
        },
      },
    },
  ];
}

function mediaControls(): readonly DemoNode[] {
  const stop = button('StopVideoButton', 'Stop playback', 'StopVideo', 'stop');
  return [
    text('MediaHeading', 'MEDIA / IMAGES, ICONS AND VIDEO', 30),
    row('MediaColumns', [
      panel(
        'ImagePanel',
        [
          text('ImageHeading', 'IMAGE / BUNDLED PROJECT ASSET', 30),
          {
            type: 'WebImage',
            name: 'WorkspaceImage',
            height: 220,
            props: {
              src: 'assets/imported/aurora-workspace.svg',
              alt: 'Illustrated workspace with project cards and a progress chart',
              objectFit: 'contain',
            },
          },
          row('FavoriteRow', [
            {
              type: 'WebIcon',
              name: 'FavoriteIcon',
              width: 32,
              height: 32,
              item: { width: 'fixed' },
              props: {
                icon: 'star',
                mode: 'button',
                accessibleLabel: 'Toggle illustration favorite',
              },
              events: { OnClick: 'ToggleFavorite' },
            },
            {
              ...paragraph('FavoriteHelp', 'Click the icon to toggle your favorite.'),
              width: 250,
              item: { width: 'fixed', grow: 1, shrink: true },
            },
          ]),
          status('ImageStatus', 'The illustration is stored in Project Assets.', 44),
        ],
        380,
      ),
      panel(
        'VideoPanel',
        [
          text('VideoHeading', 'VIDEO PLAYER / BUNDLED DASH SAMPLE', 30),
          {
            type: 'WebVideoPlayer',
            name: 'DemoVideo',
            height: 270,
            props: {
              poster: 'assets/imported/aurora-workspace.svg',
              aspectRatio: '16:9',
              controls: true,
              autoplay: false,
            },
            events: { OnError: 'VideoError', OnPlay: 'VideoPlaying', OnEnded: 'VideoEnded' },
          },
          button('LoadVideo', 'Load sample video', 'LoadSampleVideo', 'play'),
          { ...stop, props: { ...stop.props, enabled: false } },
          status(
            'MediaStatus',
            'Load the included 10-second sample, then use the player controls.',
            64,
          ),
          paragraph(
            'VideoAttribution',
            'Sintel excerpt © Blender Foundation / CC BY 3.0. Full attribution and license links are included in Project Assets (aurora-media-license.txt).',
          ),
        ],
        540,
      ),
    ]),
    ...htmlControls(),
  ];
}

/** An editable, self-contained showcase of every registered visual component. */
export function createAuroraWorkspace(name: string): {
  readonly project: WebRadProject;
  readonly userSources: Readonly<Record<string, string>>;
} {
  const base = createProject(name, { pageWidth: 1120, pageHeight: 1200 });
  const entry = base.pages.find((page) => page.id === base.entryPage);
  const notFound = base.pages.find((page) => page.name === '404');
  if (!entry || !notFound) throw new Error('Demo requires the mandatory index and 404 pages.');
  const pages = [
    entry,
    ...[
      'Forms',
      'Data',
      'Media',
      'Pokemon',
      'Timer',
      'Files',
      'Reports',
      ...AURORA_RESTGO_PAGES,
    ].map((pageName) => createPage(pageName, { width: 1120, height: 1200 })),
  ];
  const reusable = featureCard(base.styles);
  const menu = sharedNavigation(name, pages, base.styles);
  const contents = [
    overview(
      reusable.id,
      defaultComponentRegistry.list().filter((definition) => definition.visual).length,
      defaultComponentRegistry.list().filter((definition) => !definition.visual).length,
    ),
    formControls(),
    dataControls(),
    mediaControls(),
    pokemonControls(),
    timerControls(),
    fileControls(),
    reportControls(),
    restGoAccountControls(),
    restGoRecoveryControls(),
    restGoProfileControls(),
    restGoSessionControls(),
  ];
  const demoPages = pages.map((page, index) =>
    composeDemoDocument(
      page,
      base.styles,
      [navigationPlacement(menu.id), sidebarContent(contents[index] ?? [])],
      {},
      {
        OnShow: 'InitializeSidebar',
        OnHide: 'ReleaseSidebar',
        ...(page.name === 'Data' ? { OnCreate: 'LoadProjects' } : {}),
        ...(AURORA_RESTGO_PAGES.some((name) => name === page.name)
          ? {
              OnLogin: 'RestGoPageLogin',
              OnLogout: 'RestGoPageLogout',
              OnUnauthenticated: 'RestGoPageUnauthenticated',
            }
          : {}),
      },
    ),
  );
  const errorPage = composeDemoDocument(
    notFound,
    base.styles,
    [
      navigationPlacement(menu.id),
      sidebarContent([
        panel('NotFoundPanel', [
          text('NotFoundHeading', '404 / PAGE NOT FOUND', 36),
          paragraph(
            'NotFoundText',
            'This page is not part of the demonstration. Return to the overview to keep exploring.',
          ),
          button('BackToOverview', 'Return to overview', 'ReturnHome', 'home'),
        ]),
      ]),
    ],
    {},
    { OnShow: 'InitializeSidebar', OnHide: 'ReleaseSidebar' },
  );
  const project = parseProject({
    ...base,
    sourceFiles: [
      ...(base.sourceFiles ?? []),
      { id: defaultIdFactory(), kind: 'unit', name: 'AuroraSidebar' },
      { id: defaultIdFactory(), kind: 'unit', name: 'AuroraAccount' },
    ],
    pages: [...demoPages, errorPage],
    reusableElements: [reusable, menu],
    assets: assets.map((asset): ProjectAsset => ({ ...asset, id: defaultIdFactory() })),
  });
  const usedTypes = new Set(
    [...project.pages, ...project.reusableElements].flatMap((document) =>
      document.components.map((node) => node.type),
    ),
  );
  const missing = defaultComponentRegistry
    .list()
    .filter((definition) => !usedTypes.has(definition.type));
  if (missing.length > 0)
    throw new Error(
      'Aurora demo is missing components: ' +
        missing.map((definition) => definition.type).join(', '),
    );
  return { project, userSources: AURORA_DEMO_SOURCES };
}
