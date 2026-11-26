export function apiEndpointOption(id: string | null): string {
  return id?.includes(':') ? `endpoint:${id}` : (id ?? '');
}

export function graphqlQueryOption(id: string | null): string {
  return id === null ? '' : `graphql:${id}`;
}
