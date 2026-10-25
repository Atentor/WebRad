import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';
import postcss from 'postcss';
import fontSources from './font-sources.generated.json';

/** The same family names and Tailwind tokens serve Designer, Preview and export. */
export const PROJECT_FONT_THEME_CSS = `@theme {\n${WEBRAD_FONT_FAMILIES.map(
  (font) => `  --font-${font.id}: '${font.label}', ${font.fallback};`,
).join('\n')}\n}`;

export function projectFontFaceCss(candidates: readonly string[]): string {
  return WEBRAD_FONT_FAMILIES.filter(
    (font) =>
      font.id === 'roboto' ||
      candidates.some((candidate) => new RegExp(`(?:^|:)!?font-${font.id}!?$`, 'u').test(candidate)),
  )
    .map((font) => fontSources[font.id].css)
    .join('\n');
}

/** Include upstream notices for the font binaries actually embedded in the CSS. */
export function projectFontLicenseFiles(css: string): Readonly<Record<string, string>> {
  const families = new Set<string>();
  postcss.parse(css).walkAtRules('font-face', (face) => {
    face.walkDecls('font-family', (declaration) => {
      families.add(declaration.value.replaceAll(/['"]/gu, '').trim());
    });
  });
  return Object.fromEntries(
    WEBRAD_FONT_FAMILIES.filter((font) => families.has(font.label)).map((font) => {
      const source = fontSources[font.id];
      return [
        `assets/licenses/fonts/${font.id}-OFL-1.1.txt`,
        `${font.label}\n${source.packageName} ${source.version}\n\n${source.license}`,
      ];
    }),
  );
}
