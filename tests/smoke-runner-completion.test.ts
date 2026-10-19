import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
type Runner = 'development' | 'packaged';
const updateEvidence = [
  'renderer update availability without download passed',
  'renderer update download and unsaved changes guard passed',
  'renderer update install action and restart feedback passed',
];

const launcher = `
import childProcess from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import timers from 'node:timers';
import { pathToFileURL } from 'node:url';
const workspace = process.cwd();
const mode = process.argv[3];
const realSpawn = childProcess.spawn;
const realSetTimeout = timers.setTimeout;
timers.setTimeout = (callback, milliseconds, ...args) => {
  if (mode === 'timeout' && milliseconds === 240_000) {
    appendFileSync(path.join(workspace, 'deadline-armed.txt'), milliseconds + '\\n');
    return realSetTimeout(callback, 250, ...args);
  }
  return realSetTimeout(callback, milliseconds, ...args);
};
childProcess.spawn = (executable, args, options) => {
  const child = realSpawn(process.execPath, [path.join(workspace, 'fake-application.mjs'), mode, ...args], options);
  if (mode === 'timeout') {
    // Exercise the boundary where a wrapper swallows a failing process exit code.
    const realEmit = child.emit;
    child.emit = function(event, ...values) {
      return realEmit.call(this, event, ...(event === 'exit' ? [0, null] : values));
    };
  }
  return child;
};
syncBuiltinESMExports();
await import(pathToFileURL(path.join(workspace, 'scripts', process.argv[2])).href);
`;

const fakeApplication = `
import { promises as fs } from 'node:fs';
const mode = process.argv[2];
const logPath = process.argv.find(value => value.startsWith('--webrad-smoke-log='))?.slice('--webrad-smoke-log='.length);
if (logPath === undefined) process.exit(99);
const evidence = ${JSON.stringify(updateEvidence)};
evidence.unshift('renderer loaded: http://localhost/');
evidence.push(mode === 'health-failure' ? 'renderer workflow failed: synthetic late renderer failure' : 'renderer workflow completed');
await fs.writeFile(logPath, evidence.join('\\n') + '\\n');
if (mode === 'timeout') {
  process.on('SIGTERM', () => {});
  setInterval(() => process.stdout.write('stubborn application heartbeat\\n'), 100);
} else {
  process.exit(0);
}
`;

async function createWorkspace(runner: Runner): Promise<string> {
  const workspace = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-smoke-completion-')),
  );
  await fs.mkdir(path.join(workspace, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(workspace, 'examples', 'hello-webrad'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'examples', 'hello-webrad', 'HelloWebRad.wrproj'), '{}');
  for (const script of [`smoke-${runner}.mjs`, 'smoke-process.mjs']) {
    await fs.copyFile(path.resolve('scripts', script), path.join(workspace, 'scripts', script));
  }
  await fs.writeFile(path.join(workspace, 'launcher.mjs'), launcher);
  await fs.writeFile(path.join(workspace, 'fake-application.mjs'), fakeApplication);
  await fs.writeFile(
    path.join(workspace, 'package.json'),
    JSON.stringify({ productName: 'SmokeFixture' }),
  );
  const packageDirectory = path.join(
    workspace,
    'out',
    `SmokeFixture-${process.platform}-${process.arch}`,
  );
  const executable = process.platform === 'win32' ? 'SmokeFixture.exe' : 'SmokeFixture';
  const executablePath =
    process.platform === 'darwin'
      ? path.join(packageDirectory, 'SmokeFixture.app', 'Contents', 'MacOS', executable)
      : path.join(packageDirectory, executable);
  await fs.mkdir(path.dirname(executablePath), { recursive: true });
  await fs.writeFile(executablePath, 'application launch is replaced by the test fixture');
  return workspace;
}

async function run(workspace: string, runner: Runner, mode: string) {
  return execute(
    process.execPath,
    [path.join(workspace, 'launcher.mjs'), `smoke-${runner}.mjs`, mode, '--webrad-smoke-updates'],
    { cwd: workspace, timeout: 10_000 },
  );
}

describe.each(['development', 'packaged'] as const)('%s smoke completion evidence', (runner) => {
  it('rejects a swallowed late renderer failure even when every update assertion passed', async () => {
    const workspace = await createWorkspace(runner);
    try {
      await expect(run(workspace, runner, 'health-failure')).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('missing renderer workflow completed'),
      });
      const artifactRoot = path.join(workspace, 'artifacts', 'smoke', runner, 'updates');
      const [failure] = await fs.readdir(artifactRoot);
      if (failure === undefined) throw new Error('Missing failure diagnostics.');
      expect(
        await fs.readFile(path.join(artifactRoot, failure, 'webrad-smoke.log'), 'utf8'),
      ).toContain('renderer workflow failed');
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  it('accepts successful assertions followed by the universal completion marker', async () => {
    const workspace = await createWorkspace(runner);
    try {
      const result = await run(workspace, runner, 'success');
      expect(result.stdout).toContain('renderer workflow completed');
      await expect(fs.access(path.join(workspace, 'artifacts', 'smoke'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });
});

it('bounds a stubborn packaged process and rejects timeout even when a wrapper reports exit zero', async () => {
  const workspace = await createWorkspace('packaged');
  const started = performance.now();
  try {
    await expect(run(workspace, 'packaged', 'timeout')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('timed out after 240000ms'),
    });
    expect(performance.now() - started).toBeLessThan(8_000);
    expect(await fs.readFile(path.join(workspace, 'deadline-armed.txt'), 'utf8')).toBe('240000\n');
    const artifactRoot = path.join(workspace, 'artifacts', 'smoke', 'packaged', 'updates');
    const [failure] = await fs.readdir(artifactRoot);
    if (failure === undefined) throw new Error('Missing timeout diagnostics.');
    const metadata: unknown = JSON.parse(
      await fs.readFile(path.join(artifactRoot, failure, 'failure.json'), 'utf8'),
    );
    expect(metadata).toMatchObject({ error: expect.stringContaining('missing nothing') });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
