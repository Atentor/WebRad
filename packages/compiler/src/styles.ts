import {
  DEFAULT_PROJECT_SCROLLBAR_STYLE,
  type ComponentStyleModel,
  type ProjectScrollbarStyle,
} from '@webrad/project-model';
import {
  resolveComponentStyleClassNames,
  resolveComponentStylePreviewClassName,
  tokenizeTailwindClasses,
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

/**
 * Emits the project-owned scrollbar treatment used by Preview and generated
 * browser applications. WebKit gives us the full track/thumb model. Firefox
 * only exposes the standard color and platform thickness controls, so its
 * fallback is isolated to avoid suppressing the WebKit pseudo-elements in
 * browsers that support both APIs.
 */
function projectScrollbarCss(scrollbar: Readonly<ProjectScrollbarStyle>): string {
  const firefoxWidth = Math.max(scrollbar.width, scrollbar.height) <= 12 ? 'thin' : 'auto';

  return `:root {
  --wr-scrollbar-width: ${String(scrollbar.width)}px;
  --wr-scrollbar-height: ${String(scrollbar.height)}px;
  --wr-scrollbar-track-color: ${scrollbar.trackColor};
  --wr-scrollbar-track-border-color: ${scrollbar.trackBorderColor};
  --wr-scrollbar-track-border-width: ${String(scrollbar.trackBorderWidth)}px;
  --wr-scrollbar-track-radius: ${String(scrollbar.trackBorderRadius)}px;
  --wr-scrollbar-thumb-color: ${scrollbar.thumbColor};
  --wr-scrollbar-thumb-hover-color: ${scrollbar.thumbHoverColor};
  --wr-scrollbar-thumb-active-color: ${scrollbar.thumbActiveColor};
  --wr-scrollbar-thumb-border-color: ${scrollbar.thumbBorderColor};
  --wr-scrollbar-thumb-border-width: ${String(scrollbar.thumbBorderWidth)}px;
  --wr-scrollbar-thumb-radius: ${String(scrollbar.thumbBorderRadius)}px;
  --wr-scrollbar-corner-color: ${scrollbar.cornerColor};
}

@media (forced-colors: none) {
  *::-webkit-scrollbar {
    width: var(--wr-scrollbar-width);
    height: var(--wr-scrollbar-height);
  }

  *::-webkit-scrollbar-track {
    background: var(--wr-scrollbar-track-color);
    border: var(--wr-scrollbar-track-border-width) solid var(--wr-scrollbar-track-border-color);
    border-radius: var(--wr-scrollbar-track-radius);
  }

  *::-webkit-scrollbar-thumb {
    background: var(--wr-scrollbar-thumb-color);
    border: var(--wr-scrollbar-thumb-border-width) solid var(--wr-scrollbar-thumb-border-color);
    border-radius: var(--wr-scrollbar-thumb-radius);
    background-clip: padding-box;
  }

  *::-webkit-scrollbar-thumb:hover {
    background: var(--wr-scrollbar-thumb-hover-color);
  }

  *::-webkit-scrollbar-thumb:active {
    background: var(--wr-scrollbar-thumb-active-color);
  }

  *::-webkit-scrollbar-corner {
    background: var(--wr-scrollbar-corner-color);
  }

  @supports (-moz-appearance: none) {
    html,
    body,
    * {
      scrollbar-color: var(--wr-scrollbar-thumb-color) var(--wr-scrollbar-track-color);
      scrollbar-width: ${firefoxWidth};
    }
  }
}`;
}

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
        for (const candidate of tokenizeTailwindClasses(
          resolveComponentStylePreviewClassName(style, stateName),
        )) {
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
      base: process.env.WEBRAD_TAILWIND_BASE_PATH ?? process.cwd(),
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
export function compileGeneratedAppStyles(
  styles: readonly ComponentStyleModel[],
  scrollbar: Readonly<ProjectScrollbarStyle> = DEFAULT_PROJECT_SCROLLBAR_STYLE,
): Promise<string> {
  return processTailwind(styles, `${GENERATED_APP_CSS}\n${projectScrollbarCss(scrollbar)}`);
}
