import type { ProjectApplicationIcon, ProjectSeoSettings } from '@webrad/project-model';
import type { ProjectPwaSettings } from '@webrad/project-model';
import { themeBootstrapSource, type ThemeRuntimeConfiguration } from '@webrad/runtime/theme';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface HtmlDocumentMetadata {
  readonly applicationName: string;
  readonly browserTitle?: string;
  readonly routingBasePath?: string;
  readonly routePaths?: readonly string[];
  readonly applicationDescription: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly applicationIcon: ProjectApplicationIcon | null;
  readonly seo: ProjectSeoSettings;
  readonly themeConfiguration?: ThemeRuntimeConfiguration;
}

function themeScript(metadata: HtmlDocumentMetadata): string {
  return metadata.themeConfiguration === undefined
    ? ''
    : `<script>${themeBootstrapSource(metadata.themeConfiguration)}</script>\n`;
}

function documentTitle(metadata: HtmlDocumentMetadata): string {
  return metadata.browserTitle?.trim() || metadata.applicationName;
}

function descriptionTag(description: string): string {
  return description.length === 0
    ? ''
    : `    <meta name="description" content="${escapeHtml(description)}" />\n`;
}

function applicationIconTag(icon: ProjectApplicationIcon | null, href: string | null): string {
  if (icon === null || href === null) return '';
  return `    <link rel="icon" type="${escapeHtml(icon.mediaType)}" href="${escapeHtml(href)}" />\n`;
}

function seoTags(
  applicationName: string,
  applicationDescription: string,
  seo: ProjectSeoSettings,
  socialImageHref: string | null,
): string {
  const socialTitle = seo.socialTitle || applicationName;
  const socialDescription = seo.socialDescription || applicationDescription;
  const tags = [
    seo.canonicalUrl.length === 0
      ? ''
      : `    <link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}" />`,
    seo.keywords.length === 0
      ? ''
      : `    <meta name="keywords" content="${escapeHtml(seo.keywords)}" />`,
    seo.allowIndexing ? '' : '    <meta name="robots" content="noindex, nofollow" />',
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:title" content="${escapeHtml(socialTitle)}" />`,
    socialDescription.length === 0
      ? ''
      : `    <meta property="og:description" content="${escapeHtml(socialDescription)}" />`,
    seo.canonicalUrl.length === 0
      ? ''
      : `    <meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}" />`,
    socialImageHref === null
      ? ''
      : `    <meta property="og:image" content="${escapeHtml(socialImageHref)}" />`,
    `    <meta name="twitter:card" content="${
      socialImageHref === null ? 'summary' : 'summary_large_image'
    }" />`,
    `    <meta name="twitter:title" content="${escapeHtml(socialTitle)}" />`,
    socialDescription.length === 0
      ? ''
      : `    <meta name="twitter:description" content="${escapeHtml(socialDescription)}" />`,
    socialImageHref === null
      ? ''
      : `    <meta name="twitter:image" content="${escapeHtml(socialImageHref)}" />`,
  ].filter((tag) => tag.length > 0);
  return tags.length === 0 ? '' : `${tags.join('\n')}\n`;
}

export function createIndexHtml(
  metadata: HtmlDocumentMetadata,
  applicationIconHref: string | null,
  socialImageHref: string | null,
  options: { readonly pwa?: ProjectPwaSettings } = {},
): string {
  const basePath = scriptSafe(JSON.stringify(metadata.routingBasePath ?? '/'));
  const baseScript =
    '<script>if(location.protocol!=="file:"){const base=document.createElement("base");base.href=' +
    basePath +
    ';document.head.append(base);}</script>';
  return `<!doctype html>
<html lang="${escapeHtml(metadata.locale)}" data-webrad-time-zone="${escapeHtml(metadata.timeZone)}" data-webrad-application-name="${escapeHtml(metadata.applicationName)}">
  <head>
    <meta charset="UTF-8" />
${themeScript(metadata)}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${descriptionTag(metadata.applicationDescription)}    <title>${escapeHtml(documentTitle(metadata))}</title>
${baseScript}
${applicationIconTag(metadata.applicationIcon, applicationIconHref)}
${seoTags(metadata.applicationName, metadata.applicationDescription, metadata.seo, socialImageHref)}
${options.pwa?.enabled === true ? `    <meta name="theme-color" content="${escapeHtml(options.pwa.themeColor)}" />\n    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-title" content="${escapeHtml(options.pwa.shortName || metadata.applicationName)}" />\n    <link rel="manifest" href="./manifest.webmanifest" />\n    <link rel="apple-touch-icon" href="./assets/icons/pwa-192.png" />\n` : ''}
    <link rel="stylesheet" href="./assets/app.css" />
  </head>
  <body class="wr-project-surface">
    <script src="./assets/app.js"></script>
${options.pwa?.enabled === true ? '    <script src="./assets/pwa-register.js"></script>\n' : ''}
  </body>
</html>
`;
}

function scriptSafe(value: string): string {
  const lower = value.toLowerCase();
  if (!lower.includes('</script') && !lower.includes('<script') && !lower.includes('<!--'))
    return value;
  // HTML raw-text parsing also treats <!-- followed by <script> specially. Decode the
  // exact bundle into a separate script, preserving both its semantics and map columns.
  const encoded = JSON.stringify(value).replaceAll('<', '\\u003c');
  return `(() => { const script = document.createElement('script'); script.textContent = ${encoded}; document.body.append(script); })();`;
}

function styleSafe(value: string): string {
  return value.replaceAll('</style', '<\\/style');
}

export function createPreviewHtml(
  metadata: HtmlDocumentMetadata,
  javaScript: string,
  css: string,
): string {
  return `<!doctype html>
<html lang="${escapeHtml(metadata.locale)}" data-webrad-time-zone="${escapeHtml(metadata.timeZone)}" data-webrad-application-name="${escapeHtml(metadata.applicationName)}">
  <head>
    <meta charset="UTF-8" />
${themeScript(metadata)}
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${descriptionTag(metadata.applicationDescription)}    <title>${escapeHtml(documentTitle(metadata))}</title>
<meta name="webrad-route-paths" content="${encodeURIComponent(JSON.stringify(metadata.routePaths ?? []))}" />
${applicationIconTag(metadata.applicationIcon, metadata.applicationIcon?.dataUrl ?? null)}
${seoTags(
  metadata.applicationName,
  metadata.applicationDescription,
  metadata.seo,
  metadata.seo.socialImage?.dataUrl ?? null,
)}
    <style>${styleSafe(css)}</style>
  </head>
  <body class="wr-project-surface">
    <script>${scriptSafe(javaScript)}</script>
  </body>
</html>
`;
}
