// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateIndicator } from './UpdateIndicator';

afterEach(cleanup);
describe('update toolbar indicator', () => {
  it('offers Update only when a newer release is available and disables duplicate download clicks', () => {
    const onUpdate = vi.fn();
    const onCheck = vi.fn();
    const view = render(
      <UpdateIndicator
        state={{
          status: 'available',
          currentVersion: '0.1.11',
          latestVersion: '0.2.0',
          mode: 'automatic',
        }}
        onUpdate={onUpdate}
        onCheck={onCheck}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onCheck).not.toHaveBeenCalled();
    view.rerender(
      <UpdateIndicator
        state={{ status: 'downloading', currentVersion: '0.1.11', progress: 40 }}
        onUpdate={onUpdate}
        onCheck={onCheck}
      />,
    );
    expect(
      (screen.getByRole('button', { name: 'Downloading 40%' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    view.rerender(
      <UpdateIndicator
        state={{
          status: 'available',
          currentVersion: '0.1.11',
          mode: 'manual',
          message: 'Replace WebRad.app in Applications.',
        }}
        onUpdate={onUpdate}
        onCheck={onCheck}
      />,
    );
    expect(screen.getByRole('button', { name: 'Download update' }).title).toContain(
      'Replace WebRad.app',
    );
  });
  it('offers a retry after failure without falsely reporting installation', () => {
    const onCheck = vi.fn();
    render(
      <UpdateIndicator
        state={{ status: 'error', currentVersion: '0.1.11', message: 'offline' }}
        onCheck={onCheck}
        onUpdate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry update check' }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });
});
