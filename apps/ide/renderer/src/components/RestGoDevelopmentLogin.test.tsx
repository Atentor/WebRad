// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestGoDevelopmentLogin } from './RestGoDevelopmentLogin';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'webrad');
});
const baseUrl = 'https://restgo.example.test/backend';
const disconnected = {
  baseUrl,
  connected: false,
  storage: 'none',
  encryptionAvailable: true,
  email: null,
} as const;

function installBridge() {
  const bridge = {
    status: vi.fn().mockResolvedValue(disconnected),
    login: vi.fn().mockResolvedValue({
      ...disconnected,
      connected: true,
      storage: 'encrypted',
      email: 'user@example.test',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  Object.defineProperty(window, 'webrad', {
    configurable: true,
    value: { restgoDevelopment: bridge },
  });
  return bridge;
}

describe('Development login form', () => {
  it('signs in, clears the password, shows encrypted persistence and forgets the session', async () => {
    const bridge = installBridge();
    const user = userEvent.setup();
    render(<RestGoDevelopmentLogin baseUrl={baseUrl} disabled={false} />);
    await screen.findByText('Saved with operating system encryption.');
    await user.type(screen.getByLabelText('User email'), 'user@example.test');
    await user.type(screen.getByLabelText('User password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in for development' }));
    expect((await screen.findByRole('status')).textContent).toContain('user@example.test');
    expect(bridge.login).toHaveBeenCalledWith({
      baseUrl,
      email: 'user@example.test',
      password: 'password',
      remember: true,
    });
    expect(screen.getByText('Session encrypted on this device.')).toBeDefined();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign out and forget session' }));
    await screen.findByLabelText('User password');
    expect(bridge.logout).toHaveBeenCalledWith({ baseUrl });
    expect((screen.getByLabelText('User password') as HTMLInputElement).value).toBe('');
    expect(
      (screen.getByLabelText('Remember development login on this device') as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });

  it('reports login rejection and clears the password for another attempt', async () => {
    const bridge = installBridge();
    bridge.login.mockRejectedValue(new Error('Invalid login'));
    const user = userEvent.setup();
    render(<RestGoDevelopmentLogin baseUrl={baseUrl} disabled={false} />);
    await screen.findByText('Saved with operating system encryption.');
    await user.type(screen.getByLabelText('User email'), 'user@example.test');
    await user.type(screen.getByLabelText('User password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in for development' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid login');
    expect((screen.getByLabelText('User password') as HTMLInputElement).value).toBe('');
  });

  it('requires saved connection settings and skips requests while disabled', () => {
    const bridge = installBridge();
    render(<RestGoDevelopmentLogin baseUrl={baseUrl} disabled />);
    expect(bridge.status).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Sign in for development' }).matches(':disabled'),
    ).toBe(true);
  });
});
