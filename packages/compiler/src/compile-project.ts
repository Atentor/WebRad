import { parseReportTemplate, type WebReportElement } from '@webrad/runtime/report-template';
import { projectAssetPath, projectThemeRuntimeConfiguration } from '@webrad/project-model';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  defaultComponentRegistry,
  type ComponentPropertyDefinition,
  type ComponentRegistry,
  getCurrentRowBindableProperties,
  isCurrentRowFieldCompatible,
} from '@webrad/component-registry';
import {
  ApiClientConfigurationSchema,
  DataGridConfigurationSchema,
  ComboBoxConfigurationSchema,
  CurrentRowBindingsSchema,
  RepeatingGroupConfigurationSchema,
  VideoPlayerSourceSchema,
  MenuConfigurationSchema,
  comboBoxSchemaChoices,
  safeParseProject,
  type ProjectApplicationIcon,
  type ProjectSocialImage,
  type WebRadProject,
  type ApiClientSchemaNode,
} from '@webrad/project-model';
import type { BuildFailure } from 'esbuild';
import { repeatingGroupForComponent } from '@webrad/language';

import { bundleSources } from './bundle.js';
import { fromEsbuildMessage } from './diagnostics.js';
import { createIndexHtml, createPreviewHtml } from './html.js';
import { createVirtualSourceGraph } from './source-graph.js';
import { composeSourceMap, DEBUG_SCRIPT_URL } from './source-maps.js';
import { compileGeneratedAppStyles } from './styles.js';
import { typecheckSources } from './typecheck.js';
import { selectApplicationSources, selectedComponentTypes } from './runtime-selection.js';
import { selectProjectAssets } from './asset-selection.js';
import { createPwaOutput, createPwaRetirementWorker } from './pwa.js';
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
    const rowHandlerGroups = new Map<string, string>();
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
      const events =
        definition.eventsForNode?.(component, {
          document,
          reusableElements: project.reusableElements,
        }) ?? definition.events;
      for (const eventName of Object.keys(component.events)) {
        if (!events.some((event) => event.name === eventName)) {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message: `Event "${eventName}" is not registered for ${component.type}.`,
            path: [...path, 'components', componentIndex, 'events', eventName],
          });
        }
      }
      if (component.type === 'WebReportBuilder' && component.props.reportTemplate !== undefined) {
        const template = parseReportTemplate(component.props.reportTemplate);
        const validateSource = (
          clientKey: string,
          operationKey: string,
          location: readonly (string | number)[],
        ): void => {
          if (!clientKey && !operationKey) return;
          const client = document.components.find(
            (candidate) =>
              candidate.type === 'WebApiClient' &&
              (candidate.id === clientKey || candidate.name === clientKey),
          );
          const configuration = ApiClientConfigurationSchema.safeParse(
            client?.props.apiClientConfig,
          );
          const message =
            client === undefined
              ? 'Report field must reference an API Client in the same document.'
              : !configuration.success ||
                  !configuration.data.operations.some(
                    (operation) => operation.id === operationKey || operation.name === operationKey,
                  )
                ? 'Report field must reference an operation of the selected API Client.'
                : undefined;
          if (message !== undefined)
            diagnostics.push({
              category: 'error',
              source: 'registry',
              message,
              path: [...path, 'components', componentIndex, 'props', 'reportTemplate', ...location],
            });
        };
        const validateElements = (
          elements: readonly WebReportElement[],
          location: readonly (string | number)[],
        ): void => {
          elements.forEach((element, index) => {
            const itemPath = [...location, index];
            if (element.type === 'group') {
              validateElements(element.children, [...itemPath, 'children']);
            } else if (element.type === 'repeater') {
              if (element.source.scope !== 'row')
                validateSource(element.source.apiClientId, element.source.operationId, [
                  ...itemPath,
                  'source',
                ]);
              validateElements(element.children, [...itemPath, 'children']);
              if (element.header !== undefined)
                validateElements(element.header.elements, [...itemPath, 'header', 'elements']);
              if (element.footer !== undefined)
                validateElements(element.footer.elements, [...itemPath, 'footer', 'elements']);
            } else if ('value' in element && element.value.kind === 'field')
              validateSource(element.value.apiClientId, element.value.operationId, [
                ...itemPath,
                'value',
              ]);
          });
        };
        template.bands.forEach((band, index) =>
          validateElements(band.elements, ['bands', index, 'elements']),
        );
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
      const rowGroup = repeatingGroupForComponent(document, component.id);
      if (rowGroup !== undefined) {
        for (const [eventName, handler] of Object.entries(component.events)) {
          if (handler === null) continue;
          const owner = rowHandlerGroups.get(handler);
          if (owner !== undefined && owner !== rowGroup.id)
            diagnostics.push({
              category: 'error',
              source: 'registry',
              message: `Handler "${handler}" is assigned to different Repeating Groups. Use a separate handler for each row template.`,
              path: [...path, 'components', componentIndex, 'events', eventName],
            });
          else rowHandlerGroups.set(handler, rowGroup.id);
        }
      }
      if (component.type === 'WebRepeatingGroup') {
        const config = RepeatingGroupConfigurationSchema.safeParse(
          component.props.repeatingGroupConfig,
        );
        if (config.success && config.data.apiClientId !== null) {
          const report = (field: string, message: string): void => {
            diagnostics.push({
              category: 'error',
              source: 'registry',
              message,
              path: [...path, 'components', componentIndex, 'props', 'repeatingGroupConfig', field],
            });
          };
          const api = document.components.find(
            (candidate) => candidate.id === config.data.apiClientId,
          );
          if (api?.type !== 'WebApiClient')
            report(
              'apiClientId',
              'WebRepeatingGroup must reference a WebApiClient in the same document.',
            );
          else {
            const apiConfig = ApiClientConfigurationSchema.safeParse(api.props.apiClientConfig);
            const operation = apiConfig.success
              ? apiConfig.data.operations.find(
                  (candidate) => candidate.id === config.data.operationId,
                )
              : undefined;
            if (operation === undefined)
              report(
                'operationId',
                'WebRepeatingGroup must reference an operation of the selected WebApiClient.',
              );
            else if (
              !comboBoxSchemaChoices(operation.responseSchema, config.data.listPath).lists.some(
                (choice) => choice.path === config.data.listPath,
              )
            )
              report('listPath', 'WebRepeatingGroup must reference a saved response list.');
          }
        }
      }
      const bindings = CurrentRowBindingsSchema.safeParse(component.props.currentRowBindings ?? []);
      if (bindings.success && bindings.data.length > 0) {
        const report = (bindingIndex: number, field: string, message: string): void => {
          diagnostics.push({
            category: 'error',
            source: 'registry',
            message,
            path: [
              ...path,
              'components',
              componentIndex,
              'props',
              'currentRowBindings',
              bindingIndex,
              field,
            ],
          });
        };
        if (rowGroup === undefined)
          report(
            0,
            'fieldPath',
            'Current row bindings require a component inside a Repeating Group row template.',
          );
        else {
          const config = RepeatingGroupConfigurationSchema.safeParse(
            rowGroup.props.repeatingGroupConfig,
          );
          const api = config.success
            ? document.components.find((candidate) => candidate.id === config.data.apiClientId)
            : undefined;
          const apiConfig = ApiClientConfigurationSchema.safeParse(api?.props.apiClientConfig);
          const operation =
            config.success && apiConfig.success
              ? apiConfig.data.operations.find(
                  (candidate) => candidate.id === config.data.operationId,
                )
              : undefined;
          const find = (
            node: ApiClientSchemaNode,
            target: string,
          ): ApiClientSchemaNode | undefined => {
            if (node.path === target) return node;
            for (const child of node.children) {
              const match = find(child, target);
              if (match !== undefined) return match;
            }
            return undefined;
          };
          const properties = new Map(
            getCurrentRowBindableProperties(definition).map((property) => [
              property.name,
              property,
            ]),
          );
          for (const [bindingIndex, binding] of bindings.data.entries()) {
            const property = properties.get(binding.property);
            if (property === undefined) {
              report(
                bindingIndex,
                'property',
                `Property "${binding.property}" is not a writable visual value of ${component.type}.`,
              );
              continue;
            }
            const field =
              config.success && operation?.responseSchema != null
                ? find(
                    operation.responseSchema.root,
                    `${config.data.listPath}/*${binding.fieldPath}`,
                  )
                : undefined;
            if (field?.kind !== 'field') {
              report(
                bindingIndex,
                'fieldPath',
                'Current row binding must reference a saved scalar field of the selected response-list item.',
              );
              continue;
            }
            const compatible = isCurrentRowFieldCompatible(property, field.fieldType);
            if (!compatible)
              report(
                bindingIndex,
                'fieldPath',
                `Field "${binding.fieldPath}" is incompatible with the ${property.type} property "${binding.property}".`,
              );
          }
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
  if (property.validateValue) return property.validateValue(value);
  switch (property.type) {
    case 'report-template':
      try {
        parseReportTemplate(value);
        return true;
      } catch {
        return false;
      }
    case 'video-source':
      return VideoPlayerSourceSchema.safeParse(value).success;
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
    case 'repeating-group-config':
      return RepeatingGroupConfigurationSchema.safeParse(value).success;
    case 'current-row-bindings':
      return CurrentRowBindingsSchema.safeParse(value).success;
    case 'menu-config':
      return MenuConfigurationSchema.safeParse(value).success;
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
  options.onProgress?.('validation');
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

  const target = options.target ?? 'preview';
  const publishing = target === 'deploy' || target === 'native';
  const project = publishing
    ? {
        ...validation.data,
        settings: {
          ...validation.data.settings,
          ...(target === 'native'
            ? {
                applicationName: validation.data.settings.nativeApplication.applicationName,
                applicationDescription:
                  validation.data.settings.nativeApplication.description ||
                  validation.data.settings.applicationDescription,
                applicationIcon:
                  validation.data.settings.nativeApplication.icon ??
                  validation.data.settings.applicationIcon,
              }
            : {}),
          environment: validation.data.settings.build.environment,
        },
      }
    : validation.data;
  const registry = options.registry ?? defaultComponentRegistry;
  const registryDiagnostics = validateRegistry(project, registry);
  if (hasErrors(registryDiagnostics)) return failedResult(outputDirectory, registryDiagnostics);

  options.onProgress?.('selection');
  const selected = selectApplicationSources(project, options.userSources);

  options.onProgress?.('styles');
  let generatedAppCss: string;
  try {
    generatedAppCss = await compileGeneratedAppStyles(
      selected.project.styles,
      project.settings.scrollbar,
      project.settings.themes,
      selectedComponentTypes(selected, registry),
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

  options.onProgress?.('source-generation');
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
  options.onProgress?.('typecheck');
  const checked = typecheckSources(graph.sources, graph.componentScopes);
  const preBundleDiagnostics = [
    ...registryDiagnostics,
    ...graph.diagnostics,
    ...checked.diagnostics,
  ];
  if (hasErrors(preBundleDiagnostics)) return failedResult(outputDirectory, preBundleDiagnostics);

  try {
    const bundleOptions = {
      sources: checked.sources,
      entryPath: graph.entryPath,
      outputDirectory,
      minify: options.debug
        ? false
        : (options.minify ?? (publishing ? project.settings.build.minify : false)),
      sourcemap:
        options.debug || (options.sourcemap ?? (publishing && project.settings.build.sourceMaps)),
      componentTypes: graph.componentTypes,
    };
    options.onProgress?.('bundle');
    const bundle = await bundleSources(bundleOptions);
    const bundleFiles = { ...bundle.files };
    for (const [file, sourceMap] of Object.entries(bundleFiles)) {
      if (file.endsWith('.map'))
        bundleFiles[file] = composeSourceMap(sourceMap, graph.sources, checked.sourceEdits);
    }
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
    options.onProgress?.('assets');
    const iconOutputPath =
      project.settings.applicationIcon === null
        ? null
        : applicationIconOutputPath(project.settings.applicationIcon);
    const socialImageOutputPathValue =
      project.settings.seo.socialImage === null
        ? null
        : socialImageOutputPath(project.settings.seo.socialImage);
    const binaryFiles: Record<string, Uint8Array> = {};
    const assets = publishing
      ? selectProjectAssets(selected.project, selected.userSources, generatedAppCss)
      : (project.assets ?? []);
    for (const asset of assets)
      binaryFiles[projectAssetPath(asset)] = Buffer.from(asset.base64, 'base64');
    if (project.settings.applicationIcon !== null && iconOutputPath !== null) {
      binaryFiles[iconOutputPath] = decodeApplicationIcon(project.settings.applicationIcon);
    }
    if (project.settings.seo.socialImage !== null && socialImageOutputPathValue !== null) {
      binaryFiles[socialImageOutputPathValue] = decodeSocialImage(project.settings.seo.socialImage);
    }
    const entryPage = project.pages.find((page) => page.id === project.entryPage);
    const entryRoot = entryPage?.components.find(
      (component) => component.id === entryPage.rootComponentId,
    );
    const documentMetadata = {
      ...project.settings,
      themeConfiguration: projectThemeRuntimeConfiguration(project.settings.themes, project.id),
      routePaths: project.pages.map((page) =>
        String(
          page.id === project.entryPage
            ? '/index'
            : page.components.find((node) => node.id === page.rootComponentId)?.props.routePath ||
                '/' + page.name.toLowerCase(),
        ),
      ),
      browserTitle:
        typeof entryRoot?.props.browserTitle === 'string' ? entryRoot.props.browserTitle : '',
    };
    const files: Record<string, string> = {
      ...bundleFiles,
      'index.html': createIndexHtml(
        documentMetadata,
        iconOutputPath === null ? null : `./${iconOutputPath}`,
        socialImageOutputPathValue === null ? null : `./${socialImageOutputPathValue}`,
        {
          ...(target === 'deploy' ? { pwa: project.settings.pwa } : {}),
        },
      ),
    };
    if (target === 'deploy' && project.settings.pwa.enabled) {
      const pwa = await createPwaOutput(project.settings, files, binaryFiles);
      Object.assign(files, pwa.files);
      Object.assign(binaryFiles, pwa.binaryFiles);
    } else if (target === 'deploy') {
      files['service-worker.js'] = createPwaRetirementWorker();
    }
    const diagnostics = [...preBundleDiagnostics, ...bundle.diagnostics];
    if (options.write ?? true) {
      options.onProgress?.('write');
      await writeOutputFiles(outputDirectory, files, binaryFiles);
    }
    const debugSourceMap = bundleFiles['assets/app.js.map'];
    options.onProgress?.('complete');
    return {
      success: true,
      outputDirectory,
      diagnostics,
      files,
      binaryFiles,
      ...(target === 'preview'
        ? {
            previewHtml: createPreviewHtml(
              documentMetadata,
              options.debug ? `${javaScript}\n//# sourceURL=${DEBUG_SCRIPT_URL}\n` : javaScript,
              css,
            ),
          }
        : {}),
      ...(options.debug && debugSourceMap !== undefined
        ? { debug: { sourceMap: debugSourceMap, scriptUrl: DEBUG_SCRIPT_URL } }
        : {}),
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
