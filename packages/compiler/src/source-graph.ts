import pdfSources from './pdf-lib-sources.generated.json';
import shakaSources from './shaka-sources.generated.json';
import path from 'node:path';

import type { ComponentRegistry } from '@webrad/component-registry';
import {
  pageClassName,
  resolveMenuDocument,
  menuSourcePath,
  projectThemeRuntimeConfiguration,
  type PageModel,
  type WebRadProject,
} from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime/visual';
import {
  createUserPageSource,
  componentReferenceScope,
  type ComponentReferenceScope,
  createUserReusableElementSource,
  generateEnvironmentTypings,
  generatePageSource,
  generateReusableElementSource,
  createUserMenuSource,
  generateMenuSource,
} from '@webrad/language';

import runtimeSources from './runtime-sources.json';
import restGoSources from './restgo-sources.json';
import type { CompileDiagnostic } from './types.js';
import {
  selectApplicationSources,
  selectedComponentTypes,
  usesRestGo,
  usesRuntimeGlobal,
} from './runtime-selection.js';

export const VIRTUAL_ROOT = path.resolve(process.cwd(), '.webrad-compiler-virtual');
export const RUNTIME_ENTRY_PATH = virtualAbsolutePath('__runtime/index.ts');
export const RESTGO_ENTRY_PATH = virtualAbsolutePath('__restgo/index.ts');

export interface VirtualSourceGraph {
  readonly sources: ReadonlyMap<string, string>;
  readonly componentScopes: ReadonlyMap<string, ComponentReferenceScope>;
  readonly entryPath: string;
  readonly stylePath: string;
  readonly diagnostics: readonly CompileDiagnostic[];
  readonly componentTypes: ReadonlySet<string>;
}

function hasDrivePrefix(value: string): boolean {
  return value.length >= 2 && value[1] === ':';
}

export function normalizeUserSourcePath(sourcePath: string): string | undefined {
  const portable = sourcePath.replaceAll('\\', '/');
  if (
    portable.length === 0 ||
    portable.includes('\0') ||
    portable.startsWith('/') ||
    hasDrivePrefix(portable)
  ) {
    return undefined;
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === '..' || normalized.startsWith('../') || normalized === '.') return undefined;
  return normalized;
}

export function virtualAbsolutePath(portablePath: string): string {
  return path.resolve(VIRTUAL_ROOT, ...portablePath.split('/'));
}

function isReservedSourcePath(sourcePath: string): boolean {
  const normalized = sourcePath.toLocaleLowerCase();
  return (
    normalized === '__vendor' ||
    normalized.startsWith('__vendor/') ||
    normalized === '__runtime' ||
    normalized.startsWith('__runtime/') ||
    normalized === '__restgo' ||
    normalized.startsWith('__restgo/') ||
    [
      'entry.ts',
      'theme-bootstrap.ts',
      'app.css',
      'webrad-globals.d.ts',
      'webrad-environment.d.ts',
      'styles.d.ts',
    ].includes(normalized)
  );
}

function pageSourcePath(page: PageModel): string {
  return `pages/${page.name}.ts`;
}

function generatedSourcePath(page: PageModel): string {
  return `pages/${page.name}.generated.ts`;
}

function reusableSourcePath(reusableElement: PageModel): string {
  return `reusables/${reusableElement.name}.ts`;
}

function reusableGeneratedSourcePath(reusableElement: PageModel): string {
  return `reusables/${reusableElement.name}.generated.ts`;
}

function createGlobalTypings(): string {
  return `import type {
  Confirm as RuntimeConfirm,
  Message as RuntimeMessage,
  Navigate as RuntimeNavigate,
  RestGO as RuntimeRestGO,
  Theme as RuntimeTheme,
} from '@webrad/runtime';

declare global {
  const Message: typeof RuntimeMessage;
  const Confirm: typeof RuntimeConfirm;
  const Navigate: typeof RuntimeNavigate;
  const RestGO: typeof RuntimeRestGO;
  const Theme: typeof RuntimeTheme;
}

export {};
`;
}

function runtimeDocumentModel(
  document: PageModel,
  styles: WebRadProject['styles'],
  registry: ComponentRegistry,
) {
  const visualIds = new Set(
    document.components
      .filter((component) => registry.require(component.type).visual)
      .map((component) => component.id),
  );
  const stylesById = new Map(styles.map((style) => [style.id, style]));
  return {
    ...document,
    components: document.components
      .filter((component) => visualIds.has(component.id))
      .map((component) => {
        const style =
          component.styleId === undefined ? undefined : stylesById.get(component.styleId);
        const styleClassName =
          style?.componentType === component.type ? resolveComponentStyleClassName(style) : '';
        return {
          ...component,
          children: component.children.filter((childId) => visualIds.has(childId)),
          ...(style === undefined ? {} : { styleClassName }),
        };
      }),
  };
}

function runtimePageModel(
  page: PageModel,
  styles: WebRadProject['styles'],
  registry: ComponentRegistry,
  reusableElements: WebRadProject['reusableElements'],
  menus: WebRadProject['menus'],
) {
  return {
    ...runtimeDocumentModel(resolveMenuDocument(page, menus), styles, registry),
    reusableElements: reusableElements.map((reusableElement) =>
      runtimeDocumentModel(resolveMenuDocument(reusableElement, menus), styles, registry),
    ),
  };
}

function createEntrySource(
  project: WebRadProject,
  registry: ComponentRegistry,
  restGo: boolean,
  componentTypes: ReadonlySet<string>,
  userSources: Readonly<Record<string, string>>,
): string {
  const entryPage = project.pages.find((page) => page.id === project.entryPage);
  if (entryPage === undefined) throw new Error('The validated project has no entry page.');
  const pageImports = project.pages
    .map(
      (page, index) =>
        `import { ${pageClassName(page.name)} as WebRadPage${String(index)} } from './pages/${page.name}';`,
    )
    .join('\n');
  const reusableImports = project.reusableElements
    .map(
      (reusableElement) =>
        `import { ${reusableElement.name} } from './reusables/${reusableElement.name}';`,
    )
    .join('\n');
  const reusableFactories = project.reusableElements
    .map(
      (reusableElement) =>
        `  [${JSON.stringify(reusableElement.id)}, (element: HTMLElement, instanceId: string, components: ReadonlyMap<string, WebComponent>, componentIds: ReadonlyMap<string, string>) => new ${reusableElement.name}(element, instanceId, components, componentIds)],`,
    )
    .join('\n');
  const routes = project.pages
    .map((page, index) => {
      const model = JSON.stringify(
        runtimePageModel(page, project.styles, registry, project.reusableElements, project.menus),
      );
      return `  {
    id: ${JSON.stringify(page.id)},
    name: ${JSON.stringify(page.name)},
    path: ${JSON.stringify(page.id === project.entryPage ? '/index' : `/${page.name.toLowerCase()}`)},
    model: ${model} as unknown as RuntimePageModel,
    createPage: (element: HTMLElement) => new WebRadPage${String(index)}(element),
    createReusableElements,
    menuFactories,
  }`;
    })
    .join(',\n');
  const environmentValues = Object.fromEntries(
    project.settings.environmentVariables.map((variable) => [
      variable.name,
      variable.values[project.settings.environment],
    ]),
  );
  const repeatingGroups = [...project.pages, ...project.reusableElements].some((document) =>
    document.components.some((component) => component.type === 'WebRepeatingGroup'),
  );
  const confirm = usesRuntimeGlobal(userSources, 'Confirm');
  const message = usesRuntimeGlobal(userSources, 'Message');
  return `import './theme-bootstrap';
import {
  ${confirm ? 'Confirm,' : ''}
  ${restGo ? 'configureRestGo,' : ''}
  ${message ? 'Message,' : ''}
  Navigate as RuntimeNavigate,
  ${restGo ? 'RestGO,' : ''}
  WebPageRouter,
  ${repeatingGroups ? 'setRepeatingGroupReusableFactory,' : ''}
} from '@webrad/runtime';
import type {
  MountedRuntimePage,
  NavigateOptions,
  RuntimePageModel,
  RuntimePageRoute,
  WebComponent,
  WebReusableElementInstance,
  RuntimeMenuFactory,
} from '@webrad/runtime';
${pageImports}
${reusableImports}
${(project.menus ?? []).map((menu, index) => `import { ${pageClassName(menu.name)} as WebRadMenu${String(index)} } from './menus/${menu.name}';`).join('\n')}
import './app.css';
${componentTypes.has('WebVideoPlayer') ? "import 'shaka-player/dist/controls.css';" : ''}

type ReusableElementFactory = (
  element: HTMLElement,
  instanceId: string,
  components: ReadonlyMap<string, WebComponent>,
  componentIds: ReadonlyMap<string, string>,
) => WebReusableElementInstance;

const reusableElementFactories: ReadonlyMap<string, ReusableElementFactory> = new Map<string, ReusableElementFactory>([
${reusableFactories}
]);

const menuFactories: ReadonlyMap<string, RuntimeMenuFactory> = new Map<string, RuntimeMenuFactory>([
${(project.menus ?? []).map((menu, index) => `  [${JSON.stringify(menu.id)}, (element: HTMLElement) => new WebRadMenu${String(index)}(element)],`).join('\n')}
]);

${
  repeatingGroups
    ? `setRepeatingGroupReusableFactory((row) => {
  const instances = row.reusableInstances.flatMap((placement) => {
    const factory = reusableElementFactories.get(placement.reusableElementId);
    return factory === undefined ? [] : [factory(placement.element, placement.instanceId, row.components, placement.componentIds)];
  });
  return () => { for (const instance of instances) instance.dispose(); };
});`
    : ''
}

function createReusableElements(
  mounted: MountedRuntimePage,
): readonly WebReusableElementInstance[] {
  return mounted.reusableInstances.flatMap((instance) => {
    const factory = reusableElementFactories.get(instance.reusableElementId);
    return factory === undefined
      ? []
      : [factory(instance.element, instance.instanceId, mounted.components, instance.componentIds)];
  });
}

const routes: readonly RuntimePageRoute[] = [
${routes}
];
const Env = Object.freeze(${JSON.stringify(environmentValues)});
${restGo ? `configureRestGo(${JSON.stringify(project.settings.restGo)});` : ''}
const router = new WebPageRouter(routes, document.body, { mode: ${JSON.stringify(project.settings.routingMode)} });
const Navigate = (destination: string | URL, options: NavigateOptions = {}): void => {
  router.navigateBrowser(destination, options);
};

Object.assign(globalThis, { ${confirm ? 'Confirm,' : ''} ${message ? 'Message,' : ''} Navigate, Env${restGo ? ', RestGO' : ''} });
${restGo ? '' : `Object.defineProperty(globalThis, 'RestGO', { configurable: true, get: () => { throw new Error('Enable and configure RestGO in RestGo integration > Connection before using RestGO.'); } });`}
router.start(${JSON.stringify(entryPage.id)});
`;
}

export function createVirtualSourceGraph(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
  registry: ComponentRegistry,
  generatedAppCss: string,
): VirtualSourceGraph {
  const sources = new Map<string, string>();
  const diagnostics: CompileDiagnostic[] = [];
  const routePaths = new Set<string>();
  for (const page of project.pages) {
    const routePath = page.id === project.entryPage ? '/index' : '/' + page.name.toLowerCase();
    if (
      !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(routePath) ||
      routePath.split('/').some((part) => part === 'assets')
    ) {
      diagnostics.push({
        category: 'error',
        source: 'model',
        message:
          'Invalid automatic page route for ' +
          page.name +
          ': use / followed by letters, digits, hyphens, underscores and optional path segments; assets is reserved.',
      });
    } else if (routePaths.has(routePath)) {
      diagnostics.push({
        category: 'error',
        source: 'model',
        message: 'Duplicate automatic page route: ' + routePath,
      });
    } else routePaths.add(routePath);
  }

  sources.set(
    virtualAbsolutePath('__vendor/shaka/shaka-player.ui.d.ts'),
    shakaSources.declarations,
  );
  for (const [fileName, contents] of Object.entries(pdfSources.declarations))
    sources.set(virtualAbsolutePath('__vendor/pdf-lib/' + fileName), contents);
  for (const [fileName, contents] of Object.entries(pdfSources.standardFontDeclarations))
    sources.set(virtualAbsolutePath('__vendor/pdf-standard-fonts/' + fileName), contents);
  for (const [fileName, contents] of Object.entries(runtimeSources)) {
    sources.set(virtualAbsolutePath(`__runtime/${fileName}`), contents);
  }
  for (const [fileName, contents] of Object.entries(restGoSources)) {
    sources.set(virtualAbsolutePath(`__restgo/${fileName}`), contents);
  }

  for (const [sourcePath, contents] of Object.entries(userSources)) {
    const normalized = normalizeUserSourcePath(sourcePath);
    if (normalized === undefined) {
      diagnostics.push({
        category: 'error',
        source: 'compiler',
        message: `User source path "${sourcePath}" is not a safe relative path.`,
        file: sourcePath,
      });
      continue;
    }
    if (isReservedSourcePath(normalized)) {
      diagnostics.push({
        category: 'error',
        source: 'compiler',
        message: `User source path "${sourcePath}" is reserved for generated application or embedded library files.`,
        file: sourcePath,
      });
      continue;
    }
    if (normalized.endsWith('.generated.ts') || normalized.endsWith('.generated.d.ts')) {
      diagnostics.push({
        category: 'warning',
        source: 'compiler',
        message: `Ignored user content for generated file "${normalized}".`,
        file: normalized,
      });
      continue;
    }
    sources.set(virtualAbsolutePath(normalized), contents);
  }

  for (const page of project.pages) {
    const userPath = virtualAbsolutePath(pageSourcePath(page));
    if (!sources.has(userPath)) sources.set(userPath, createUserPageSource(page));
    sources.set(
      virtualAbsolutePath(generatedSourcePath(page)),
      generatePageSource(page, { registry, menus: project.menus }),
    );
  }

  for (const reusableElement of project.reusableElements) {
    const userPath = virtualAbsolutePath(reusableSourcePath(reusableElement));
    if (!sources.has(userPath)) {
      sources.set(userPath, createUserReusableElementSource(reusableElement));
    }
    sources.set(
      virtualAbsolutePath(reusableGeneratedSourcePath(reusableElement)),
      generateReusableElementSource(reusableElement, { registry, menus: project.menus }),
    );
  }

  for (const menu of project.menus ?? []) {
    const userPath = virtualAbsolutePath(menuSourcePath(menu));
    if (!sources.has(userPath)) sources.set(userPath, createUserMenuSource(menu));
    sources.set(virtualAbsolutePath(`menus/${menu.name}.generated.ts`), generateMenuSource(menu));
  }

  const entryPath = virtualAbsolutePath('entry.ts');
  const stylePath = virtualAbsolutePath('app.css');
  const selected = selectApplicationSources(project, userSources);
  const runtimeProject = selected.project;
  const componentTypes = selectedComponentTypes(selected, registry);
  sources.set(
    entryPath,
    createEntrySource(
      runtimeProject,
      registry,
      usesRestGo(runtimeProject, selected.userSources),
      componentTypes,
      selected.userSources,
    ),
  );
  sources.set(stylePath, generatedAppCss);
  sources.set(
    virtualAbsolutePath('theme-bootstrap.ts'),
    `import { Theme } from '@webrad/runtime';\nTheme.configure(${JSON.stringify(projectThemeRuntimeConfiguration(project.settings.themes, project.id))});\nObject.assign(globalThis, { Theme });\n`,
  );
  sources.set(virtualAbsolutePath('webrad-globals.d.ts'), createGlobalTypings());
  sources.set(
    virtualAbsolutePath('webrad-environment.d.ts'),
    generateEnvironmentTypings(project.settings.environmentVariables),
  );
  sources.set(virtualAbsolutePath('styles.d.ts'), `declare module '*.css';\n`);
  const componentScopes = new Map([
    ...(project.menus ?? []).map(
      (menu) => [virtualAbsolutePath(menuSourcePath(menu)), componentReferenceScope(menu)] as const,
    ),
    ...project.pages.map(
      (page) => [virtualAbsolutePath(pageSourcePath(page)), componentReferenceScope(page)] as const,
    ),
    ...project.reusableElements.map(
      (element) =>
        [
          virtualAbsolutePath(reusableSourcePath(element)),
          componentReferenceScope(element),
        ] as const,
    ),
  ]);
  return { sources, componentScopes, entryPath, stylePath, diagnostics, componentTypes };
}
