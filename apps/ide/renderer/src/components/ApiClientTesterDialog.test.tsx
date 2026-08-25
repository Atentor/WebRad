// @vitest-environment jsdom

import {
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  type ComponentNode,
} from '@webrad/project-model';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientTesterDialog } from './ApiClientTesterDialog';

const apiClientComponent: ComponentNode = {
  id: 'api-client-1',
  type: 'WebApiClient',
  name: 'ApiClient1',
  parentId: null,
  layout: createDefaultComponentLayout(),
  bounds: { x: 0, y: 0, width: 112, height: 52 },
  props: {
    baseUrl: '',
    apiClientConfig: createDefaultApiClientConfiguration(),
  },
  events: {},
  children: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function configureAndSend(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Base URL'), 'https://api.example.test');
  await user.type(screen.getByLabelText('Path'), '/customers');
  await user.click(screen.getByRole('button', { name: 'Send test request' }));
  return user;
}

describe('ApiClientTesterDialog', () => {
  it('infers and saves a successful JSON response contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ customers: [{ id: 1, name: 'Ada' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const onSave = vi.fn();

    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );

    const user = await configureAndSend();
    await screen.findByRole('region', { name: 'Response definitions' });
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));

    const configuration = onSave.mock.calls[0]?.[1];
    const customers = configuration?.operations[0]?.responseSchema?.root.children.find(
      (node: { readonly name: string }) => node.name === 'customers',
    );
    expect(customers).toMatchObject({ kind: 'list', path: '/customers' });
    expect(customers?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', fieldType: 'integer', path: '/customers/*/id' }),
        expect.objectContaining({ name: 'name', fieldType: 'string', path: '/customers/*/name' }),
      ]),
    );
  });

  it('shows a JSON HTTP error without saving its error envelope as output schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Not found' } }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const onSave = vi.fn();

    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );

    const user = await configureAndSend();
    await screen.findByText('404 Not Found');
    expect(screen.queryByRole('region', { name: 'Response definitions' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[1]?.operations[0]?.responseSchema).toBeNull();
  });
});
