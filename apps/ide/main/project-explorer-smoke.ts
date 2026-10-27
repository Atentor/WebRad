/** Select a resource's own row, independently of icon markup and entry badges. */
export function projectExplorerRowExpression(
  resource: { readonly id: string } | { readonly name: string },
): string {
  if ('id' in resource) {
    const selector = `.wr-project-tree .wr-page-row[data-project-resource-id=${JSON.stringify(resource.id)}]`;
    return `document.querySelector(${JSON.stringify(selector)})`;
  }
  return `[...document.querySelectorAll('.wr-project-tree .wr-page-row')].find(row => row.querySelector(':scope > .wr-explorer-name')?.textContent === ${JSON.stringify(resource.name)})`;
}
