import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const repository =
  process.env.WEBRAD_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || 'Atentor/WebRad';
const root = process.cwd();
const command = process.argv[2];
const tag = process.env.WEBRAD_RELEASE_TAG || process.env.GITHUB_REF_NAME;

function versionFromTag() {
  if (!tag?.startsWith('v') || !versionPattern.test(tag.slice(1))) {
    throw new Error(
      'Use a stable version tag in the form vMAJOR.MINOR.PATCH (for example v0.2.0).',
    );
  }
  return tag.slice(1);
}

function validateRepository() {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(repository))
    throw new Error('Invalid release repository.');
}

function gh(arguments_) {
  return execFileSync('gh', arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function hashFile(file, algorithm = 'sha256') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Release artifacts must not be symbolic links.');
    if (entry.isDirectory()) files.push(...(await walk(path.join(directory, entry.name))));
    else if (entry.isFile()) files.push(path.join(directory, entry.name));
  }
  return files;
}

function exactlyOne(files, predicate, label) {
  const selected = files.filter(predicate);
  if (selected.length !== 1)
    throw new Error(`Expected exactly one ${label}; found ${String(selected.length)}.`);
  return selected[0];
}

async function verifyTargets(directory, targets) {
  const expected = [
    'darwin/arm64/mac',
    'darwin/x64/mac',
    'linux/x64/deb',
    'linux/x64/rpm',
    'win32/x64/squirrel',
  ];
  if (
    !Array.isArray(targets) ||
    JSON.stringify(targets.map((item) => `${item.platform}/${item.arch}/${item.kind}`).sort()) !==
      JSON.stringify(expected)
  )
    throw new Error('Release platform set is incomplete or duplicated.');
  for (const target of targets) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/.test(target.file) ||
      !/^[a-f0-9]{64}$/.test(target.sha256) ||
      !Number.isSafeInteger(target.size) ||
      target.size < 1 ||
      typeof target.signed !== 'boolean'
    )
      throw new Error('Invalid release artifact metadata.');
    const file = path.join(directory, target.file);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size !== target.size || (await hashFile(file)) !== target.sha256)
      throw new Error('Release artifact integrity check failed.');
  }
}

function publicAssets(version, targets) {
  return new Set([
    'RELEASES',
    `WebRad-${version}-win32-x64-Setup.exe`,
    'webrad-update.json',
    'webrad-darwin-x64.json',
    'webrad-darwin-arm64.json',
    ...targets.map((target) => target.file),
  ]);
}

async function checksumsFor(directory, names) {
  const checksums = [];
  for (const name of [...names].sort()) {
    const file = path.join(directory, name);
    if (!(await fs.lstat(file)).isFile()) throw new Error('Release assets must be regular files.');
    checksums.push(`${await hashFile(file)}  ${name}`);
  }
  return `${checksums.join('\n')}\n`;
}

async function preflight() {
  versionFromTag();
  validateRepository();
  if (!process.env.GH_TOKEN)
    throw new Error(
      'Set GH_TOKEN to the workflow GITHUB_TOKEN. The publish job requires Contents write access.',
    );
  let metadata;
  try {
    metadata = JSON.parse(gh(['api', `repos/${repository}`]));
  } catch {
    throw new Error(
      `Cannot access the public ${repository} repository. Check the workflow token and repository visibility. See docs/releases.md.`,
    );
  }
  if (metadata.private !== false)
    throw new Error(
      'The installer repository must be public so installed apps can download updates without a token.',
    );
  if (process.env.WEBRAD_RELEASE_VERIFY_ONLY !== 'true') {
    let comparison;
    try {
      comparison = JSON.parse(gh(['api', `repos/${repository}/compare/${tag}...main`]));
    } catch {
      throw new Error('Cannot verify that the release tag belongs to main.');
    }
    if (!['ahead', 'identical'].includes(comparison.status))
      throw new Error('Release tags must point to main or an ancestor of main.');
  }
  process.stdout.write(`Release destination ready: ${repository}\n`);
}

async function prepare() {
  const version = versionFromTag();
  validateRepository();
  const manifestPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  manifest.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  process.stdout.write(
    `Building WebRad ${version} from ${tag}; the working checkout alone receives this version.\n`,
  );
}

async function stage() {
  const version = versionFromTag();
  const platform = process.env.WEBRAD_RELEASE_PLATFORM || process.platform;
  const arch = process.env.WEBRAD_RELEASE_ARCH || process.arch;
  if (!['win32/x64', 'linux/x64', 'darwin/x64', 'darwin/arm64'].includes(`${platform}/${arch}`))
    throw new Error('Unsupported release build target.');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== version)
    throw new Error('Packaged version must match the tag. Run release-tools.mjs prepare first.');
  const files = await walk(path.join(root, 'out', 'make'));
  const destination = path.join(root, 'out', 'release');
  await fs.mkdir(destination, { recursive: true });
  if ((await fs.readdir(destination)).length)
    throw new Error('Release staging must start with an empty directory.');
  const targets = [];
  const copy = async (source, name) => {
    await fs.copyFile(source, path.join(destination, name));
  };
  const target = async (source, name, kind, signed = false) => {
    await copy(source, name);
    targets.push({
      platform,
      arch,
      kind,
      file: name,
      size: (await fs.stat(source)).size,
      sha256: await hashFile(source),
      signed,
    });
  };
  if (platform === 'win32') {
    const nupkg = exactlyOne(
      files,
      (file) => file.endsWith('-full.nupkg'),
      'Squirrel full package',
    );
    const releases = exactlyOne(
      files,
      (file) => path.basename(file) === 'RELEASES',
      'Squirrel RELEASES file',
    );
    const releaseLine = (await fs.readFile(releases, 'utf8')).trim().split(/\r?\n/);
    const expected = `${await hashFile(nupkg, 'sha1')} ${path.basename(nupkg)} ${String((await fs.stat(nupkg)).size)}`;
    if (releaseLine.length !== 1 || releaseLine[0].toLowerCase() !== expected.toLowerCase())
      throw new Error('Squirrel RELEASES does not match the full package.');
    await target(nupkg, path.basename(nupkg), 'squirrel');
    await copy(releases, 'RELEASES');
    await copy(
      exactlyOne(files, (file) => file.endsWith('.exe'), 'Windows Setup'),
      `WebRad-${version}-win32-${arch}-Setup.exe`,
    );
  } else if (platform === 'linux') {
    for (const kind of ['deb', 'rpm']) {
      await target(
        exactlyOne(files, (file) => file.endsWith(`.${kind}`), `Linux ${kind}`),
        `WebRad-${version}-linux-${arch}.${kind}`,
        kind,
      );
    }
  } else {
    await target(
      exactlyOne(files, (file) => file.endsWith('.zip'), 'macOS ZIP'),
      `WebRad-${version}-darwin-${arch}.zip`,
      'mac',
      process.env.WEBRAD_MAC_SIGNED === 'true',
    );
  }
  await fs.writeFile(
    path.join(destination, `webrad-target-${platform}-${arch}.json`),
    `${JSON.stringify({ formatVersion: 1, version, targets }, null, 2)}\n`,
  );
}

async function assemble() {
  const version = versionFromTag();
  validateRepository();
  const directory = path.join(root, 'release-downloads');
  const shards = (await fs.readdir(directory)).filter((name) =>
    /^webrad-target-(win32|linux|darwin)-(x64|arm64)\.json$/.test(name),
  );
  if (shards.length !== 4)
    throw new Error('All four release builds are required before publishing.');
  const targets = [];
  for (const name of shards) {
    const shard = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    if (shard.formatVersion !== 1 || shard.version !== version || !Array.isArray(shard.targets))
      throw new Error('Release build versions do not match.');
    targets.push(...shard.targets);
  }
  await verifyTargets(directory, targets);
  const publishedAt = new Date().toISOString();
  const manifest = { formatVersion: 1, version, publishedAt, targets };
  await fs.writeFile(
    path.join(directory, 'webrad-update.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const target of targets.filter((item) => item.platform === 'darwin')) {
    const updateTo = {
      version,
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(target.file)}`,
      name: `WebRad ${version}`,
      notes: `WebRad ${version}`,
      pub_date: publishedAt,
      sha256: target.sha256,
      size: target.size,
    };
    const feed = { currentRelease: version, releases: [{ version, updateTo }] };
    await fs.writeFile(
      path.join(directory, `webrad-darwin-${target.arch}.json`),
      `${JSON.stringify(feed, null, 2)}\n`,
    );
  }
  const allowed = publicAssets(version, targets);
  const entries = await fs.readdir(directory);
  if (entries.some((name) => !allowed.has(name) && !shards.includes(name)))
    throw new Error('Unexpected file in public release staging.');
  await fs.writeFile(path.join(directory, 'SHA256SUMS'), await checksumsFor(directory, allowed));
  for (const name of shards) await fs.unlink(path.join(directory, name));
}

async function publish() {
  if (process.env.WEBRAD_RELEASE_VERIFY_ONLY && process.env.WEBRAD_RELEASE_VERIFY_ONLY !== 'false')
    throw new Error('Verification runs cannot publish a release.');
  await preflight();
  const directory = path.join(root, 'release-downloads');
  const notesPath = path.join(root, 'release-notes.md');
  const manifest = JSON.parse(
    await fs.readFile(path.join(directory, 'webrad-update.json'), 'utf8'),
  );
  if (manifest.version !== versionFromTag()) throw new Error('Publication version mismatch.');
  if (manifest.formatVersion !== 1) throw new Error('Unsupported release manifest format.');
  await verifyTargets(directory, manifest.targets);
  const assets = publicAssets(manifest.version, manifest.targets);
  const entries = await fs.readdir(directory);
  if (
    entries.length !== assets.size + 1 ||
    entries.some((name) => name !== 'SHA256SUMS' && !assets.has(name))
  )
    throw new Error('Unexpected or missing file in public release staging.');
  if (
    !(await fs.lstat(path.join(directory, 'SHA256SUMS'))).isFile() ||
    (await fs.readFile(path.join(directory, 'SHA256SUMS'), 'utf8')) !==
      (await checksumsFor(directory, assets))
  )
    throw new Error('Release checksums do not match the assembled assets.');
  const unsignedMac = manifest.targets.some(
    (target) => target.platform === 'darwin' && !target.signed,
  );
  await fs.writeFile(
    notesPath,
    `WebRad ${manifest.version}\n\nInstallers for Windows x64, Linux x64 (.deb/.rpm), macOS Intel and macOS Apple Silicon.\n\n${unsignedMac ? 'The macOS builds are unsigned. macOS may block opening them; automatic macOS installation is unavailable until Developer ID signing is configured.\n\n' : ''}SHA-256 checksums are included in SHA256SUMS.\n`,
  );
  let existing;
  try {
    existing = JSON.parse(gh(['release', 'view', tag, '--repo', repository, '--json', 'isDraft']));
  } catch {
    /* A new tag has no release yet. */
  }
  if (existing && !existing.isDraft)
    throw new Error(
      'This release is already public. Create a new version tag instead of overwriting it.',
    );
  if (!existing)
    gh([
      'release',
      'create',
      tag,
      '--repo',
      repository,
      '--verify-tag',
      '--draft',
      '--title',
      `WebRad ${manifest.version}`,
      '--notes-file',
      notesPath,
    ]);
  const files = [...assets, 'SHA256SUMS'].sort().map((file) => path.join(directory, file));
  gh(['release', 'upload', tag, '--repo', repository, '--clobber', ...files]);
  // Advance latest only after the complete artifact set has been uploaded.
  const latest = JSON.parse(
    gh(['api', `repos/${repository}/releases?per_page=100`, '--paginate', '--slurp']),
  ).flat();
  const numeric = (value) => value.split('.').map(BigInt);
  const newer = (candidate, installed) => {
    const a = numeric(candidate);
    const b = numeric(installed);
    for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index];
    return false;
  };
  const newerPublished = latest.some(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      /^v\d+\.\d+\.\d+$/.test(release.tag_name) &&
      newer(release.tag_name.slice(1), manifest.version),
  );
  gh([
    'release',
    'edit',
    tag,
    '--repo',
    repository,
    '--draft=false',
    `--latest=${String(!newerPublished)}`,
  ]);
  process.stdout.write(`Published https://github.com/${repository}/releases/tag/${tag}\n`);
}

try {
  if (command === 'preflight') await preflight();
  else if (command === 'prepare') await prepare();
  else if (command === 'stage') await stage();
  else if (command === 'assemble') await assemble();
  else if (command === 'publish') await publish();
  else throw new Error('Expected preflight, prepare, stage, assemble or publish.');
} catch (error) {
  // Never echo subprocess environments, credentials or GitHub CLI stderr.
  process.stderr.write(
    `[IDE] Release failed: ${error instanceof Error && !('status' in error) ? error.message : 'GitHub operation failed. Check the release token and repository permissions.'}\n`,
  );
  process.exitCode = 1;
}
