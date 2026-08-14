import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceName = 'Icon.svg';
const manifestName = 'Icon.generated.json';
const outputNames = ['Icon.png', 'Icon.ico', 'Icon.icns'];
const sourcePath = path.join(repositoryRoot, sourceName);
const manifestPath = path.join(repositoryRoot, manifestName);
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icnsEntries = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function createIco(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let imageOffset = directory.length;
  images.forEach(({ size, png }, index) => {
    const entryOffset = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(png.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([directory, ...images.map(({ png }) => png)]);
}

function createIcns(images) {
  const chunks = images.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(header.length + png.length, 4);
    return Buffer.concat([header, png]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(header.length + body.length, 4);
  return Buffer.concat([header, body]);
}

function assertOutputFormat(fileName, buffer) {
  if (fileName === 'Icon.png') {
    const signature = buffer.subarray(0, 8).toString('hex');
    if (
      signature !== '89504e470d0a1a0a' ||
      buffer.readUInt32BE(16) !== 512 ||
      buffer.readUInt32BE(20) !== 512
    ) {
      throw new Error('Generated Icon.png is not a 512x512 PNG.');
    }
    return;
  }
  if (fileName === 'Icon.ico') {
    if (
      buffer.readUInt16LE(0) !== 0 ||
      buffer.readUInt16LE(2) !== 1 ||
      buffer.readUInt16LE(4) !== icoSizes.length
    ) {
      throw new Error('Generated Icon.ico has an invalid icon directory.');
    }
    return;
  }
  if (
    buffer.subarray(0, 4).toString('ascii') !== 'icns' ||
    buffer.readUInt32BE(4) !== buffer.length
  ) {
    throw new Error('Generated Icon.icns has an invalid container header.');
  }
}

async function checkGeneratedIcons(source) {
  const manifestText = await fs.readFile(manifestPath, 'utf8').catch(() => '');
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('Generated application icons are missing. Run npm run icons.');
  }

  if (
    manifest.schemaVersion !== 1 ||
    manifest.source !== sourceName ||
    manifest.sourceSha256 !== sha256(source) ||
    typeof manifest.outputs !== 'object' ||
    manifest.outputs === null
  ) {
    throw new Error('Generated application icons are stale. Run npm run icons.');
  }

  for (const fileName of outputNames) {
    const output = await fs.readFile(path.join(repositoryRoot, fileName)).catch(() => null);
    const record = Reflect.get(manifest.outputs, fileName);
    if (
      output === null ||
      typeof record !== 'object' ||
      record === null ||
      Reflect.get(record, 'bytes') !== output.length ||
      Reflect.get(record, 'sha256') !== sha256(output)
    ) {
      throw new Error(`Generated ${fileName} is stale. Run npm run icons.`);
    }
    assertOutputFormat(fileName, output);
  }
}

async function generateIcons(source) {
  const { default: sharp } = await import('sharp');
  const sizes = [...new Set([512, ...icoSizes, ...icnsEntries.map(([, size]) => size)])];
  const rendered = new Map(
    await Promise.all(
      sizes.map(async (size) => {
        const density = Math.max(72, Math.ceil((72 * size) / 512));
        const png = await sharp(source, { density })
          .resize(size, size, { fit: 'contain' })
          .png({ adaptiveFiltering: true, compressionLevel: 9 })
          .toBuffer();
        return [size, png];
      }),
    ),
  );
  const pngAt = (size) => {
    const png = rendered.get(size);
    if (png === undefined) throw new Error(`Failed to render the ${String(size)}px icon.`);
    return png;
  };
  const outputs = new Map([
    ['Icon.png', pngAt(512)],
    ['Icon.ico', createIco(icoSizes.map((size) => ({ size, png: pngAt(size) })))],
    ['Icon.icns', createIcns(icnsEntries.map(([type, size]) => ({ type, png: pngAt(size) })))],
  ]);

  for (const [fileName, output] of outputs) {
    assertOutputFormat(fileName, output);
    await fs.writeFile(path.join(repositoryRoot, fileName), output);
  }

  const manifest = {
    schemaVersion: 1,
    source: sourceName,
    sourceSha256: sha256(source),
    outputs: Object.fromEntries(
      [...outputs].map(([fileName, output]) => [
        fileName,
        { bytes: output.length, sha256: sha256(output) },
      ]),
    ),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  globalThis.process.stdout.write(`Generated application icons from ${sourceName}.\n`);
}

const source = await fs.readFile(sourcePath);
if (globalThis.process.argv.includes('--check')) {
  await checkGeneratedIcons(source);
} else {
  await generateIcons(source);
}
