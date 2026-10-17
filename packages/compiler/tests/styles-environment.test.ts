import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@webrad/project-model';
import { compileGeneratedAppStyles, compileTailwindStyles } from '../src/styles';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Tailwind compiler environment', () => {
  it('compiles Designer and generated CSS when the working directory has no dependencies', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'webrad-tailwind-'));
    try {
      vi.spyOn(process, 'cwd').mockReturnValue(directory);
      vi.stubEnv('WEBRAD_TAILWIND_BASE_PATH', repositoryRoot);
      const project = createProject('TailwindEnvironment');
      const designerCss = await compileTailwindStyles(project.styles);
      const generatedCss = await compileGeneratedAppStyles(project.styles);
      expect(designerCss).toContain('--font-sans');
      expect(generatedCss).toContain('.wr-component');
      expect(generatedCss).toContain('--font-sans');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
