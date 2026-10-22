import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const output = path.resolve('out/native-build-validation');
await fs.mkdir(output, { recursive: true });
const manifests = await Promise.all(
  ['package.json', 'packages/compiler/package.json', 'packages/native-build/package.json'].map(
    async (file) => JSON.parse(await fs.readFile(file, 'utf8')),
  ),
);
const external = [
  ...new Set(
    manifests
      .flatMap((entry) => [
        ...Object.keys(entry.dependencies ?? {}),
        ...Object.keys(entry.devDependencies ?? {}),
      ])
      .filter((name) => !name.startsWith('@webrad/')),
  ),
];
const entry = path.join(output, 'validate.cjs');
await build({
  entryPoints: ['tests/fixtures/native-build-validation.ts'],
  outfile: entry,
  platform: 'node',
  format: 'cjs',
  bundle: true,
  target: 'node24',
  external,
  logLevel: 'warning',
});
const child = spawn(process.execPath, [entry], {
  shell: false,
  windowsHide: true,
  stdio: 'inherit',
});
process.exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});
