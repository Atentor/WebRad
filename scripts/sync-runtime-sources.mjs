import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(repositoryRoot, 'packages', 'runtime', 'src');
const outputPath = path.join(repositoryRoot, 'packages', 'compiler', 'src', 'runtime-sources.json');
const sourceFiles = [
  'api-client.ts',
  'component.ts',
  'controls.ts',
  'page.ts',
  'globals.ts',
  'index.ts',
  'layout.ts',
  'render.ts',
  'visual.ts',
];

const sources = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (fileName) => [
      fileName,
      await fs.readFile(path.join(runtimeRoot, fileName), 'utf8'),
    ]),
  ),
);
const expected = `${JSON.stringify(sources, null, 2)}\n`;

if (globalThis.process.argv.includes('--check')) {
  const actual = await fs.readFile(outputPath, 'utf8').catch(() => '');
  if (actual !== expected) {
    throw new Error('Embedded runtime sources are stale. Run npm run runtime:sources.');
  }
} else {
  await fs.writeFile(outputPath, expected, 'utf8');
}
