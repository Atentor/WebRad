import {
  graphQLEndpointName,
  type ApiClientOperation,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import type { ReactElement } from 'react';

import { apiEndpointOption, graphqlQueryOption } from './api-client-operation-options';

interface ApiClientOperationOptionsProps {
  readonly endpoints: readonly ApiClientOperation[];
  readonly queries: readonly ProjectGraphQLOperation[];
}

export function ApiClientOperationOptions({
  endpoints,
  queries,
}: ApiClientOperationOptionsProps): ReactElement {
  const queryNameCounts = new Map<string, number>();
  for (const query of queries) {
    const name = graphQLEndpointName(query);
    queryNameCounts.set(name, (queryNameCounts.get(name) ?? 0) + 1);
  }
  return (
    <>
      <option value="">(select an operation)</option>
      {endpoints.map(({ id, method, name, path }) => (
        <option key={apiEndpointOption(id)} value={apiEndpointOption(id)}>
          {name} — {method} {path}
        </option>
      ))}
      {queries.length > 0 && (
        <optgroup label="RestGo GraphQL endpoints">
          {queries.map((query) => {
            const endpointName = graphQLEndpointName(query);
            return (
              <option key={query.id} value={graphqlQueryOption(query.id)}>
                {endpointName}
                {(queryNameCounts.get(endpointName) ?? 0) > 1 && ` · ${query.name}`}
              </option>
            );
          })}
        </optgroup>
      )}
    </>
  );
}
