import type { ComponentStyleModel } from '@webrad/project-model';
import {
  resolveComponentStyleClassNames,
  resolveComponentStyleStateClassNames,
  type TailwindStyleSource,
  WEBRAD_COMPONENT_CSS,
} from '@webrad/runtime/visual';
import tailwindcss from '@tailwindcss/postcss';
import postcss from 'postcss';

/** Base application defaults. They are placed in Tailwind's components layer at build time. */
export const GENERATED_APP_CSS = `:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --wr-input-bg: #ffffff;
  --wr-muted-text: #657184;
  --wr-accent: #1479d3;
  --wr-control-border: #9da9b8;
  --wr-control-surface: #f5f7fa;
  --wr-button-bg: #edf1f6;
  --wr-button-hover: #dfe6ef;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
}

body {
  min-width: 100vw;
  min-height: 100vh;
  color: #1f2937;
  background: #ffffff;
}

.wr-webpage {
  width: 100vw !important;
  min-height: 100vh;
  height: 100vh !important;
  color: #111827;
  background: #ffffff;
}

${WEBRAD_COMPONENT_CSS}
`;

const TAILWIND_LAYER_ORDER = '@layer theme, base, components, utilities;';

function escapeCssString(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\a ')
    .replaceAll('\r', '\\d ')
    .replaceAll('\f', '\\c ');
}

/** Returns every exact utility candidate authored in the reusable style library. */
export function collectTailwindCandidates(
  styles: readonly TailwindStyleSource[],
  includePreviewStates = false,
): readonly string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const style of styles) {
    for (const candidate of resolveComponentStyleClassNames(style)) {
      if (candidate.includes('{') || candidate.includes('}')) {
        throw new Error(
          `Tailwind class candidate "${candidate}" contains a brace. Braces are reserved for @source expansion and are not accepted in saved styles.`,
        );
      }
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push(candidate);
    }
    if (includePreviewStates) {
      for (const stateName of ['hover', 'focus', 'active', 'disabled'] as const) {
        for (const candidate of resolveComponentStyleStateClassNames(style.states[stateName])) {
          if (seen.has(candidate)) continue;
          seen.add(candidate);
          candidates.push(candidate);
        }
      }
    }
  }
  return candidates;
}

function tailwindInput(
  styles: readonly TailwindStyleSource[],
  componentCss?: string,
  includePreviewStates = false,
): string {
  const candidates = collectTailwindCandidates(styles, includePreviewStates);
  const sourceDirective =
    candidates.length === 0 ? '' : `\n@source inline("${escapeCssString(candidates.join(' '))}");`;
  const components = componentCss === undefined ? '' : `\n@layer components {\n${componentCss}\n}`;
  return `${TAILWIND_LAYER_ORDER}
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);${sourceDirective}${components}
`;
}

async function processTailwind(
  styles: readonly TailwindStyleSource[],
  componentCss?: string,
  includePreviewStates = false,
): Promise<string> {
  const result = await postcss([
    tailwindcss({
      base: process.cwd(),
      optimize: false,
      transformAssetUrls: false,
    }),
  ]).process(tailwindInput(styles, componentCss, includePreviewStates), { from: undefined });
  return result.css;
}

/**
 * Compiles project-authored candidates to static theme and utility CSS. This is
 * browser output; generated applications never load Tailwind at runtime.
 */
export function compileTailwindStyles(styles: readonly ComponentStyleModel[]): Promise<string> {
  return processTailwind(styles, undefined, true);
}

/** Compiles the complete generated application stylesheet with correct layer precedence. */
export function compileGeneratedAppStyles(styles: readonly ComponentStyleModel[]): Promise<string> {
  return processTailwind(styles, GENERATED_APP_CSS);
}
