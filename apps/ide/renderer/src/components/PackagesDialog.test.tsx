// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebRadBridge } from '../../../shared/contracts';
import type {
  PackageAction,
  PackageSearchRequest,
  PackageSearchResult,
} from '../../../shared/package-contracts';
import { PackagesDialog } from './PackagesDialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createController() {
  return {
    open: true,
    show: vi.fn(),
    close: vi.fn(),
    selectedName: '',
    status: {
      revision: '1',
      toolchain: { available: true, nodeVersion: '26', npmVersion: '12' },
      dependencies: [
        {
          name: 'dayjs',
          requested: '^1.11.0',
          installedVersion: '1.11.0',
          latestVersion: '1.11.13',
        },
      ],
    },
    busy: false,
    refreshing: false,
    error: null as string | null,
    message: null as string | null,
    logs: [] as string[],
    refresh: vi.fn(async () => undefined),
    run: vi.fn<(action: PackageAction, name?: string, version?: string) => Promise<void>>(
      async () => undefined,
    ),
    cancel: vi.fn(async () => undefined),
    packageLibraries: {},
    typeWarnings: [],
  };
}

function bridge(
  search = vi.fn<(request: PackageSearchRequest) => Promise<PackageSearchResult>>(async () => ({
    packages: [],
    total: 0,
    offset: 0,
  })),
) {
  const cancel = vi.fn(async () => undefined);
  window.webrad = { packages: { search, cancel } } as unknown as WebRadBridge;
  return { search, cancel };
}

describe('Packages manager', () => {
  it('dispatches explicit install versions, updates, removal and restore to the project controller', async () => {
    bridge();
    const controller = createController();
    const user = userEvent.setup();
    render(<PackagesDialog projectName="Shop" controller={controller} blocked={false} />);
    expect(screen.getByText('Installed: 1.11.0')).toBeTruthy();
    expect(screen.getByText('Latest: 1.11.13')).toBeTruthy();
    await user.type(screen.getByLabelText('Package name'), '@scope/library');
    await user.type(screen.getByLabelText('Package version'), '2.0.0');
    await user.click(screen.getByRole('button', { name: 'Install' }));
    await user.click(screen.getByRole('button', { name: 'Update dayjs' }));
    await user.click(screen.getByRole('button', { name: 'Remove dayjs' }));
    await user.click(screen.getByRole('button', { name: 'Restore dependencies' }));
    expect(controller.run.mock.calls).toEqual([
      ['install', '@scope/library', '2.0.0'],
      ['update', 'dayjs'],
      ['remove', 'dayjs'],
      ['restore'],
    ]);
  });

  it('searches the registry with pagination and installs an actual result name', async () => {
    const packages = bridge(
      vi.fn(async (request: PackageSearchRequest): Promise<PackageSearchResult> => ({
        packages: [
          { name: 'axios', version: '1.12.0', description: 'HTTP client', license: 'MIT' },
        ],
        total: 30,
        offset: request.offset ?? 0,
      })),
    );
    const controller = createController();
    const user = userEvent.setup();
    render(<PackagesDialog projectName="Shop" controller={controller} blocked={false} />);
    await user.type(screen.getByLabelText('Search NPM packages'), 'axios');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('HTTP client')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(packages.search.mock.calls[1]?.[0]).toMatchObject({ query: 'axios', offset: 1 });
    await user.click(screen.getByRole('button', { name: 'Install axios' }));
    expect(controller.run).toHaveBeenCalledWith('install', 'axios');
  });

  it('cancels an in-flight registry search and discards its late result', async () => {
    let resolveSearch: ((result: PackageSearchResult) => void) | undefined;
    const packages = bridge(
      vi.fn(
        () =>
          new Promise<PackageSearchResult>((resolve) => {
            resolveSearch = resolve;
          }),
      ),
    );
    render(<PackagesDialog projectName="Shop" controller={createController()} blocked={false} />);
    fireEvent.change(screen.getByLabelText('Search NPM packages'), { target: { value: 'axios' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('button', { name: 'Cancel search' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }));
    expect(packages.cancel).toHaveBeenCalledWith(packages.search.mock.calls[0]?.[0].requestId);
    await act(async () =>
      resolveSearch?.({
        packages: [{ name: 'stale', version: '1', description: 'Stale response' }],
        total: 1,
        offset: 0,
      }),
    );
    expect(screen.queryByText('Stale response')).toBeNull();
  });

  it('shows operation errors/logs, keeps cancel available and blocks conflicting actions', async () => {
    bridge();
    const controller = {
      ...createController(),
      busy: true,
      error: 'Network request failed',
      logs: ['npm ERR network'],
      message: 'Installing dayjs',
    };
    render(<PackagesDialog projectName="Shop" controller={controller} blocked={false} />);
    expect(screen.getByRole('alert').textContent).toBe('Network request failed');
    expect(screen.getByLabelText('Package operation log').textContent).toContain('npm ERR network');
    expect(
      (screen.getByRole('button', { name: 'Update dayjs' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel operation' }));
    await waitFor(() => expect(controller.cancel).toHaveBeenCalledOnce());
  });
});
