/** Browser-safe authorization shared by the editor, Preview and generated apps. */
export type WebApiAuthorization =
  | { readonly type: 'none' }
  | { readonly type: 'basic'; readonly username: string; readonly password: string }
  | { readonly type: 'bearer'; readonly token: string }
  | {
      readonly type: 'api-key';
      readonly name: string;
      readonly value: string;
      readonly in: 'header' | 'query';
    };

/** Returns a detached, validated definition without coercing or trimming secrets. */
export function normalizeApiClientAuthorization(value: unknown): WebApiAuthorization | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid API authorization definition.');
  const definition = value as Record<string, unknown>;
  const text = (field: string, max = 32768): string => {
    const entry = definition[field];
    if (
      typeof entry !== 'string' ||
      entry.length > max ||
      /[\r\n]/u.test(entry) ||
      entry.includes(String.fromCharCode(0))
    )
      throw new TypeError(`Invalid API authorization ${field}.`);
    return entry;
  };
  const fields = (allowed: readonly string[]): void => {
    if (Object.keys(definition).some((key) => !allowed.includes(key)))
      throw new TypeError('Unexpected API authorization field.');
  };
  switch (definition.type) {
    case 'none':
      fields(['type']);
      return { type: 'none' };
    case 'basic': {
      fields(['type', 'username', 'password']);
      const username = text('username');
      if (username.includes(':'))
        throw new TypeError('A Basic Auth username cannot contain a colon.');
      return { type: 'basic', username, password: text('password') };
    }
    case 'bearer': {
      fields(['type', 'token']);
      const token = text('token');
      if (token !== token.trim() || /\s/u.test(token))
        throw new TypeError('Enter the Bearer token without its prefix or whitespace.');
      return { type: 'bearer', token };
    }
    case 'api-key': {
      fields(['type', 'name', 'value', 'in']);
      const name = text('name', 256);
      if (!name.trim() || name !== name.trim())
        throw new TypeError('Enter an API key name without surrounding whitespace.');
      if (definition.in !== 'header' && definition.in !== 'query')
        throw new TypeError('Choose Header or Query parameter for the API key.');
      const key = text('value');
      if (definition.in === 'header') new Headers([[name, key]]);
      return { type: 'api-key', name, value: key, in: definition.in };
    }
    default:
      throw new TypeError('Unsupported API authorization type.');
  }
}

/** Explicit authorization wins over manual headers; omission preserves legacy headers. */
export function applyApiClientAuthorization(
  url: string,
  headers: Headers,
  authorization: WebApiAuthorization | null | undefined,
): string {
  const definition = normalizeApiClientAuthorization(authorization);
  if (definition === null) return url;
  headers.delete('Authorization');
  switch (definition.type) {
    case 'none':
      break;
    case 'basic': {
      const bytes = new TextEncoder().encode(`${definition.username}:${definition.password}`);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      headers.set('Authorization', `Basic ${btoa(binary)}`);
      break;
    }
    case 'bearer':
      if (!definition.token)
        throw new TypeError('Enter a Bearer token before sending the request.');
      headers.set('Authorization', `Bearer ${definition.token}`);
      break;
    case 'api-key':
      if (!definition.value)
        throw new TypeError('Enter an API key value before sending the request.');
      if (definition.in === 'header') headers.set(definition.name, definition.value);
      else {
        const parsed = new URL(url, globalThis.location?.href);
        parsed.searchParams.set(definition.name, definition.value);
        return parsed.href;
      }
      break;
  }
  return url;
}
