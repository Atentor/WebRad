import { InvalidIdentifierError, InvalidProjectNameError } from './errors.js';
import type { ComponentNode, PageModel } from './types.js';

// Binding identifiers cannot be ECMAScript/TypeScript reserved words. Contextual
// keywords (for example `type`) remain valid identifiers and are intentionally allowed.
const RESERVED_WORDS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'constructor',
]);

// Generated component fields live on page and reusable authored scopes. These
// names are part of the browser runtime contract (including Object members)
// and cannot safely be replaced by a component instance with an unrelated type.
const GENERATED_PAGE_BASE_MEMBER_NAMES = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'backgroundColor',
  'bindEvent',
  'bindGeneratedEvent',
  'borderColor',
  'caption',
  'collapseWhenHidden',
  'close',
  'color',
  'dispose',
  'element',
  'emit',
  'enabled',
  'focus',
  'height',
  'hasOwnProperty',
  'hide',
  'id',
  'isPrototypeOf',
  'layoutMode',
  'alignSelf',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'name',
  'pageName',
  'propertyIsEnumerable',
  'requireComponentElement',
  'show',
  'tabIndex',
  'toLocaleString',
  'toString',
  'valueOf',
  'visible',
  'width',
  'x',
  'y',
]);

const IDENTIFIER_PATTERN = /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u;

export interface NameValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

const WINDOWS_DEVICE_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function portableFileNameKey(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function getProjectNameError(value: string): string | undefined {
  if (value.trim().length === 0) return 'the project name cannot be empty';
  if (value !== value.trim()) return 'the project name cannot start or end with whitespace';
  if (/[<>:"/\\|?*]/.test(value) || [...value].some((character) => character.charCodeAt(0) <= 31)) {
    return 'the project name contains a character that is not portable in a file name';
  }
  if (value.endsWith('.') || value === '.' || value === '..') {
    return 'the project name is not a portable file name';
  }
  if (WINDOWS_DEVICE_NAME_PATTERN.test(value)) {
    return 'reserved Windows device names cannot be used as project names';
  }
  return undefined;
}

export function isValidProjectName(value: string): boolean {
  return getProjectNameError(value) === undefined;
}

export function assertValidProjectName(value: string): void {
  const reason = getProjectNameError(value);
  if (reason !== undefined) throw new InvalidProjectNameError(value, reason);
}

export function getTypeScriptIdentifierError(value: string): string | undefined {
  if (value.length === 0) {
    return 'the name cannot be empty';
  }

  if (!IDENTIFIER_PATTERN.test(value)) {
    return 'use a TypeScript identifier (letters, digits, _, or $, without a leading digit)';
  }

  if (RESERVED_WORDS.has(value)) {
    return 'reserved words cannot be used as names';
  }

  return undefined;
}

export function isValidTypeScriptIdentifier(value: string): boolean {
  return getTypeScriptIdentifierError(value) === undefined;
}

export function assertValidTypeScriptIdentifier(value: string): void {
  const reason = getTypeScriptIdentifierError(value);
  if (reason !== undefined) {
    throw new InvalidIdentifierError(value, reason);
  }
}

export function getGeneratedPageMemberNameError(value: string): string | undefined {
  return GENERATED_PAGE_BASE_MEMBER_NAMES.has(value)
    ? `the name "${value}" conflicts with the generated page runtime API`
    : undefined;
}

/** Returns the authored class identifier for a page's persisted name. */
export function pageClassName(name: string): string {
  return name === '404' ? 'Page404' : name;
}

export function getPageNameError(value: string): string | undefined {
  if (value === '404') return undefined;
  const identifierError = getTypeScriptIdentifierError(value);
  if (identifierError !== undefined) return identifierError;
  if (WINDOWS_DEVICE_NAME_PATTERN.test(value)) {
    return 'reserved Windows device names cannot be used as page names';
  }
  return undefined;
}

export function assertValidPageName(value: string): void {
  const reason = getPageNameError(value);
  if (reason !== undefined) throw new InvalidIdentifierError(value, reason);
}

export function isUniqueName(
  name: string,
  existing: Iterable<string>,
  currentName?: string,
): boolean {
  for (const candidate of existing) {
    if (candidate === name && candidate !== currentName) {
      return false;
    }
  }
  return true;
}

export function createSequentialName(baseName: string, existing: Iterable<string>): string {
  assertValidTypeScriptIdentifier(baseName);
  const occupied = new Set(existing);
  let sequence = 1;

  while (occupied.has(`${baseName}${String(sequence)}`)) {
    sequence += 1;
  }

  return `${baseName}${String(sequence)}`;
}

export function validateComponentName(
  name: string,
  pageOrComponents: PageModel | readonly ComponentNode[],
  componentId?: string,
): NameValidationResult {
  const isPageRoot =
    'rootComponentId' in pageOrComponents &&
    componentId === pageOrComponents.rootComponentId &&
    pageOrComponents.components.some((node) => node.id === componentId && node.type === 'WebPage');
  const reason = isPageRoot && name === '404' ? undefined : getTypeScriptIdentifierError(name);
  if (reason !== undefined) {
    return { valid: false, reason };
  }

  const components: readonly ComponentNode[] =
    'components' in pageOrComponents ? pageOrComponents.components : pageOrComponents;
  const isRoot =
    'components' in pageOrComponents && componentId === pageOrComponents.rootComponentId;
  const memberNameError = isRoot ? undefined : getGeneratedPageMemberNameError(name);
  if (memberNameError !== undefined) return { valid: false, reason: memberNameError };
  const duplicate = components.some(
    (component) => component.name === name && component.id !== componentId,
  );

  return duplicate
    ? { valid: false, reason: `the name "${name}" is already used in this page` }
    : { valid: true };
}
