import { describe, expect, it, vi } from 'vitest';

import { CommandHistory, type Command } from '../src/command-history.js';

class AddNumber implements Command<number> {
  public constructor(
    readonly amount: number,
    public readonly label = `Add ${amount}`,
  ) {}

  public execute(state: number): number {
    return state + this.amount;
  }

  public undo(state: number): number {
    return state - this.amount;
  }
}

describe('CommandHistory', () => {
  it('executes, undoes, redoes, and invalidates a divergent redo branch', () => {
    const history = new CommandHistory(0);
    history.execute(new AddNumber(2));
    history.execute(new AddNumber(3));
    expect(history.state).toBe(5);
    expect(history.undo()).toBe(2);
    expect(history.redo()).toBe(5);
    history.undo();
    history.execute(new AddNumber(10));
    expect(history.state).toBe(12);
    expect(history.canRedo).toBe(false);
  });

  it('groups many deltas into one transaction entry without state snapshots', () => {
    const history = new CommandHistory(0);
    history.runTransaction('Move selection', () => {
      history.execute(new AddNumber(1));
      history.execute(new AddNumber(2));
      history.execute(new AddNumber(3));
    });
    expect(history.state).toBe(6);
    expect(history.undoDepth).toBe(1);
    expect(history.undo()).toBe(0);
    expect(history.redo()).toBe(6);
  });

  it('rolls back every delta when a transaction fails', () => {
    const history = new CommandHistory(4);
    const listener = vi.fn();
    history.subscribe(listener);
    expect(() =>
      history.runTransaction('Failing operation', () => {
        history.execute(new AddNumber(10));
        history.execute({
          execute: () => {
            throw new Error('failure');
          },
          undo: (state) => state,
        });
      }),
    ).toThrow('failure');
    expect(history.state).toBe(4);
    expect(history.undoDepth).toBe(0);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'rollback', state: 4 }),
    );
  });

  it('honors the configured history bound', () => {
    const history = new CommandHistory(0, { maxEntries: 2 });
    history.execute(new AddNumber(1));
    history.execute(new AddNumber(2));
    history.execute(new AddNumber(4));
    expect(history.undoDepth).toBe(2);
    expect(history.undo()).toBe(3);
    expect(history.undo()).toBe(1);
    expect(history.undo()).toBe(1);
  });
});
