import path from 'node:path';

import type { ComponentRegistry } from '@webrad/component-registry';
import type { PageModel, WebRadProject } from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime/visual';
import {
  createUserPageSource,
  createUserReusableElementSource,
  generateEnvironmentTypings,
  generatePageSource,
  generateReusableElementSource,
} from '@webrad/language';

import runtimeSources from './runtime-sources.json';
import restGoSources from './restgo-sources.json';
import type { CompileDiagnostic } from './types.js';

export const VIRTUAL_ROOT = path.resolve(process.cwd(), '.webrad-compiler-virtual');
export const RUNTIME_ENTRY_PATH = virtualAbsolutePath('__runtime/index.ts');
export const RESTGO_ENTRY_PATH = virtualAbsolutePath('__restgo/index.ts');

export interface VirtualSourceGraph {
  readonly sources: ReadonlyMap<string, string>;
  readonly entryPath: string;
  readonly stylePath: string;
  readonly diagnostics: readonly CompileDiagnostic[];
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
    normalized === '__runtime' ||
    normalized.startsWith('__runtime/') ||
    normalized === '__restgo' ||
    normalized.startsWith('__restgo/') ||
    [
      'entry.ts',
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
} from '@webrad/runtime';

declare global {
  const Message: typeof RuntimeMessage;
  const Confirm: typeof RuntimeConfirm;
  const Navigate: typeof RuntimeNavigate;
  const RestGO: typeof RuntimeRestGO;
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
) {
  return {
    ...runtimeDocumentModel(page, styles, registry),
    reusableElements: reusableElements.map((reusableElement) =>
      runtimeDocumentModel(reusableElement, styles, registry),
    ),
  };
}

function createEntrySource(project: WebRadProject, registry: ComponentRegistry): string {
  const entryPage = project.pages.find((page) => page.id === project.entryPage);
  if (entryPage === undefined) throw new Error('The validated project has no entry page.');
  const pageImports = project.pages
    .map((page) => `import { ${page.name} } from './pages/${page.name}';`)
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
    .map((page) => {
      const model = JSON.stringify(
        runtimePageModel(page, project.styles, registry, project.reusableElements),
      );
      return `  {
    id: ${JSON.stringify(page.id)},
    name: ${JSON.stringify(page.name)},
    model: ${model} as unknown as RuntimePageModel,
    createPage: (element: HTMLElement) => new ${page.name}(element),
    createReusableElements,
  }`;
    })
    .join(',\n');
  const environmentValues = Object.fromEntries(
    project.settings.environmentVariables.map((variable) => [
      variable.name,
      variable.values[project.settings.environment],
    ]),
  );
  return `import {
  Confirm,
  configureRestGo,
  Message,
  Navigate as RuntimeNavigate,
  RestGO,
  WebPageRouter,
} from '@webrad/runtime';
import type {
  MountedRuntimePage,
  NavigateOptions,
  RuntimePageModel,
  RuntimePageRoute,
  WebComponent,
  WebReusableElementInstance,
} from '@webrad/runtime';
${pageImports}
${reusableImports}
import './app.css';

type ReusableElementFactory = (
  element: HTMLElement,
  instanceId: string,
  components: ReadonlyMap<string, WebComponent>,
  componentIds: ReadonlyMap<string, string>,
) => WebReusableElementInstance;

const reusableElementFactories: ReadonlyMap<string, ReusableElementFactory> = new Map([
${reusableFactories}
]);

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
configureRestGo(${JSON.stringify(project.settings.restGo)});
const router = new WebPageRouter(routes, document.body);
const Navigate = (destination: string | URL, options: NavigateOptions = {}): void => {
  router.navigateBrowser(destination, options);
};

Object.assign(globalThis, { Confirm, Message, Navigate, Env, RestGO });
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
      generatePageSource(page, { registry }),
    );
  }

  for (const reusableElement of project.reusableElements) {
    const userPath = virtualAbsolutePath(reusableSourcePath(reusableElement));
    if (!sources.has(userPath)) {
      sources.set(userPath, createUserReusableElementSource(reusableElement));
    }
    sources.set(
      virtualAbsolutePath(reusableGeneratedSourcePath(reusableElement)),
      generateReusableElementSource(reusableElement, { registry }),
    );
  }

  const entryPath = virtualAbsolutePath('entry.ts');
  const stylePath = virtualAbsolutePath('app.css');
  sources.set(entryPath, createEntrySource(project, registry));
  sources.set(stylePath, generatedAppCss);
  sources.set(virtualAbsolutePath('webrad-globals.d.ts'), createGlobalTypings());
  sources.set(
    virtualAbsolutePath('webrad-environment.d.ts'),
    generateEnvironmentTypings(project.settings.environmentVariables),
  );
  sources.set(virtualAbsolutePath('styles.d.ts'), `declare module '*.css';\n`);
  return { sources, entryPath, stylePath, diagnostics };
}
