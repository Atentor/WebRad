// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutDialog } from './AboutDialog';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'webrad');
});

describe('About links', () => {
  it('shows Atentor attribution and highlights the website and documentation', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'webrad', { configurable: true, value: { links: { open } } });
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    const atentor = screen.getByRole('link', { name: 'Atentor' });
    const website = screen.getByRole('link', { name: /WebRAD website & documentation/ });
    expect(screen.getByText(/Powered by/)).toBeTruthy();
    expect(atentor.getAttribute('href')).toBe('https://atentor.com');
    expect(website.getAttribute('href')).toBe('https://webrad.atentor.com');
    await user.tab();
    expect(document.activeElement).toBe(atentor);
    await user.keyboard('{Enter}');
    expect(open).toHaveBeenCalledWith('atentor');
    await user.tab();
    expect(document.activeElement).toBe(website);
    await user.keyboard('{Enter}');
    expect(open).toHaveBeenCalledWith('webrad');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports browser launch failures and allows retry', async () => {
    const open = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue(undefined);
    Object.defineProperty(window, 'webrad', { configurable: true, value: { links: { open } } });
    const user = userEvent.setup();
    render(<AboutDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole('link', { name: 'Atentor' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not open the browser');
    await user.click(screen.getByRole('link', { name: 'Atentor' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
