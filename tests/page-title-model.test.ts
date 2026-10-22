import { describe, expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ChangePropertyCommand, CommandHistory } from '@webrad/designer';
import { createPage, deserializePage, serializePage } from '@webrad/project-model';

describe('page browser title model', () => {
  it('registers an optional browser title independently from the page caption and identity', () => {
    const definition = defaultComponentRegistry.require('WebPage');
    expect(definition.properties.find(({ name }) => name === 'browserTitle')).toMatchObject({
      label: 'Browser title',
      type: 'string',
      source: 'props',
      defaultValue: '',
    });
    expect(defaultComponentRegistry.createComponent('WebPage').props.browserTitle).toBe('');
    expect(createPage().components[0]?.props.browserTitle).toBe('');
    expect(
      defaultComponentRegistry
        .require('WebPanel')
        .properties.some(({ name }) => name === 'browserTitle'),
    ).toBe(false);
  });

  it('persists edits and clearing with undo/redo while preserving old pages and stable IDs', () => {
    const initial = createPage('PageMain', { caption: 'Main page' });
    const legacy = deserializePage(
      serializePage({
        ...initial,
        components: initial.components.map((node) => ({
          ...node,
          props: { caption: 'Main page' },
        })),
      }),
    );
    const history = new CommandHistory(legacy);
    const root = (): (typeof initial.components)[number] => history.state.components[0]!;
    expect(root().props.browserTitle).toBeUndefined();
    history.execute(
      new ChangePropertyCommand(legacy.rootComponentId, 'browserTitle', 'Portal <&>'),
    );
    expect(deserializePage(serializePage(history.state)).components[0]?.props.browserTitle).toBe(
      'Portal <&>',
    );
    expect(root().id).toBe(legacy.rootComponentId);
    expect(root().name).toBe('PageMain');
    expect(history.state.caption).toBe('Main page');
    expect(root().props.caption).toBe('Main page');
    history.undo();
    expect(Object.hasOwn(root().props, 'browserTitle')).toBe(false);
    history.redo();
    expect(root().props.browserTitle).toBe('Portal <&>');
    history.execute(new ChangePropertyCommand(legacy.rootComponentId, 'browserTitle', ''));
    expect(deserializePage(serializePage(history.state)).components[0]?.props.browserTitle).toBe(
      '',
    );
    history.undo();
    expect(root().props.browserTitle).toBe('Portal <&>');
  });
});
