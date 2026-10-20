import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Load esbuild before mocking cwd: its native service retains the cwd from module load.
import { stop } from 'esbuild';

import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, createProject, updatePage } from '@webrad/project-model';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'webrad-shaka-'));
});

beforeEach(() => {
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
  vi.stubEnv('WEBRAD_TAILWIND_BASE_PATH', repositoryRoot);
  vi.stubEnv(
    'WEBRAD_TYPESCRIPT_LIB_PATH',
    path.join(repositoryRoot, 'node_modules/typescript/lib'),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  // One compiler/service per suite. Its real cwd is outside the temporary project,
  // so the project must be removable even while the native service is alive.
  try {
    await rm(directory, { recursive: true, force: true });
  } finally {
    await stop();
  }
});

describe('Shaka compiler environment without project dependencies', () => {
  it.each([
    { debug: false, video: false },
    { debug: true, video: false },
    { debug: false, video: true },
    { debug: true, video: true },
  ])('compiles Preview/Debug with $debug debug and $video video', async ({ debug, video }) => {
    const { compileProjectToMemory } = await import('../src/index.js');
    const { VIRTUAL_ROOT } = await import('../src/source-graph.js');
    expect(path.dirname(VIRTUAL_ROOT)).toBe(directory);
    let project = createProject('ShakaEnvironment');
    const page = project.pages[0]!;
    if (video) {
      project = updatePage(
        project,
        page.id,
        addComponent(
          page,
          defaultComponentRegistry.createComponent('WebVideoPlayer', {
            id: 'video-player',
            name: 'VideoPlayer1',
            parentId: page.rootComponentId,
          }),
          page.rootComponentId,
        ),
      );
    }
    const result = await compileProjectToMemory(project, { debug, userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.previewHtml).toContain('<script>');
    expect(result.debug !== undefined).toBe(debug);
    expect(result.files['assets/licenses/Shaka-Player-Apache-2.0.txt'] !== undefined).toBe(video);
    if (video) expect(result.files['assets/app.css']).toContain('.shaka-video-container');
  });

  it('checks Shaka members using real declarations without local node_modules', async () => {
    const { compileProjectToMemory } = await import('../src/index.js');
    const result = await compileProjectToMemory(createProject('InvalidShaka'), {
      userSources: {
        'units/InvalidShaka.ts': `import shaka from 'shaka-player/dist/shaka-player.ui.js';
const player = new shaka.Player();
player.missingWebRadMember();
`,
      },
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        source: 'typescript',
        code: 2339,
        message: expect.stringContaining('missingWebRadMember'),
      }),
    ]);
  });
});
