// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddPageDialog } from './AddPageDialog';
afterEach(cleanup);
describe('AddPageDialog', () => {
  it('shows the suggested page name and creates the normalized name', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <AddPageDialog
        kind="page"
        suggestedName="Page2"
        occupiedNames={['index']}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Add page' });
    const input = within(dialog).getByRole('textbox', { name: 'Page name' });
    expect((input as HTMLInputElement).value).toBe('Page2');
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, '  Orders  ');
    await user.click(within(dialog).getByRole('button', { name: 'Add page' }));
    expect(onCreate).toHaveBeenCalledWith('Orders');
  });
  it('rejects invalid names and portable duplicate names before creation', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <AddPageDialog
        kind="page"
        suggestedName="Page2"
        occupiedNames={['index']}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Page name' });
    await user.clear(input);
    await user.type(input, 'Page Main');
    await user.click(screen.getByRole('button', { name: 'Add page' }));
    expect(screen.getByRole('alert').textContent).toContain('TypeScript identifier');
    expect(onCreate).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'INDEX');
    await user.click(screen.getByRole('button', { name: 'Add page' }));
    expect(screen.getByRole('alert').textContent).toContain('already exists');
    expect(onCreate).not.toHaveBeenCalled();
  });
  it('uses reusable-component labels and closes from Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AddPageDialog
        kind="reusable"
        suggestedName="Reusable1"
        occupiedNames={[]}
        onCancel={onCancel}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Add reusable component' })).toBeDefined();
    expect(
      (screen.getByRole('textbox', { name: 'Reusable component name' }) as HTMLInputElement).value,
    ).toBe('Reusable1');
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
