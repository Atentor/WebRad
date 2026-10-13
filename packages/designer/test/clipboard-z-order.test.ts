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
import { pageFixture } from './fixtures.js';

describe('designer clipboard', () => {
  it('copies normalized roots with complete descendant subtrees', () => {
    const clipboard = copyComponents(pageFixture(), ['inside', 'panel']);
    expect(clipboard.rootIds).toEqual(['panel']);
    expect(clipboard.components.map(({ id }) => id)).toEqual(['panel', 'inside']);
    expect(clipboard.components.find(({ id }) => id === 'panel')?.children).toEqual(['inside']);
  });

  it('materializes fresh IDs, unique names, mapped relationships, and an 8px offset', () => {
    const page = pageFixture();
    const clipboard = copyComponents(page, ['panel']);
    const paste = materializePaste(page, clipboard, {
      createId: (sourceId) => `copy-${sourceId}`,
    });

    expect(paste.rootIds).toEqual(['copy-panel']);
    expect(paste.components.find(({ id }) => id === 'copy-panel')).toMatchObject({
      name: 'PNLMain1',
      parentId: 'root',
      bounds: { x: 208, y: 108, width: 200, height: 160 },
      children: ['copy-inside'],
    });
    expect(paste.components.find(({ id }) => id === 'copy-inside')).toMatchObject({
      name: 'LBLInside1',
      parentId: 'copy-panel',
      bounds: { x: 8, y: 8, width: 80, height: 24 },
    });
  });

  it('uses available numeric suffixes across repeated pastes and copied copies', () => {
    const original = pageFixture();
    const history = new CommandHistory(original);
    history.execute(
      new PasteComponentsCommand(copyComponents(original, ['panel']), {
        createId: (id) => `first-${id}`,
      }),
    );
    history.execute(
      new PasteComponentsCommand(copyComponents(history.state, ['first-panel']), {
        createId: (id) => `second-${id}`,
      }),
    );
    expect(findDesignerComponent(history.state, 'second-first-panel').name).toBe('PNLMain2');
    expect(findDesignerComponent(history.state, 'second-first-inside').name).toBe('LBLInside2');
    const pasted = history.state;
    history.undo();
    history.redo();
    expect(history.state).toEqual(pasted);
  });

  it('checks numeric names case-insensitively and preserves names available in the target', () => {
    const original = pageFixture();
    const page = {
      ...original,
      components: original.components.map((node) => ({
        ...node,
        name: node.id === 'panel' ? 'Component1' : node.id === 'a' ? 'component2' : node.name,
      })),
    };
    const clipboard = copyComponents(page, ['panel']);
    const options = { createId: (id: string) => `paste-${id}` };
    expect(materializePaste(page, clipboard, options).components[0]?.name).toBe('Component3');
    expect(materializePaste(original, clipboard, options).components[0]?.name).toBe('Component1');
  });

  it('pastes and reverses a subtree while reusing the same IDs on redo', () => {
    const original = pageFixture();
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
    const page = pageFixture();
    expect(findDesignerComponent(bringToFront(page, ['a', 'b']), 'root').children).toEqual([
      'panel',
      'a',
      'b',
    ]);
    expect(findDesignerComponent(sendToBack(page, ['b', 'panel']), 'root').children).toEqual([
      'b',
      'panel',
      'a',
    ]);
  });

  it('undoes and redoes exact sibling orders', () => {
    const original = pageFixture();
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
