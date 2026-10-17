import type { ProjectEnvironmentVariable } from '@webrad/project-model';

const ENVIRONMENT_VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Produces the project-specific ambient declaration consumed by Monaco and
 * the compiler. Values remain runtime strings because each Build selects one
 * project environment.
 */
export function generateEnvironmentTypings(
  variables: readonly ProjectEnvironmentVariable[],
): string {
  const names = [
    ...new Set(
      variables
        .map((variable) => variable.name)
        .filter((name) => ENVIRONMENT_VARIABLE_NAME.test(name)),
    ),
  ].sort();
  const properties =
    names.length === 0
      ? '    readonly [name: string]: never;'
      : names.map((name) => `    readonly ${name}: string;`).join('\n');
  return `/** Browser-visible values selected from Project Settings. */
declare global {
  const Env: Readonly<{
${properties}
  }>;
}

export {};
`;
}
