// @vitest-environment jsdom

import {
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  DEFAULT_REST_GO_PROJECT_SETTINGS,
  type ComponentNode,
} from '@webrad/project-model';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  it('removes the last endpoint, saves an empty client and can add an endpoint after reopening', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const view = render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );
    const remove = screen.getByRole('button', { name: 'Remove operation' }) as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.test');
    await user.click(remove);
    expect(screen.getByRole('dialog', { name: 'API Client' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('No endpoints configured');
    expect(screen.queryByRole('button', { name: 'Send test request' })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Remove operation' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add operation' }));
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    const [baseUrl, apiClientConfig] = onSave.mock.calls[0] as [
      string,
      ReturnType<typeof createDefaultApiClientConfiguration>,
    ];
    expect(baseUrl).toBe('https://api.example.test');
    expect(apiClientConfig.operations).toEqual([]);
    expect(apiClientComponent.props.apiClientConfig).toEqual(createDefaultApiClientConfiguration());
    view.unmount();
    render(
      <ApiClientTesterDialog
        component={{
          ...apiClientComponent,
          props: { ...apiClientComponent.props, baseUrl, apiClientConfig },
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('No endpoints configured');
    await user.click(screen.getByRole('button', { name: 'Add operation' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(baseUrl);
    expect((screen.getByLabelText('Operation name') as HTMLInputElement).value).toBe('Request1');
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(onSave.mock.calls[1]?.[1]?.operations).toHaveLength(1);
    expect(onSave.mock.calls[1]?.[1]?.operations[0]?.id).not.toBe('operation-1');
  });

  it('discards deletion of the last endpoint when canceled', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={onClose} onSave={onSave} />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove operation' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(apiClientComponent.props.apiClientConfig).toEqual(createDefaultApiClientConfiguration());
  });

  it('tests and saves an independent API version for each request', async () => {
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response('{}', {
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.test/restgo');
    await user.type(screen.getByLabelText('Path'), '/database/items');
    await user.type(screen.getByLabelText('Dynamic API version'), '2');
    await user.click(screen.getByRole('button', { name: 'Send test request' }));
    await screen.findByRole('region', { name: 'Response definitions' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example.test/restgo/v2/database/items');
    await user.click(
      within(screen.getByRole('complementary', { name: 'API operations' })).getByRole('button', {
        name: 'Add operation',
      }),
    );
    expect((screen.getByLabelText('Dynamic API version') as HTMLInputElement).value).toBe('');
    await user.type(screen.getByLabelText('Dynamic API version'), '3');
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(
      onSave.mock.calls[0]?.[1]?.operations.map(
        (operation: { apiVersion?: number }) => operation.apiVersion,
      ),
    ).toEqual([2, 3]);
  });
  it('preserves chosen response fields when selecting the active operation or switching operations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 1, name: 'Ada' }), {
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
    await user.click(screen.getByLabelText('Save name'));
    await user.click(screen.getByRole('button', { name: 'Request GET' }));
    expect((screen.getByLabelText('Save name') as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Add operation' }));
    await user.click(screen.getByRole('button', { name: 'Request GET' }));
    expect(screen.queryByLabelText('Save name')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(
      onSave.mock.calls[0]?.[1]?.operations[0]?.responseSchema?.root.children.map(
        (node: { name: string }) => node.name,
      ),
    ).toEqual(['id']);
  });

  it('allocates an unused operation name after removals', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );
    await user.click(screen.getByRole('button', { name: 'Add operation' }));
    await user.click(screen.getByRole('button', { name: 'Add operation' }));
    await user.click(screen.getByRole('button', { name: 'Request2 GET' }));
    await user.click(screen.getByRole('button', { name: 'Remove operation' }));
    await user.click(screen.getByRole('button', { name: 'Add operation' }));
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(
      onSave.mock.calls[0]?.[1]?.operations.map((operation: { name: string }) => operation.name),
    ).toEqual(['Request', 'Request3', 'Request4']);
  });

  it('offers every standard method and a custom method, with browser restrictions visible', async () => {
    const user = userEvent.setup();
    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    const selector = screen.getByLabelText('Method');
    expect([...selector.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
      'CONNECT',
      'TRACE',
      '__custom__',
    ]);
    await user.selectOptions(selector, 'TRACE');
    expect(screen.getByRole('note').textContent).toContain('Browsers prohibit TRACE');
    expect(
      (screen.getByRole('button', { name: 'Send test request' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.selectOptions(selector, '__custom__');
    await user.clear(screen.getByLabelText('Custom method'));
    await user.type(screen.getByLabelText('Custom method'), 'report');
    expect((screen.getByLabelText('Custom method') as HTMLInputElement).value).toBe('REPORT');
  });

  it('preserves headers and query edits across tabs and sends multipart fields with temporary files', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.test/v1');
    await user.type(screen.getByLabelText('Path'), '/upload');
    await user.selectOptions(screen.getByLabelText('Method'), 'POST');
    await user.click(screen.getByRole('button', { name: 'Add query parameters' }));
    await user.type(screen.getByLabelText(/^Query parameters name /), 'tag');
    await user.type(screen.getByLabelText('Query parameters value tag'), 'a b');
    await user.click(screen.getByRole('tab', { name: 'Headers' }));
    await user.click(screen.getByRole('button', { name: 'Add headers' }));
    await user.type(screen.getByLabelText(/^Headers name /), 'X-Client');
    await user.type(screen.getByLabelText('Headers value X-Client'), 'webrad');
    await user.click(screen.getByRole('tab', { name: 'Body' }));
    await user.selectOptions(screen.getByLabelText('Body type'), 'form-data');
    await user.type(screen.getByLabelText('Request body'), 'name=Ada&tag=one&tag=two');
    await user.upload(
      screen.getByLabelText('Test files'),
      new File(['hello'], 'hello.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Send test request' }));
    await screen.findByText('204');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/upload?tag=a+b');
    expect(new Headers(init.headers).get('X-Client')).toBe('webrad');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect((init.body as FormData).get('name')).toBe('Ada');
    expect((init.body as FormData).getAll('tag')).toEqual(['one', 'two']);
    expect(((init.body as FormData).get('file') as File).name).toBe('hello.txt');
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('hello.txt');
    expect(onSave.mock.calls[0]?.[1]?.operations[0]).toMatchObject({
      method: 'POST',
      body: { kind: 'form-data', content: 'name=Ada&tag=one&tag=two' },
    });
  });

  it('locks the integration URL, sends the test JWT and saves only the authenticated binding', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ApiClientTesterDialog
        component={apiClientComponent}
        restGoSettings={{
          ...DEFAULT_REST_GO_PROJECT_SETTINGS,
          enabled: true,
          baseUrl: 'https://restgo.example.test/backend',
          apiToken: 'raw-token',
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Connection'), 'restgo-session');
    const base = screen.getByLabelText('Base URL') as HTMLInputElement;
    expect(base.readOnly).toBe(true);
    expect(base.value).toBe('https://restgo.example.test/backend');
    await user.type(base, 'https://other.example.test');
    expect(base.value).toBe('https://restgo.example.test/backend');
    await user.type(screen.getByLabelText('Path'), '/v1/demo/customers');
    await user.type(screen.getByLabelText('Dynamic API version'), '2');
    await user.click(screen.getByText('Test authentication'));
    await user.type(screen.getByLabelText('Test JWT'), 'temporary-user-jwt');
    await user.click(screen.getByRole('button', { name: 'Send test request' }));
    await screen.findByText('204');
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://restgo.example.test/backend/v2/demo/customers');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer temporary-user-jwt');
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error' });
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(onSave.mock.calls[0]?.[0]).toBe('');
    expect(onSave.mock.calls[0]?.[1]).toMatchObject({ connection: 'restgo-session' });
    expect(onSave.mock.calls[0]?.[1]?.operations[0]?.apiVersion).toBe(2);
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('temporary-user-jwt');
    expect(JSON.stringify(onSave.mock.calls)).not.toContain('raw-token');
  });

  it('rejects anonymous tests and endpoint escapes before making a RestGo request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <ApiClientTesterDialog
        component={apiClientComponent}
        restGoSettings={{
          ...DEFAULT_REST_GO_PROJECT_SETTINGS,
          enabled: true,
          baseUrl: 'https://restgo.example.test/backend',
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText('Connection'), 'restgo-session');
    await user.type(screen.getByLabelText('Path'), '/customers');
    await user.click(screen.getByRole('button', { name: 'Send test request' }));
    expect((await screen.findByRole('alert')).textContent).toContain('temporary Test JWT');
    await user.clear(screen.getByLabelText('Path'));
    await user.type(screen.getByLabelText('Path'), 'https://other.example.test/customers');
    await user.click(screen.getByRole('button', { name: 'Send test request' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('configured integration URL'),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('removes a body when switching to GET and requires integration setup before saving a binding', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ApiClientTesterDialog component={apiClientComponent} onClose={vi.fn()} onSave={onSave} />,
    );
    await user.selectOptions(screen.getByLabelText('Method'), 'POST');
    await user.click(screen.getByRole('tab', { name: 'Body' }));
    await user.selectOptions(screen.getByLabelText('Body type'), 'text');
    await user.type(screen.getByLabelText('Request body'), 'content');
    await user.selectOptions(screen.getByLabelText('Method'), 'GET');
    expect((screen.getByLabelText('Body type') as HTMLSelectElement).value).toBe('none');
    expect((screen.getByLabelText('Body type') as HTMLSelectElement).disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText('Connection'), 'restgo-session');
    await user.click(screen.getByRole('button', { name: 'Save API Client' }));
    expect(screen.getByRole('alert').textContent).toContain('Enable RestGo integration');
    expect(onSave).not.toHaveBeenCalled();
  });

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
