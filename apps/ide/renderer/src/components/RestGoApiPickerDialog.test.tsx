// @vitest-environment jsdom

import type { RestGoPublishedApi } from '@webrad/designer';
import {
  createDefaultApiClientConfiguration,
  DEFAULT_REST_GO_PROJECT_SETTINGS,
  type ApiClientConfiguration,
} from '@webrad/project-model';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestGoAdminBridge, RestGoAdminCatalog } from '../../../shared/restgo-admin';
import { RestGoApiPickerDialog } from './RestGoApiPickerDialog';

const originalBridgeDescriptor = Object.getOwnPropertyDescriptor(window, 'webrad');
const baseUrl = 'https://restgo.example.test/backend';

function publishedCatalog(): RestGoAdminCatalog {
  return {
    bancos: [
      {
        id: 1,
        ativo: true,
        slug: 'customers',
        host: 'localhost',
        port: 5432,
        database: 'customers',
        descri: '',
        sslMode: 'require',
      },
    ],
    endpoints: [
      {
        id: 11,
        ativo: true,
        slug: 'orders',
        versao: 2,
        metodo: 'GET',
        script: 'SELECT * FROM orders WHERE id = :id',
        tipo: 'normal',
        idoperacao: null,
      },
      {
        id: 12,
        ativo: true,
        slug: 'orders',
        versao: 2,
        metodo: 'PUT',
        script: 'UPDATE orders SET total = :total WHERE id = :id',
        tipo: 'normal',
        idoperacao: null,
      },
      {
        id: 13,
        ativo: true,
        slug: 'token-orders',
        versao: 4,
        metodo: 'GET',
        script: 'SELECT 1',
        tipo: 'normal',
        idoperacao: null,
      },
      {
        id: 14,
        ativo: true,
        slug: 'public-orders',
        versao: 1,
        metodo: 'GET',
        script: 'SELECT 1',
        tipo: 'normal',
        idoperacao: null,
      },
    ],
    publications: [
      {
        id: 20,
        ativo: true,
        idbanco: 1,
        idendpoint: 11,
        bancoSlug: 'customers',
        endpointSlug: 'orders',
        versao: 2,
        requiresAuthentication: true,
        isPublic: false,
      },
      {
        id: 21,
        ativo: true,
        idbanco: 1,
        idendpoint: 13,
        bancoSlug: 'customers',
        endpointSlug: 'token-orders',
        versao: 4,
        requiresAuthentication: false,
        isPublic: false,
      },
      {
        id: 22,
        ativo: true,
        idbanco: 1,
        idendpoint: 14,
        bancoSlug: 'customers',
        endpointSlug: 'public-orders',
        versao: 1,
        requiresAuthentication: false,
        isPublic: true,
      },
    ],
    operations: [],
  };
}

function renderPicker(
  configuration: ApiClientConfiguration = createDefaultApiClientConfiguration(),
  customBaseUrl = '',
  bridgeOverrides: Partial<Pick<RestGoAdminBridge, 'status' | 'catalog' | 'connect'>> = {},
): {
  readonly bridge: Pick<RestGoAdminBridge, 'status' | 'catalog' | 'connect'>;
  readonly onImport: ReturnType<
    typeof vi.fn<(apis: readonly RestGoPublishedApi[], convertCustom: boolean) => void>
  >;
} {
  const bridge: Pick<RestGoAdminBridge, 'status' | 'catalog' | 'connect'> = {
    status: vi.fn<RestGoAdminBridge['status']>().mockResolvedValue({
      baseUrl,
      connected: true,
      storage: 'session',
      encryptionAvailable: false,
    }),
    catalog: vi.fn<RestGoAdminBridge['catalog']>().mockResolvedValue(publishedCatalog()),
    connect: vi.fn<RestGoAdminBridge['connect']>().mockResolvedValue({
      baseUrl,
      connected: true,
      storage: 'session',
      encryptionAvailable: false,
    }),
    ...bridgeOverrides,
  };
  Object.defineProperty(window, 'webrad', {
    configurable: true,
    value: { restgoAdmin: bridge },
  });
  const onImport = vi.fn<(apis: readonly RestGoPublishedApi[], convertCustom: boolean) => void>();
  render(
    <RestGoApiPickerDialog
      restGoSettings={{ ...DEFAULT_REST_GO_PROJECT_SETTINGS, enabled: true, baseUrl }}
      configuration={configuration}
      customBaseUrl={customBaseUrl}
      onClose={vi.fn()}
      onImport={onImport}
    />,
  );
  return { onImport, bridge };
}

afterEach(() => {
  cleanup();
  if (originalBridgeDescriptor === undefined) Reflect.deleteProperty(window, 'webrad');
  else Object.defineProperty(window, 'webrad', originalBridgeDescriptor);
});

describe('RestGoApiPickerDialog', () => {
  it('limits a selection to one authentication mode and unlocks other modes when cleared', async () => {
    const user = userEvent.setup();
    const { onImport } = renderPicker();
    const jwt = (await screen.findByRole('checkbox', {
      name: 'Import GET customers/orders v2',
    })) as HTMLInputElement;
    const matchingJwt = screen.getByRole('checkbox', {
      name: 'Import PUT customers/orders v2',
    }) as HTMLInputElement;
    const token = screen.getByRole('checkbox', {
      name: 'Import GET customers/token-orders v4',
    }) as HTMLInputElement;
    const publicApi = screen.getByRole('checkbox', {
      name: 'Import GET customers/public-orders v1',
    }) as HTMLInputElement;

    expect(token.disabled).toBe(false);
    expect(publicApi.disabled).toBe(false);
    await user.click(jwt);
    expect(matchingJwt.disabled).toBe(false);
    expect(token.disabled).toBe(true);
    expect(publicApi.disabled).toBe(true);
    expect(screen.getAllByText('Separate client required')).toHaveLength(2);
    await user.click(token);
    expect(token.checked).toBe(false);
    expect(onImport).not.toHaveBeenCalled();

    await user.click(jwt);
    expect(token.disabled).toBe(false);
    expect(publicApi.disabled).toBe(false);
    expect(screen.queryByText('Separate client required')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Import APIs' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('requires conversion consent before importing into a custom client with authored requests', async () => {
    const user = userEvent.setup();
    const defaults = createDefaultApiClientConfiguration();
    const configuration: ApiClientConfiguration = {
      ...defaults,
      operations: defaults.operations.map((operation) => ({
        ...operation,
        name: 'ExistingOrders',
        path: '/legacy/orders',
        headers: [
          { id: 'auth-header', name: 'Authorization', value: 'custom-token', enabled: true },
        ],
      })),
    };
    const { onImport } = renderPicker(configuration, 'https://custom.example.test');
    await user.click(
      await screen.findByRole('checkbox', { name: 'Import GET customers/orders v2' }),
    );
    const importButton = screen.getByRole('button', {
      name: 'Import 1 request',
    }) as HTMLButtonElement;
    const consent = screen.getByRole('checkbox', {
      name: /Use the fixed RestGo URL and authentication/,
    });

    expect(importButton.disabled).toBe(true);
    await user.click(importButton);
    expect(onImport).not.toHaveBeenCalled();
    await user.click(consent);
    expect(importButton.disabled).toBe(false);
    await user.click(consent);
    expect(importButton.disabled).toBe(true);
    await user.click(consent);
    await user.click(importButton);

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith(
      [expect.objectContaining({ id: '20:11', method: 'GET', apiVersion: 2 })],
      true,
    );
    expect(configuration.operations[0]?.headers[0]?.value).toBe('custom-token');
    expect(configuration.operations[0]?.path).toBe('/legacy/orders');
  });

  it('imports same-named GET and PUT selections as distinct versioned request descriptors', async () => {
    const user = userEvent.setup();
    const { onImport } = renderPicker();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Import GET customers/orders v2' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Import PUT customers/orders v2' }));
    await user.click(screen.getByRole('button', { name: 'Import 2 requests' }));

    expect(onImport).toHaveBeenCalledTimes(1);
    const imported = onImport.mock.calls[0];
    expect(imported?.[1]).toBe(false);
    expect(imported?.[0]).toEqual([
      {
        id: '20:11',
        name: 'orders',
        database: 'customers',
        endpoint: 'orders',
        method: 'GET',
        apiVersion: 2,
        authentication: 'jwt',
        kind: 'sql',
        script: 'SELECT * FROM orders WHERE id = :id',
      },
      {
        id: '20:12',
        name: 'orders',
        database: 'customers',
        endpoint: 'orders',
        method: 'PUT',
        apiVersion: 2,
        authentication: 'jwt',
        kind: 'sql',
        script: 'UPDATE orders SET total = :total WHERE id = :id',
      },
    ]);
  });

  it('reconnects rejected administrative access without changing authored request configuration', async () => {
    const user = userEvent.setup();
    const configuration = createDefaultApiClientConfiguration();
    const savedConfiguration = JSON.stringify(configuration);
    const catalog = vi
      .fn<RestGoAdminBridge['catalog']>()
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'webrad:restgo-admin:catalog': Error: RestGo HTTP 401: Administrative access expired or was rejected. Reconnect with an administrative API token.",
        ),
      )
      .mockResolvedValue(publishedCatalog());
    const { bridge, onImport } = renderPicker(configuration, 'https://custom.example.test', {
      catalog,
    });
    const tokenInput = await screen.findByLabelText('Administrative API token');
    expect(screen.getByRole('alert').textContent).not.toContain('Error invoking remote method');
    expect(
      (screen.getByRole('button', { name: 'Import APIs' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(tokenInput, 'rgo.reconnected-administrator');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('checkbox', { name: 'Import GET customers/orders v2' });
    expect(bridge.connect).toHaveBeenCalledWith({
      baseUrl,
      token: 'rgo.reconnected-administrator',
      remember: false,
    });
    expect(screen.queryByLabelText('Administrative API token')).toBeNull();
    expect(JSON.stringify(configuration)).toBe(savedConfiguration);
    expect(onImport).not.toHaveBeenCalled();
    expect(catalog).toHaveBeenCalledTimes(2);
  });

  it('offers administrative connection before loading a disconnected catalog', async () => {
    const { bridge } = renderPicker(createDefaultApiClientConfiguration(), '', {
      status: vi.fn<RestGoAdminBridge['status']>().mockResolvedValue({
        baseUrl,
        connected: false,
        storage: 'none',
        encryptionAvailable: false,
      }),
    });
    await screen.findByLabelText('Administrative API token');
    expect(bridge.catalog).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
