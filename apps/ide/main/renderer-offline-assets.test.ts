import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererRoot = path.resolve('apps', 'ide', 'renderer');

async function componentSources(): Promise<string> {
  const componentDirectory = path.join(rendererRoot, 'src', 'components');
  const files = await fs.readdir(componentDirectory);
  const sources = await Promise.all(
    files
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
      .map((file) => fs.readFile(path.join(componentDirectory, file), 'utf8')),
  );
  return sources.join('\n');
}

describe('renderer offline assets', () => {
  it('does not depend on Google Fonts or remote icon fonts', async () => {
    const html = await fs.readFile(path.join(rendererRoot, 'index.html'), 'utf8');
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/u);
    expect(html).toContain("font-src 'self' data:");
  });

  it('uses local SVG icons instead of font ligatures', async () => {
    const sources = await componentSources();
    expect(sources).not.toContain('material-icons');
    expect(sources).toContain("from './Icon'");
  });
});
