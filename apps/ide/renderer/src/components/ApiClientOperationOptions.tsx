import type { ApiClientOperation, ProjectGraphQLOperation } from '@webrad/project-model';
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
  return (
    <>
      <option value="">(select an operation)</option>
      {endpoints.map(({ id, method, name, path }) => (
        <option key={apiEndpointOption(id)} value={apiEndpointOption(id)}>
          {name} — {method} {path}
        </option>
      ))}
      {queries.length > 0 && (
        <optgroup label="RestGo GraphQL queries">
          {queries.map(({ id, name }) => (
            <option key={id} value={graphqlQueryOption(id)}>
              {name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
