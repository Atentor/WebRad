// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { BugReportButton } from './BugReportButton';

afterEach(cleanup);

it('opens the approved issues target without requiring a project', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, 'webrad', { configurable: true, value: { links: { open } } });
  render(<BugReportButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Report a bug' }));
  expect(open.mock.calls).toEqual([['issues']]);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('reports a browser launch failure and lets the user try again', async () => {
  const open = vi
    .fn()
    .mockRejectedValueOnce(new Error('Browser unavailable'))
    .mockResolvedValue(undefined);
  Object.defineProperty(window, 'webrad', { configurable: true, value: { links: { open } } });
  render(<BugReportButton />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Report a bug' }));
  expect(screen.getByRole('alert').textContent).toContain('Could not open the browser');
  await user.click(screen.getByRole('button', { name: 'Report a bug' }));
  expect(open).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
