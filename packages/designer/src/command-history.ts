export interface Command<TState> {
  readonly label?: string;
  execute(state: TState): TState;
  undo(state: TState): TState;
}

export type HistoryChangeReason = 'execute' | 'undo' | 'redo' | 'rollback' | 'reset';

export interface HistoryChange<TState> {
  readonly state: TState;
  readonly reason: HistoryChangeReason;
  readonly command?: Command<TState>;
}

export type HistoryListener<TState> = (change: HistoryChange<TState>) => void;

interface ActiveTransaction<TState> {
  readonly label: string;
  readonly commands: Command<TState>[];
}

/** A transaction is a list of reversible deltas, never a snapshot of the state. */
export class CompositeCommand<TState> implements Command<TState> {
  public constructor(
    public readonly label: string,
    public readonly commands: readonly Command<TState>[],
  ) {
    if (commands.length === 0) {
      throw new RangeError('A composite command requires at least one command.');
    }
    this.commands = [...commands];
  }

  public execute(state: TState): TState {
    return this.commands.reduce((current, command) => command.execute(current), state);
  }

  public undo(state: TState): TState {
    return [...this.commands].reverse().reduce((current, command) => command.undo(current), state);
  }
}

export interface CommandHistoryOptions {
  /** Maximum command entries retained. Omit for an unbounded history. */
  readonly maxEntries?: number;
}

/**
 * An immutable-state command history. Commands store their own small inverse
 * deltas; the history itself never captures whole-page snapshots.
 */
export class CommandHistory<TState> {
  readonly #listeners = new Set<HistoryListener<TState>>();
  readonly #maxEntries: number | undefined;
  #state: TState;
  #undoStack: Command<TState>[] = [];
  #redoStack: Command<TState>[] = [];
  #activeTransaction: ActiveTransaction<TState> | null = null;

  public constructor(initialState: TState, options: CommandHistoryOptions = {}) {
    if (
      options.maxEntries !== undefined &&
      (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0)
    ) {
      throw new RangeError('maxEntries must be a positive integer.');
    }
    this.#state = initialState;
    this.#maxEntries = options.maxEntries;
  }

  public get state(): TState {
    return this.#state;
  }

  public get canUndo(): boolean {
    return this.#activeTransaction === null && this.#undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.#activeTransaction === null && this.#redoStack.length > 0;
  }

  public get undoDepth(): number {
    return this.#undoStack.length;
  }

  public get redoDepth(): number {
    return this.#redoStack.length;
  }

  public get inTransaction(): boolean {
    return this.#activeTransaction !== null;
  }

  public subscribe(listener: HistoryListener<TState>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  public execute(command: Command<TState>): TState {
    const nextState = command.execute(this.#state);
    this.#state = nextState;
    if (this.#activeTransaction !== null) {
      this.#activeTransaction.commands.push(command);
    } else {
      this.#pushUndo(command);
      this.#redoStack = [];
    }
    this.#emit('execute', command);
    return this.#state;
  }

  public undo(): TState {
    if (this.#activeTransaction !== null) {
      throw new Error('Cannot undo while a transaction is active.');
    }
    const command = this.#undoStack.at(-1);
    if (command === undefined) {
      return this.#state;
    }
    const nextState = command.undo(this.#state);
    this.#undoStack.pop();
    this.#redoStack.push(command);
    this.#state = nextState;
    this.#emit('undo', command);
    return this.#state;
  }

  public redo(): TState {
    if (this.#activeTransaction !== null) {
      throw new Error('Cannot redo while a transaction is active.');
    }
    const command = this.#redoStack.at(-1);
    if (command === undefined) {
      return this.#state;
    }
    const nextState = command.execute(this.#state);
    this.#redoStack.pop();
    this.#pushUndo(command);
    this.#state = nextState;
    this.#emit('redo', command);
    return this.#state;
  }

  public beginTransaction(label = 'Transaction'): void {
    if (this.#activeTransaction !== null) {
      throw new Error('Nested transactions are not supported.');
    }
    this.#activeTransaction = { label, commands: [] };
  }

  public commitTransaction(): TState {
    const transaction = this.#activeTransaction;
    if (transaction === null) {
      throw new Error('No transaction is active.');
    }
    this.#activeTransaction = null;
    if (transaction.commands.length > 0) {
      this.#pushUndo(new CompositeCommand(transaction.label, transaction.commands));
      this.#redoStack = [];
    }
    return this.#state;
  }

  public rollbackTransaction(): TState {
    const transaction = this.#activeTransaction;
    if (transaction === null) {
      throw new Error('No transaction is active.');
    }

    let nextState = this.#state;
    for (let index = transaction.commands.length - 1; index >= 0; index -= 1) {
      const command = transaction.commands[index];
      if (command !== undefined) {
        nextState = command.undo(nextState);
      }
    }
    this.#activeTransaction = null;
    this.#state = nextState;
    this.#emit('rollback');
    return this.#state;
  }

  public runTransaction<TResult>(label: string, operation: () => TResult): TResult {
    this.beginTransaction(label);
    try {
      const result = operation();
      this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      throw error;
    }
  }

  public clear(): void {
    if (this.#activeTransaction !== null) {
      throw new Error('Cannot clear history while a transaction is active.');
    }
    this.#undoStack = [];
    this.#redoStack = [];
  }

  public reset(state: TState): void {
    if (this.#activeTransaction !== null) {
      throw new Error('Cannot reset history while a transaction is active.');
    }
    this.#state = state;
    this.#undoStack = [];
    this.#redoStack = [];
    this.#emit('reset');
  }

  #pushUndo(command: Command<TState>): void {
    this.#undoStack.push(command);
    if (this.#maxEntries !== undefined && this.#undoStack.length > this.#maxEntries) {
      this.#undoStack.splice(0, this.#undoStack.length - this.#maxEntries);
    }
  }

  #emit(reason: HistoryChangeReason, command?: Command<TState>): void {
    const change: HistoryChange<TState> = { state: this.#state, reason, command };
    for (const listener of this.#listeners) {
      listener(change);
    }
  }
}
