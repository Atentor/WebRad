import type { ComponentPropertyDefinition } from '@webrad/component-registry';

const textPropertyTypes = new Set<ComponentPropertyDefinition['type']>([
  'string',
  'enum',
  'icon',
  'color',
  'component',
  'reusable-element',
  'menu-definition',
]);

/** Context redaction markers must never replace real project data. */
export function assertNoCodexPrivatePlaceholder(text: string, target: string): void {
  let candidate = text;
  const encoded = encodeURIComponent('[private value omitted]').toLowerCase();
  for (let depth = 0; depth < 3; depth += 1) {
    const lower = candidate.toLowerCase();
    if (
      candidate.includes('[private value omitted]') ||
      lower.includes(encoded) ||
      lower.includes(encoded.replaceAll('%20', '+'))
    ) {
      throw new Error(
        `Codex cannot replace private values in ${target}. Preserve the existing value instead.`,
      );
    }
    try {
      const decoded = decodeURIComponent(candidate.replaceAll('+', ' '));
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
}

function checkPrivateValues(value: unknown, target: string): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) continue;
    if (entry.depth > 64)
      throw new Error(`Codex returned an excessively nested value for ${target}.`);
    if (typeof entry.value === 'string') assertNoCodexPrivatePlaceholder(entry.value, target);
    else if (Array.isArray(entry.value)) {
      for (const item of entry.value) pending.push({ value: item, depth: entry.depth + 1 });
    } else if (entry.value && typeof entry.value === 'object') {
      for (const [key, item] of Object.entries(entry.value)) {
        assertNoCodexPrivatePlaceholder(key, target);
        pending.push({ value: item, depth: entry.depth + 1 });
      }
    }
  }
}

/** Structured values never fall back to text or execute JavaScript expressions. */
export function readCodexJsonValue(text: string, target: string): unknown {
  assertNoCodexPrivatePlaceholder(text, target);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Codex returned invalid JSON for ${target}. Ask Codex to revise that value; no changes were applied.`,
    );
  }
  checkPrivateValues(value, target);
  return value;
}

/** Text values accept both literal strings and the original JSON-string format. */
export function readCodexPropertyValue(
  property: ComponentPropertyDefinition,
  text: string,
  target: string,
): unknown {
  assertNoCodexPrivatePlaceholder(text, target);
  let value: unknown = text;
  if (textPropertyTypes.has(property.type)) {
    try {
      const decoded: unknown = JSON.parse(text);
      if (typeof decoded === 'string') value = decoded;
      if (decoded === null && (property.type === 'component' || property.nullable)) value = null;
    } catch {
      // A literal enum, caption, color or reference needs no second JSON encoding.
    }
  } else {
    value = readCodexJsonValue(text, target);
  }
  checkPrivateValues(value, target);
  const nullable = value === null && (property.nullable || property.type === 'component');
  let valid = true;
  switch (property.type) {
    case 'number':
      valid = nullable || (typeof value === 'number' && Number.isFinite(value));
      break;
    case 'boolean':
      valid = typeof value === 'boolean';
      break;
    case 'string-list':
      valid = Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
      break;
    case 'enum':
    case 'icon':
      valid =
        typeof value === 'string' &&
        (property.validateValue !== undefined ||
          property.options === undefined ||
          property.options.includes(value));
      break;
    case 'string':
    case 'color':
    case 'reusable-element':
    case 'menu-definition':
      valid = nullable || typeof value === 'string';
      break;
    case 'component':
      valid = nullable || typeof value === 'string';
      break;
  }
  if (!valid)
    throw new Error(`Codex supplied an invalid value for ${target}; expected ${property.type}.`);
  return value;
}
