// @vitest-environment jsdom
import { componentRegistry } from '@webrad/component-registry';
import {
  createDefaultRepeatingGroupConfiguration,
  type ComponentNode,
} from '@webrad/project-model';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { comboBoxApiConfiguration } from '../../../../../tests/fixtures/combo-box';
import { RepeatingGroupConfigurationDialog } from './RepeatingGroupConfigurationDialog';
import { CurrentRowBindingsDialog } from './CurrentRowBindingsDialog';
import { ObjectInspector } from './ObjectInspector';

afterEach(cleanup);

function fixture() {
  const group = componentRegistry.createComponent('WebRepeatingGroup', {
    id: 'group',
    name: 'RepeatingGroup1',
    parentId: 'root',
  });
  const client = componentRegistry.createComponent('WebApiClient', {
    id: 'customers-api',
    name: 'ApiClient1',
    parentId: 'root',
    props: { apiClientConfig: comboBoxApiConfiguration() },
  });
  const button = componentRegistry.createComponent('WebButton', {
    id: 'button',
    name: 'Button1',
    parentId: 'nested',
  });
  const panel = componentRegistry.createComponent('WebPanel', {
    id: 'nested',
    name: 'Panel1',
    parentId: group.id,
  });
  const bound = {
    ...group,
    props: {
      ...group.props,
      repeatingGroupConfig: {
        ...createDefaultRepeatingGroupConfiguration(),
        apiClientId: client.id,
        operationId: 'load-customers',
        listPath: '/customers',
      },
    },
  };
  return { group, bound, client, button, panel, components: [bound, client, button, panel] };
}

it('selects a saved API list and saves row sizing as one isolated draft', async () => {
  const { group, components } = fixture();
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <StrictMode>
      <RepeatingGroupConfigurationDialog
        component={group}
        availableComponents={components}
        onSave={onSave}
        onClose={vi.fn()}
      />
    </StrictMode>,
  );
  const editor = within(screen.getByRole('dialog', { name: 'Configure Repeating Group' }));
  await user.selectOptions(editor.getByLabelText('Repeating Group API Client'), 'customers-api');
  expect(editor.getByLabelText('Repeating Group response list')).toHaveProperty(
    'value',
    '/customers',
  );
  await user.selectOptions(editor.getByLabelText('Repeating Group row height'), 'fixed');
  const height = editor.getByLabelText('Repeating Group fixed row height');
  await user.clear(height);
  await user.type(height, '180');
  expect(onSave).not.toHaveBeenCalled();
  await user.click(editor.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      apiClientId: 'customers-api',
      operationId: 'load-customers',
      listPath: '/customers',
      rowHeightMode: 'fixed',
      fixedRowHeight: 180,
    }),
  );
});

it('blocks impossible row constraints and discards canceled edits', async () => {
  const { bound, components } = fixture();
  const onSave = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <RepeatingGroupConfigurationDialog
      component={bound}
      availableComponents={components}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  await user.type(screen.getByLabelText('Repeating Group maximum row height'), '10');
  expect(screen.getByRole('alert').textContent).toContain('Maximum row height');
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it('allows explicitly unbinding a missing API source and keeps the saved geometry', async () => {
  const { bound } = fixture();
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <RepeatingGroupConfigurationDialog
      component={bound}
      availableComponents={[]}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  await user.selectOptions(screen.getByLabelText('Repeating Group API Client'), '');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({
    ...createDefaultRepeatingGroupConfiguration(),
    apiClientId: null,
    operationId: null,
  });
});

it('binds several visual values without changing authored static values, and filters numeric fields', async () => {
  const { bound, button, components } = fixture();
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <CurrentRowBindingsDialog
      component={button}
      group={bound}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  await user.selectOptions(screen.getByLabelText('Current row Caption'), '/name');
  const index = screen.getByLabelText('Current row TabIndex');
  expect(within(index).queryByRole('option', { name: 'name (string)' })).toBeNull();
  await user.selectOptions(index, '/id');
  expect(onSave).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith([
    { property: 'caption', fieldPath: '/name' },
    { property: 'tabIndex', fieldPath: '/id' },
  ]);
  expect(button.props.caption).toBe('Button');
});

it('keeps a missing operation visible and explains how to select a replacement', async () => {
  const { bound, client, components } = fixture();
  const configuration = comboBoxApiConfiguration();
  const operation = configuration.operations[0]!;
  const replacement = {
    ...client,
    props: {
      ...client.props,
      apiClientConfig: {
        ...configuration,
        operations: [{ ...operation, id: 'replacement', name: 'Replacement' }],
      },
    },
  };
  const onSave = vi.fn();
  render(
    <RepeatingGroupConfigurationDialog
      component={bound}
      availableComponents={components.map((component) =>
        component.id === client.id ? replacement : component,
      )}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Repeating Group operation')).toHaveProperty(
    'value',
    'load-customers',
  );
  expect(screen.getByRole('status').textContent).toContain('saved operation is unavailable');
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Repeating Group operation'), 'replacement');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ operationId: 'replacement', listPath: '/customers' }),
  );
});

it('identifies a removed response list and permits selecting a valid saved list', async () => {
  const { bound, components } = fixture();
  const configuration = bound.props.repeatingGroupConfig as ReturnType<
    typeof createDefaultRepeatingGroupConfiguration
  >;
  const onSave = vi.fn();
  render(
    <RepeatingGroupConfigurationDialog
      component={{
        ...bound,
        props: { ...bound.props, repeatingGroupConfig: { ...configuration, listPath: '/removed' } },
      }}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('status').textContent).toContain('saved response list is unavailable');
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Repeating Group response list'), '/customers');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ listPath: '/customers' }));
});

it('explains an empty API Client and allows recovery through Unbound', async () => {
  const { bound, client } = fixture();
  const emptyClient = {
    ...client,
    props: { ...client.props, apiClientConfig: { ...comboBoxApiConfiguration(), operations: [] } },
  };
  const onSave = vi.fn();
  render(
    <RepeatingGroupConfigurationDialog
      component={bound}
      availableComponents={[emptyClient]}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('status').textContent).toContain('Add an operation');
  expect(screen.getByLabelText('Repeating Group operation')).toHaveProperty('disabled', true);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Repeating Group API Client'), '');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ apiClientId: null, operationId: null }),
  );
});

it('puts content bindings first, exposes the authored fallback and marks unavailable fields', () => {
  const { bound, button, components } = fixture();
  render(
    <CurrentRowBindingsDialog
      component={{
        ...button,
        props: {
          ...button.props,
          currentRowBindings: [{ property: 'caption', fieldPath: '/missing' }],
        },
      }}
      group={bound}
      availableComponents={components}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const caption = screen.getByLabelText('Current row Caption');
  expect(document.activeElement).toBe(caption);
  expect(caption.getAttribute('aria-invalid')).toBe('true');
  const hint = document.getElementById(caption.getAttribute('aria-describedby')!);
  expect(hint?.textContent).toBe('Static value: Button');
});

it('shows unavailable bindings and requires removal or replacement before saving', async () => {
  const { bound, button, components } = fixture();
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <CurrentRowBindingsDialog
      component={{
        ...button,
        props: {
          ...button.props,
          currentRowBindings: [{ property: 'caption', fieldPath: '/removed' }],
        },
      }}
      group={bound}
      availableComponents={components}
      onSave={onSave}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  await user.selectOptions(screen.getByLabelText('Current row Caption'), '__static__');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith([]);
});

it('offers the registry-declared binding workflow for nested descendants and hides it outside rows', async () => {
  const { button, components } = fixture();
  const onDesignerAction = vi.fn();
  const callbacks = {
    onPropertyChange: vi.fn(),
    onEventChange: vi.fn(),
    onEventDoubleClick: vi.fn(),
    onDesignerAction,
  };
  const view = render(
    <ObjectInspector {...callbacks} selection={[button]} availableComponents={components} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Bind Current Row' }));
  expect(onDesignerAction).toHaveBeenCalledWith(
    'current-row-bindings',
    button,
    expect.objectContaining({ name: 'currentRowBindings' }),
  );
  const outside: ComponentNode = { ...button, parentId: 'root' };
  view.rerender(
    <ObjectInspector
      {...callbacks}
      selection={[outside]}
      availableComponents={[
        outside,
        ...components.filter((component) => component.id !== outside.id),
      ]}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Bind Current Row' })).toBeNull();
});
