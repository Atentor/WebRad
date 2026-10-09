import { projectAssetPath } from '@webrad/project-model';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  defaultComponentRegistry,
  type ComponentPropertyDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import {
  ApiClientConfigurationSchema,
  DataGridConfigurationSchema,
  ComboBoxConfigurationSchema,
  comboBoxSchemaChoices,
  safeParseProject,
  type ProjectApplicationIcon,
  type ProjectSocialImage,
  type WebRadProject,
} from '@webrad/project-model';
import type { BuildFailure } from 'esbuild';

import { bundleSources } from './bundle.js';
import { fromEsbuildMessage } from './diagnostics.js';
import { createIndexHtml, createPreviewHtml } from './html.js';
import { createVirtualSourceGraph } from './source-graph.js';
import { compileGeneratedAppStyles } from './styles.js';
import { typecheckSources } from './typecheck.js';
import type {
  CompileDiagnostic,
  CompileProjectMemoryOptions,
  CompileProjectOptions,
  CompileProjectResult,
} from './types.js';

function validateRegistry(
  project: WebRadProject,
  registry: ComponentRegistry,
): readonly CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const documents = [
    ...project.pages.map((document, index) => ({
      document,
      path: ['pages', index] as const,
    })),
    ...project.reusableElements.map((document, index) => ({
      document,
      path: ['reusableElements', index] as const,
    })),
  ];
  for (const { document, path } of documents) {
    for (const [componentIndex, component] of document.components.entries()) {
      const definition = registry.get(component.type);
      if (definition === undefined) {
        diagnostics.push({
          category: 'error',
          source: 'registry',
          message: `Unknown component type "${component.type}".`,
          path: [...path, 'components', componentIndex, 'type'],
        });
        continue;
      }
      if (!definition.canHaveChildren && component.children.length > 0) {
        diagnostics.push({
          category: 'error',
          source: 'registry',
          message: `${component.type} cannot contain child components.`,
          path: [...path, 'components', componentIndex, 'children'],
        });
      }
      const propertyDefinitions = new Map(
        definition.properties
          .filter((property) => (property.source ?? 'props') === 'props')
          .map((property) => [property.name, property]),
      );
      for (const [propertyName, value] of Object.entries(component.props)) {
        const property = propertyDefinitions.get(propertyName);
        if (property === undefined) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: `Property "${propertyName}" is not registered for ${component.type}.`,
            path: [...path, 'components', componentIndex, 'props', propertyName],
          });
          continue;
        }
        if (!isValidPropertyValue(property, value, document.components, project.reusableElements)) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: `Property "${propertyName}" has an invalid ${property.type} value for ${component.type}.`,
            path: [...path, 'components', componentIndex, 'props', propertyName],
          });
        }
        if (property.type === 'api-client-config') {
          const configuration = ApiClientConfigurationSchema.safeParse(value);
          if (
            configuration.success &&
            ['restgo-session', 'restgo-api-token', 'restgo-public'].includes(
              configuration.data.connection ?? '',
            ) &&
            !project.settings.restGo.enabled
          ) {
            diagnostics.push({
              category: 'error',
              source: 'registry',
              message: 'Enable and configure the RestGo connection before binding an API Client.',
              path: [...path, 'components', componentIndex, 'props', propertyName, 'connection'],
            });
          }
        }
      }
      for (const eventName of Object.keys(component.events)) {
        if (!definition.events.some((event) => event.name === eventName)) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: `Event "${eventName}" is not registered for ${component.type}.`,
            path: [...path, 'components', componentIndex, 'events', eventName],
          });
        }
      }
      if (component.type === 'WebComboBox' && component.props.comboBoxConfig == null) {
        const items = component.props.items;
        const values = component.props.values;
        if (
          Array.isArray(values) &&
          values.length > 0 &&
          Array.isArray(items) &&
          values.length !== items.length
        ) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: 'WebComboBox Values must have one value per Item.',
            path: [...path, 'components', componentIndex, 'props', 'values'],
          });
        }
      }
      if (component.type === 'WebComboBox' && component.props.comboBoxConfig != null) {
        const configuration = ComboBoxConfigurationSchema.safeParse(component.props.comboBoxConfig);
        if (!configuration.success) continue;
        const binding = configuration.data;
        const bindingPath = [...path, 'components', componentIndex, 'props', 'comboBoxConfig'];
        const report = (field: string, message: string): void => {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message,
            path: [...bindingPath, field],
          });
        };
        const apiClient = document.components.find(
          (candidate) => candidate.id === binding.apiClientId,
        );
        if (apiClient?.type !== 'WebApiClient') {
          report('apiClientId', 'WebComboBox must reference a WebApiClient in the same document.');
          continue;
        }
        const apiConfiguration = ApiClientConfigurationSchema.safeParse(
          apiClient.props.apiClientConfig,
        );
        const operation = apiConfiguration.success
          ? apiConfiguration.data.operations.find(
              (candidate) => candidate.id === binding.operationId,
            )
          : undefined;
        if (operation === undefined) {
          report(
            'operationId',
            'WebComboBox must reference an operation of the selected WebApiClient.',
          );
          continue;
        }
        const choices = comboBoxSchemaChoices(operation.responseSchema, binding.listPath);
        if (!choices.lists.some((choice) => choice.path === binding.listPath)) {
          report('listPath', 'WebComboBox must reference a saved response list.');
          continue;
        }
        for (const field of ['displayField', 'keyField'] as const) {
          if (!choices.fields.some((choice) => choice.path === binding[field])) {
            report(
              field,
              `WebComboBox ${field} must reference a scalar field of the selected list item.`,
            );
          }
        }
      }
      if (component.type === 'WebDataGrid') {
        const configuration = DataGridConfigurationSchema.safeParse(component.props.dataGridConfig);
        if (!configuration.success) continue;
        const dataGridPath = [...path, 'components', componentIndex, 'props', 'dataGridConfig'];
        if (configuration.data.apiClientId === null) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: 'WebDataGrid must reference a WebApiClient.',
            path: [...dataGridPath, 'apiClientId'],
          });
          continue;
        }
        const apiClient = document.components.find(
          (candidate) => candidate.id === configuration.data.apiClientId,
        );
        if (apiClient?.type !== 'WebApiClient') {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: 'WebDataGrid apiClientId must reference a WebApiClient on the same page.',
            path: [...dataGridPath, 'apiClientId'],
          });
          continue;
        }
        const apiConfiguration = ApiClientConfigurationSchema.safeParse(
          apiClient.props.apiClientConfig,
        );
        const operation = apiConfiguration.success
          ? apiConfiguration.data.operations.find(
              (candidate) => candidate.id === configuration.data.operationId,
            )
          : undefined;
        if (operation === undefined) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message:
              'WebDataGrid operationId must reference an operation of the selected WebApiClient.',
            path: [...dataGridPath, 'operationId'],
          });
          continue;
        }
        const findSchemaNode = (node: {
          readonly path: string;
          readonly kind: string;
          readonly children: readonly unknown[];
        }): { readonly path: string; readonly kind: string } | undefined => {
          if (node.path === configuration.data.listPath) return node;
          for (const child of node.children) {
            if (typeof child !== 'object' || child === null) continue;
            const candidate = findSchemaNode(child as typeof node);
            if (candidate !== undefined) return candidate;
          }
          return undefined;
        };
        const listNode =
          operation.responseSchema === null
            ? undefined
            : findSchemaNode(operation.responseSchema.root);
        if (listNode?.kind !== 'list') {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: 'WebDataGrid listPath must reference a saved list response field.',
            path: [...dataGridPath, 'listPath'],
          });
        }
      }
    }
  }
  for (const [styleIndex, style] of project.styles.entries()) {
    const definition = registry.get(style.componentType);
    if (definition === undefined) {
      diagnostics.push({
        category: 'error',
        source: 'registry',
        message: `Style "${style.name}" targets unknown component type "${style.componentType}".`,
        path: ['styles', styleIndex, 'componentType'],
      });
    } else if (!definition.visual) {
      diagnostics.push({
        category: 'error',
        source: 'registry',
        message: `Style "${style.name}" cannot target nonvisual component type "${style.componentType}".`,
        path: ['styles', styleIndex, 'componentType'],
      });
    }
  }
  return diagnostics;
}

function isValidPropertyValue(
  property: ComponentPropertyDefinition,
  value: unknown,
  components: WebRadProject['pages'][number]['components'],
  reusableElements: WebRadProject['reusableElements'],
): boolean {
  switch (property.type) {
    case 'string':
    case 'color':
      return typeof value === 'string';
    case 'string-list':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
    case 'icon':
      return typeof value === 'string' && (property.options?.includes(value) ?? false);
    case 'component':
      return (
        value === null ||
        (typeof value === 'string' && components.some((component) => component.id === value))
      );
    case 'reusable-element':
      return (
        typeof value === 'string' &&
        reusableElements.some((reusableElement) => reusableElement.id === value)
      );
    case 'api-client-config':
      return ApiClientConfigurationSchema.safeParse(value).success;
    case 'data-grid-config':
      return DataGridConfigurationSchema.safeParse(value).success;
    case 'combo-box-config':
      return value === null || ComboBoxConfigurationSchema.safeParse(value).success;
  }
}

function hasErrors(diagnostics: readonly CompileDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.category === 'error');
}

function serializableDiagnosticPath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return path.map((segment) =>
    typeof segment === 'symbol' ? (segment.description ?? String(segment)) : segment,
  );
}

function failedResult(
  outputDirectory: string,
  diagnostics: readonly CompileDiagnostic[],
): CompileProjectResult {
  return { success: false, outputDirectory, diagnostics, files: {} };
}

async function writeOutputFiles(
  outputDirectory: string,
  files: Readonly<Record<string, string>>,
  binaryFiles: Readonly<Record<string, Uint8Array>> = {},
): Promise<void> {
  for (const [relativePath, contents] of [
    ...Object.entries(files),
    ...Object.entries(binaryFiles),
  ]) {
    const target = path.resolve(outputDirectory, ...relativePath.split('/'));
    const relative = path.relative(outputDirectory, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Compiler output escaped its output directory: ${relativePath}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
}

function applicationIconOutputPath(icon: ProjectApplicationIcon): string {
  const extension = icon.mediaType === 'image/svg+xml' ? 'svg' : 'png';
  return `assets/icons/application.${extension}`;
}

function decodeApplicationIcon(icon: ProjectApplicationIcon): Uint8Array {
  return decodeDataUrl(icon.mediaType, icon.dataUrl);
}

function socialImageOutputPath(image: ProjectSocialImage): string {
  const extension = image.mediaType === 'image/png' ? 'png' : 'jpg';
  return `assets/images/social-share.${extension}`;
}

function decodeSocialImage(image: ProjectSocialImage): Uint8Array {
  return decodeDataUrl(image.mediaType, image.dataUrl);
}

function decodeDataUrl(mediaType: string, dataUrl: string): Uint8Array {
  const prefix = `data:${mediaType};base64,`;
  return Uint8Array.from(Buffer.from(dataUrl.slice(prefix.length), 'base64'));
}

function buildFailureDiagnostics(error: BuildFailure): readonly CompileDiagnostic[] {
  return [
    ...error.errors.map((message) => fromEsbuildMessage(message, 'error')),
    ...error.warnings.map((message) => fromEsbuildMessage(message, 'warning')),
  ];
}

function isBuildFailure(error: unknown): error is BuildFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray(Reflect.get(error, 'errors')) &&
    Array.isArray(Reflect.get(error, 'warnings'))
  );
}

export async function compileProject(
  projectInput: WebRadProject,
  options: CompileProjectOptions,
): Promise<CompileProjectResult> {
  if (options.outputDirectory.trim().length === 0) {
    return failedResult('', [
      {
        category: 'error',
        source: 'compiler',
        message: 'A non-empty outputDirectory is required.',
      },
    ]);
  }
  const outputDirectory = path.resolve(options.outputDirectory);
  const validation = safeParseProject(projectInput);
  if (!validation.success) {
    return failedResult(
      outputDirectory,
      validation.error.issues.map((issue) => ({
        category: 'error',
        source: 'model',
        code: issue.code,
        message: issue.message,
        path: serializableDiagnosticPath(issue.path),
      })),
    );
  }

  const project = validation.data;
  const registry = options.registry ?? defaultComponentRegistry;
  const registryDiagnostics = validateRegistry(project, registry);
  if (hasErrors(registryDiagnostics)) return failedResult(outputDirectory, registryDiagnostics);

  let generatedAppCss: string;
  try {
    generatedAppCss = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.colorPalette,
    );
  } catch (error) {
    return failedResult(outputDirectory, [
      ...registryDiagnostics,
      {
        category: 'error',
        source: 'compiler',
        message: `Tailwind CSS compilation failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]);
  }

  let graph;
  try {
    graph = createVirtualSourceGraph(project, options.userSources, registry, generatedAppCss);
  } catch (error) {
    return failedResult(outputDirectory, [
      ...registryDiagnostics,
      {
        category: 'error',
        source: 'compiler',
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
  const checked = typecheckSources(graph.sources, graph.componentScopes);
  const preBundleDiagnostics = [
    ...registryDiagnostics,
    ...graph.diagnostics,
    ...checked.diagnostics,
  ];
  if (hasErrors(preBundleDiagnostics)) return failedResult(outputDirectory, preBundleDiagnostics);

  try {
    const bundle = await bundleSources({
      sources: checked.sources,
      entryPath: graph.entryPath,
      outputDirectory,
      minify: options.minify ?? false,
      sourcemap: options.sourcemap ?? false,
    });
    const javaScript = bundle.files['assets/app.js'];
    const css = bundle.files['assets/app.css'];
    if (javaScript === undefined || css === undefined) {
      return failedResult(outputDirectory, [
        ...preBundleDiagnostics,
        ...bundle.diagnostics,
        {
          category: 'error',
          source: 'compiler',
          message: 'esbuild did not produce assets/app.js and assets/app.css.',
        },
      ]);
    }
    const iconOutputPath =
      project.settings.applicationIcon === null
        ? null
        : applicationIconOutputPath(project.settings.applicationIcon);
    const socialImageOutputPathValue =
      project.settings.seo.socialImage === null
        ? null
        : socialImageOutputPath(project.settings.seo.socialImage);
    const binaryFiles: Record<string, Uint8Array> = {};
    for (const asset of project.assets ?? [])
      binaryFiles[projectAssetPath(asset)] = Buffer.from(asset.base64, 'base64');
    if (project.settings.applicationIcon !== null && iconOutputPath !== null) {
      binaryFiles[iconOutputPath] = decodeApplicationIcon(project.settings.applicationIcon);
    }
    if (project.settings.seo.socialImage !== null && socialImageOutputPathValue !== null) {
      binaryFiles[socialImageOutputPathValue] = decodeSocialImage(project.settings.seo.socialImage);
    }
    const files = {
      ...bundle.files,
      'index.html': createIndexHtml(
        project.settings,
        iconOutputPath === null ? null : `./${iconOutputPath}`,
        socialImageOutputPathValue === null ? null : `./${socialImageOutputPathValue}`,
      ),
    };
    const diagnostics = [...preBundleDiagnostics, ...bundle.diagnostics];
    if (options.write ?? true) await writeOutputFiles(outputDirectory, files, binaryFiles);
    return {
      success: true,
      outputDirectory,
      diagnostics,
      files,
      previewHtml: createPreviewHtml(project.settings, javaScript, css),
    };
  } catch (error) {
    const diagnostics = isBuildFailure(error)
      ? buildFailureDiagnostics(error)
      : [
          {
            category: 'error' as const,
            source: 'compiler' as const,
            message: error instanceof Error ? error.message : String(error),
          },
        ];
    return failedResult(outputDirectory, [...preBundleDiagnostics, ...diagnostics]);
  }
}

export function compileProjectToMemory(
  project: WebRadProject,
  options: CompileProjectMemoryOptions,
): Promise<CompileProjectResult> {
  return compileProject(project, {
    ...options,
    outputDirectory: options.outputDirectory ?? path.resolve('.webrad-preview'),
    write: false,
  });
}

export const buildProject = compileProject;
