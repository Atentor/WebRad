import { describe, expect, it } from 'vitest';

import { CommandHistory } from '../src/command-history.js';
import {
  AddComponentCommand,
  ChangeLayoutPropertyCommand,
  ChangePropertyCommand,
  MoveCommand,
  ReorderComponentsCommand,
  RemoveComponentCommand,
  RenameComponentCommand,
  ResizeCommand,
} from '../src/commands.js';
import { DesignerModelError, findDesignerComponent } from '../src/model-utils.js';
import { component, pageFixture } from './fixtures.js';

describe('component commands', () => {
  it('adds a component at an exact model and sibling position and reverses it', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(
      new AddComponentCommand(
        component('new', 'root', {
          name: 'BTNNew',
          bounds: { x: 24, y: 24, width: 80, height: 32 },
        }),
        { siblingIndex: 1, componentIndex: 2 },
      ),
    );

    expect(history.state.components[2]?.id).toBe('new');
    expect(findDesignerComponent(history.state, 'root').children).toEqual([
      'a',
      'new',
      'b',
      'panel',
    ]);
    history.undo();
    expect(history.state).toEqual(pageFixture());
    history.redo();
    expect(findDesignerComponent(history.state, 'new').id).toBe('new');
  });

  it('removes and restores a complete container subtree without taking a page snapshot', () => {
    const original = pageFixture();
    const history = new CommandHistory(original);
    history.execute(new RemoveComponentCommand(['panel', 'inside']));
    expect(history.state.components.map(({ id }) => id)).toEqual(['root', 'a', 'b']);
    expect(findDesignerComponent(history.state, 'root').children).toEqual(['a', 'b']);

    history.undo();
    expect(history.state).toEqual(original);
    history.redo();
    expect(history.state.components.some(({ id }) => id === 'inside')).toBe(false);
  });

  it('moves a multi-selection with one shared delta and parent bounds', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(new MoveCommand(['a', 'b'], { x: 1_000, y: -100 }));

    // Union right edge was 160, so the common X delta is clamped to 480.
    expect(findDesignerComponent(history.state, 'a').bounds).toEqual({
      x: 490,
      y: 0,
      width: 40,
      height: 24,
    });
    expect(findDesignerComponent(history.state, 'b').bounds).toEqual({
      x: 580,
      y: 30,
      width: 60,
      height: 30,
    });
    history.undo();
    expect(findDesignerComponent(history.state, 'a').bounds.x).toBe(10);
  });

  it('refuses a multi-parent move because their coordinates are relative to different containers', () => {
    expect(() =>
      new CommandHistory(pageFixture()).execute(new MoveCommand(['a', 'inside'], { x: 1, y: 1 })),
    ).toThrow(DesignerModelError);
  });

  it('resizes from handles with minimum size and supports a final-bounds command', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(new ResizeCommand('a', 'w', { x: 100, y: 0 }, { minWidth: 16 }));
    expect(findDesignerComponent(history.state, 'a').bounds).toEqual({
      x: 34,
      y: 20,
      width: 16,
      height: 24,
    });
    history.undo();

    history.execute(new ResizeCommand('a', { x: 8, y: 8, width: 120, height: 36 }));
    expect(findDesignerComponent(history.state, 'a').bounds).toEqual({
      x: 8,
      y: 8,
      width: 120,
      height: 36,
    });
    history.undo();
    expect(findDesignerComponent(history.state, 'a').bounds).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 24,
    });
  });

  it('changes a shared property and restores both present and absent old values', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(new ChangePropertyCommand(['a', 'b'], 'enabled', false));
    expect(findDesignerComponent(history.state, 'a').props.enabled).toBe(false);
    expect(findDesignerComponent(history.state, 'b').props.enabled).toBe(false);

    history.undo();
    expect(findDesignerComponent(history.state, 'a').props.enabled).toBe(true);
    expect(Object.hasOwn(findDesignerComponent(history.state, 'b').props, 'enabled')).toBe(false);
  });

  it('changes responsive container and item rules as reversible model deltas', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(new ChangeLayoutPropertyCommand('root', 'container', 'mode', 'row'));
    history.execute(new ChangeLayoutPropertyCommand(['a', 'b'], 'item', 'width', 'stretch'));

    expect(findDesignerComponent(history.state, 'root').layout.container.mode).toBe('row');
    expect(findDesignerComponent(history.state, 'a').layout.item.width).toBe('stretch');
    expect(findDesignerComponent(history.state, 'b').layout.item.width).toBe('stretch');

    history.undo();
    expect(findDesignerComponent(history.state, 'a').layout.item.width).toBe('fixed');
    expect(findDesignerComponent(history.state, 'b').layout.item.width).toBe('fixed');
    history.undo();
    expect(findDesignerComponent(history.state, 'root').layout.container.mode).toBe('fixed');

    expect(() =>
      history.execute(new ChangeLayoutPropertyCommand('a', 'item', 'missingRule', 'value')),
    ).toThrow(DesignerModelError);
  });

  it('reorders direct flow siblings while preserving component IDs and undo history', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(new ReorderComponentsCommand('root', 'b', 'a'));
    expect(findDesignerComponent(history.state, 'root').children).toEqual(['b', 'a', 'panel']);
    expect(findDesignerComponent(history.state, 'b').parentId).toBe('root');

    history.undo();
    expect(findDesignerComponent(history.state, 'root').children).toEqual(['a', 'b', 'panel']);
    history.redo();
    expect(findDesignerComponent(history.state, 'root').children).toEqual(['b', 'a', 'panel']);

    expect(() =>
      new CommandHistory(pageFixture()).execute(
        new ReorderComponentsCommand('root', 'inside', null),
      ),
    ).toThrow(DesignerModelError);
  });

  it('renames without changing stable identity and rejects invalid or duplicate names', () => {
    const history = new CommandHistory(pageFixture());
    history.execute(new RenameComponentCommand('a', 'BTNSave'));
    expect(findDesignerComponent(history.state, 'a')).toMatchObject({ id: 'a', name: 'BTNSave' });
    history.undo();
    expect(findDesignerComponent(history.state, 'a')).toMatchObject({ id: 'a', name: 'BTNA' });

    expect(() => new RenameComponentCommand('a', 'invalid name')).toThrow(DesignerModelError);
    expect(() => history.execute(new RenameComponentCommand('a', 'BTNB'))).toThrow(
      DesignerModelError,
    );
    expect(() => new RenameComponentCommand('a', 'class')).toThrow(DesignerModelError);
  });

  it('treats a multi-property transaction as one undo entry', () => {
    const history = new CommandHistory(pageFixture());
    history.runTransaction('Inspector multi-edit', () => {
      history.execute(new ChangePropertyCommand('a', 'caption', 'Save'));
      history.execute(new ChangePropertyCommand('b', 'caption', 'Save'));
    });
    expect(history.undoDepth).toBe(1);
    history.undo();
    expect(findDesignerComponent(history.state, 'a').props.caption).toBe('A');
    expect(findDesignerComponent(history.state, 'b').props.caption).toBe('B');
  });
});
