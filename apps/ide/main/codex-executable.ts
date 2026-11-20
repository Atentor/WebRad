import { access, readdir, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Never invokes a command shell, npm wrapper, or an arbitrary script. */
export async function codexExecutable(preferred: string | null): Promise<string | null> {
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates: string[] = [];
  if (preferred) {
    if (!path.isAbsolute(preferred) || path.basename(preferred).toLowerCase() !== executable) {
      throw new Error(`Select the native ${executable} executable.`);
    }
    candidates.push(preferred);
  } else {
    for (const entry of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
      const trimmed = entry.trim();
      const directory =
        trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
      if (path.isAbsolute(directory)) candidates.push(path.join(directory, executable));
    }
    candidates.push(path.join(os.homedir(), '.local', 'bin', executable));
    candidates.push(path.join(os.homedir(), '.codex', 'bin', executable));
    const platformDirectory =
      process.platform === 'win32'
        ? `windows-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`
        : `${process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`;
    for (const edition of ['.vscode', '.vscode-insiders']) {
      const extensions = path.join(os.homedir(), edition, 'extensions');
      try {
        const entries = await readdir(extensions);
        for (const entry of entries
          .filter((name) => name.startsWith('openai.chatgpt-'))
          .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))) {
          candidates.push(path.join(extensions, entry, 'bin', platformDirectory, executable));
        }
      } catch {
        // The editor extension is optional; PATH and manual selection still work.
      }
    }
  }
  for (const candidate of candidates) {
    try {
      const resolved = await realpath(candidate);
      if (!(await stat(resolved)).isFile()) continue;
      await access(resolved, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return resolved;
    } catch {
      // Try the next installed location without running any discovered programs.
    }
  }
  if (preferred) throw new Error('The selected Codex executable is no longer available.');
  return null;
}
