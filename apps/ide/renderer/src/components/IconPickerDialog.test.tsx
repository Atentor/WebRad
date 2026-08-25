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
    expect(dialog.querySelectorAll('.wr-icon')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Select Add icon' }));

    await user.click(screen.getByRole('button', { name: 'Select Save icon' }));
    expect(onSelect).toHaveBeenCalledWith('save');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
