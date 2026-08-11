function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function createIndexHtml(projectName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(projectName)}</title>
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

export function createPreviewHtml(projectName: string, javaScript: string, css: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(projectName)}</title>
    <style>${styleSafe(css)}</style>
  </head>
  <body>
    <script>${scriptSafe(javaScript)}</script>
  </body>
</html>
`;
}
