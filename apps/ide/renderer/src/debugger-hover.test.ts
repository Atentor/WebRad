import { describe, expect, it, vi } from 'vitest';
import type { CancellationToken, editor, Position } from 'monaco-editor/editor';
import type { DebugEvaluation } from '../../shared/debugger-contracts';
import { createDebugTestBridge } from '../../shared/debugger-test-bridge';
import {
  createDebugHoverProvider,
  debugHoverExpression,
  type DebugHoverContext,
} from './debugger-hover';

function fixture() {
  const bridge = createDebugTestBridge();
  const context: DebugHoverContext = {
    bridge,
    sessionId: 'session',
    frameId: 'frame',
    path: 'pages/Main.ts',
  };
  let current: DebugHoverContext | null = context;
  let version = 1;
  const model = {
    getValue: () => 'let aaa: number; aaa = 123;',
    getOffsetAt: (position: Position) => position.column - 1,
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
    getVersionId: () => version,
    isDisposed: () => false,
  } as editor.ITextModel;
  let active: editor.ITextModel | null = model;
  const token = { isCancellationRequested: false } as CancellationToken;
  const provider = createDebugHoverProvider(
    () => current,
    () => active,
  );
  const hover = () =>
    provider.provideHover(model, { lineNumber: 1, column: 18 } as Position, token);
  return {
    bridge,
    model,
    token,
    hover,
    context,
    setContext: (next: DebugHoverContext | null) => {
      current = next;
    },
    switchModel: () => {
      active = null;
    },
    editModel: () => {
      version += 1;
    },
  };
}

describe('paused debugger hover', () => {
  it('displays the assigned value and evaluates only the reference in the selected frame', async () => {
    const { bridge, hover } = fixture();
    vi.mocked(bridge.evaluate).mockResolvedValue({ value: { type: 'number', description: '123' } });
    expect(await hover()).toMatchObject({
      contents: [
        { value: expect.stringContaining('aaa = 123'), isTrusted: false, supportHtml: false },
      ],
    });
    expect(bridge.evaluate).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'session',
      frameId: 'frame',
      expression: 'aaa',
      throwOnSideEffect: true,
    });
  });

  it.each(['resume', 'frame', 'model', 'edit', 'cancel'] as const)(
    'discards an evaluation after %s',
    async (change) => {
      const f = fixture();
      let resolve!: (result: DebugEvaluation) => void;
      vi.mocked(f.bridge.evaluate).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = f.hover();
      if (change === 'resume') f.setContext(null);
      if (change === 'frame') f.setContext({ ...f.context, frameId: 'other' });
      if (change === 'model') f.switchModel();
      if (change === 'edit') f.editModel();
      if (change === 'cancel') Object.assign(f.token, { isCancellationRequested: true });
      resolve({ value: { type: 'number', description: '123' } });
      expect(await pending).toBeNull();
    },
  );

  it('does not evaluate while running or outside the active source model', async () => {
    const f = fixture();
    f.switchModel();
    expect(await f.hover()).toBeNull();
    f.setContext(null);
    expect(await f.hover()).toBeNull();
    expect(f.bridge.evaluate).not.toHaveBeenCalled();
  });

  it('leaves unavailable and side-effecting values to the normal TypeScript hover', async () => {
    const { bridge, hover } = fixture();
    vi.mocked(bridge.evaluate).mockResolvedValue({
      value: { type: 'undefined', description: 'undefined' },
      error: 'ReferenceError',
    });
    expect(await hover()).toBeNull();
    vi.mocked(bridge.evaluate).mockRejectedValue(new Error('expired frame'));
    expect(await hover()).toBeNull();
  });

  it('renders application strings as inert text even with markdown fences', async () => {
    const { bridge, hover } = fixture();
    vi.mocked(bridge.evaluate).mockResolvedValue({
      value: { type: 'string', description: '```\n[click](command:evil)\n<script>' },
    });
    const result = await hover();
    expect(result?.contents[0]?.value).toContain('````text');
    expect(result?.contents[0]).toMatchObject({ isTrusted: false, supportHtml: false });
  });
});

describe('hover reference AST', () => {
  it.each([
    ['aaa = 123', 'aaa', 'aaa'],
    ['payload.nested.ok', 'ok', 'payload.nested.ok'],
    ['payload.nested.ok', 'nested', 'payload.nested'],
    ['payload.nested.ok', 'payload', 'payload'],
    ['this.Button.caption', 'caption', 'this.Button.caption'],
    ['payload["nested"].ok', 'ok', 'payload["nested"].ok'],
    ['payload?.nested', 'nested', 'payload?.nested'],
    ['getPayload().count', 'count', null],
    ['payload[index++].count', 'count', null],
    ['const text = "aaa";', 'aaa', null],
    ['// aaa\nlet value = 1;', 'aaa', null],
    ['let aaa: Number;', 'Number', null],
    ['import { aaa } from "./other";', 'aaa', null],
    ['const obj = { aaa: 1 };', 'aaa', null],
  ])('extracts the reference in %s', (source, word, expression) => {
    expect(debugHoverExpression(source, source.indexOf(word))?.expression ?? null).toBe(expression);
  });
});
