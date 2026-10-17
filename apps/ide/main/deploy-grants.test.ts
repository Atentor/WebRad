import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DeployDirectoryGrants } from './deploy-grants';

const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep))
      throw new Error('Unsafe test cleanup.');
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('native deploy directory capabilities', () => {
  it('persists only exact grants bound to the canonical project root and identity', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-deploy-grants-'));
    temporaryRoots.push(userData);
    const root = path.join(userData, 'project');
    const output = path.join(userData, 'hosted');
    const grants = new DeployDirectoryGrants(userData);
    expect(await grants.has(root, 'owner', output)).toBe(false);
    await grants.grant(root, 'owner', output);
    const reopened = new DeployDirectoryGrants(userData);
    expect(await reopened.has(root, 'owner', output)).toBe(true);
    expect(await reopened.has(root, 'other-project', output)).toBe(false);
    expect(await reopened.has(root, 'owner', path.join(output, 'nested'))).toBe(false);
    expect(await reopened.has(path.join(userData, 'other-root'), 'owner', output)).toBe(false);
  });

  it('uses transient grants without a userData path and fails closed for malformed stored grants', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-deploy-grants-'));
    temporaryRoots.push(userData);
    await fs.writeFile(path.join(userData, 'deploy-directories.json'), '{broken');
    const output = path.join(userData, 'output');
    const persisted = new DeployDirectoryGrants(userData);
    expect(await persisted.has(userData, 'owner', output)).toBe(false);
    const transient = new DeployDirectoryGrants();
    await transient.grant(userData, 'owner', output);
    expect(await transient.has(userData, 'owner', output)).toBe(true);
    expect(await new DeployDirectoryGrants().has(userData, 'owner', output)).toBe(false);
  });
});
