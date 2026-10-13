import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const capabilitySchema = z
  .object({
    projectRoot: z.string().min(1),
    projectId: z.string().min(1),
    destination: z.string().min(1),
  })
  .strict();
const storeSchema = z
  .object({ formatVersion: z.literal(1), grants: z.array(capabilitySchema) })
  .strict();
type DirectoryCapability = z.infer<typeof capabilitySchema>;

function key(capability: DirectoryCapability): string {
  const normalize = (value: string): string =>
    process.platform === 'win32' ? value.toLowerCase() : value;
  return `${normalize(capability.projectRoot)}\0${capability.projectId}\0${normalize(capability.destination)}`;
}

/** Native-picker capabilities live in main-owned application data, separate from project settings. */
export class DeployDirectoryGrants {
  private readonly grants = new Map<string, DirectoryCapability>();
  private loading?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();

  public constructor(private readonly userDataPath?: string) {}

  private async load(): Promise<void> {
    if (this.loading === undefined) this.loading = this.read();
    await this.loading;
  }

  private async read(): Promise<void> {
    if (this.userDataPath === undefined) return;
    try {
      const store = storeSchema.parse(
        JSON.parse(
          await fs.readFile(path.join(this.userDataPath, 'deploy-directories.json'), 'utf8'),
        ) as unknown,
      );
      for (const capability of store.grants) {
        if (path.isAbsolute(capability.projectRoot) && path.isAbsolute(capability.destination))
          this.grants.set(key(capability), capability);
      }
    } catch {
      // Unreadable capabilities never authorize writes; the native picker can grant them again.
    }
  }

  public async has(projectRoot: string, projectId: string, destination: string): Promise<boolean> {
    await this.load();
    return this.grants.has(key({ projectRoot, projectId, destination }));
  }

  public async grant(projectRoot: string, projectId: string, destination: string): Promise<void> {
    await this.load();
    const capability = capabilitySchema.parse({ projectRoot, projectId, destination });
    this.grants.set(key(capability), capability);
    if (this.userDataPath === undefined) return;
    const data = `${JSON.stringify({ formatVersion: 1, grants: [...this.grants.values()] }, null, 2)}\n`;
    const userDataPath = this.userDataPath;
    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(userDataPath, { recursive: true });
        const temporaryPath = path.join(userDataPath, `.deploy-directories-${randomUUID()}.tmp`);
        try {
          await fs.writeFile(temporaryPath, data, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
          await fs.rename(temporaryPath, path.join(userDataPath, 'deploy-directories.json'));
        } finally {
          await fs.rm(temporaryPath, { force: true });
        }
      });
    this.writes = write;
    await write;
  }
}
