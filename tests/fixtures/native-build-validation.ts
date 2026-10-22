import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  assembleProject,
  deserializePage,
  deserializeProjectManifest,
  type NativeBundleFormat,
  type NativeTargetArchitecture,
  type NativeTargetPlatform,
} from '@webrad/project-model';
import {
  buildNativeApplication,
  checkNativePrerequisites,
  exportNativeBuildProject,
} from '@webrad/native-build';

async function validate(): Promise<void> {
  const directory = path.resolve('out/native-build-validation', randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const example = path.resolve('examples/hello-webrad');
  const manifest = deserializeProjectManifest(
    await fs.readFile(path.join(example, 'HelloWebRad.wrproj'), 'utf8'),
  );
  const pages = await Promise.all(
    manifest.pages.map(async (page) =>
      deserializePage(await fs.readFile(path.join(example, page.pageFile), 'utf8')),
    ),
  );
  const project = assembleProject(manifest, pages);
  const userSources = Object.fromEntries(
    await Promise.all(
      manifest.pages.map(
        async (page) =>
          [page.codeFile, await fs.readFile(path.join(example, page.codeFile), 'utf8')] as const,
      ),
    ),
  );
  const compilation = await compileProjectToMemory(project, { target: 'native', userSources });
  if (!compilation.success) throw new Error(JSON.stringify(compilation.diagnostics));
  const frontend = {
    success: true,
    project: 'examples/hello-webrad',
    compilerTarget: 'native',
    diagnostics: compilation.diagnostics,
    files: [...Object.keys(compilation.files), ...Object.keys(compilation.binaryFiles ?? {})],
    nativeWebViewExecution: 'not-validated',
    restGoInNativeWebView: 'not-validated',
  };
  const targets: readonly (readonly [
    NativeTargetPlatform,
    NativeBundleFormat,
    NativeTargetArchitecture,
  ])[] = [
    ['windows', 'exe', 'host'],
    ['windows', 'nsis', 'host'],
    ['windows', 'msi', 'host'],
    ['linux', 'deb', 'host'],
    ['linux', 'rpm', 'host'],
    ['linux', 'appimage', 'host'],
    ['macos', 'app', 'host'],
    ['macos', 'dmg', 'host'],
    ['android', 'apk', 'arm64'],
    ['android', 'aab', 'arm64'],
    ['ios', 'ios-app', process.arch === 'arm64' ? 'arm64-simulator' : 'x64'],
    ['ios', 'ipa', 'arm64'],
  ];
  const results: unknown[] = [];
  let failed = false;
  for (const [platform, bundleFormat, architecture] of targets) {
    const settings = {
      ...project.settings.nativeApplication,
      build: {
        ...project.settings.nativeApplication.build,
        platform,
        bundleFormat,
        architecture,
        configuration:
          platform === 'android' && bundleFormat === 'apk'
            ? ('debug' as const)
            : ('release' as const),
      },
    };
    const id = `${platform}-${bundleFormat}`;
    const exported = path.join(directory, `export-${id}`);
    await exportNativeBuildProject({
      settings,
      files: compilation.files,
      binaryFiles: compilation.binaryFiles,
      directory: exported,
    });
    const prerequisites = await checkNativePrerequisites(settings);
    if (!prerequisites.ready) {
      const status = prerequisites.checks.some(
        (check) => check.id === 'platform' && check.status === 'unsupported',
      )
        ? 'not-run-platform'
        : 'not-run-missing-toolchain';
      results.push({
        platform,
        bundleFormat,
        architecture,
        status,
        generatedProject: exported,
        prerequisites,
      });
      process.stdout.write(`[COMPILER] ${id}: ${status}\n`);
      continue;
    }
    const built = await buildNativeApplication({
      buildId: id,
      settings,
      files: compilation.files,
      binaryFiles: compilation.binaryFiles,
      workspaceRoot: path.join(directory, 'cache', platform),
      outputDirectory: path.join(directory, 'artifacts', id),
      onEvent: (event) =>
        process.stdout.write(`[COMPILER] ${id} ${event.stage}: ${event.message}\n`),
    });
    const status =
      built.status === 'completed' && built.artifacts.length > 0 ? 'validated' : 'failed';
    if (status === 'failed') failed = true;
    results.push({
      ...built,
      platform,
      bundleFormat,
      architecture,
      status,
      generatedProject: exported,
    });
  }
  const report = {
    timestamp: new Date().toISOString(),
    host: { platform: process.platform, architecture: process.arch },
    frontend,
    targets: results,
  };
  await fs.writeFile(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(
    path.resolve('out/native-build-validation/latest-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(
    `[COMPILER] Native Build validation report: ${path.join(directory, 'report.json')}\n`,
  );
  if (failed) process.exitCode = 1;
}
void validate().catch((error: unknown) => {
  process.stderr.write(
    `[COMPILER] Native Build validation failed: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
