import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
const execute = promisify(execFile);
const vitest = path.resolve('node_modules/vitest/vitest.mjs');
const setup = path.resolve('tests/setup/worker-event-loop.ts');
const suite = [
  "import { MessageChannel } from 'node:worker_threads';",
  'let delivered = false;',
  'const { port1, port2 } = new MessageChannel();',
  "port1.on('message', () => { delivered = true; });",
  "it('queues a transport reply', () => { port2.postMessage('reply'); });",
  "it('processes replies between synchronous cases', () => { expect(delivered).toBe(true); });",
  "it('keeps the real event loop available with fake timers', () => { vi.useFakeTimers(); });",
  'afterAll(() => { port1.close(); port2.close(); vi.useRealTimers(); });',
].join('\n');
interface FixtureResult {
  readonly code: number;
  readonly numPassedTests: number;
  readonly numFailedTests: number;
  readonly testResults: readonly {
    readonly assertionResults: readonly {
      readonly title: string;
      readonly status: string;
    }[];
  }[];
}
async function runFixture(root: string, enabled: boolean): Promise<FixtureResult> {
  const config = path.join(root, enabled ? 'enabled.config.mjs' : 'control.config.mjs');
  const report = path.join(root, enabled ? 'enabled-report.json' : 'control-report.json');
  await fs.writeFile(
    config,
    'export default ' +
      JSON.stringify({
        root,
        cacheDir: path.join(root, enabled ? 'enabled-cache' : 'control-cache'),
        test: {
          globals: true,
          environment: 'node',
          include: ['suite.test.mjs'],
          setupFiles: enabled ? [setup] : [],
          pool: 'forks',
          maxWorkers: 1,
          testTimeout: 5000,
        },
      }) +
      ';\n',
  );
  let result: {
    readonly code: number;
    readonly stdout: string;
  };
  try {
    const output = await execute(
      process.execPath,
      [vitest, 'run', '--config', config, '--reporter=json', '--outputFile', report],
      { timeout: 30000, windowsHide: true },
    );
    result = { code: 0, stdout: output.stdout };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('stdout' in error) ||
      !('code' in error) ||
      typeof error.stdout !== 'string' ||
      typeof error.code !== 'number'
    )
      throw error;
    result = { code: error.code, stdout: error.stdout };
  }
  return {
    ...(JSON.parse(await fs.readFile(report, 'utf8')) as Omit<FixtureResult, 'code'>),
    code: result.code,
  };
}
describe('Vitest worker event-loop scheduling', () => {
  it('drains real transport callbacks between synchronous tests even when fake timers are enabled', async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-test-event-loop-')),
    );
    try {
      await fs.writeFile(path.join(root, 'suite.test.mjs'), suite);
      const control = await runFixture(root, false);
      expect(control.code).toBe(1);
      expect(control.numFailedTests).toBe(1);
      expect(control.testResults.flatMap((result) => result.assertionResults)).toContainEqual(
        expect.objectContaining({
          title: 'processes replies between synchronous cases',
          status: 'failed',
        }),
      );
      const scheduled = await runFixture(root, true);
      expect(scheduled.code).toBe(0);
      expect(scheduled.numFailedTests).toBe(0);
      expect(scheduled.numPassedTests).toBe(3);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
