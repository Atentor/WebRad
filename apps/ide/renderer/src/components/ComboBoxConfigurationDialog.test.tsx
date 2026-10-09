// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { comboBoxBinding, comboBoxProject } from '../../../../../tests/fixtures/combo-box.js';
import { ComboBoxConfigurationDialog } from './ComboBoxConfigurationDialog';

afterEach(cleanup);

function setup(bound = false) {
  const page = comboBoxProject().pages[0];
  const component = page?.components.find((candidate) => candidate.type === 'WebComboBox');
  if (page === undefined || component === undefined) throw new Error('Missing fixture.');
  const onSave = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <StrictMode>
      <ComboBoxConfigurationDialog
        component={{
          ...component,
          props: { ...component.props, comboBoxConfig: bound ? comboBoxBinding : null },
        }}
        availableComponents={page.components}
        onSave={onSave}
        onClose={onClose}
      />
    </StrictMode>,
  );
  return {
    user,
    onSave,
    onClose,
    editor: within(screen.getByRole('dialog', { name: 'Configure ComboBox' })),
  };
}

it('selects the API Client, response list, displayed field, and key and saves one draft', async () => {
  const { user, onSave, editor } = setup();
  await user.selectOptions(editor.getByLabelText('ComboBox API Client'), 'customers-api');
  expect(editor.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  await user.selectOptions(editor.getByLabelText('ComboBox display field'), '/name');
  await user.selectOptions(editor.getByLabelText('ComboBox key field'), '/id');
  expect(onSave).not.toHaveBeenCalled();
  await user.click(editor.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(comboBoxBinding);
});

it('reopens the saved binding, clears obsolete field choices on list changes, and supports primitive items', async () => {
  const { user, onSave, editor } = setup(true);
  expect(editor.getByLabelText('ComboBox display field')).toHaveProperty('value', '/name');
  expect(editor.getByLabelText('ComboBox key field')).toHaveProperty('value', '/id');
  await user.selectOptions(editor.getByLabelText('ComboBox response list'), '/codes');
  expect(editor.getByLabelText('ComboBox display field')).toHaveProperty('value', '');
  await user.click(editor.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({
    ...comboBoxBinding,
    listPath: '/codes',
    displayField: '',
    keyField: '',
  });
});

it('returns to static items explicitly and cancels without saving', async () => {
  const { user, onSave, onClose, editor } = setup(true);
  await user.selectOptions(editor.getByLabelText('ComboBox API Client'), '');
  await user.click(editor.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(null);
  onSave.mockClear();
  await user.selectOptions(editor.getByLabelText('ComboBox API Client'), 'customers-api');
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it('allows removing a binding when its API Client was deleted', async () => {
  const component = comboBoxProject().pages[0]?.components.find(
    (candidate) => candidate.type === 'WebComboBox',
  );
  if (component === undefined) throw new Error('Missing ComboBox.');
  const onSave = vi.fn();
  render(
    <ComboBoxConfigurationDialog
      component={component}
      availableComponents={[]}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  expect(screen.getByLabelText('ComboBox API Client')).toHaveProperty('value', 'customers-api');
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  await user.selectOptions(screen.getByLabelText('ComboBox API Client'), '');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(null);
});
