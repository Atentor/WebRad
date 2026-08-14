import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveCompilerEnvironment } from './compiler-environment';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('compiler environment', () => {
  it('resolves development resources from node_modules on Windows and Linux', () => {
    expect(
      resolveCompilerEnvironment({
        packaged: false,
        resourcesPath: 'C:\\ignored',
        developmentRoot: 'C:\\workspace\\WebRad',
        platform: 'win32',
        architecture: 'x64',
      }),
    ).toEqual({
      WEBRAD_ESBUILD_MODULE_PATH: 'C:\\workspace\\WebRad\\node_modules\\esbuild\\lib\\main.js',
      ESBUILD_BINARY_PATH: 'C:\\workspace\\WebRad\\node_modules\\@esbuild\\win32-x64\\esbuild.exe',
      WEBRAD_TYPESCRIPT_LIB_PATH: 'C:\\workspace\\WebRad\\node_modules\\typescript\\lib',
    });

    expect(
      resolveCompilerEnvironment({
        packaged: false,
        resourcesPath: '/ignored',
        developmentRoot: '/workspace/WebRad',
        platform: 'linux',
        architecture: 'arm64',
      }),
    ).toEqual({
      WEBRAD_ESBUILD_MODULE_PATH: '/workspace/WebRad/node_modules/esbuild/lib/main.js',
      ESBUILD_BINARY_PATH: '/workspace/WebRad/node_modules/@esbuild/linux-arm64/bin/esbuild',
      WEBRAD_TYPESCRIPT_LIB_PATH: '/workspace/WebRad/node_modules/typescript/lib',
    });
  });

  it('resolves packaged resources beside the application on Windows and Linux', () => {
    expect(
      resolveCompilerEnvironment({
        packaged: true,
        resourcesPath: 'C:\\Program Files\\WebRAD\\resources',
        developmentRoot: 'C:\\ignored',
        platform: 'win32',
        architecture: 'x64',
      }),
    ).toEqual({
      WEBRAD_ESBUILD_MODULE_PATH: 'C:\\Program Files\\WebRAD\\resources\\esbuild\\lib\\main.js',
      ESBUILD_BINARY_PATH: 'C:\\Program Files\\WebRAD\\resources\\win32-x64\\esbuild.exe',
      WEBRAD_TYPESCRIPT_LIB_PATH: 'C:\\Program Files\\WebRAD\\resources\\typescript\\lib',
    });

    expect(
      resolveCompilerEnvironment({
        packaged: true,
        resourcesPath: '/opt/WebRAD/resources',
        developmentRoot: '/ignored',
        platform: 'linux',
        architecture: 'x64',
      }),
    ).toEqual({
      WEBRAD_ESBUILD_MODULE_PATH: '/opt/WebRAD/resources/esbuild/lib/main.js',
      ESBUILD_BINARY_PATH: '/opt/WebRAD/resources/linux-x64/bin/esbuild',
      WEBRAD_TYPESCRIPT_LIB_PATH: '/opt/WebRAD/resources/typescript/lib',
    });
  });

  it('points development compilation at the installed TypeScript standard libraries', async () => {
    const environment = resolveCompilerEnvironment({
      packaged: false,
      resourcesPath: path.join(repositoryRoot, 'unused'),
      developmentRoot: repositoryRoot,
      platform: process.platform,
      architecture: process.arch,
    });

    await Promise.all(
      ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'].map((fileName) =>
        access(path.join(environment.WEBRAD_TYPESCRIPT_LIB_PATH, fileName)),
      ),
    );
  });
});
