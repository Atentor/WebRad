import type { ProjectApplicationIcon, ProjectSeoSettings } from '@webrad/project-model';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface HtmlDocumentMetadata {
  readonly applicationName: string;
  readonly applicationDescription: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly applicationIcon: ProjectApplicationIcon | null;
  readonly seo: ProjectSeoSettings;
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
    seo.socialImageUrl.length === 0
      ? ''
      : `    <meta property="og:image" content="${escapeHtml(seo.socialImageUrl)}" />`,
    `    <meta name="twitter:card" content="${
      seo.socialImageUrl.length === 0 ? 'summary' : 'summary_large_image'
    }" />`,
    `    <meta name="twitter:title" content="${escapeHtml(socialTitle)}" />`,
    socialDescription.length === 0
      ? ''
      : `    <meta name="twitter:description" content="${escapeHtml(socialDescription)}" />`,
    seo.socialImageUrl.length === 0
      ? ''
      : `    <meta name="twitter:image" content="${escapeHtml(seo.socialImageUrl)}" />`,
  ].filter((tag) => tag.length > 0);
  return tags.length === 0 ? '' : `${tags.join('\n')}\n`;
}

export function createIndexHtml(
  metadata: HtmlDocumentMetadata,
  applicationIconHref: string | null,
): string {
  return `<!doctype html>
<html lang="${escapeHtml(metadata.locale)}" data-webrad-time-zone="${escapeHtml(metadata.timeZone)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${descriptionTag(metadata.applicationDescription)}    <title>${escapeHtml(metadata.applicationName)}</title>
${applicationIconTag(metadata.applicationIcon, applicationIconHref)}
${seoTags(metadata.applicationName, metadata.applicationDescription, metadata.seo)}
    <link rel="stylesheet" href="./assets/app.css" />
  </head>
  <body>
    <script src="./assets/app.js"></script>
  </body>
</html>
`;
}

function scriptSafe(value: string): string {
  return value.replaceAll('</script', '<\\/script');
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
<html lang="${escapeHtml(metadata.locale)}" data-webrad-time-zone="${escapeHtml(metadata.timeZone)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${descriptionTag(metadata.applicationDescription)}    <title>${escapeHtml(metadata.applicationName)}</title>
${applicationIconTag(metadata.applicationIcon, metadata.applicationIcon?.dataUrl ?? null)}
${seoTags(metadata.applicationName, metadata.applicationDescription, metadata.seo)}
    <style>${styleSafe(css)}</style>
  </head>
  <body>
    <script>${scriptSafe(javaScript)}</script>
  </body>
</html>
`;
}
