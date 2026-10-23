// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconPickerDialog } from './IconPickerDialog';

afterEach(cleanup);

describe('IconPickerDialog', () => {
  it('presents local SVG icons in a modal gallery and restores trigger focus', async () => {
    const user = userEvent.setup();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const view = render(
      <IconPickerDialog
        icons={['add', 'save']}
        selected="add"
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Choose an icon' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(dialog.querySelectorAll('.wr-icon-picker-option .wr-icon')).toHaveLength(2);
    expect(dialog.querySelector('.wr-modal-close [data-lucide-icon="x"]')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search icons' }));

    await user.click(screen.getByRole('button', { name: 'Select Save icon' }));
    expect(onSelect).toHaveBeenCalledWith('save');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('filters by icon name or label without selecting, and focuses the best matching result', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <IconPickerDialog
        icons={['add', 'chevron-down', 'save']}
        selected="add"
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    );

    const search = screen.getByRole('searchbox', { name: 'Search icons' });
    await user.type(search, 'chevron down');
    expect(screen.queryByRole('button', { name: 'Select Add icon' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select Chevron Down icon' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Select Chevron Down icon' }).textContent).toBe(
      'chevron-down',
    );
    expect(screen.getByRole('button', { name: 'Select Chevron Down icon' }).title).toBe(
      'chevron-down',
    );
    expect(onSelect).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Select Chevron Down icon' }),
    );
    await user.click(screen.getByRole('button', { name: 'Select Chevron Down icon' }));
    expect(onSelect).toHaveBeenCalledWith('chevron-down');
  });

  it('finds canonical icons through labels and non-displayed aliases', async () => {
    const user = userEvent.setup();
    render(
      <IconPickerDialog
        icons={['add', 'close', 'login', 'logout', 'door-in', 'door-out']}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const search = screen.getByRole('searchbox', { name: 'Search icons' });
    await user.type(search, 'door exit');
    expect(screen.getByRole('button', { name: 'Select Door Out icon' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Select Door In icon' })).toBeNull();

    await user.clear(search);
    await user.type(search, 'log in');
    expect(screen.getByRole('button', { name: 'Select Login icon' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Select Logout icon' })).toBeNull();

    await user.clear(search);
    await user.type(search, 'plus');
    expect(screen.getByRole('button', { name: 'Select Add icon' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Select Close icon' })).toBeNull();
  });

  it('keeps focus in the search and announces an empty result set', async () => {
    const user = userEvent.setup();
    render(
      <IconPickerDialog icons={['save']} selected="add" onClose={vi.fn()} onSelect={vi.fn()} />,
    );

    const search = screen.getByRole('searchbox', { name: 'Search icons' });
    await user.type(search, 'missing');
    expect(screen.getByRole('status').textContent).toContain('No icons found');
    expect(document.activeElement).toBe(search);
    expect(screen.queryByRole('button', { name: 'Select Save icon' })).toBeNull();
  });
});
