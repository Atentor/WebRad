import type {
  ApiClientFieldType,
  ApiClientResponseSchema,
  ApiClientSchemaNode,
} from '@webrad/project-model';

export type ApiSchemaIdFactory = (prefix: string) => string;

function defaultIdFactory(prefix: string): string {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

function pointerChild(parent: string, name: string): string {
  return `${parent}/${escapePointerToken(name)}`;
}

function scalarType(values: readonly unknown[]): ApiClientFieldType {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (present.length === 0) return 'null';
  if (present.every((value) => typeof value === 'boolean')) return 'boolean';
  if (present.every((value) => typeof value === 'number')) {
    return present.every((value) => Number.isInteger(value)) ? 'integer' : 'number';
  }
  if (present.every((value) => typeof value === 'string')) {
    const strings = present as readonly string[];
    if (strings.every((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value))) return 'date';
    if (
      strings.every((value) =>
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/u.test(value),
      )
    ) {
      return 'datetime';
    }
    return 'string';
  }
  return 'unknown';
}

function inferNode(
  name: string,
  path: string,
  values: readonly unknown[],
  idFactory: ApiSchemaIdFactory,
): ApiClientSchemaNode {
  const nullable = values.some((value) => value === null || value === undefined);
  const present = values.filter((value) => value !== null && value !== undefined);
  const allObjects = present.length > 0 && present.every(isRecord);
  const allLists = present.length > 0 && present.every(Array.isArray);

  if (allObjects) {
    const records = present as readonly Readonly<Record<string, unknown>>[];
    const names = [...new Set(records.flatMap((record) => Object.keys(record)))].sort();
    return {
      id: idFactory('object'),
      name,
      path,
      kind: 'object',
      fieldType: 'object',
      nullable,
      children: names.map((childName) =>
        inferNode(
          childName,
          pointerChild(path, childName),
          records.map((record) => record[childName]),
          idFactory,
        ),
      ),
    };
  }

  if (allLists) {
    const lists = present as readonly unknown[][];
    const items = lists.flatMap((list) => list.slice(0, 100));
    const itemObjects = items.length > 0 && items.every(isRecord);
    const children = itemObjects
      ? (() => {
          const records = items as readonly Readonly<Record<string, unknown>>[];
          const names = [...new Set(records.flatMap((record) => Object.keys(record)))].sort();
          return names.map((childName) =>
            inferNode(
              childName,
              pointerChild(`${path}/*`, childName),
              records.map((record) => record[childName]),
              idFactory,
            ),
          );
        })()
      : items.length === 0
        ? []
        : [inferNode('$item', `${path}/*`, items, idFactory)];
    return {
      id: idFactory('list'),
      name,
      path,
      kind: 'list',
      fieldType: 'list',
      nullable,
      children,
    };
  }

  return {
    id: idFactory('field'),
    name,
    path,
    kind: 'field',
    fieldType: scalarType(values),
    nullable,
    children: [],
  };
}

/** Creates a selectable, editable response contract from a JSON result. */
export function inferApiClientResponseSchema(
  value: unknown,
  idFactory: ApiSchemaIdFactory = defaultIdFactory,
): ApiClientResponseSchema {
  return {
    version: 1,
    root: inferNode('Response', '', [value], idFactory),
  };
}

function matchingNode(
  node: ApiClientSchemaNode,
  candidates: readonly ApiClientSchemaNode[],
): ApiClientSchemaNode | undefined {
  return candidates.find(
    (candidate) => candidate.path === node.path && candidate.kind === node.kind,
  );
}

function hasNodeAtPath(
  node: ApiClientSchemaNode,
  candidates: readonly ApiClientSchemaNode[],
): boolean {
  return candidates.some((candidate) => candidate.path === node.path);
}

/**
 * A new sample refreshes the displayed shape but preserves prior IDs and type
 * choices where a path still exists. Missing prior fields remain available so
 * a partial test result does not silently break a saved binding.
 */
export function reconcileApiClientResponseSchema(
  inferred: ApiClientResponseSchema,
  existing: ApiClientResponseSchema | null | undefined,
): ApiClientResponseSchema {
  if (existing === null || existing === undefined) return inferred;

  const reconcile = (
    node: ApiClientSchemaNode,
    previous: ApiClientSchemaNode | undefined,
  ): ApiClientSchemaNode => {
    // A response can legitimately change shape at a path (for example from an
    // object to `null` or a scalar). In that case it is a replacement, not a
    // missing field: preserving the old node would create an invalid tree or
    // duplicate generated TypeScript properties.
    const compatiblePrevious =
      previous !== undefined && previous.path === node.path && previous.kind === node.kind
        ? previous
        : undefined;
    const reconciledChildren = node.children.map((child) =>
      reconcile(
        child,
        compatiblePrevious === undefined
          ? undefined
          : matchingNode(child, compatiblePrevious.children),
      ),
    );
    const preservedChildren =
      compatiblePrevious === undefined
        ? []
        : compatiblePrevious.children.filter((child) => !hasNodeAtPath(child, node.children));
    return {
      ...node,
      ...(compatiblePrevious === undefined
        ? {}
        : {
            id: compatiblePrevious.id,
            fieldType: compatiblePrevious.fieldType,
            nullable: compatiblePrevious.nullable,
          }),
      children: [...reconciledChildren, ...preservedChildren],
    };
  };
  return { version: 1, root: reconcile(inferred.root, existing.root) };
}

export function collectApiClientSchemaNodeIds(
  node: ApiClientSchemaNode,
  target = new Set<string>(),
): ReadonlySet<string> {
  target.add(node.id);
  node.children.forEach((child) => collectApiClientSchemaNodeIds(child, target));
  return target;
}

/** Drops unchecked schema branches while always retaining the response root. */
export function pruneApiClientResponseSchema(
  schema: ApiClientResponseSchema,
  selectedIds: ReadonlySet<string>,
): ApiClientResponseSchema {
  const prune = (node: ApiClientSchemaNode, required: boolean): ApiClientSchemaNode | null => {
    if (!required && !selectedIds.has(node.id)) return null;
    return {
      ...node,
      children: node.children.flatMap((child) => {
        const next = prune(child, false);
        return next === null ? [] : [next];
      }),
    };
  };
  const root = prune(schema.root, true);
  if (root === null) throw new Error('The API response root cannot be removed.');
  return { version: 1, root };
}

export function findApiClientSchemaNode(
  node: ApiClientSchemaNode,
  id: string,
): ApiClientSchemaNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const result = findApiClientSchemaNode(child, id);
    if (result !== undefined) return result;
  }
  return undefined;
}
