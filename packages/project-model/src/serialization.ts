import {
  FutureFormatVersionError,
  ProjectModelError,
  ProjectParseError,
  UnsupportedFormatVersionError,
} from './errors.js';
import { parseForm, parseProject, parseProjectManifest } from './schemas.js';
import {
  CURRENT_FORM_FORMAT_VERSION,
  CURRENT_PROJECT_FORMAT_VERSION,
  DEFAULT_PROJECT_SETTINGS,
  type FormModel,
  type ProjectManifest,
  type WebRadProject,
} from './types.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readVersion(input: unknown, kind: 'project' | 'form'): number {
  if (!isRecord(input) || !Number.isInteger(input.formatVersion)) {
    throw new ProjectParseError(`The ${kind} document must contain an integer formatVersion.`);
  }
  return input.formatVersion as number;
}

function assertSupportedVersion(
  kind: 'project' | 'form',
  version: number,
  currentVersion: number,
): void {
  if (version > currentVersion) {
    throw new FutureFormatVersionError(kind, version, currentVersion);
  }
  if (version < 0) {
    throw new UnsupportedFormatVersionError(kind, version, currentVersion);
  }
}

function migrateSettingsV0(input: unknown): JsonRecord {
  const settings = isRecord(input) ? input : {};
  return {
    gridSize:
      typeof settings.gridSize === 'number' ? settings.gridSize : DEFAULT_PROJECT_SETTINGS.gridSize,
    snapToGrid:
      typeof settings.snapToGrid === 'boolean'
        ? settings.snapToGrid
        : DEFAULT_PROJECT_SETTINGS.snapToGrid,
    showGrid:
      typeof settings.showGrid === 'boolean'
        ? settings.showGrid
        : DEFAULT_PROJECT_SETTINGS.showGrid,
    outputDirectory:
      typeof settings.outputDirectory === 'string'
        ? settings.outputDirectory
        : DEFAULT_PROJECT_SETTINGS.outputDirectory,
  };
}

function migrateFormV0(input: JsonRecord): JsonRecord {
  const form = { ...input };
  delete form.formatVersion;
  return {
    ...form,
    formatVersion: CURRENT_FORM_FORMAT_VERSION,
    layoutMode: form.layoutMode ?? 'absolute',
  };
}

function migrateProjectV0(input: JsonRecord): JsonRecord {
  const project = { ...input };
  delete project.formatVersion;
  return {
    ...project,
    formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
    forms: Array.isArray(project.forms)
      ? project.forms.map((form) => (isRecord(form) ? migrateFormV0(form) : form))
      : project.forms,
    settings: migrateSettingsV0(project.settings),
  };
}

/** Applies explicit, one-version-at-a-time migrations and returns a current raw document. */
export function migrateProjectDocument(input: unknown): unknown {
  let document = input;
  let version = readVersion(document, 'project');
  assertSupportedVersion('project', version, CURRENT_PROJECT_FORMAT_VERSION);

  while (version < CURRENT_PROJECT_FORMAT_VERSION) {
    if (version === 0 && isRecord(document)) {
      document = migrateProjectV0(document);
    } else {
      throw new UnsupportedFormatVersionError('project', version, CURRENT_PROJECT_FORMAT_VERSION);
    }
    version = readVersion(document, 'project');
  }

  return document;
}

export function migrateFormDocument(input: unknown): unknown {
  let document = input;
  let version = readVersion(document, 'form');
  assertSupportedVersion('form', version, CURRENT_FORM_FORMAT_VERSION);

  while (version < CURRENT_FORM_FORMAT_VERSION) {
    if (version === 0 && isRecord(document)) {
      document = migrateFormV0(document);
    } else {
      throw new UnsupportedFormatVersionError('form', version, CURRENT_FORM_FORMAT_VERSION);
    }
    version = readVersion(document, 'form');
  }

  return document;
}

function migrateManifestDocument(input: unknown): unknown {
  const version = readVersion(input, 'project');
  assertSupportedVersion('project', version, CURRENT_PROJECT_FORMAT_VERSION);
  if (version === CURRENT_PROJECT_FORMAT_VERSION) return input;
  if (version === 0 && isRecord(input)) {
    const manifest = { ...input };
    delete manifest.formatVersion;
    return {
      ...manifest,
      formatVersion: CURRENT_PROJECT_FORMAT_VERSION,
      settings: migrateSettingsV0(manifest.settings),
    };
  }
  throw new UnsupportedFormatVersionError('project', version, CURRENT_PROJECT_FORMAT_VERSION);
}

export function migrateProject(input: unknown): WebRadProject {
  return parseProject(migrateProjectDocument(input));
}

export function migrateForm(input: unknown): FormModel {
  return parseForm(migrateFormDocument(input));
}

const KEY_ORDER = new Map<string, number>(
  [
    'formatVersion',
    'id',
    'type',
    'name',
    'caption',
    'entryForm',
    'forms',
    'settings',
    'formFile',
    'generatedFile',
    'codeFile',
    'width',
    'height',
    'layoutMode',
    'rootComponentId',
    'components',
    'parentId',
    'bounds',
    'x',
    'y',
    'props',
    'events',
    'children',
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
  return migrateProject(parseJson(text, 'project'));
}

export function serializeForm(form: FormModel): string {
  return stableJson(parseForm(form));
}

export function deserializeForm(text: string): FormModel {
  return migrateForm(parseJson(text, 'form'));
}

export function serializeProjectManifest(manifest: ProjectManifest): string {
  return stableJson(parseProjectManifest(manifest));
}

export function deserializeProjectManifest(text: string): ProjectManifest {
  return parseProjectManifest(migrateManifestDocument(parseJson(text, 'project manifest')));
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

export function safeDeserializeForm(text: string): DeserializeResult<FormModel> {
  return safeDeserialize(() => deserializeForm(text));
}

export function safeDeserializeProjectManifest(text: string): DeserializeResult<ProjectManifest> {
  return safeDeserialize(() => deserializeProjectManifest(text));
}

export const stringifyProject = serializeProject;
export const parseSerializedProject = deserializeProject;
