import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseUpdateManifest,
  DEFAULT_RELEASE_REPOSITORY,
  latestManifestUrl,
} from '../apps/ide/main/update-release';
const script = path.resolve('scripts/release-tools.mjs');
const directories: string[] = [];
const releaseCandidates: readonly {
  version: string;
  environment: Record<string, string>;
  verifyOnly: boolean;
}[] = [
  { version: '0.2.0', environment: {}, verifyOnly: false },
  {
    version: '0.0.0',
    environment: {
      GITHUB_REF_NAME: 'codex/verify-release-test',
      WEBRAD_RELEASE_TAG: 'v0.0.0',
      WEBRAD_RELEASE_VERIFY_ONLY: 'true',
    },
    verifyOnly: true,
  },
];
async function directory(): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-release-test-')));
  directories.push(root);
  return root;
}
function run(root: string, command: string, extra: Record<string, string> = {}): string {
  return execFileSync(
    process.execPath,
    [
      '--import',
      new URL('./fixtures/release-github-cli.mjs', import.meta.url).href,
      script,
      command,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        WEBRAD_RELEASE_TAG: '',
        WEBRAD_RELEASE_VERIFY_ONLY: '',
        WEBRAD_RELEASE_PLATFORM: '',
        WEBRAD_RELEASE_ARCH: '',
        WEBRAD_MAC_SIGNED: 'false',
        GITHUB_REF_NAME: 'v0.2.0',
        GITHUB_REPOSITORY: 'Atentor/WebRad',
        WEBRAD_RELEASE_REPOSITORY: '',
        GH_TOKEN: 'release-test-token',
        WEBRAD_RELEASE_TEST_CALLS: path.join(root, 'github-cli.jsonl'),
        ...extra,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}
afterEach(async () => {
  for (const root of directories.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
describe('tagged release assembly', () => {
  it('uses the public source repository and the workflow token while rejecting private destinations', async () => {
    const root = await directory();
    expect(run(root, 'preflight')).toContain('Release destination ready: Atentor/WebRad');
    expect(latestManifestUrl(DEFAULT_RELEASE_REPOSITORY)).toBe(
      'https://github.com/Atentor/WebRad/releases/latest/download/webrad-update.json',
    );
    expect(() => run(root, 'preflight', { WEBRAD_RELEASE_TEST_PRIVATE: 'true' })).toThrow(
      'must be public',
    );
    expect(() => run(root, 'preflight', { GH_TOKEN: '' })).toThrow('GITHUB_TOKEN');
  });
  it.each(releaseCandidates)(
    'derives the package and lockfile root version from the tag while retaining workspace versions ($version)',
    async ({ version, environment }) => {
      const root = await directory();
      await fs.writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'webrad', version: '0.1.11' }),
      );
      await fs.writeFile(
        path.join(root, 'package-lock.json'),
        JSON.stringify({
          version: '0.1.11',
          packages: { '': { version: '0.1.11' }, 'packages/runtime': { version: '0.1.0' } },
        }),
      );
      run(root, 'prepare', environment);
      const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
        version: string;
      };
      expect(manifest.version).toBe(version);
      const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8')) as {
        version: string;
        packages: Record<
          string,
          {
            version: string;
          }
        >;
      };
      expect(lock.version).toBe(version);
      expect(lock.packages['']?.version).toBe(version);
      expect(lock.packages['packages/runtime']?.version).toBe('0.1.0');
      expect(() => run(root, 'prepare', { GITHUB_REF_NAME: 'v1.0.0-beta' })).toThrow();
    },
  );
  it.each(releaseCandidates)(
    'stages all platforms, verifies hashes and emits native macOS feeds without exposing private files ($version)',
    async ({ version, environment, verifyOnly }) => {
      const root = await directory();
      const publicDirectory = path.join(root, 'release-downloads');
      await fs.mkdir(publicDirectory);
      for (const [platform, arch] of [
        ['win32', 'x64'],
        ['linux', 'x64'],
        ['darwin', 'x64'],
        ['darwin', 'arm64'],
      ] as const) {
        const build = path.join(root, `${platform}-${arch}`);
        const make = path.join(build, 'out', 'make');
        await fs.mkdir(make, { recursive: true });
        await fs.writeFile(path.join(build, 'package.json'), JSON.stringify({ version: version }));
        if (platform === 'win32') {
          const data = Buffer.from('NuGet fixture');
          const file = `webrad-${version}-full.nupkg`;
          await fs.writeFile(path.join(make, file), data);
          await fs.writeFile(
            path.join(make, 'RELEASES'),
            `${createHash('sha1').update(data).digest('hex')} ${file} ${String(data.length)}\n`,
          );
          await fs.writeFile(path.join(make, 'WebRad Setup.exe'), 'exe fixture');
        } else if (platform === 'linux') {
          for (const kind of ['deb', 'rpm'])
            await fs.writeFile(path.join(make, `webrad.${kind}`), `${kind} fixture`);
        } else await fs.writeFile(path.join(make, 'webrad.zip'), `${arch} ZIP fixture`);
        await fs.writeFile(path.join(make, 'private-source.ts'), 'must never be published');
        run(build, 'stage', {
          ...environment,
          WEBRAD_RELEASE_PLATFORM: platform,
          WEBRAD_RELEASE_ARCH: arch,
        });
        const staged = path.join(build, 'out', 'release');
        for (const file of await fs.readdir(staged))
          await fs.copyFile(path.join(staged, file), path.join(publicDirectory, file));
      }
      run(root, 'assemble', environment);
      const manifest = parseUpdateManifest(
        JSON.parse(await fs.readFile(path.join(publicDirectory, 'webrad-update.json'), 'utf8')),
      );
      expect(manifest.version).toBe(version);
      expect(manifest.targets).toHaveLength(5);
      expect(
        manifest.targets
          .filter((target) => target.kind === 'mac')
          .every((target) => !target.signed),
      ).toBe(true);
      const feed = JSON.parse(
        await fs.readFile(path.join(publicDirectory, 'webrad-darwin-arm64.json'), 'utf8'),
      ) as {
        currentRelease: string;
        releases: {
          updateTo: {
            url: string;
            sha256: string;
          };
        }[];
      };
      expect(feed.currentRelease).toBe(version);
      expect(feed.releases[0]?.updateTo.url).toContain(
        `/Atentor/WebRad/releases/download/v${version}/`,
      );
      expect(feed.releases[0]?.updateTo.sha256).toHaveLength(64);
      const entries = await fs.readdir(publicDirectory);
      expect(entries).not.toContain('private-source.ts');
      expect(entries.some((name) => name.startsWith('webrad-target-'))).toBe(false);
      expect(entries).toContain('SHA256SUMS');
      if (verifyOnly) {
        expect(() => run(root, 'publish', environment)).toThrow(
          'Verification runs cannot publish a release.',
        );
        await expect(fs.stat(path.join(root, 'github-cli.jsonl'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
        return;
      }
      run(root, 'publish', environment);
      const calls = (await fs.readFile(path.join(root, 'github-cli.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string[]);
      expect(calls[0]).toEqual(['api', 'repos/Atentor/WebRad']);
      expect(calls.find((call) => call[1] === 'create')).toEqual([
        'release',
        'create',
        `v${version}`,
        '--repo',
        'Atentor/WebRad',
        '--verify-tag',
        '--draft',
        '--title',
        `WebRad ${version}`,
        '--notes-file',
        path.join(root, 'release-notes.md'),
      ]);
      const upload = calls.findIndex((call) => call[1] === 'upload');
      const publication = calls.findIndex((call) => call[1] === 'edit');
      expect(upload).toBeGreaterThan(-1);
      expect(publication).toBeGreaterThan(upload);
      expect(calls[publication]).toEqual([
        'release',
        'edit',
        `v${version}`,
        '--repo',
        'Atentor/WebRad',
        '--draft=false',
        '--latest=true',
      ]);
    },
  );
  it('refuses a partial multi-platform release', async () => {
    const root = await directory();
    await fs.mkdir(path.join(root, 'release-downloads'));
    expect(() => run(root, 'assemble')).toThrow();
  });
});
