import { expect, it } from 'vitest';
import {
  ChangePropertyCommand,
  CommandHistory,
  RemoveComponentCommand,
  copyComponents,
  materializePaste,
} from '../src/index.js';
import { repeatingGroupProject } from '../../../tests/fixtures/repeating-group.js';

it('undoes row bindings and template deletion while retaining stable component identities', () => {
  const page = repeatingGroupProject().pages[0]!;
  const history = new CommandHistory(page);
  history.execute(new ChangePropertyCommand('name-row', 'currentRowBindings', []));
  expect(
    history.state.components.find((node) => node.id === 'name-row')?.props.currentRowBindings,
  ).toEqual([]);
  history.undo();
  expect(
    history.state.components.find((node) => node.id === 'name-row')?.props.currentRowBindings,
  ).toEqual([{ property: 'caption', fieldPath: '/name' }]);
  history.execute(new RemoveComponentCommand('panel-row'));
  expect(history.state.components.some((node) => node.id === 'button-row')).toBe(false);
  history.undo();
  expect(history.state.components.find((node) => node.id === 'button-row')?.name).toBe('Choose2');
  history.redo();
  expect(history.state.components.some((node) => node.id === 'panel-row')).toBe(false);
});

it('keeps the row template intact and binds to the copied API Client when pasted together', () => {
  const page = repeatingGroupProject().pages[0]!;
  const paste = materializePaste(page, copyComponents(page, ['customers-api', 'group-row']), {
    createId: (id) => `copy-${id}`,
  });
  expect(
    paste.components.find((node) => node.id === 'copy-group-row')?.props.repeatingGroupConfig,
  ).toMatchObject({
    apiClientId: 'copy-customers-api',
    operationId: 'load-customers',
  });
  expect(
    paste.components.find((node) => node.id === 'copy-name-row')?.props.currentRowBindings,
  ).toEqual([{ property: 'caption', fieldPath: '/name' }]);
  expect(paste.components.find((node) => node.id === 'copy-panel-row')?.children).toEqual([
    'copy-name-row',
    'copy-button-row',
  ]);
  const groupOnly = materializePaste(page, copyComponents(page, ['group-row']), {
    createId: (id) => `only-${id}`,
  });
  expect(groupOnly.components[0]?.props.repeatingGroupConfig).toMatchObject({
    apiClientId: 'customers-api',
  });
});
