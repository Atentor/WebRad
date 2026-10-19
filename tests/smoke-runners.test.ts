import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const originalFixture = '{"fixture":"original authored project"}\n';
const changedFixture = `${originalFixture}modified by the smoke application\n`;
const failureLog = 'renderer loaded: http://localhost/\nsynthetic application failure\n';

// Replace only the application launch. The real runner still owns arguments, evidence,
// failure reporting, artifact preservation and cleanup, while a real child process fails.
const launcher = `
import childProcess from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const realSpawn = childProcess.spawn;
const workspace = process.cwd();
childProcess.spawn = (executable, args, options) => {
  writeFileSync(path.join(workspace, 'launch-record.json'), JSON.stringify({ executable, args }));
  return realSpawn(process.execPath, [path.join(workspace, 'fake-application.mjs'), ...args], options);
};
syncBuiltinESMExports();
await import(pathToFileURL(path.join(workspace, 'scripts', process.argv[2])).href);
`;

const fakeApplication = `
import { promises as fs } from 'node:fs';
import path from 'node:path';
const logPath = process.argv.find(value => value.startsWith('--webrad-smoke-log='))?.slice('--webrad-smoke-log='.length);
const profilePath = process.argv.find(value => value.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
if (logPath === undefined || profilePath === undefined) process.exit(99);
await fs.mkdir(profilePath, { recursive: true });
await fs.writeFile(path.join(profilePath, 'private-profile-sentinel'), 'exclude this profile from artifacts');
await fs.writeFile(path.join(path.dirname(logPath), 'hello-webrad', 'HelloWebRad.wrproj'), ${JSON.stringify(changedFixture)});
await fs.writeFile(logPath, ${JSON.stringify(failureLog)});
process.exit(37);
`;

interface LaunchRecord {
  readonly executable: string;
  readonly args: readonly string[];
}

describe.each(['development', 'packaged'] as const)(
  '%s smoke runner failure diagnostics',
  (runner) => {
    const variants = [
      'standard',
      'updates',
      'resources',
      'deploy',
      ...(runner === 'development' ? ['debugger'] : []),
    ];

    it.each(variants)(
      'isolates the %s profile and preserves the failing fixture without Chromium data',
      async (variant) => {
        const workspace = await fs.realpath(
          await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-smoke-runner-')),
        );
        try {
          await fs.mkdir(path.join(workspace, 'scripts'), { recursive: true });
          await fs.mkdir(path.join(workspace, 'examples', 'hello-webrad'), { recursive: true });
          const fixturePath = path.join(
            workspace,
            'examples',
            'hello-webrad',
            'HelloWebRad.wrproj',
          );
          await fs.writeFile(fixturePath, originalFixture);
          for (const script of [`smoke-${runner}.mjs`, 'smoke-process.mjs']) {
            await fs.copyFile(
              path.resolve('scripts', script),
              path.join(workspace, 'scripts', script),
            );
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

          let failure: unknown;
          try {
            await execute(
              process.execPath,
              [
                path.join(workspace, 'launcher.mjs'),
                `smoke-${runner}.mjs`,
                ...(variant === 'standard' ? [] : [`--webrad-smoke-${variant}`]),
              ],
              { cwd: workspace, timeout: 15_000 },
            );
          } catch (error) {
            failure = error;
          }
          expect(failure).toMatchObject({ code: 1 });
          expect(failure).toHaveProperty('stderr', expect.stringContaining('exit 37'));
          expect(failure).toHaveProperty(
            'stderr',
            expect.stringContaining('diagnostics preserved:'),
          );

          const launch = JSON.parse(
            await fs.readFile(path.join(workspace, 'launch-record.json'), 'utf8'),
          ) as LaunchRecord;
          const logPath = launch.args
            .find((value) => value.startsWith('--webrad-smoke-log='))
            ?.slice('--webrad-smoke-log='.length);
          if (logPath === undefined)
            throw new Error('The application did not receive its smoke log path.');
          expect(launch.args.filter((value) => value.startsWith('--user-data-dir='))).toEqual([
            `--user-data-dir=${path.join(path.dirname(logPath), 'chromium')}`,
          ]);
          await expect(fs.access(path.dirname(logPath))).rejects.toMatchObject({ code: 'ENOENT' });
          expect(await fs.readFile(fixturePath, 'utf8')).toBe(originalFixture);

          const artifactRoot = path.join(workspace, 'artifacts', 'smoke', runner, variant);
          const failures = await fs.readdir(artifactRoot);
          expect(failures).toHaveLength(1);
          const destination = path.join(artifactRoot, failures[0]!);
          expect(await fs.readFile(path.join(destination, 'webrad-smoke.log'), 'utf8')).toBe(
            failureLog,
          );
          expect(
            await fs.readFile(path.join(destination, 'hello-webrad', 'HelloWebRad.wrproj'), 'utf8'),
          ).toBe(changedFixture);
          expect(
            JSON.parse(await fs.readFile(path.join(destination, 'failure.json'), 'utf8')),
          ).toMatchObject({
            runner,
            variant,
            error: expect.stringContaining('exit 37'),
          });
          const entries = await fs.readdir(destination, { recursive: true });
          expect(
            entries.some(
              (entry) => entry.includes('chromium') || entry.includes('private-profile-sentinel'),
            ),
          ).toBe(false);
        } finally {
          await fs.rm(workspace, { recursive: true, force: true });
        }
      },
    );
  },
);
