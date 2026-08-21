import path from 'node:path';

import type { ComponentRegistry } from '@webrad/component-registry';
import type { PageModel, WebRadProject } from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime/visual';
import { createUserPageSource, generatePageSource } from '@webrad/language';

import runtimeSources from './runtime-sources.json';
import type { CompileDiagnostic } from './types.js';

export const VIRTUAL_ROOT = path.resolve(process.cwd(), '.webrad-compiler-virtual');
export const RUNTIME_ENTRY_PATH = virtualAbsolutePath('__runtime/index.ts');

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

function pageSourcePath(page: PageModel): string {
  return `pages/${page.name}.ts`;
}

function generatedSourcePath(page: PageModel): string {
  return `pages/${page.name}.generated.ts`;
}

function createGlobalTypings(): string {
  return `import type {
  Confirm as RuntimeConfirm,
  Message as RuntimeMessage,
  Navigate as RuntimeNavigate,
} from '@webrad/runtime';

declare global {
  const Message: typeof RuntimeMessage;
  const Confirm: typeof RuntimeConfirm;
  const Navigate: typeof RuntimeNavigate;
}

export {};
`;
}

function runtimePageModel(
  page: PageModel,
  styles: WebRadProject['styles'],
  registry: ComponentRegistry,
) {
  const visualIds = new Set(
    page.components
      .filter((component) => registry.require(component.type).visual)
      .map((component) => component.id),
  );
  const stylesById = new Map(styles.map((style) => [style.id, style]));
  return {
    ...page,
    components: page.components
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

function createEntrySource(project: WebRadProject, registry: ComponentRegistry): string {
  const entryPage = project.pages.find((page) => page.id === project.entryPage);
  if (entryPage === undefined) throw new Error('The validated project has no entry page.');
  const serializedPage = JSON.stringify(runtimePageModel(entryPage, project.styles, registry));
  return `import {
  Confirm,
  Message,
  Navigate,
  mountPage,
} from '@webrad/runtime';
import type { RuntimePageModel } from '@webrad/runtime';
import { ${entryPage.name} } from './pages/${entryPage.name}';
import './app.css';

Object.assign(globalThis, { Confirm, Message, Navigate });

const model = ${serializedPage} as unknown as RuntimePageModel;
const mounted = mountPage(model, document.body);
const page = new ${entryPage.name}(mounted.element);
page.show();
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

  const entryPath = virtualAbsolutePath('entry.ts');
  const stylePath = virtualAbsolutePath('app.css');
  sources.set(entryPath, createEntrySource(project, registry));
  sources.set(stylePath, generatedAppCss);
  sources.set(virtualAbsolutePath('webrad-globals.d.ts'), createGlobalTypings());
  sources.set(virtualAbsolutePath('styles.d.ts'), `declare module '*.css';\n`);
  return { sources, entryPath, stylePath, diagnostics };
}
