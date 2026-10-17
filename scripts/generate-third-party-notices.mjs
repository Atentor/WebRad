import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = process.argv[2];
if (!destination) throw new Error('Provide the output path for THIRD_PARTY_LICENSES.txt.');

const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
const packages = Object.entries(lock.packages)
  .filter(
    ([location, metadata]) =>
      location.startsWith('node_modules/') &&
      !metadata.link &&
      (!metadata.dev || location === 'node_modules/electron'),
  )
  .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
const sections = [
  'WebRAD third-party licenses',
  'Original WebRAD code: MIT; see LICENSE.',
  'Installed production dependencies and Electron for this build.',
  'Electron/Chromium also retain their bundled LICENSE and LICENSES.chromium.html.',
  '',
];

for (const [location, metadata] of packages) {
  const directory = path.join(root, location);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && metadata.optional) continue;
    throw error;
  }
  if (manifest.version !== metadata.version) {
    throw new Error(`Installed version differs from package-lock.json: ${location}`);
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(licen[cs]e|notice|copying|copyright|third[-_ ]?party)/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  // esbuild's platform binary packages share the top-level esbuild license.
  const licensePaths = files.map((name) => path.join(directory, name));
  if (licensePaths.length === 0 && manifest.name.startsWith('@esbuild/')) {
    licensePaths.push(path.join(root, 'node_modules', 'esbuild', 'LICENSE.md'));
  }
  // libvips binary packages publish their third-party licensing table in README.md.
  if (
    licensePaths.length === 0 &&
    manifest.name.startsWith('@img/sharp-libvips-') &&
    entries.some((entry) => entry.isFile() && entry.name === 'README.md')
  ) {
    const readmePath = path.join(directory, 'README.md');
    if (/^## Licensing\r?$/m.test(await fs.readFile(readmePath, 'utf8')))
      licensePaths.push(readmePath);
  }
  if (licensePaths.length === 0) throw new Error(`No license text found for ${manifest.name}.`);
  sections.push(
    '='.repeat(72),
    `${manifest.name} ${manifest.version}`,
    `License: ${manifest.license ?? metadata.license ?? 'See license text'}`,
    '',
  );
  for (const licensePath of licensePaths) {
    sections.push(
      `--- ${path.basename(licensePath)} ---`,
      (await fs.readFile(licensePath, 'utf8')).replaceAll('\r\n', '\n').trim(),
      '',
    );
  }
}

await fs.mkdir(path.dirname(path.resolve(destination)), { recursive: true });
await fs.writeFile(destination, `${sections.join('\n')}\n`, 'utf8');
