// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { comboBoxProject } from '../../../../../tests/fixtures/combo-box';
import { ComboBoxItemsDialog } from './ComboBoxItemsDialog';

afterEach(cleanup);

function setup(focusField: 'items' | 'values' = 'items') {
  const component = comboBoxProject().pages[0]?.components.find(
    (node) => node.type === 'WebComboBox',
  );
  if (!component) throw new Error('Missing ComboBox.');
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <ComboBoxItemsDialog
      component={{ ...component, props: { items: [], values: [] } }}
      focusField={focusField}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { user: userEvent.setup(), onSave, onClose };
}

it('accepts newline-separated labels and values as one saved draft', async () => {
  const { user, onSave } = setup();
  expect(document.activeElement).toBe(screen.getByLabelText('ComboBox Items'));
  await user.type(screen.getByLabelText('ComboBox Items'), 'Ana{Enter}Bruno{Enter}');
  await user.type(screen.getByLabelText('ComboBox Values'), '1{Enter}2{Enter}');
  expect(onSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(['Ana', 'Bruno'], ['1', '2']);
});

it('requires one value per item, supports text as the value, and cancels drafts', async () => {
  const { user, onSave, onClose } = setup('values');
  expect(document.activeElement).toBe(screen.getByLabelText('ComboBox Values'));
  await user.type(screen.getByLabelText('ComboBox Items'), 'Ana{Enter}Bruno');
  await user.type(screen.getByLabelText('ComboBox Values'), '1');
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  await user.clear(screen.getByLabelText('ComboBox Values'));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(['Ana', 'Bruno'], []);
  onSave.mockClear();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});
