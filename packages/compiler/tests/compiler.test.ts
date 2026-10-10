import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addPage,
  addComponent,
  addComponentStyle,
  addReusableElement,
  bindComponentEvent,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  DEFAULT_PROJECT_SCROLLBAR_STYLE,
  createDefaultApiClientConfiguration,
  createComponentStyle,
  createPage,
  createProject,
  createReusableElement,
  setComponentStyle,
  updatePage,
  updateProjectSettings,
  type ApiClientConfiguration,
  type BackgroundGradientValue,
  type PageModel,
  type StylePropertyValue,
  type WebRadProject,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  resolveStylePropertyCandidate,
  tokenizeTailwindClasses,
  WEBRAD_COMPONENT_CSS,
} from '@webrad/runtime/visual';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

import { compileProject, compileProjectToMemory } from '../src/index.js';
import { createVirtualSourceGraph } from '../src/source-graph.js';
import {
  collectTailwindCandidates,
  compileGeneratedAppStyles,
  compileTailwindStyles,
  GENERATED_APP_CSS,
} from '../src/styles.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-compiler-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function executableProject(): WebRadProject {
  let sequence = 0;
  const idFactory = (): string => `stable-${String((sequence += 1))}`;
  const project = createProject('HelloWebRad', { idFactory });
  let page: PageModel = project.pages[0] as PageModel;
  const rootId = page.rootComponentId;
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebEdit', {
      id: 'edit-name',
      name: 'EDTNome',
      parentId: rootId,
      x: 24,
      y: 24,
    }),
    rootId,
  );
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'button-show',
      name: 'BTNMostrar',
      parentId: rootId,
      x: 24,
      y: 72,
    }),
    rootId,
  );
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'api-client',
      name: 'ApiClient1',
      parentId: rootId,
      props: { baseUrl: 'https://api.example.test' },
    }),
    rootId,
  );
  page = bindComponentEvent(page, rootId, 'OnCreate', 'PageMainCreate');
  page = bindComponentEvent(page, 'button-show', 'OnClick', 'BTNMostrarClick');
  return updatePage(project, page.id, page);
}

function customersApiClientConfiguration(): ApiClientConfiguration {
  const defaults = createDefaultApiClientConfiguration();
  const request = defaults.operations[0];
  if (request === undefined) throw new Error('Expected an API Client default operation.');

  return {
    ...defaults,
    defaultHeaders: [
      { id: 'accept-header', name: 'Accept', value: 'application/json', enabled: true },
    ],
    timeoutMs: 15_000,
    operations: [
      {
        ...request,
        id: 'load-customers',
        name: 'LoadCustomers',
        path: '/customers',
        query: [{ id: 'page-query', name: 'page', value: '1', enabled: true }],
        responseSchema: {
          version: 1,
          root: {
            id: 'customers-response',
            name: 'Response',
            path: '',
            kind: 'list',
            fieldType: 'list',
            nullable: false,
            children: [
              {
                id: 'customer-id',
                name: 'id',
                path: '/*/id',
                kind: 'field',
                fieldType: 'integer',
                nullable: false,
                children: [],
              },
              {
                id: 'customer-name',
                name: 'name',
                path: '/*/name',
                kind: 'field',
                fieldType: 'string',
                nullable: true,
                children: [],
              },
            ],
          },
        },
      },
    ],
  };
}

function dataGridExecutableProject(): WebRadProject {
  const project = executableProject();
  const page = project.pages[0];
  if (page === undefined) throw new Error('Expected an initial page.');
  const configuredPage: PageModel = {
    ...page,
    components: page.components.map((component) =>
      component.id === 'api-client'
        ? {
            ...component,
            props: { ...component.props, apiClientConfig: customersApiClientConfiguration() },
          }
        : component,
    ),
  };
  const withGrid = addComponent(
    configuredPage,
    defaultComponentRegistry.createComponent('WebDataGrid', {
      id: 'data-grid',
      name: 'DataGrid1',
      parentId: configuredPage.rootComponentId,
      x: 24,
      y: 128,
      props: {
        dataGridConfig: {
          schemaVersion: 1,
          apiClientId: 'api-client',
          operationId: 'load-customers',
          listPath: '',
          columnCount: 3,
          showHeader: true,
          stickyHeader: true,
          showFooter: true,
          stickyFooter: true,
          columns: [
            {
              id: 'name',
              header: 'Name',
              fieldPath: '/name',
              cellKind: 'text',
              footer: 'Customers',
            },
            { id: 'id', header: 'ID', fieldPath: '/id', cellKind: 'button', footer: '' },
            {
              id: 'active',
              header: 'Active',
              fieldPath: '/active',
              cellKind: 'checkbox',
              footer: '',
            },
          ],
        },
      },
    }),
    configuredPage.rootComponentId,
  );
  return updatePage(project, withGrid.id, withGrid);
}

function styledExecutableProject(): WebRadProject {
  const project = executableProject();
  const style = createComponentStyle('Primary Button', 'WebButton', {
    idFactory: () => 'style-primary-button',
    states: {
      base: {
        textGradient: {
          kind: 'linear',
          direction: 'to-right',
          from: '#f59e0b',
          to: '#ef4444',
        },
        backgroundGradient: {
          kind: 'linear',
          direction: 'to-bottom-right',
          from: '#2563eb',
          to: '#7c3aed',
        },
        borderWidth: { value: 4, unit: 'px' },
        borderStyle: 'solid',
        borderGradient: {
          kind: 'linear',
          direction: 'to-bottom',
          from: '#22c55e',
          to: '#06b6d4',
        },
        paddingLeft: { value: 24, unit: 'px' },
        paddingRight: { value: 24, unit: 'px' },
        letterSpacing: { value: 0.125, unit: 'rem' },
        borderRadius: { value: 40, unit: 'px' },
        boxShadow: 'md',
        transitionProperty: 'all',
        transitionDuration: 200,
        animationName: 'pulse',
        animationDuration: 750,
        animationIterationCount: 'infinite',
      },
      hover: {
        backgroundGradient: {
          kind: 'linear',
          direction: 'to-top',
          from: '#1d4ed8',
          to: '#0f172a',
        },
      },
      focus: {
        outlineWidth: { value: 2, unit: 'px' },
        outlineStyle: 'solid',
        outlineColor: '#38bdf8',
        ringWidth: { value: 2, unit: 'px' },
        ringColor: '#93c5fd',
      },
      active: { scale: 95 },
      disabled: { cursor: 'not-allowed', opacity: 50 },
    },
  });
  const withStyle = addComponentStyle(project, style);
  return setComponentStyle(withStyle, withStyle.pages[0]!.id, 'button-show', style.id);
}

function reusableElementExecutableProject(): WebRadProject {
  let sequence = 0;
  const idFactory = (): string => `reusable-${String((sequence += 1))}`;
  const project = createProject('ReusableCompile', { idFactory });
  let reusableDefinition = createReusableElement('CustomerCard', {
    idFactory,
    width: 240,
    height: 96,
  });
  const reusableButton = defaultComponentRegistry.createComponent('WebButton', {
    id: 'customer-card-button',
    name: 'CustomerCardButton',
    parentId: reusableDefinition.rootComponentId,
    x: 16,
    y: 16,
    props: { caption: 'Select' },
  });
  reusableDefinition = bindComponentEvent(
    addComponent(reusableDefinition, reusableButton, reusableDefinition.rootComponentId),
    reusableButton.id,
    'OnClick',
    'CustomerCardButtonClick',
  );
  const reusableApiClient = defaultComponentRegistry.createComponent('WebApiClient', {
    id: 'customer-card-api-client',
    name: 'CustomerCardApiClient',
    parentId: reusableDefinition.rootComponentId,
    props: { baseUrl: 'https://api.example.test/customer-card' },
  });
  reusableDefinition = addComponent(
    reusableDefinition,
    reusableApiClient,
    reusableDefinition.rootComponentId,
  );
  const withReusableDefinition = addReusableElement(project, reusableDefinition);
  const page = withReusableDefinition.pages[0];
  if (page === undefined) throw new Error('Expected the initial page.');

  const reusableInstance = defaultComponentRegistry.createComponent('WebReusableElement', {
    id: 'customer-card-instance',
    name: 'CustomerCardInstance',
    parentId: page.rootComponentId,
    x: 24,
    y: 36,
    props: {
      reusableElementId: reusableDefinition.id,
      placement: 'floating',
      floatingHorizontalAnchor: 'right',
      floatingVerticalAnchor: 'bottom',
      floatingZIndex: 220,
    },
  });
  const secondReusableInstance = defaultComponentRegistry.createComponent('WebReusableElement', {
    id: 'customer-card-second-instance',
    name: 'CustomerCardSecondInstance',
    parentId: page.rootComponentId,
    x: 24,
    y: 156,
    props: { reusableElementId: reusableDefinition.id, placement: 'in-flow' },
  });
  const pageWithReusableInstances = addComponent(
    addComponent(page, reusableInstance, page.rootComponentId),
    secondReusableInstance,
    page.rootComponentId,
  );
  return updatePage(withReusableDefinition, page.id, pageWithReusableInstances);
}

function internallyNavigableProject(): WebRadProject {
  const project = executableProject();
  const detailsPage = bindComponentEvent(
    createPage('PageDetails', {
      idFactory: (() => {
        let sequence = 0;
        return () => `details-${String((sequence += 1))}`;
      })(),
    }),
    'details-2',
    'OnCreate',
    'PageDetailsCreate',
  );
  return addPage(project, detailsPage);
}

describe('compileProject', () => {
  it('serializes reusable definitions into the runtime model and compiles without diagnostics', async () => {
    const project = reusableElementExecutableProject();
    const reusableDefinition = project.reusableElements[0];
    if (reusableDefinition === undefined) throw new Error('Expected a reusable definition.');

    const graph = createVirtualSourceGraph(
      project,
      {},
      defaultComponentRegistry,
      GENERATED_APP_CSS,
    );
    const entrySource = graph.sources.get(graph.entryPath);
    if (entrySource === undefined) throw new Error('Expected the compiler entry source.');

    expect(graph.diagnostics).toEqual([]);
    expect(entrySource).toContain('"reusableElements":[');
    expect(entrySource).toContain(`"id":"${reusableDefinition.id}"`);
    expect(entrySource).toContain(`"reusableElementId":"${reusableDefinition.id}"`);

    const result = await compileProjectToMemory(project, { userSources: {} });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.files['assets/app.js']).toContain('reusableElements');
    expect(result.files['assets/app.js']).toContain(reusableDefinition.id);
    expect(result.files['assets/app.js']).toContain('CustomerCardApiClient');
  });

  it.each(['this.', ''])(
    'binds reusable component events with %s access inside an isolated authored instance per placement',
    async (access) => {
      const project = reusableElementExecutableProject();
      const userSources = {
        'reusables/CustomerCard.ts': `import type { WebButton } from '@webrad/runtime';
import { CustomerCardGenerated } from './CustomerCard.generated';

for (const CustomerCardButton of ['module-local']) { void CustomerCardButton; }

export class CustomerCard extends CustomerCardGenerated {
  #clicks = 0;

  private readCaption(value = ${access}CustomerCardButton.caption): string { return value; }

  public CustomerCardButtonClick(sender: WebButton): void {
    this.#clicks += 1;
    ${access}CustomerCardButton.caption = String(this.#clicks);
    sender.element.dataset.reusableClicks = String(this.#clicks);
    sender.element.dataset.hostPageName = this.pageName;
    sender.element.dataset.defaultCaption = this.readCaption();
  }
}
`,
      };
      const result = await compileProjectToMemory(project, { userSources });

      expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
      const application = result.files['assets/app.js'] ?? '';
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
        url: 'https://preview.webrad.test/',
      });
      Object.defineProperties(dom.window, {
        fetch: { value: globalThis.fetch },
        Headers: { value: globalThis.Headers },
      });
      dom.window.eval(application);

      const firstButton = dom.window.document.querySelector<HTMLButtonElement>(
        '[data-webrad-id="customer-card-instance:customer-card-button"]',
      );
      const secondButton = dom.window.document.querySelector<HTMLButtonElement>(
        '[data-webrad-id="customer-card-second-instance:customer-card-button"]',
      );
      expect(firstButton).toBeInstanceOf(dom.window.HTMLButtonElement);
      expect(secondButton).toBeInstanceOf(dom.window.HTMLButtonElement);
      if (firstButton === null || secondButton === null) {
        throw new Error('Compiled reusable buttons did not render.');
      }

      firstButton.click();
      firstButton.click();
      secondButton.click();
      expect(firstButton.dataset.reusableClicks).toBe('2');
      expect(secondButton.dataset.reusableClicks).toBe('1');
      expect(firstButton.textContent).toBe('2');
      expect(secondButton.textContent).toBe('1');
      expect(firstButton.dataset.hostPageName).toBe('PageMain');
      expect(secondButton.dataset.hostPageName).toBe('PageMain');
      expect(firstButton.dataset.defaultCaption).toBe('2');
      expect(secondButton.dataset.defaultCaption).toBe('1');
      dom.window.close();
    },
  );

  it('executes bare component references, method defaults, lexical bindings and arrows without modifying authored source', async () => {
    const project = executableProject();
    const source = `import { PageMainGenerated } from './PageMain.generated';
for (const EDTNome of [{ value: 'module-local' }]) { void EDTNome.value; }
for (let BTNMostrar of ['module-local']) { void BTNMostrar; }
export class PageMain extends PageMainGenerated {
  private readDefaults(value = EDTNome.value, { caption = BTNMostrar.caption } = {}): string {
    return value + ':' + caption;
  }
  public PageMainCreate(): void {
    EDTNome.value = 'Ada';
    BTNMostrar.caption = 'Ready';
    ApiClient1.baseUrl = 'https://api.changed.test';
    const fields = { EDTNome };
    this.element.dataset.fieldName = fields.EDTNome.name;
    this.element.dataset.apiUrl = ApiClient1.baseUrl;
    this.element.dataset.defaults = this.readDefaults();
  }
  public BTNMostrarClick(): void {
    const EDTNome = { value: 'local' };
    const run = () => BTNMostrar.caption = EDTNome.value;
    run();
  }
}`;
    const userSources = { 'pages/PageMain.ts': source };
    const result = await compileProjectToMemory(project, { userSources });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(userSources['pages/PageMain.ts']).toBe(source);
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const button = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-webrad-id="button-show"]',
    );
    const edit = dom.window.document.querySelector<HTMLInputElement>(
      '[data-webrad-id="edit-name"]',
    );
    const root = dom.window.document.querySelector<HTMLElement>('[data-field-name]');
    expect(edit?.value).toBe('Ada');
    expect(root?.dataset.fieldName).toBe('EDTNome');
    expect(root?.dataset.apiUrl).toBe('https://api.changed.test');
    expect(root?.dataset.defaults).toBe('Ada:Ready');
    button?.click();
    expect(button?.textContent).toBe('local');
    dom.window.close();
  });

  it('preserves authored diagnostic positions for invalid bare component properties', async () => {
    const source = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  public PageMainCreate(): void { EDTNome.value = 42; }
}`;
    const result = await compileProjectToMemory(executableProject(), {
      userSources: { 'pages/PageMain.ts': source },
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 2322, file: 'pages/PageMain.ts', line: 3, column: 35 }),
      ]),
    );
  });

  it('compiles in-app page navigation for button handlers and hash links', async () => {
    const project = internallyNavigableProject();
    const mainPage = project.pages.find((page) => page.name === 'PageMain');
    const detailsPage = project.pages.find((page) => page.name === 'PageDetails');
    if (mainPage === undefined || detailsPage === undefined)
      throw new Error('Expected the compiled page routes.');
    const userSources = {
      'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';

export class PageMain extends PageMainGenerated {
  public BTNMostrarClick(): void {
    Navigate('PageDetails');
  }
}
`,
      'pages/PageDetails.ts': `import { PageDetailsGenerated } from './PageDetails.generated';

export class PageDetails extends PageDetailsGenerated {
  public PageDetailsCreate(): void {
    this.element.dataset.pageDetailsCreated = 'true';
  }
}
`,
    };
    const graph = createVirtualSourceGraph(
      project,
      userSources,
      defaultComponentRegistry,
      GENERATED_APP_CSS,
    );
    const entrySource = graph.sources.get(graph.entryPath);
    if (entrySource === undefined) throw new Error('Expected the compiler entry source.');

    expect(entrySource).toContain("import { PageDetails } from './pages/PageDetails';");
    expect(entrySource).toContain('WebPageRouter');
    expect(entrySource).toContain(`id: ${JSON.stringify(detailsPage.id)}`);

    const result = await compileProjectToMemory(project, { userSources });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const application = result.files['assets/app.js'] ?? '';
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    dom.window.eval(application);
    const button = dom.window.document.querySelector('[data-webrad-id="button-show"]');
    expect(button).toBeInstanceOf(dom.window.HTMLButtonElement);
    if (!(button instanceof dom.window.HTMLButtonElement)) {
      throw new TypeError('Compiled navigation button did not render.');
    }
    button.click();
    expect(dom.window.location.hash).toBe('#/PageDetails');
    expect(dom.window.document.querySelector(`[data-webrad-page-id="${mainPage.id}"]`)).toBeNull();
    const detailsElement = dom.window.document.querySelector<HTMLElement>(
      `[data-webrad-page-id="${detailsPage.id}"]`,
    );
    expect(detailsElement?.dataset.pageDetailsCreated).toBe('true');
    await new Promise<void>((resolve) => {
      dom.window.addEventListener('hashchange', () => resolve(), { once: true });
      dom.window.location.hash = '';
    });
    expect(
      dom.window.document.querySelector(`[data-webrad-page-id="${mainPage.id}"]`),
    ).not.toBeNull();
    dom.window.close();

    const linkedDom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/#/PageDetails',
    });
    Object.defineProperties(linkedDom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    expect(() => linkedDom.window.eval(application)).not.toThrow();
    expect(
      linkedDom.window.document.querySelector<HTMLElement>(
        `[data-webrad-page-id="${detailsPage.id}"]`,
      )?.dataset.pageDetailsCreated,
    ).toBe('true');
    linkedDom.window.close();
  });

  it('compiles an API Client without configured endpoints', async () => {
    const project = executableProject();
    const configuration: ApiClientConfiguration = {
      ...createDefaultApiClientConfiguration(),
      operations: [],
    };
    const configuredProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === 'api-client'
            ? { ...component, props: { ...component.props, apiClientConfig: configuration } }
            : component,
        ),
      })),
    };
    const result = await compileProjectToMemory(configuredProject, { userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  });

  it('accepts a registered, typed API Client response contract', async () => {
    const project = executableProject();
    const configuration = customersApiClientConfiguration();
    const configuredProject: WebRadProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === 'api-client'
            ? {
                ...component,
                props: { ...component.props, apiClientConfig: configuration },
              }
            : component,
        ),
      })),
    };

    const result = await compileProjectToMemory(configuredProject, { userSources: {} });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['assets/app.js']).toContain('LoadCustomers');
    expect(result.files['assets/app.js']).toContain('customer-name');
  });

  it('requires enabled RestGo integration for a session-bound API Client', async () => {
    const project = executableProject();
    const configuration: ApiClientConfiguration = {
      ...customersApiClientConfiguration(),
      connection: 'restgo-session',
    };
    const boundProject: WebRadProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === 'api-client'
            ? { ...component, props: { ...component.props, apiClientConfig: configuration } }
            : component,
        ),
      })),
    };

    const disabledResult = await compileProjectToMemory(boundProject, { userSources: {} });
    expect(disabledResult.success).toBe(false);
    expect(disabledResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'registry',
          category: 'error',
          message: 'Enable and configure the RestGo connection before binding an API Client.',
          path: ['pages', 0, 'components', 3, 'props', 'apiClientConfig', 'connection'],
        }),
      ]),
    );

    const invalidBaseResult = await compileProjectToMemory(
      {
        ...boundProject,
        settings: {
          ...boundProject.settings,
          restGo: { ...boundProject.settings.restGo, enabled: true, baseUrl: '' },
        },
      },
      { userSources: {} },
    );
    expect(invalidBaseResult.success).toBe(false);
    expect(invalidBaseResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'model',
          category: 'error',
          path: ['settings', 'restGo', 'baseUrl'],
        }),
      ]),
    );

    const enabledProject = updateProjectSettings(boundProject, {
      restGo: {
        ...project.settings.restGo,
        enabled: true,
        baseUrl: 'https://restgo.example.test/proxy/restgo',
      },
    });
    const enabledResult = await compileProjectToMemory(enabledProject, { userSources: {} });
    expect(enabledResult.success, JSON.stringify(enabledResult.diagnostics, null, 2)).toBe(true);
    expect(enabledResult.files['assets/app.js']).toContain('restgo-session');
    expect(enabledResult.files['assets/app.js']).toContain(
      'https://restgo.example.test/proxy/restgo',
    );
  });

  it('checks a RestGo-bound service inside a reusable definition', async () => {
    let project = createProject('RestGoReusable');
    let reusable = createReusableElement('CustomerService');
    reusable = addComponent(
      reusable,
      defaultComponentRegistry.createComponent('WebApiClient', {
        id: 'reusable-api-client',
        parentId: reusable.rootComponentId,
        props: {
          apiClientConfig: {
            ...createDefaultApiClientConfiguration(),
            connection: 'restgo-session',
          },
        },
      }),
      reusable.rootComponentId,
    );
    project = addReusableElement(project, reusable);

    const result = await compileProjectToMemory(project, { userSources: {} });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'registry',
          path: ['reusableElements', 0, 'components', 1, 'props', 'apiClientConfig', 'connection'],
        }),
      ]),
    );
  });

  it('generates a Data Grid bound to a selected API operation and response list', async () => {
    const result = await compileProjectToMemory(dataGridExecutableProject(), { userSources: {} });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['assets/app.js']).toContain('bindApiClient');
    expect(result.files['assets/app.js']).toContain('wr-data-grid-content');
  });

  it('rejects a Data Grid list binding that is not present in the selected API contract', async () => {
    const project = dataGridExecutableProject();
    const invalidProject: WebRadProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === 'data-grid'
            ? {
                ...component,
                props: {
                  ...component.props,
                  dataGridConfig: {
                    ...(component.props.dataGridConfig as object),
                    listPath: '/missing',
                  },
                },
              }
            : component,
        ),
      })),
    };

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'WebDataGrid listPath must reference a saved list response field.',
        }),
      ]),
    );
  });

  it('validates, typechecks and writes an ordinary browser application', async () => {
    const outputDirectory = await temporaryDirectory();
    const sourceProject = executableProject();
    const project = updateProjectSettings(sourceProject, {
      applicationName: 'Hello & <WebRAD>',
      applicationDescription: 'A customer <portal> & workspace.',
      locale: 'en-US',
      applicationIcon: {
        fileName: 'hello.svg',
        mediaType: 'image/svg+xml',
        dataUrl:
          'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
      },
      seo: {
        canonicalUrl: 'https://portal.example.test/?source=web&campaign=launch',
        keywords: 'customer portal, support & accounts',
        allowIndexing: false,
        socialTitle: 'Portal & <Share>',
        socialDescription: 'Manage <accounts> & support.',
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
            production: 'https://api.production.example.test',
          },
        },
      ],
      scrollbar: {
        ...sourceProject.settings.scrollbar,
        width: 16,
        height: 14,
        trackColor: '#0f172a',
        thumbColor: '#34d399',
        thumbHoverColor: '#10b981',
        thumbActiveColor: '#059669',
      },
    });
    const originalUserSource = `import { PageMainGenerated } from './PageMain.generated';

export class PageMain extends PageMainGenerated {
  public PageMainCreate(): void {
    this.EDTNome.value = 'Ada';
    this.EDTNome.x = 36;
    const configuredBaseUrl = this.ApiClient1.baseUrl;
    this.ApiClient1.baseUrl = \`\${configuredBaseUrl}/v1\`;
    this.element.dataset.runtimeContract = JSON.stringify({
      editId: this.EDTNome.id,
      editName: this.EDTNome.name,
      editValue: this.EDTNome.value,
      editX: this.EDTNome.x,
      editWidth: this.EDTNome.width,
      buttonCaption: this.BTNMostrar.caption,
      apiId: this.ApiClient1.id,
      apiName: this.ApiClient1.name,
      apiBaseUrl: this.ApiClient1.baseUrl,
      environmentBaseUrl: Env.API_BASE_URL,
    });
  }

  public async BTNMostrarClick(): Promise<void> {
    Message(\`Olá \${this.EDTNome.value}\`);
  }
}
`;
    const userSources = { 'pages/PageMain.ts': originalUserSource };

    const result = await compileProject(project, { outputDirectory, userSources });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['index.html']).toContain('./assets/app.js');
    expect(result.files['index.html']).toContain(
      '<html lang="en-US" data-webrad-time-zone="America/Sao_Paulo">',
    );
    expect(result.files['index.html']).toContain('<title>Hello &amp; &lt;WebRAD&gt;</title>');
    expect(result.files['index.html']).toContain(
      '<link rel="icon" type="image/svg+xml" href="./assets/icons/application.svg" />',
    );
    expect(result.files['index.html']).toContain(
      '<meta name="description" content="A customer &lt;portal&gt; &amp; workspace." />',
    );
    expect(result.files['index.html']).toContain(
      '<link rel="canonical" href="https://portal.example.test/?source=web&amp;campaign=launch" />',
    );
    expect(result.files['index.html']).toContain(
      '<meta name="keywords" content="customer portal, support &amp; accounts" />',
    );
    expect(result.files['index.html']).toContain(
      '<meta name="robots" content="noindex, nofollow" />',
    );
    expect(result.files['index.html']).toContain(
      '<meta property="og:title" content="Portal &amp; &lt;Share&gt;" />',
    );
    expect(result.files['index.html']).toContain(
      '<meta property="og:image" content="./assets/images/social-share.png" />',
    );
    expect(result.files['index.html']).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    );
    expect(result.files['assets/app.js']).toContain('BTNMostrarClick');
    expect(result.files['assets/app.js']).toContain('https://api.example.test');
    expect(result.files['assets/app.js']).toContain('https://api.production.example.test');
    expect(result.files['assets/app.js']).toContain('api-client');
    expect(result.files['assets/app.css']).toContain('.wr-webpage');
    expect(result.files['assets/app.css']).toContain('.wr-webbutton:hover:not(:disabled)');
    expect(result.files['assets/app.css']).toContain('--wr-scrollbar-width: 16px');
    expect(result.files['assets/app.css']).toContain('--wr-scrollbar-height: 14px');
    expect(result.files['assets/app.css']).toContain('--wr-scrollbar-track-color: #0f172a');
    expect(result.files['assets/app.css']).toContain('--wr-scrollbar-thumb-color: #34d399');
    expect(result.files['assets/app.css']).toContain('*::-webkit-scrollbar-thumb:hover');
    expect(result.files['assets/app.css']).toContain('@supports (-moz-appearance: none)');
    expect(result.previewHtml).toContain('<script>');
    expect(result.previewHtml).toContain('<style>');
    expect(result.previewHtml).toContain('--wr-scrollbar-width: 16px');
    expect(result.previewHtml).toContain('data:image/svg+xml;base64,');
    expect(result.previewHtml).toContain('data:image/png;base64,');
    expect(result.previewHtml).toContain(
      '<meta property="og:title" content="Portal &amp; &lt;Share&gt;" />',
    );
    expect(result.previewHtml).toContain(
      '<html lang="en-US" data-webrad-time-zone="America/Sao_Paulo">',
    );
    await expect(fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8')).resolves.toContain(
      '<!doctype html>',
    );
    await expect(
      fs.readFile(path.join(outputDirectory, 'assets', 'app.js'), 'utf8'),
    ).resolves.toContain('mountPage');
    await expect(
      fs.readFile(path.join(outputDirectory, 'assets', 'icons', 'application.svg'), 'utf8'),
    ).resolves.toContain('<svg');
    await expect(
      fs.stat(path.join(outputDirectory, 'assets', 'images', 'social-share.png')),
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(fs.stat(path.join(outputDirectory, 'pages', 'PageMain.ts'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
    expect(userSources['pages/PageMain.ts']).toBe(originalUserSource);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    expect(() => dom.window.eval(result.files['assets/app.js'] ?? '')).not.toThrow();
    expect(dom.window.document.querySelector('[data-webrad-id="api-client"]')).toBeNull();
    const mountedPage = dom.window.document.querySelector<HTMLElement>('[data-webrad-page-id]');
    expect(mountedPage).not.toBeNull();
    const serializedContract = mountedPage?.dataset.runtimeContract;
    expect(serializedContract).toBeDefined();
    expect(JSON.parse(serializedContract ?? '{}') as unknown).toEqual({
      editId: 'edit-name',
      editName: 'EDTNome',
      editValue: 'Ada',
      editX: 36,
      editWidth: 160,
      buttonCaption: 'Button',
      apiId: 'api-client',
      apiName: 'ApiClient1',
      apiBaseUrl: 'https://api.example.test/v1',
      environmentBaseUrl: 'https://api.production.example.test',
    });
    const editElement = dom.window.document.querySelector('[data-webrad-id="edit-name"]');
    expect(editElement).toBeInstanceOf(dom.window.HTMLInputElement);
    if (!(editElement instanceof dom.window.HTMLInputElement)) {
      throw new TypeError('Compiled WebEdit did not render an input element.');
    }
    expect(editElement.value).toBe('Ada');
    expect(editElement.style.left).toBe('36px');
    dom.window.close();
  });

  it('embeds the same browser-safe component stylesheet used by the designer projection', async () => {
    expect(GENERATED_APP_CSS).toContain(WEBRAD_COMPONENT_CSS);
    expect(GENERATED_APP_CSS).toContain('--wr-control-surface: #f5f7fa');
    const css = await compileGeneratedAppStyles([]);
    expect(css).toContain(
      `--wr-scrollbar-thumb-color: ${DEFAULT_PROJECT_SCROLLBAR_STYLE.thumbColor}`,
    );
    expect(css).toContain('--wr-scrollbar-width: 10px');
  });

  it('compiles structured states, animations and safe arbitrary values', async () => {
    const project = styledExecutableProject();
    const css = await compileTailwindStyles(project.styles);
    const candidates = collectTailwindCandidates(project.styles);

    expect(candidates).toEqual(
      expect.arrayContaining([
        '[&_[data-webrad-text-content]]:bg-[linear-gradient(to_right,#f59e0b,#ef4444)]',
        '[&_[data-webrad-text-content]]:bg-clip-text',
        '[&_[data-webrad-text-content]]:text-transparent',
        'border',
        'border-transparent',
        '[border-style:solid]',
        '[background:linear-gradient(to_bottom_right,#2563eb,#7c3aed)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
        'border-[4px]',
        'rounded-[40px]',
        'hover:[background:linear-gradient(to_top,#1d4ed8,#0f172a)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
        'focus:ring-[2px]',
        'focus:outline-[2px]',
        'active:scale-[0.95]',
        'disabled:opacity-[0.5]',
        'aria-disabled:opacity-[0.5]',
        'animate-pulse',
        '[animation-duration:750ms]!',
        '[animation-iteration-count:infinite]!',
      ]),
    );
    expect(css).toContain('border-color: transparent;');
    expect(css).toContain('border-radius: 40px;');
    expect(css).toContain(
      'background: linear-gradient(to bottom right,#2563eb,#7c3aed) padding-box,linear-gradient(to bottom,#22c55e,#06b6d4) border-box;',
    );
    expect(css).toContain(
      '.hover\\:\\[background\\:linear-gradient\\(to_top\\,\\#1d4ed8\\,\\#0f172a\\)_padding-box\\,linear-gradient\\(to_bottom\\,\\#22c55e\\,\\#06b6d4\\)_border-box\\]:hover',
    );
    expect(css).not.toContain('border-image:');
    expect(css).toContain('.disabled\\:opacity-\\[0\\.5\\]');
    expect(css).toContain('.aria-disabled\\:opacity-\\[0\\.5\\]');
    expect(css).toContain('.animate-pulse');
    expect(css).toContain('.tracking-\\[0\\.125rem\\]');
    expect(css).toContain('.\\[animation-duration\\:750ms\\]\\!');
    expect(css).not.toContain('.m-96');
    expect(css).not.toContain('::file-selector-button');
  });

  it('generates and compiles a real Tailwind rule for every metadata default', async () => {
    const styles = COMPONENT_STYLE_PROPERTY_DEFINITIONS.map((definition) =>
      createComponentStyle(
        `Default ${definition.label}`,
        definition.componentTypes?.[0] ?? 'WebButton',
        {
          idFactory: () => `style-${definition.name}`,
          states: { base: { [definition.name]: definition.defaultValue } },
        },
      ),
    );
    const candidates = COMPONENT_STYLE_PROPERTY_DEFINITIONS.flatMap((definition) => {
      const candidateExpression = resolveStylePropertyCandidate(
        definition.name,
        definition.defaultValue,
      );
      expect(candidateExpression, definition.name).toBeDefined();
      return tokenizeTailwindClasses(candidateExpression ?? '');
    });
    const css = await compileTailwindStyles(styles);
    const escapeClassName = (candidate: string): string =>
      candidate.replace(/([^a-zA-Z0-9_-])/gu, '\\$1');

    for (const candidate of candidates) {
      expect(css, candidate).toContain(`.${escapeClassName(candidate)}`);
    }
  });

  it('generates a real Tailwind rule for every value offered by the visual editor', async () => {
    const valuesFor = (
      definition: (typeof COMPONENT_STYLE_PROPERTY_DEFINITIONS)[number],
    ): readonly StylePropertyValue[] => {
      const { editor } = definition;
      switch (editor.kind) {
        case 'enum':
          return editor.options.map((option) => option.value);
        case 'color':
          return [...editor.keywords.map((option) => option.value), '#123456'];
        case 'gradient':
          return editor.directions.map(
            (direction) =>
              ({
                kind: 'linear',
                direction: direction.value as BackgroundGradientValue['direction'],
                from: '#123456',
                to: '#abcdef',
              }) satisfies BackgroundGradientValue,
          );
        case 'number':
          return [...new Set([editor.min, definition.defaultValue as number, editor.max])];
        case 'length': {
          const numericValue = editor.allowNegative === true ? -2 : Math.max(editor.min ?? 0, 2);
          return [
            ...(editor.keywords?.map((option) => option.value) ?? []),
            ...editor.units.map((unit) => ({ value: numericValue, unit }) as const),
          ];
        }
      }
    };
    const entries = COMPONENT_STYLE_PROPERTY_DEFINITIONS.flatMap((definition) =>
      valuesFor(definition).map((value, index) => ({ definition, value, index })),
    );
    const styles = entries.map(({ definition, value, index }) =>
      createComponentStyle(
        `Option ${definition.name} ${String(index)}`,
        definition.componentTypes?.[0] ?? 'WebButton',
        {
          idFactory: () => `style-${definition.name}-${String(index)}`,
          states: { base: { [definition.name]: value } },
        },
      ),
    );
    const candidates = entries.flatMap(({ definition, value }) => {
      const candidateExpression = resolveStylePropertyCandidate(definition.name, value);
      expect(candidateExpression, `${definition.name}: ${JSON.stringify(value)}`).toBeDefined();
      return tokenizeTailwindClasses(candidateExpression ?? '');
    });
    const css = await compileTailwindStyles(styles);
    const escapeClassName = (candidate: string): string =>
      candidate.replace(/([^a-zA-Z0-9_-])/gu, '\\$1');

    for (const candidate of candidates) {
      expect(css, candidate).toContain(`.${escapeClassName(candidate)}`);
    }
  });

  it('ships static Tailwind CSS and applies the selected style in the compiled browser app', async () => {
    const result = await compileProjectToMemory(styledExecutableProject(), { userSources: {} });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const css = result.files['assets/app.css'] ?? '';
    expect(css).toContain('@layer theme, base, components, utilities');
    expect(css).toContain('@layer components');
    expect(css).toContain('@layer utilities');
    expect(css).toContain('.wr-webbutton');
    expect(css).toContain(
      '.\\[background\\:linear-gradient\\(to_bottom_right\\,\\#2563eb\\,\\#7c3aed\\)_padding-box\\,linear-gradient\\(to_bottom\\,\\#22c55e\\,\\#06b6d4\\)_border-box\\]',
    );
    expect(result.files['assets/app.js']).not.toContain('@tailwindcss');

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const button = dom.window.document.querySelector<HTMLElement>('[data-webrad-id="button-show"]');
    expect(button).not.toBeNull();
    expect([...(button?.classList ?? [])]).toEqual(
      expect.arrayContaining([
        '[&_[data-webrad-text-content]]:bg-[linear-gradient(to_right,#f59e0b,#ef4444)]',
        'border-[4px]',
        'rounded-[40px]',
        '[background:linear-gradient(to_bottom_right,#2563eb,#7c3aed)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
        'hover:[background:linear-gradient(to_top,#1d4ed8,#0f172a)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
        'disabled:opacity-[0.5]',
        'animate-pulse',
      ]),
    );
    dom.window.close();
  });

  it('preserves an empty style binding and lets it own paint properties', async () => {
    const project = executableProject();
    const emptyStyle = createComponentStyle('Empty Page', 'WebPage', {
      idFactory: () => 'style-empty-page',
    });
    const withStyle = addComponentStyle(project, emptyStyle);
    const assigned = setComponentStyle(
      withStyle,
      withStyle.pages[0]!.id,
      withStyle.pages[0]!.rootComponentId,
      emptyStyle.id,
    );
    const painted: WebRadProject = {
      ...assigned,
      pages: assigned.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === page.rootComponentId
            ? {
                ...component,
                props: { ...component.props, backgroundColor: 'rgb(255, 0, 0)' },
              }
            : component,
        ),
      })),
    };

    const result = await compileProjectToMemory(painted, { userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['assets/app.js']).toMatch(/"styleClassName":\s*""/u);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const page = dom.window.document.querySelector<HTMLElement>('[data-webrad-page-id]');
    expect(page?.style.backgroundColor).toBe('');
    dom.window.close();
  });

  it('returns structured TypeScript diagnostics without writing a broken build', async () => {
    const outputDirectory = await temporaryDirectory();
    const result = await compileProject(executableProject(), {
      outputDirectory,
      userSources: {
        'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  broken: MissingType;
}
`,
      },
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        category: 'error',
        source: 'typescript',
        file: 'pages/PageMain.ts',
      }),
    );
    await expect(fs.stat(path.join(outputDirectory, 'index.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('supports a no-write memory build for Preview', async () => {
    const outputDirectory = path.join(await temporaryDirectory(), 'memory-output');
    const result = await compileProjectToMemory(executableProject(), {
      outputDirectory,
      userSources: {},
    });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.previewHtml).toContain('webradPageId');
    await expect(fs.stat(outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects component names that collide with the generated page runtime API', async () => {
    const project = executableProject();
    const invalidProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === 'api-client' ? { ...component, name: 'show' } : component,
        ),
      })),
    };

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        source: 'model',
        message: expect.stringContaining('runtime API'),
      }),
    );
  });

  it('rejects unknown or incorrectly typed component properties', async () => {
    let sequence = 0;
    const project = createProject('BrokenProps', () => `broken-${String((sequence += 1))}`);
    const page = project.pages[0]!;
    const root = page.components[0]!;
    const invalidProject = {
      ...project,
      pages: [
        {
          ...page,
          components: [
            {
              ...root,
              props: { ...root.props, visible: 'yes', mysteryProperty: true },
            },
          ],
        },
      ],
    };

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('visible'))).toBe(
      true,
    );
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('mysteryProperty')),
    ).toBe(true);
  });

  it('accepts a styled Popup container and serializes its visual children into the runtime document model', async () => {
    const project = executableProject();
    const page = project.pages[0];
    if (page === undefined) throw new Error('Expected an initial page.');
    const popup = defaultComponentRegistry.createComponent('WebPopup', {
      id: 'popup-dialog',
      name: 'Popup1',
      parentId: page.rootComponentId,
    });
    const withPopup = updatePage(project, page.id, addComponent(page, popup, page.rootComponentId));
    const popupPage = withPopup.pages.find((candidate) => candidate.id === page.id);
    if (popupPage === undefined) throw new Error('Expected the Popup page.');
    const popupButton = defaultComponentRegistry.createComponent('WebButton', {
      id: 'popup-confirm-button',
      name: 'BTNConfirmar',
      parentId: popup.id,
      x: 24,
      y: 96,
      props: { caption: 'Confirmar' },
    });
    const withPopupChild = updatePage(
      withPopup,
      popupPage.id,
      addComponent(popupPage, popupButton, popup.id),
    );
    const popupStyle = createComponentStyle('Confirm Surface', 'WebPopup', {
      idFactory: () => 'popup-style',
      states: { base: { backgroundColor: '#0f172a', textColor: '#f8fafc' } },
    });
    const withStyle = addComponentStyle(withPopupChild, popupStyle);
    const assigned = setComponentStyle(withStyle, page.id, popup.id, popupStyle.id);

    const graph = createVirtualSourceGraph(
      assigned,
      {},
      defaultComponentRegistry,
      GENERATED_APP_CSS,
    );
    const entrySource = graph.sources.get(graph.entryPath);
    if (entrySource === undefined) throw new Error('Expected the compiler entry source.');

    const result = await compileProjectToMemory(assigned, { userSources: {} });

    expect(graph.diagnostics).toEqual([]);
    expect(entrySource).toContain('"id":"popup-dialog"');
    expect(entrySource).toContain('"children":["popup-confirm-button"]');
    expect(entrySource).toContain('"parentId":"popup-dialog"');
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['assets/app.js']).toContain('"type": "WebPopup"');
    expect(result.files['assets/app.js']).toContain('bg-[#0f172a]');
  });

  it('rejects styles that target unknown or nonvisual registry entries', async () => {
    const project = executableProject();
    const unknown = createComponentStyle('Unknown Style', 'MissingControl', {
      idFactory: () => 'style-unknown',
    });
    const nonvisual = createComponentStyle('API Style', 'WebApiClient', {
      idFactory: () => 'style-api',
    });
    const invalidProject = addComponentStyle(addComponentStyle(project, unknown), nonvisual);

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'registry',
          message: expect.stringContaining('unknown component type'),
          path: ['styles', project.styles.length, 'componentType'],
        }),
        expect.objectContaining({
          source: 'registry',
          message: expect.stringContaining('nonvisual component type'),
          path: ['styles', project.styles.length + 1, 'componentType'],
        }),
      ]),
    );
  });
});
