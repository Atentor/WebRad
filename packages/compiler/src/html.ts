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
}

function descriptionTag(description: string): string {
  return description.length === 0
    ? ''
    : `    <meta name="description" content="${escapeHtml(description)}" />\n`;
}

export function createIndexHtml(metadata: HtmlDocumentMetadata): string {
  return `<!doctype html>
<html lang="${escapeHtml(metadata.locale)}" data-webrad-time-zone="${escapeHtml(metadata.timeZone)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${descriptionTag(metadata.applicationDescription)}    <title>${escapeHtml(metadata.applicationName)}</title>
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
    <style>${styleSafe(css)}</style>
  </head>
  <body>
    <script>${scriptSafe(javaScript)}</script>
  </body>
</html>
`;
}
