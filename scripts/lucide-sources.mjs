import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

/** Snapshot the installed upstream SVG nodes, including its canonical filenames. */
export async function createLucideSources(repositoryRoot) {
  const root = path.join(repositoryRoot, 'node_modules', 'lucide');
  const directory = path.join(root, 'dist', 'esm', 'icons');
  const names = (await fs.readdir(directory)).filter((name) => name.endsWith('.mjs')).sort();
  const nodes = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name.slice(0, -4),
        (await import(pathToFileURL(path.join(directory, name)).href)).default,
      ]),
    ),
  );
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const license = await fs.readFile(path.join(root, 'LICENSE'), 'utf8');
  return {
    source: await format(
      `// Generated from lucide ${metadata.version} (ISC). Do not edit.\n// See licenses/Lucide.txt and scripts/lucide-sources.mjs.\nexport const LUCIDE_ICON_NAMES = ${JSON.stringify(Object.keys(nodes))} as const;\nexport type LucideIconName = (typeof LUCIDE_ICON_NAMES)[number];\nexport type LucideIconNode = readonly (readonly [string, Readonly<Record<string, string | number>>])[];\nexport const LUCIDE_ICON_NODES: Readonly<Record<string, LucideIconNode>> = ${JSON.stringify(nodes)};\n`,
      {
        ...(await resolveConfig(
          path.join(repositoryRoot, 'packages', 'runtime', 'src', 'lucide-icons.generated.ts'),
        )),
        parser: 'typescript',
      },
    ),
    license,
    metadata: JSON.stringify({ version: metadata.version, license }, null, 2) + '\n',
  };
}
