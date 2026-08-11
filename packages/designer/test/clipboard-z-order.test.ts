import { describe, expect, it } from 'vitest';

import { copyComponents, materializePaste, PasteComponentsCommand } from '../src/clipboard.js';
import { CommandHistory } from '../src/command-history.js';
import { findDesignerComponent } from '../src/model-utils.js';
import {
  BringToFrontCommand,
  bringToFront,
  SendToBackCommand,
  sendToBack,
} from '../src/z-order.js';
import { formFixture } from './fixtures.js';

describe('designer clipboard', () => {
  it('copies normalized roots with complete descendant subtrees', () => {
    const clipboard = copyComponents(formFixture(), ['inside', 'panel']);
    expect(clipboard.rootIds).toEqual(['panel']);
    expect(clipboard.components.map(({ id }) => id)).toEqual(['panel', 'inside']);
    expect(clipboard.components.find(({ id }) => id === 'panel')?.children).toEqual(['inside']);
  });

  it('materializes fresh IDs, unique names, mapped relationships, and an 8px offset', () => {
    const form = formFixture();
    const clipboard = copyComponents(form, ['panel']);
    const paste = materializePaste(form, clipboard, {
      createId: (sourceId) => `copy-${sourceId}`,
    });

    expect(paste.rootIds).toEqual(['copy-panel']);
    expect(paste.components.find(({ id }) => id === 'copy-panel')).toMatchObject({
      name: 'PNLMainCopy',
      parentId: 'root',
      bounds: { x: 208, y: 108, width: 200, height: 160 },
      children: ['copy-inside'],
    });
    expect(paste.components.find(({ id }) => id === 'copy-inside')).toMatchObject({
      name: 'LBLInsideCopy',
      parentId: 'copy-panel',
      bounds: { x: 8, y: 8, width: 80, height: 24 },
    });
  });

  it('pastes and reverses a subtree while reusing the same IDs on redo', () => {
    const original = formFixture();
    const history = new CommandHistory(original);
    const command = new PasteComponentsCommand(copyComponents(original, ['panel']), {
      createId: (sourceId) => `pasted-${sourceId}`,
    });
    history.execute(command);
    expect(command.pastedRootIds).toEqual(['pasted-panel']);
    expect(findDesignerComponent(history.state, 'root').children.at(-1)).toBe('pasted-panel');
    expect(history.state.components).toHaveLength(original.components.length + 2);

    history.undo();
    expect(history.state).toEqual(original);
    history.redo();
    expect(command.pastedRootIds).toEqual(['pasted-panel']);
    expect(history.state.components.filter(({ id }) => id === 'pasted-panel')).toHaveLength(1);
  });
});

describe('Z-order', () => {
  it('brings selected siblings to front and sends them to back while preserving their relative order', () => {
    const form = formFixture();
    expect(findDesignerComponent(bringToFront(form, ['a', 'b']), 'root').children).toEqual([
      'panel',
      'a',
      'b',
    ]);
    expect(findDesignerComponent(sendToBack(form, ['b', 'panel']), 'root').children).toEqual([
      'b',
      'panel',
      'a',
    ]);
  });

  it('undoes and redoes exact sibling orders', () => {
    const original = formFixture();
    const history = new CommandHistory(original);
    history.execute(new BringToFrontCommand('a'));
    expect(findDesignerComponent(history.state, 'root').children).toEqual(['b', 'panel', 'a']);
    history.undo();
    expect(history.state).toEqual(original);
    history.redo();
    expect(findDesignerComponent(history.state, 'root').children).toEqual(['b', 'panel', 'a']);

    history.execute(new SendToBackCommand('panel'));
    expect(findDesignerComponent(history.state, 'root').children[0]).toBe('panel');
  });
});
