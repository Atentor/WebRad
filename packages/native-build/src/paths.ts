import { lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function safeRelativePath(value: string): string {
  if (
    !value ||
    value.includes('\\') ||
    [...value].some((char) => char.charCodeAt(0) < 32) ||
    value.includes(':') ||
    path.posix.isAbsolute(value) ||
    value
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[<>"|?*]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
    throw new Error(`Unsafe generated file path: ${value}.`);
  return value;
}
export function isPathWithin(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}
export async function ensureSafeDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new Error(`Native build directory must be an ordinary directory: ${cursor}.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(cursor);
    }
  }
  return realpath(absolute);
}
export async function writeSafeFile(
  root: string,
  relative: string,
  content: string | Uint8Array,
): Promise<void> {
  safeRelativePath(relative);
  const filename = path.join(root, ...relative.split('/'));
  if (!isPathWithin(root, filename)) throw new Error('Generated file escapes its workspace.');
  await ensureSafeDirectory(path.dirname(filename));
  try {
    if ((await lstat(filename)).isSymbolicLink())
      throw new Error(`Refusing a symbolic link: ${filename}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeFile(filename, content, { flag: 'wx', mode: 0o600 });
}
/** Exports and generation require an empty directory, so no user-authored file is replaced. */
export async function ensureEmptyDirectory(directory: string): Promise<string> {
  const root = await ensureSafeDirectory(directory);
  if ((await readdir(root)).length > 0)
    throw new Error('Native project export requires an empty directory.');
  return root;
}
