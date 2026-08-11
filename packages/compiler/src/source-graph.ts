import path from 'node:path';

import type { ComponentRegistry } from '@webrad/component-registry';
import type { FormModel, WebRadProject } from '@webrad/project-model';
import { createUserFormSource, generateFormSource } from '@webrad/language';

import runtimeSources from './runtime-sources.json';
import { GENERATED_APP_CSS } from './styles.js';
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

function formSourcePath(form: FormModel): string {
  return `forms/${form.name}.ts`;
}

function generatedSourcePath(form: FormModel): string {
  return `forms/${form.name}.generated.ts`;
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

function runtimeFormModel(form: FormModel, registry: ComponentRegistry): FormModel {
  const visualIds = new Set(
    form.components
      .filter((component) => registry.require(component.type).visual)
      .map((component) => component.id),
  );
  return {
    ...form,
    components: form.components
      .filter((component) => visualIds.has(component.id))
      .map((component) => ({
        ...component,
        children: component.children.filter((childId) => visualIds.has(childId)),
      })),
  };
}

function createEntrySource(project: WebRadProject, registry: ComponentRegistry): string {
  const entryForm = project.forms.find((form) => form.id === project.entryForm);
  if (entryForm === undefined) throw new Error('The validated project has no entry form.');
  const serializedForm = JSON.stringify(runtimeFormModel(entryForm, registry));
  return `import {
  Confirm,
  Message,
  Navigate,
  mountForm,
} from '@webrad/runtime';
import type { RuntimeFormModel } from '@webrad/runtime';
import { ${entryForm.name} } from './forms/${entryForm.name}';
import './app.css';

Object.assign(globalThis, { Confirm, Message, Navigate });

const model = ${serializedForm} as unknown as RuntimeFormModel;
const mounted = mountForm(model, document.body);
const form = new ${entryForm.name}(mounted.element);
form.show();
`;
}

export function createVirtualSourceGraph(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
  registry: ComponentRegistry,
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

  for (const form of project.forms) {
    const userPath = virtualAbsolutePath(formSourcePath(form));
    if (!sources.has(userPath)) sources.set(userPath, createUserFormSource(form));
    sources.set(
      virtualAbsolutePath(generatedSourcePath(form)),
      generateFormSource(form, { registry }),
    );
  }

  const entryPath = virtualAbsolutePath('entry.ts');
  const stylePath = virtualAbsolutePath('app.css');
  sources.set(entryPath, createEntrySource(project, registry));
  sources.set(stylePath, GENERATED_APP_CSS);
  sources.set(virtualAbsolutePath('webrad-globals.d.ts'), createGlobalTypings());
  sources.set(virtualAbsolutePath('styles.d.ts'), `declare module '*.css';\n`);
  return { sources, entryPath, stylePath, diagnostics };
}
