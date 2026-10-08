import { ModelUpdateError, ProjectModelError } from './errors.js';
import { bindStyleColorsToPalette } from './color-palette.js';
import {
  DEFAULT_PROJECT_COLOR_PALETTE,
  COMPONENT_STYLE_STATE_NAMES,
  type ProjectPaletteColor,
} from './types.js';
import {
  applyDefaultComponentStyle,
  defaultComponentStyleId,
  DEFAULT_COMPONENT_STYLE_DEFINITIONS,
} from './default-styles.js';
import { assertValidProjectName, assertValidTypeScriptIdentifier } from './naming.js';
import {
  parseComponentStyle,
  parsePage,
  parseProject,
  parseProjectManifest,
  parseReusableElement,
} from './schemas.js';
import {
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  createDefaultComponentLayout,
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
  DEFAULT_PROJECT_SETTINGS,
  EMPTY_COMPONENT_STYLE_PROPERTIES,
  type ComponentNode,
  type ComponentStyleModel,
  type ComponentStyleProperties,
  type ComponentStylePreset,
  type ComponentStyleStateName,
  type PageDescriptor,
  type PageModel,
  type ReusableElementModel,
  type IdFactory,
  type ProjectManifest,
  type ProjectSettings,
  type WebRadProject,
} from './types.js';

export const defaultIdFactory: IdFactory = () => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new ProjectModelError('crypto.randomUUID() is required to create stable model IDs.');
  }
  return globalThis.crypto.randomUUID();
};

function resolveFactory(
  options: { readonly idFactory?: IdFactory } | IdFactory | undefined,
): IdFactory {
  return typeof options === 'function' ? options : (options?.idFactory ?? defaultIdFactory);
}

export interface CreateComponentStyleOptions {
  readonly idFactory?: IdFactory;
  readonly preset?: ComponentStylePreset;
  readonly states?: Partial<Readonly<Record<ComponentStyleStateName, ComponentStyleProperties>>>;
}

/** Creates an unbound reusable style with a stable identity. */
export function createComponentStyle(
  name: string,
  componentType: string,
  options: CreateComponentStyleOptions | IdFactory = {},
): ComponentStyleModel {
  assertValidTypeScriptIdentifier(componentType);
  const states = typeof options === 'function' ? undefined : options.states;
  const preset = typeof options === 'function' ? undefined : options.preset;
  return parseComponentStyle({
    id: resolveFactory(options)(),
    name,
    componentType,
    ...(preset === undefined ? {} : { preset }),
    states: {
      base: { ...EMPTY_COMPONENT_STYLE_PROPERTIES, ...states?.base },
      hover: { ...EMPTY_COMPONENT_STYLE_PROPERTIES, ...states?.hover },
      focus: { ...EMPTY_COMPONENT_STYLE_PROPERTIES, ...states?.focus },
      active: { ...EMPTY_COMPONENT_STYLE_PROPERTIES, ...states?.active },
      disabled: { ...EMPTY_COMPONENT_STYLE_PROPERTIES, ...states?.disabled },
    },
  });
}

/** Creates the protected visual library seeded into every new project. */
export function createDefaultComponentStyles(
  projectId: string,
  colors: readonly ProjectPaletteColor[] = DEFAULT_PROJECT_COLOR_PALETTE,
): readonly ComponentStyleModel[] {
  return DEFAULT_COMPONENT_STYLE_DEFINITIONS.map((definition) =>
    createComponentStyle(definition.name, definition.componentType, {
      idFactory: () => defaultComponentStyleId(projectId, definition.componentType),
      preset: 'default',
      states: Object.fromEntries(
        COMPONENT_STYLE_STATE_NAMES.map((state) => [
          state,
          bindStyleColorsToPalette(
            (
              definition.states as Partial<
                Record<ComponentStyleStateName, ComponentStyleProperties>
              >
            )[state] ?? {},
            colors,
          ),
        ]),
      ),
    }),
  );
}

export interface CreateDefaultRootOptions {
  readonly idFactory?: IdFactory;
  readonly caption?: string;
  readonly width?: number;
  readonly height?: number;
}

export function createDefaultRoot(
  name: string,
  options: CreateDefaultRootOptions | IdFactory = {},
): ComponentNode {
  assertValidTypeScriptIdentifier(name);
  const width =
    typeof options === 'function' ? DEFAULT_PAGE_WIDTH : (options.width ?? DEFAULT_PAGE_WIDTH);
  const height =
    typeof options === 'function' ? DEFAULT_PAGE_HEIGHT : (options.height ?? DEFAULT_PAGE_HEIGHT);
  const caption = typeof options === 'function' ? name : (options.caption ?? name);

  return {
    id: resolveFactory(options)(),
    type: 'WebPage',
    name,
    parentId: null,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width, height },
    props: {
      caption,
      visible: true,
      enabled: true,
      backgroundColor: '#ffffff',
    },
    events: {
      OnCreate: null,
      OnShow: null,
      OnHide: null,
      OnResize: null,
    },
    children: [],
  };
}

export type CreatePageOptions = CreateDefaultRootOptions;

export function createPage(
  name = 'PageMain',
  options: CreatePageOptions | IdFactory = {},
): PageModel {
  assertValidTypeScriptIdentifier(name);
  const idFactory = resolveFactory(options);
  const width =
    typeof options === 'function' ? DEFAULT_PAGE_WIDTH : (options.width ?? DEFAULT_PAGE_WIDTH);
  const height =
    typeof options === 'function' ? DEFAULT_PAGE_HEIGHT : (options.height ?? DEFAULT_PAGE_HEIGHT);
  const caption = typeof options === 'function' ? name : (options.caption ?? name);
  const pageId = idFactory();
  const root = createDefaultRoot(name, { idFactory, caption, width, height });

  return parsePage({
    formatVersion: CURRENT_PAGE_FORMAT_VERSION,
    id: pageId,
    name,
    caption,
    width,
    height,
    components: [root],
    rootComponentId: root.id,
  });
}

export type CreateReusableElementOptions = CreateDefaultRootOptions;

/**
 * Creates a page-shaped reusable definition. Its WebPanel root makes
 * it safe to mount inside another page without inheriting page lifecycle or
 * viewport ownership semantics.
 */
export function createReusableElement(
  name = 'ReusableElement',
  options: CreateReusableElementOptions | IdFactory = {},
): ReusableElementModel {
  assertValidTypeScriptIdentifier(name);
  const idFactory = resolveFactory(options);
  const width = typeof options === 'function' ? 360 : (options.width ?? 360);
  const height = typeof options === 'function' ? 240 : (options.height ?? 240);
  const caption = typeof options === 'function' ? name : (options.caption ?? name);
  const reusableId = idFactory();
  const root: ComponentNode = {
    id: idFactory(),
    type: 'WebPanel',
    name,
    parentId: null,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width, height },
    props: {
      caption,
      visible: true,
      enabled: true,
      backgroundColor: 'transparent',
      borderColor: '#808080',
    },
    events: {
      OnClick: null,
      OnDblClick: null,
      OnMouseEnter: null,
      OnMouseLeave: null,
    },
    children: [],
  };

  return parseReusableElement({
    formatVersion: CURRENT_PAGE_FORMAT_VERSION,
    id: reusableId,
    name,
    caption,
    width,
    height,
    components: [root],
    rootComponentId: root.id,
  });
}

export interface CreateProjectOptions {
  readonly idFactory?: IdFactory;
  readonly pageName?: string;
  readonly pageCaption?: string;
  readonly pageWidth?: number;
  readonly pageHeight?: number;
  readonly settings?: Partial<ProjectSettings>;
}

export function createProject(
  name = 'Project1',
  options: CreateProjectOptions | IdFactory = {},
): WebRadProject {
  assertValidProjectName(name);
  const idFactory = resolveFactory(options);
  const projectId = idFactory();
  const page = createPage(
    typeof options === 'function' ? 'PageMain' : (options.pageName ?? 'PageMain'),
    {
      idFactory,
      caption: typeof options === 'function' ? undefined : options.pageCaption,
      width: typeof options === 'function' ? undefined : options.pageWidth,
      height: typeof options === 'function' ? undefined : options.pageHeight,
    },
  );
  const settings = {
    ...DEFAULT_PROJECT_SETTINGS,
    applicationName: name,
    ...(typeof options === 'function' ? {} : options.settings),
  };
  const styles = createDefaultComponentStyles(projectId, settings.colorPalette);
  const styledPage = parsePage({
    ...page,
    components: page.components.map((component) =>
      component.id === page.rootComponentId
        ? applyDefaultComponentStyle(component, styles)
        : component,
    ),
  });

  return parseProject({
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    id: projectId,
    name,
    entryPage: page.id,
    pages: [styledPage],
    reusableElements: [],
    styles,
    settings,
  });
}

export function createPageDescriptor(page: PageModel): PageDescriptor {
  const parsed = parsePage(page);
  const basePath = `pages/${parsed.name}`;
  return {
    id: parsed.id,
    name: parsed.name,
    pageFile: `${basePath}.wrpage`,
    generatedFile: `${basePath}.generated.ts`,
    codeFile: `${basePath}.ts`,
  };
}

export function projectToManifest(project: WebRadProject): ProjectManifest {
  const parsed = parseProject(project);
  return parseProjectManifest({
    formatVersion: parsed.formatVersion,
    id: parsed.id,
    name: parsed.name,
    entryPage: parsed.entryPage,
    pages: parsed.pages.map(createPageDescriptor),
    reusableElements: parsed.reusableElements,
    styles: parsed.styles,
    settings: parsed.settings,
  });
}

/** Reassembles the in-memory source-of-truth aggregate from a manifest and page files. */
export function assembleProject(
  manifestInput: ProjectManifest,
  pageDocuments: Iterable<PageModel>,
): WebRadProject {
  const manifest = parseProjectManifest(manifestInput);
  const pagesById = new Map<string, PageModel>();

  for (const input of pageDocuments) {
    const page = parsePage(input);
    if (pagesById.has(page.id)) {
      throw new ModelUpdateError(`Page ID "${page.id}" was supplied more than once.`);
    }
    pagesById.set(page.id, page);
  }

  const pages = manifest.pages.map((descriptor) => {
    const page = pagesById.get(descriptor.id);
    if (page === undefined) {
      throw new ModelUpdateError(`Missing page document for descriptor "${descriptor.name}".`);
    }
    if (page.name !== descriptor.name) {
      throw new ModelUpdateError(
        `Page descriptor name "${descriptor.name}" does not match document name "${page.name}".`,
      );
    }
    pagesById.delete(descriptor.id);
    return page;
  });

  if (pagesById.size > 0) {
    throw new ModelUpdateError(
      'One or more page documents are not listed in the project manifest.',
    );
  }

  return parseProject({
    formatVersion: manifest.formatVersion,
    id: manifest.id,
    name: manifest.name,
    entryPage: manifest.entryPage,
    pages,
    reusableElements: manifest.reusableElements,
    styles: manifest.styles,
    settings: manifest.settings,
  });
}

export const createWebRadProject = createProject;
export const createPageModel = createPage;
export const createReusableElementModel = createReusableElement;
export const toProjectManifest = projectToManifest;
