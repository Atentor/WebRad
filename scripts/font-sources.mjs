import { promises as fs } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { WEBRAD_FONT_FAMILIES } from '../packages/runtime/src/fonts.ts';

/** Preserve upstream descriptors and binaries, embedding only Latin/Latin Extended WOFF2. */
export async function createFontSources(repositoryRoot) {
  const result = {};
  for (const font of WEBRAD_FONT_FAMILIES) {
    const directory = path.join(repositoryRoot, 'node_modules', font.packageName);
    const metadata = JSON.parse(await fs.readFile(path.join(directory, 'metadata.json'), 'utf8'));
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const root = postcss.root();
    const sheets = metadata.variable
      ? ['wght.css', 'wght-italic.css']
      : metadata.weights.flatMap((weight) => [`${weight}.css`, `${weight}-italic.css`]);
    for (const sheet of sheets) {
      const css = postcss.parse(await fs.readFile(path.join(directory, sheet), 'utf8'));
      for (const face of css.nodes.filter(
        (node) => node.type === 'atrule' && node.name === 'font-face',
      )) {
        const source = face.nodes.find((node) => node.type === 'decl' && node.prop === 'src');
        const file = source?.value.match(/url\(\.\/files\/([^()]+\.woff2)\)/u)?.[1];
        if (!file || !file.startsWith(`${font.id}-latin-`)) continue;
        const binary = await fs.readFile(path.join(directory, 'files', file));
        if (binary.subarray(0, 4).toString() !== 'wOF2')
          throw new Error(`Invalid WOFF2 font: ${file}`);
        face.walkDecls('font-family', (declaration) => {
          declaration.value = `'${font.label}'`;
        });
        source.value = `url(data:font/woff2;base64,${binary.toString('base64')}) format('woff2')`;
        root.append(face);
      }
    }
    if (!root.nodes.length) throw new Error(`Missing font faces: ${font.id}`);
    result[font.id] = {
      css: root.toString(),
      packageName: font.packageName,
      version: manifest.version,
      license: await fs.readFile(path.join(directory, 'LICENSE'), 'utf8'),
    };
  }
  return `${JSON.stringify(result, null, 2)}\n`;
}
