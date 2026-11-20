import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CodexHistorySchema, type CodexHistory, type CodexHistoryGroup } from '../shared/codex-history';

const envelope = z.object({ version: z.literal(1), groups: CodexHistorySchema });
const maxBytes = 32 * 1024 * 1024;

/** Private IDE data; no project source or generated application dependency. */
export class CodexHistoryStore {
  #writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly directory: string) {}
  async read(): Promise<CodexHistory> {
    await this.#writes;
    return this.#read();
  }
  async #read(): Promise<CodexHistory> {
    try {
      const contents = await readFile(path.join(this.directory, 'conversations.json'));
      if (contents.byteLength > maxBytes) throw new Error('Codex history exceeds the local storage limit.');
      return envelope.parse(JSON.parse(contents.toString('utf8')) as unknown).groups;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
      throw error;
    }
  }
  save(scope: string, group: CodexHistoryGroup): Promise<void> {
    const task = this.#writes.then(async () => {
      const groups = { ...await this.#read(), [scope]: group };
      const contents = JSON.stringify({ version: 1, groups });
      if (Buffer.byteLength(contents) > maxBytes) throw new Error('Codex history is full. Delete old conversations before saving more.');
      await mkdir(this.directory, { recursive: true });
      const temporary = path.join(this.directory, `conversations-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, path.join(this.directory, 'conversations.json'));
      } finally { await unlink(temporary).catch(() => undefined); }
    });
    this.#writes = task.catch(() => undefined);
    return task;
  }
}
