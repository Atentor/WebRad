import {
  FutureFormatVersionError,
  ProjectModelError,
  ProjectParseError,
  UnsupportedFormatVersionError,
} from './errors.js';
import { parsePage, parseProject, parseProjectManifest, parseVisualDocument } from './schemas.js';
import {
  CURRENT_PAGE_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  type PageModel,
  type ProjectManifest,
  type WebRadProject,
} from './types.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVersion(input: unknown, kind: 'project' | 'page'): number {
  if (!isRecord(input) || !Number.isInteger(input.formatVersion)) {
    throw new ProjectParseError(`The ${kind} document must contain an integer formatVersion.`);
  }
  return input.formatVersion as number;
}

function assertCurrentVersion(
  kind: 'project' | 'page',
  version: number,
  currentVersion: number,
): void {
  if (version > currentVersion) {
    throw new FutureFormatVersionError(kind, version, currentVersion);
  }
  if (version !== currentVersion) {
    throw new UnsupportedFormatVersionError(kind, version, currentVersion);
  }
}

const KEY_ORDER = new Map<string, number>(
  [
    'formatVersion',
    'id',
    'type',
    'name',
    'componentType',
    'preset',
    'caption',
    'entryPage',
    'pages',
    'reusableElements',
    'styles',
    'settings',
    'pageFile',
    'generatedFile',
    'codeFile',
    'width',
    'height',
    'rootComponentId',
    'components',
    'parentId',
    'layout',
    'container',
    'mode',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
    'wrap',
    'justifyContent',
    'alignItems',
    'item',
    'minWidth',
    'maxWidth',
    'minHeight',
    'maxHeight',
    'grow',
    'shrink',
    'alignSelf',
    'horizontalAnchor',
    'verticalAnchor',
    'left',
    'right',
    'top',
    'bottom',
    'bounds',
    'x',
    'y',
    'props',
    'events',
    'styleId',
    'children',
    'states',
    'base',
    'hover',
    'focus',
    'active',
    'disabled',
    'kind',
    'direction',
    'from',
    'to',
    'value',
    'unit',
    'applicationName',
    'applicationDescription',
    'locale',
    'timeZone',
    'applicationIcon',
    'seo',
    'fileName',
    'mediaType',
    'dataUrl',
    'canonicalUrl',
    'keywords',
    'allowIndexing',
    'socialTitle',
    'socialDescription',
    'socialImage',
    'environment',
    'environmentVariables',
    'restGo',
    'enabled',
    'baseUrl',
    'apiVersion',
    'defaultDatabase',
    'persistSession',
    'sessionStorage',
    'storageKey',
    'values',
    'development',
    'production',
    'scrollbar',
    'trackColor',
    'trackBorderColor',
    'trackBorderWidth',
    'trackBorderRadius',
    'thumbColor',
    'thumbHoverColor',
    'thumbActiveColor',
    'thumbBorderColor',
    'thumbBorderWidth',
    'thumbBorderRadius',
    'cornerColor',
    'gridSize',
    'snapToGrid',
    'showGrid',
    'outputDirectory',
  ].map((key, index) => [key, index]),
);

function compareKeys(left: string, right: string): number {
  const leftOrder = KEY_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = KEY_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
  return leftOrder === rightOrder ? left.localeCompare(right) : leftOrder - rightOrder;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareKeys)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function parseJson(text: string, kind: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProjectParseError(`Invalid JSON in ${kind} document.`, { cause: error });
  }
}

export function serializeProject(project: WebRadProject): string {
  return stableJson(parseProject(project));
}

export function deserializeProject(text: string): WebRadProject {
  const document = parseJson(text, 'project');
  assertCurrentVersion('project', readVersion(document, 'project'), CURRENT_PROJECT_FORMAT_VERSION);
  return parseProject(document);
}

export function serializePage(page: PageModel): string {
  return stableJson(parsePage(page));
}

/** Serializes a page-shaped visual document, including reusable definitions. */
export function serializeVisualDocument(document: PageModel): string {
  return stableJson(parseVisualDocument(document));
}

export function deserializePage(text: string): PageModel {
  const document = parseJson(text, 'page');
  assertCurrentVersion('page', readVersion(document, 'page'), CURRENT_PAGE_FORMAT_VERSION);
  return parsePage(document);
}

export function serializeProjectManifest(manifest: ProjectManifest): string {
  return stableJson(parseProjectManifest(manifest));
}

export function deserializeProjectManifest(text: string): ProjectManifest {
  const document = parseJson(text, 'project manifest');
  assertCurrentVersion('project', readVersion(document, 'project'), CURRENT_PROJECT_FORMAT_VERSION);
  return parseProjectManifest(document);
}

export interface DeserializeSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface DeserializeFailure {
  readonly success: false;
  readonly error: ProjectModelError;
}

export type DeserializeResult<T> = DeserializeSuccess<T> | DeserializeFailure;

function safeDeserialize<T>(operation: () => T): DeserializeResult<T> {
  try {
    return { success: true, data: operation() };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof ProjectModelError
          ? error
          : new ProjectParseError('Unable to read the WebRAD document.', { cause: error }),
    };
  }
}

export function safeDeserializeProject(text: string): DeserializeResult<WebRadProject> {
  return safeDeserialize(() => deserializeProject(text));
}

export function safeDeserializePage(text: string): DeserializeResult<PageModel> {
  return safeDeserialize(() => deserializePage(text));
}

export function safeDeserializeProjectManifest(text: string): DeserializeResult<ProjectManifest> {
  return safeDeserialize(() => deserializeProjectManifest(text));
}

export const stringifyProject = serializeProject;
export const parseSerializedProject = deserializeProject;
