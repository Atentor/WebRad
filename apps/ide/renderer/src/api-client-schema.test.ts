import { describe, expect, it } from 'vitest';

import {
  inferApiClientResponseSchema,
  reconcileApiClientResponseSchema,
} from './api-client-schema.js';

function sequentialIds(): (prefix: string) => string {
  let sequence = 0;
  return (prefix) => `${prefix}-${String((sequence += 1))}`;
}

describe('API client response-schema inference', () => {
  it('replaces a node whose JSON shape changed instead of duplicating its path', () => {
    const existing = inferApiClientResponseSchema(
      { result: { id: 1, name: 'Ada' } },
      sequentialIds(),
    );
    const inferred = inferApiClientResponseSchema({ result: 'not-found' }, sequentialIds());

    const reconciled = reconcileApiClientResponseSchema(inferred, existing);
    const resultNodes = reconciled.root.children.filter((node) => node.path === '/result');

    expect(resultNodes).toHaveLength(1);
    expect(resultNodes[0]).toMatchObject({
      kind: 'field',
      fieldType: 'string',
      children: [],
    });
  });

  it('replaces the root when a new sample changes its top-level shape', () => {
    const existing = inferApiClientResponseSchema({ data: { id: 1 } }, sequentialIds());
    const inferred = inferApiClientResponseSchema(42, sequentialIds());

    const reconciled = reconcileApiClientResponseSchema(inferred, existing);

    expect(reconciled.root).toMatchObject({
      kind: 'field',
      fieldType: 'integer',
      children: [],
    });
  });
});
