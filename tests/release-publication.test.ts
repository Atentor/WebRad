import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve('scripts/release-tools.mjs');
const directories: string[] = [];
const commit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function verificationRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 12345,
    status: 'completed',
    conclusion: 'success',
    head_sha: commit,
    event: 'push',
    head_branch: 'main',
    ...overrides,
  };
}

async function directory(): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-publish-test-')));
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
        WEBRAD_RELEASE_TAG: 'v0.2.0',
        WEBRAD_RELEASE_VERIFY_ONLY: 'false',
        GITHUB_REPOSITORY: 'Atentor/WebRad',
        GITHUB_SHA: commit,
        WEBRAD_RELEASE_REPOSITORY: 'Atentor/WebRad',
        GH_TOKEN: 'release-test-token',
        WEBRAD_RELEASE_TEST_CALLS: path.join(root, 'github-cli.jsonl'),
        ...extra,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

async function calls(root: string): Promise<string[][]> {
  return (await fs.readFile(path.join(root, 'github-cli.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string[]);
}

async function assembledRelease(): Promise<{ root: string; assets: string }> {
  const root = await directory();
  const assets = path.join(root, 'release-downloads');
  await fs.mkdir(assets);
  for (const [platform, arch, kinds] of [
    ['win32', 'x64', ['squirrel']],
    ['linux', 'x64', ['deb', 'rpm']],
    ['darwin', 'x64', ['mac']],
    ['darwin', 'arm64', ['mac']],
  ] as const) {
    const targets = [];
    for (const kind of kinds) {
      const extension = kind === 'squirrel' ? 'nupkg' : kind === 'mac' ? 'zip' : kind;
      const file = `WebRad-0.2.0-${platform}-${arch}.${extension}`;
      const content = Buffer.from(`${platform}/${arch}/${kind} installer`);
      await fs.writeFile(path.join(assets, file), content);
      targets.push({
        platform,
        arch,
        kind,
        file,
        size: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        signed: false,
      });
    }
    await fs.writeFile(
      path.join(assets, `webrad-target-${platform}-${arch}.json`),
      JSON.stringify({ formatVersion: 1, version: '0.2.0', targets }),
    );
  }
  await fs.writeFile(path.join(assets, 'WebRad-0.2.0-win32-x64-Setup.exe'), 'Windows Setup');
  await fs.writeFile(path.join(assets, 'RELEASES'), 'Squirrel update feed');
  run(root, 'assemble');
  return { root, assets };
}

afterEach(async () => {
  for (const root of directories.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('release publication boundaries', () => {
  it.each(['behind', 'diverged'])('rejects tags outside main (%s)', async (status) => {
    const root = await directory();
    expect(() => run(root, 'preflight', { WEBRAD_RELEASE_TEST_ANCESTRY: status })).toThrow(
      'Release tags must point to main or an ancestor of main.',
    );
    expect((await calls(root))[1]).toEqual(['api', 'repos/Atentor/WebRad/compare/v0.2.0...main']);
  });

  it('accepts tags on main ancestry and bypasses synthetic verification tags', async () => {
    const root = await directory();
    expect(run(root, 'preflight', { WEBRAD_RELEASE_TEST_ANCESTRY: 'ahead' })).toContain('ready');
    await fs.unlink(path.join(root, 'github-cli.jsonl'));
    run(root, 'preflight', {
      WEBRAD_RELEASE_VERIFY_ONLY: 'true',
      WEBRAD_RELEASE_TEST_ANCESTRY: 'diverged',
    });
    expect(await calls(root)).toEqual([['api', 'repos/Atentor/WebRad']]);
  });

  it.each([
    { event: 'push', head_branch: 'main' },
    { event: 'push', head_branch: 'codex/verify-release-regression' },
    { event: 'workflow_dispatch', head_branch: 'v0.2.0' },
  ])(
    'accepts a successful verification of this commit ($event/$head_branch)',
    async (candidate) => {
      const root = await directory();
      expect(
        run(root, 'preflight', {
          WEBRAD_RELEASE_TEST_RUNS: JSON.stringify([
            { workflow_runs: [verificationRun(candidate)] },
          ]),
        }),
      ).toContain(`Release commit verified by workflow run 12345: ${commit}`);
    },
  );

  it.each([
    { head_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { event: 'push', head_branch: 'v0.2.0' },
    { event: 'push', head_branch: 'feature/editor' },
    { event: 'pull_request' },
  ])('rejects a run that does not prove this commit was verified (%j)', async (candidate) => {
    const root = await directory();
    expect(() =>
      run(root, 'preflight', {
        WEBRAD_RELEASE_TEST_RUNS: JSON.stringify([{ workflow_runs: [verificationRun(candidate)] }]),
      }),
    ).toThrow('has no successful four-platform release verification');
  });

  it('checks all verification pages for the exact candidate SHA', async () => {
    const root = await directory();
    run(root, 'preflight', {
      WEBRAD_RELEASE_TEST_RUNS: JSON.stringify([
        { workflow_runs: [verificationRun({ head_sha: 'b'.repeat(40) })] },
        { workflow_runs: [verificationRun()] },
      ]),
    });
    expect((await calls(root)).slice(2)).toEqual(
      ['release', 'validate', 'security'].map((workflow) => [
        'api',
        `repos/Atentor/WebRad/actions/workflows/${workflow}.yml/runs?head_sha=${commit}${workflow === 'release' ? '&status=success' : ''}&per_page=100`,
        '--paginate',
        '--slurp',
      ]),
    );
  });

  it('rejects a tag resolving to another commit before consulting verification runs', async () => {
    const root = await directory();
    expect(() => run(root, 'preflight', { WEBRAD_RELEASE_TEST_TAG_SHA: 'b'.repeat(40) })).toThrow(
      'release tag must resolve to the exact GITHUB_SHA',
    );
    expect(await calls(root)).toHaveLength(2);
  });

  it('requires an exact commit SHA and reports missing Actions permissions', async () => {
    const root = await directory();
    expect(() => run(root, 'preflight', { GITHUB_SHA: '' })).toThrow('Set GITHUB_SHA');
    expect(() => run(root, 'preflight', { WEBRAD_RELEASE_TEST_RUNS_FAILURE: 'true' })).toThrow(
      'Grant Actions read permission',
    );
  });

  it('does not query release verification during non-publishing builds', async () => {
    const root = await directory();
    run(root, 'preflight', {
      WEBRAD_RELEASE_VERIFY_ONLY: 'true',
      GITHUB_SHA: '',
      WEBRAD_RELEASE_TEST_RUNS_FAILURE: 'true',
    });
    expect(await calls(root)).toEqual([['api', 'repos/Atentor/WebRad']]);
  });

  it('keeps complete installers unpublished when this commit lacks verification', async () => {
    const { root } = await assembledRelease();
    expect(() =>
      run(root, 'publish', {
        WEBRAD_RELEASE_TEST_RUNS: JSON.stringify([{ workflow_runs: [] }]),
      }),
    ).toThrow('has no successful four-platform release verification');
    expect((await calls(root)).some((call) => call[0] === 'release')).toBe(false);
  });

  it('rejects extra source files after artifact transfer before creating any release', async () => {
    const { root, assets } = await assembledRelease();
    await fs.writeFile(path.join(assets, 'private-source.ts'), 'private source');
    expect(() => run(root, 'publish')).toThrow('Unexpected or missing file');
    expect((await calls(root)).every((call) => call[0] === 'api')).toBe(true);
  });

  it.each([
    'WebRad-0.2.0-win32-x64-Setup.exe',
    'RELEASES',
    'webrad-darwin-arm64.json',
    'SHA256SUMS',
  ])('rejects modified auxiliary asset %s before upload', async (file) => {
    const { root, assets } = await assembledRelease();
    await fs.appendFile(path.join(assets, file), '\nmodified');
    expect(() => run(root, 'publish')).toThrow('Release checksums do not match');
    expect((await calls(root)).some((call) => call[0] === 'release')).toBe(false);
  });

  it('rejects a damaged installer even when the transfer contains the expected file names', async () => {
    const { root, assets } = await assembledRelease();
    await fs.appendFile(path.join(assets, 'WebRad-0.2.0-linux-x64.deb'), 'modified');
    expect(() => run(root, 'publish')).toThrow('Release artifact integrity check failed.');
    expect((await calls(root)).some((call) => call[0] === 'release')).toBe(false);
  });

  it('preserves latest when a newer published version appears after the first page', async () => {
    const { root } = await assembledRelease();
    run(root, 'publish', {
      WEBRAD_RELEASE_TEST_RELEASES: JSON.stringify([
        [{ tag_name: 'v0.1.0', draft: false, prerelease: false }],
        [{ tag_name: 'v1.0.0', draft: false, prerelease: false }],
      ]),
    });
    const commands = await calls(root);
    expect(commands).toContainEqual([
      'api',
      'repos/Atentor/WebRad/releases?per_page=100',
      '--paginate',
      '--slurp',
    ]);
    expect(commands.find((call) => call[1] === 'edit')).toContain('--latest=false');
  });

  it('resumes an existing draft without creating another release', async () => {
    const { root } = await assembledRelease();
    run(root, 'publish', { WEBRAD_RELEASE_TEST_EXISTING: 'draft' });
    const commands = await calls(root);
    expect(commands.some((call) => call[1] === 'create')).toBe(false);
    const upload = commands.findIndex((call) => call[1] === 'upload');
    expect(upload).toBeGreaterThan(-1);
    expect(commands.findIndex((call) => call[1] === 'edit')).toBeGreaterThan(upload);
  });

  it('refuses overwriting a public release', async () => {
    const { root } = await assembledRelease();
    expect(() => run(root, 'publish', { WEBRAD_RELEASE_TEST_EXISTING: 'public' })).toThrow(
      'already public',
    );
    expect((await calls(root)).some((call) => call[1] === 'upload')).toBe(false);
  });

  it('leaves the release unpublished when uploading fails', async () => {
    const { root } = await assembledRelease();
    expect(() => run(root, 'publish', { WEBRAD_RELEASE_TEST_UPLOAD_FAILURE: 'true' })).toThrow(
      'Upload failed.',
    );
    expect((await calls(root)).some((call) => call[1] === 'edit')).toBe(false);
  });
});
