import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);

interface SmokeProcessResult {
  readonly exitCode: number;
  readonly elapsedMilliseconds: number;
  readonly timedOut?: {
    readonly phase: 'startup' | 'functional';
    readonly milliseconds: number;
    readonly lastProgress: string;
  };
}

async function run(scenario: string): Promise<SmokeProcessResult> {
  const { stdout } = await execute(
    process.execPath,
    [path.resolve('tests/fixtures/smoke-process.mjs'), scenario],
    { timeout: 10_000 },
  );
  return JSON.parse(stdout) as SmokeProcessResult;
}

describe('development smoke process deadlines', () => {
  it('bounds a cold startup stall and reports its last progress', async () => {
    const result = await run('startup-stall');
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toEqual({
      phase: 'startup',
      milliseconds: 1_000,
      lastProgress: 'compiler passed: cold startup stalled',
    });
  });

  it('starts a bounded functional deadline after the renderer loads', async () => {
    const result = await run('functional-stall');
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toEqual({
      phase: 'functional',
      milliseconds: 250,
      lastProgress: 'renderer fixture interaction started',
    });
  });

  it('does not spend the functional budget on cold startup', async () => {
    const result = await run('separate-budgets');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBeUndefined();
    expect(result.elapsedMilliseconds).toBeGreaterThan(800);
  });

  it('preserves a real application failure exit code', async () => {
    const result = await run('nonzero-exit');
    expect(result.exitCode).toBe(37);
    expect(result.timedOut).toBeUndefined();
  });
});
