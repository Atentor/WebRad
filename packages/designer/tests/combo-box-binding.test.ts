import { expect, it } from 'vitest';
import { ChangePropertyCommand, CommandHistory } from '../src/index.js';
import { comboBoxBinding, comboBoxProject } from '../../../tests/fixtures/combo-box.js';

it('undoes and redoes the complete ComboBox binding as one command without changing identity', () => {
  const page = comboBoxProject().pages[0];
  if (page === undefined) throw new Error('Missing page.');
  const history = new CommandHistory(page);
  const read = () =>
    history.state.components.find((component) => component.id === 'customer-combo');
  history.execute(new ChangePropertyCommand('customer-combo', 'comboBoxConfig', null));
  expect(read()?.props.comboBoxConfig).toBeNull();
  history.undo();
  expect(read()?.props.comboBoxConfig).toEqual(comboBoxBinding);
  history.redo();
  expect(read()?.id).toBe('customer-combo');
  expect(read()?.props.comboBoxConfig).toBeNull();
});
