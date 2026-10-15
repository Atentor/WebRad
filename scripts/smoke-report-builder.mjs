import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { clearTimeout, setTimeout } from 'node:timers';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const output = path.resolve('out/report-builder-review');
const fixtureOutput = path.join(output, 'electron');
await fs.mkdir(fixtureOutput, { recursive: true });
const packages = await Promise.all(
  ['package.json', 'packages/compiler/package.json', 'packages/runtime/package.json'].map(
    async (file) => JSON.parse(await fs.readFile(file, 'utf8')),
  ),
);
const external = [
  ...new Set(
    [
      'electron',
      ...packages.flatMap((entry) => [
        ...Object.keys(entry.dependencies ?? {}),
        ...Object.keys(entry.devDependencies ?? {}),
      ]),
    ].filter((name) => !name.startsWith('@webrad/')),
  ),
];
await build({
  entryPoints: {
    main: 'tests/fixtures/report-builder-electron.ts',
    preload: 'tests/fixtures/report-builder-electron-preload.ts',
  },
  outdir: fixtureOutput,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external,
  logLevel: 'warning',
});
const electron = require('electron');
const child = spawn(electron, [path.join(fixtureOutput, 'main.cjs')], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    WEBRAD_REPORT_ELECTRON_OUTPUT: output,
    WEBRAD_ESBUILD_MODULE_PATH: require.resolve('esbuild'),
  },
});
let log = '';
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (bytes) => {
    const value = bytes.toString();
    log += value;
    process.stdout.write(value);
  });
const timeout = setTimeout(() => child.kill(), 120_000);
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (exitCode) => resolve(exitCode ?? 1));
}).finally(() => clearTimeout(timeout));
await fs.writeFile(path.join(output, 'electron-smoke.log'), log);
if (code === 0) await fs.rm(path.join(output, 'electron-error.json'), { force: true });
if (code !== 0)
  throw new Error(
    `ReportBuilder Electron smoke failed (${String(code)}); see ${path.join(output, 'electron-smoke.log')}`,
  );
