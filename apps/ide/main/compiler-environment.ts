import path from 'node:path';

export interface CompilerEnvironmentOptions {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly developmentRoot: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
}

export interface CompilerEnvironment {
  readonly WEBRAD_ESBUILD_MODULE_PATH: string;
  readonly ESBUILD_BINARY_PATH: string;
  readonly WEBRAD_TYPESCRIPT_LIB_PATH: string;
}

export function resolveCompilerEnvironment(
  options: CompilerEnvironmentOptions,
): CompilerEnvironment {
  const pathApi = options.platform === 'win32' ? path.win32 : path.posix;
  const nativePackage = `${options.platform}-${options.architecture}`;
  const esbuildExecutable =
    options.platform === 'win32' ? 'esbuild.exe' : pathApi.join('bin', 'esbuild');

  if (options.packaged) {
    return {
      WEBRAD_ESBUILD_MODULE_PATH: pathApi.join(options.resourcesPath, 'esbuild', 'lib', 'main.js'),
      ESBUILD_BINARY_PATH: pathApi.join(options.resourcesPath, nativePackage, esbuildExecutable),
      WEBRAD_TYPESCRIPT_LIB_PATH: pathApi.join(options.resourcesPath, 'typescript', 'lib'),
    };
  }

  const nodeModulesPath = pathApi.join(options.developmentRoot, 'node_modules');
  return {
    WEBRAD_ESBUILD_MODULE_PATH: pathApi.join(nodeModulesPath, 'esbuild', 'lib', 'main.js'),
    ESBUILD_BINARY_PATH: pathApi.join(
      nodeModulesPath,
      '@esbuild',
      nativePackage,
      esbuildExecutable,
    ),
    WEBRAD_TYPESCRIPT_LIB_PATH: pathApi.join(nodeModulesPath, 'typescript', 'lib'),
  };
}
