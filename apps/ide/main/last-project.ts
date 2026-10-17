import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ProjectSession } from '../shared/contracts';
import { loadProjectFiles } from './project-files';

const lastProjectSchema = z
  .object({
    formatVersion: z.literal(1),
    projectFilePath: z
      .string()
      .min(1)
      .max(32_768)
      .refine((value) => path.isAbsolute(value) && !value.includes('\0')),
  })
  .strict();

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Application preferences only; the project model and user sources remain in project files. */
export class LastProjectStore {
  private readonly statePath: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.statePath = path.join(userDataPath, 'last-project.json');
  }

  async restore(): Promise<ProjectSession | null> {
    await this.pendingWrite;
    let contents: string;
    try {
      contents = await fs.readFile(this.statePath, 'utf8');
    } catch (error) {
      if (!isMissingFile(error)) console.warn('[PROJECT] Could not read the last project.', error);
      return null;
    }
    try {
      const state = lastProjectSchema.parse(JSON.parse(contents) as unknown);
      return await loadProjectFiles(state.projectFilePath);
    } catch (error) {
      console.warn('[PROJECT] Could not reopen the last project.', error);
      return null;
    }
  }

  remember(projectFilePath: string): Promise<void> {
    // Serialize writes so two successful operations cannot replace newer state with an older one.
    const write = this.pendingWrite.then(async () => {
      const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`;
      try {
        const state = lastProjectSchema.parse({ formatVersion: 1, projectFilePath });
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        await fs.rename(temporaryPath, this.statePath);
      } catch (error) {
        console.warn('[PROJECT] Could not remember the last project.', error);
      } finally {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    });
    this.pendingWrite = write;
    return write;
  }
}
