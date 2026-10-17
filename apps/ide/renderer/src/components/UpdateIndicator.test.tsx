// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../../../shared/update-contracts';
import { UpdateIndicator } from './UpdateIndicator';

afterEach(cleanup);
describe('update toolbar indicator', () => {
  it('offers Update only when a newer release is available and disables duplicate download clicks', () => {
    const onUpdate = vi.fn();
    const view = render(
      <UpdateIndicator
        state={{
          status: 'available',
          currentVersion: '0.1.11',
          latestVersion: '0.2.0',
          mode: 'automatic',
        }}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    view.rerender(
      <UpdateIndicator
        state={{ status: 'downloading', currentVersion: '0.1.11', progress: 40 }}
        onUpdate={onUpdate}
      />,
    );
    expect((screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Update' }).title).toBe('Downloading 40%');
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    view.rerender(
      <UpdateIndicator
        state={{
          status: 'available',
          currentVersion: '0.1.11',
          mode: 'manual',
          message: 'Replace WebRad.app in Applications.',
        }}
        onUpdate={onUpdate}
      />,
    );
    expect(screen.getByRole('button', { name: 'Update' }).title).toContain('Replace WebRad.app');
  });
  it.each<UpdateStatus>(['idle', 'disabled', 'checking', 'current', 'error'])(
    'hides the button when update availability is not confirmed (%s)',
    (status) => {
      render(
        <UpdateIndicator
          state={{ status, currentVersion: '0.1.11', message: 'offline' }}
          onUpdate={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
  it.each<UpdateStatus>(['ready', 'installing', 'manual'])(
    'keeps the Update label during the confirmed update flow (%s)',
    (status) => {
      const onUpdate = vi.fn();
      render(
        <UpdateIndicator
          state={{ status, currentVersion: '0.1.11', latestVersion: '0.2.0' }}
          onUpdate={onUpdate}
        />,
      );
      const button = screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement;
      expect(button.textContent).toBe('Update');
      expect(button.disabled).toBe(status !== 'ready');
      fireEvent.click(button);
      expect(onUpdate).toHaveBeenCalledTimes(status === 'ready' ? 1 : 0);
    },
  );
});
