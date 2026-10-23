import { createServer } from 'node:http';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createProject } from '@webrad/project-model';
import { checkNativePrerequisites, findNativeTool } from '@webrad/native-build';

it('inspects real Rustup proxies without downloading an absent active toolchain', async (context) => {
  const rustup = await findNativeTool('rustup');
  if (!rustup) return context.skip();
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'webrad-readonly-rustup-'));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(404).end();
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing test port.');
    const host =
      process.platform === 'win32'
        ? 'pc-windows-msvc'
        : process.platform === 'darwin'
          ? 'apple-darwin'
          : 'unknown-linux-gnu';
    const architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    await writeFile(
      path.join(root, 'settings.toml'),
      `version = "12"\ndefault_host_triple = "${architecture}-${host}"\ndefault_toolchain = "1.77.2-${architecture}-${host}"\nprofile = "minimal"\n`,
    );
    const env = {
      ...process.env,
      PATH: path.dirname(rustup),
      CARGO_HOME: path.dirname(path.dirname(rustup)),
      RUSTUP_HOME: root,
      RUSTUP_TOOLCHAIN: `1.77.2-${architecture}-${host}`,
      RUSTUP_AUTO_INSTALL: '1',
      RUSTUP_DIST_SERVER: `http://127.0.0.1:${address.port}`,
    };
    const original = createProject('ReadonlyRustup').settings.nativeApplication;
    const report = await checkNativePrerequisites(
      {
        ...original,
        build: {
          ...original.build,
          platform: 'android',
          architecture: 'arm64',
          bundleFormat: 'apk',
        },
      },
      { env },
    );
    expect(report.checks.find((check) => check.id === 'rustc')?.status).toBe('missing');
    expect(report.checks.find((check) => check.id === 'cargo')?.status).toBe('missing');
    expect(requests).toEqual([]);
    expect(env.RUSTUP_AUTO_INSTALL).toBe('1');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
