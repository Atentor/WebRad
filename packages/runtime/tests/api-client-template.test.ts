// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { WebApiClient, type WebApiClientConfiguration } from '../src/api-client.js';
import {
  getApiClientTemplateParameters,
  parseApiClientTemplateTestValue,
  resolveApiClientBodyTemplate,
} from '../src/api-client-template.js';

describe('API Client body templates', () => {
  it('discovers unique names and preserves types when a template changes', () => {
    expect(
      getApiClientTemplateParameters('<id> <chave> <id> <instância>', [
        { name: 'id', type: 'integer' },
        { name: 'removed', type: 'boolean' },
      ]),
    ).toEqual([
      { name: 'id', type: 'integer' },
      { name: 'chave', type: 'string' },
      { name: 'instância', type: 'string' },
    ]);
  });

  it('escapes text and keeps typed JSON values in quoted and unquoted placeholders', () => {
    const text = 'Ana "quoted"\n\\ <id>';
    const content = resolveApiClientBodyTemplate(
      {
        kind: 'json',
        content:
          '{"id":<id>,"name":<name>,"embedded":"prefix <name>","enabled":"<enabled>","extra":<extra>,"items":<items>,"nothing":<nothing>}',
        parameters: [
          { name: 'id', type: 'integer' },
          { name: 'name', type: 'string' },
          { name: 'enabled', type: 'boolean' },
          { name: 'extra', type: 'object' },
          { name: 'items', type: 'array' },
          { name: 'nothing', type: 'null' },
        ],
      },
      { id: 7, name: text, enabled: false, extra: { nested: 'safe' }, items: [1, 2] },
    );
    expect(JSON.parse(content)).toEqual({
      id: 7,
      name: text,
      embedded: `prefix ${text}`,
      enabled: false,
      extra: { nested: 'safe' },
      items: [1, 2],
      nothing: null,
    });
  });

  it('rejects missing or incompatible inputs and never reads inherited parameter values', () => {
    const body = {
      kind: 'json' as const,
      content: '{"id":<id>}',
      parameters: [{ name: 'id', type: 'integer' as const }],
    };
    expect(() => resolveApiClientBodyTemplate(body)).toThrow('requires a value');
    expect(() => resolveApiClientBodyTemplate(body, { id: 1.2 })).toThrow('integer');
    expect(() => resolveApiClientBodyTemplate(body, { id: Number.POSITIVE_INFINITY })).toThrow(
      'integer',
    );
    expect(() => parseApiClientTemplateTestValue(body.parameters[0]!, 'abc')).toThrow('integer');
    expect(() =>
      resolveApiClientBodyTemplate({ kind: 'text', content: '<constructor>' }, {}),
    ).toThrow('requires a value');
    expect(() =>
      resolveApiClientBodyTemplate({ kind: 'json', content: '{"broken": 1<name>}' }, { name: 'x' }),
    ).toThrow();
  });

  it('encodes form values without introducing extra fields or resolving encoded literals', () => {
    const content = resolveApiClientBodyTemplate(
      {
        kind: 'form-urlencoded',
        content: 'value=<value>&tag=one&tag=two&literal=%3Cconstructor%3E',
      },
      { value: 'a&admin=true+ç=' },
    );
    const form = new URLSearchParams(content);
    expect(form.get('value')).toBe('a&admin=true+ç=');
    expect(form.has('admin')).toBe(false);
    expect(form.getAll('tag')).toEqual(['one', 'two']);
    expect(form.get('literal')).toBe('<constructor>');
  });

  it('executes saved templates with programmatic values and allows an explicit body override', async () => {
    const configuration: WebApiClientConfiguration = {
      schemaVersion: 1,
      defaultHeaders: [],
      timeoutMs: 30000,
      operations: [
        {
          id: 'put-key',
          name: 'PutKey',
          method: 'PUT',
          path: '/key',
          headers: [],
          query: [],
          body: {
            kind: 'json',
            content: '{"idinstancia":<idinstancia>,"chave":<chave>}',
            parameters: [
              { name: 'idinstancia', type: 'integer' },
              { name: 'chave', type: 'string' },
            ],
          },
          credentials: 'omit',
          timeoutMs: null,
          responseSchema: null,
        },
      ],
    };
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response('{"success":true}', { headers: { 'Content-Type': 'application/json' } }),
    );
    const client = new WebApiClient({
      baseUrl: 'https://api.example.test',
      apiClientConfig: configuration,
      fetch,
    });
    await expect(client.execute('PutKey')).rejects.toThrow('requires a value');
    expect(fetch).not.toHaveBeenCalled();
    await client.execute('PutKey', { parameters: { idinstancia: 12, chave: 'safe "value"' } });
    const init = fetch.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ idinstancia: 12, chave: 'safe "value"' });
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init).not.toHaveProperty('parameters');
    expect(client.apiClientConfig.operations[0]?.body.content).toContain('<idinstancia>');
    await client.execute('PutKey', { body: { idinstancia: 99, chave: 'override' } });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      idinstancia: 99,
      chave: 'override',
    });
  });
  it('preserves JSON-escaped angle brackets as literals even when other placeholders exist', () => {
    const result = resolveApiClientBodyTemplate(
      {
        kind: 'json',
        content: String.raw`{"id":<id>,"literal":"\u003cconstructor\u003e","known":"\u003cid\u003e"}`,
      },
      { id: 'replacement' },
    );
    expect(JSON.parse(result)).toEqual({
      id: 'replacement',
      literal: '<constructor>',
      known: '<id>',
    });
  });
});
