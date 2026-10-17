import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

interface FixturePackage {
  readonly name: string;
  readonly dev?: boolean;
  readonly optional?: boolean;
  readonly installed?: boolean;
  readonly installedVersion?: string;
  readonly files?: Readonly<Record<string, string>>;
}

async function fixture(packages: readonly FixturePackage[]): Promise<() => string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-legal-test-')));
  directories.push(root);
  const script = path.join(root, 'scripts', 'generate-third-party-notices.mjs');
  await fs.mkdir(path.dirname(script), { recursive: true });
  await fs.copyFile(
    new URL('../scripts/generate-third-party-notices.mjs', import.meta.url),
    script,
  );
  await fs.writeFile(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      packages: Object.fromEntries(
        packages.map((pkg) => [
          `node_modules/${pkg.name}`,
          { version: '1.0.0', license: 'MIT', dev: pkg.dev, optional: pkg.optional },
        ]),
      ),
    }),
  );
  for (const pkg of packages) {
    if (pkg.installed === false) continue;
    const directory = path.join(root, 'node_modules', pkg.name);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: pkg.name, version: pkg.installedVersion ?? '1.0.0', license: 'MIT' }),
    );
    for (const [name, contents] of Object.entries(pkg.files ?? {})) {
      await fs.mkdir(path.dirname(path.join(directory, name)), { recursive: true });
      await fs.writeFile(path.join(directory, name), contents);
    }
  }
  const output = path.join(root, 'THIRD_PARTY_LICENSES.txt');
  return () => {
    execFileSync(process.execPath, [script, output], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return output;
  };
}

describe('desktop third-party notices', () => {
  it('preserves full licenses and camel-case third-party notices, includes Electron and omits build-only or absent optional packages', async () => {
    const run = await fixture([
      {
        name: 'browser-library',
        files: {
          LICENSE: 'Library copyright\r\nPermission text',
          'ThirdPartyNotices.txt': 'Upstream attribution',
        },
      },
      { name: 'electron', dev: true, files: { LICENSE: 'Electron license' } },
      { name: 'build-tool', dev: true, files: {} },
      { name: 'other-platform', optional: true, installed: false },
    ]);
    const first = await fs.readFile(run(), 'utf8');
    expect(first).toContain('browser-library 1.0.0');
    expect(first).toContain('Library copyright\nPermission text');
    expect(first).toContain('Upstream attribution');
    expect(first).toContain('Electron license');
    expect(first).not.toContain('build-tool');
    expect(first).not.toContain('other-platform');
    expect(await fs.readFile(run(), 'utf8')).toBe(first);
  });

  it('retains the shared esbuild license for installed platform binary packages', async () => {
    const run = await fixture([
      { name: 'esbuild', files: { 'LICENSE.md': 'esbuild copyright and permission' } },
      { name: '@esbuild/test-platform', optional: true, files: {} },
    ]);
    const output = await fs.readFile(run(), 'utf8');
    expect(output).toContain('@esbuild/test-platform 1.0.0');
    expect(output.split('esbuild copyright and permission')).toHaveLength(3);
  });

  it.each(['linux-x64', 'darwin-x64', 'darwin-arm64'])(
    'preserves the upstream README licensing notices for the %s libvips package',
    async (platform) => {
      const name = `@img/sharp-libvips-${platform}`;
      const run = await fixture([
        {
          name,
          optional: true,
          files: {
            'README.md': `# ${name}\r\n\r\n## Licensing\r\n\r\n| libvips | LGPLv3 |\r\n| glib | LGPLv3 |\r\nUpstream attribution and license links\r\n`,
            'lib/index.js': 'Native library loader',
          },
        },
      ]);
      const first = await fs.readFile(run(), 'utf8');
      expect(first).toContain(`${name} 1.0.0`);
      expect(first).toContain('--- README.md ---');
      expect(first).toContain('## Licensing\n\n| libvips | LGPLv3 |\n| glib | LGPLv3 |');
      expect(first).toContain('Upstream attribution and license links');
      expect(first).not.toContain('Native library loader');
      expect(await fs.readFile(run(), 'utf8')).toBe(first);
    },
  );

  it('keeps separate libvips license files when supplied by upstream', async () => {
    const run = await fixture([
      {
        name: '@img/sharp-libvips-linux-x64',
        optional: true,
        files: { LICENSE: 'Full upstream license', 'README.md': 'Package documentation' },
      },
    ]);
    const output = await fs.readFile(run(), 'utf8');
    expect(output).toContain('Full upstream license');
    expect(output).not.toContain('Package documentation');
  });

  it.each<FixturePackage>([
    { name: '@img/sharp-libvips-linux-x64', files: {} },
    { name: '@img/sharp-libvips-darwin-arm64', files: { 'README.md': 'No licensing section' } },
    { name: 'missing-license', files: { 'README.md': '## Licensing\nUnrelated README' } },
  ])('rejects $name without a recognized upstream license notice', async ({ name, files }) => {
    const run = await fixture([{ name, optional: true, files }]);
    expect(run).toThrow(`No license text found for ${name}.`);
  });

  it('rejects installed production dependencies without a license text', async () => {
    const run = await fixture([{ name: 'missing-license', files: {} }]);
    expect(run).toThrow('No license text found for missing-license.');
  });

  it('rejects an installed dependency that differs from the locked version', async () => {
    const run = await fixture([
      { name: 'version-mismatch', installedVersion: '2.0.0', files: { LICENSE: 'License text' } },
    ]);
    expect(run).toThrow('Installed version differs from package-lock.json');
  });
});
