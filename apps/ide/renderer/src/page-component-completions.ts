export interface PageComponentSymbol {
  readonly name: string;
  readonly type: string;
}

export interface PageComponentCompletionContext {
  readonly activeResource: string;
  readonly requestedResource: string;
  /** True only when Monaco's TypeScript worker accepts `this` at the cursor. */
  readonly supportsThisExpression: boolean;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * Monaco's TypeScript worker already parses the complete model. Requiring its
 * `this` keyword completion and dot commit character excludes declarations,
 * type positions, imports, object keys, strings, templates, and comments.
 */
export function supportsTypeScriptThisExpression(completionInfo: unknown): boolean {
  if (!isRecord(completionInfo) || completionInfo.isMemberCompletion === true) return false;
  const entries = completionInfo.entries;
  const commitCharacters = completionInfo.defaultCommitCharacters;
  return (
    Array.isArray(entries) &&
    entries.some((entry) => isRecord(entry) && entry.name === 'this') &&
    Array.isArray(commitCharacters) &&
    commitCharacters.includes('.')
  );
}

/**
 * Selects the Delphi-style page fields that complement TypeScript completions.
 * Qualified member access is deliberately left to TypeScript's native provider.
 */
export function pageComponentCompletionSymbols(
  components: readonly PageComponentSymbol[],
  context: PageComponentCompletionContext,
): readonly PageComponentSymbol[] {
  if (context.requestedResource !== context.activeResource) return [];
  if (!context.supportsThisExpression) return [];

  return components;
}
