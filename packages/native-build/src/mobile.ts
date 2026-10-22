import type { NativeApplicationSettings } from '@webrad/project-model';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isPathWithin } from './paths.js';

/** The same standalone configuration script is used by the IDE and exported CI builds. */
function nativeMobileData(settings: NativeApplicationSettings) {
  const orientation =
    settings.mobile.orientation === 'auto' ? 'unspecified' : settings.mobile.orientation;
  const hideStatus = settings.mobile.fullscreen || !settings.mobile.statusBar;
  const activity = `package WEBRAD_PACKAGE\n\nimport android.os.Bundle\nimport androidx.core.view.WindowCompat\nimport androidx.core.view.WindowInsetsCompat\nimport androidx.core.view.WindowInsetsControllerCompat\n\nclass MainActivity : app.tauri.TauriActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    WindowCompat.setDecorFitsSystemWindows(window, ${settings.mobile.safeArea})\n    val controller = WindowInsetsControllerCompat(window, window.decorView)\n    controller.${hideStatus ? 'hide' : 'show'}(WindowInsetsCompat.Type.statusBars())\n    ${settings.mobile.fullscreen ? 'controller.hide(WindowInsetsCompat.Type.navigationBars())' : ''}\n  }\n}\n`;
  const signing = settings.signing;
  const refs = [
    signing.androidKeystorePathEnvironmentVariable,
    signing.androidKeystorePasswordEnvironmentVariable,
    signing.androidKeyAliasEnvironmentVariable,
    signing.androidKeyPasswordEnvironmentVariable,
  ];
  const gradle = refs.every(Boolean)
    ? `\n// WebRAD environment-based release signing\nandroid {\n  signingConfigs {\n    create("webradRelease") {\n      storeFile = file(requireNotNull(System.getenv(${JSON.stringify(refs[0])})) { "Missing keystore environment variable" })\n      storePassword = requireNotNull(System.getenv(${JSON.stringify(refs[1])})) { "Missing store password environment variable" }\n      keyAlias = requireNotNull(System.getenv(${JSON.stringify(refs[2])})) { "Missing key alias environment variable" }\n      keyPassword = requireNotNull(System.getenv(${JSON.stringify(refs[3])})) { "Missing key password environment variable" }\n    }\n  }\n  buildTypes.getByName("release") { signingConfig = signingConfigs.getByName("webradRelease") }\n}\n`
    : '';
  return { orientation, activity, gradle };
}

export function createNativeMobileSetupScript(settings: NativeApplicationSettings): string {
  const { orientation, activity, gradle } = nativeMobileData(settings);
  return `import { lstat, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) throw new Error('Pass android or ios.');
if (${Boolean(settings.mobile.splashScreen)}) throw new Error('Custom mobile splash screens are not supported by this generator. Remove Mobile > Splash Screen before building.');
if (platform === 'android') {
  const root = path.join(directory, 'src-tauri', 'gen', 'android');
  const safe = async (filename) => {
    const relative = path.relative(directory, filename);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe generated mobile path.');
    let cursor = directory;
    for (const part of relative.split(path.sep)) { cursor = path.join(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Generated mobile files may not be symlinks.'); }
  };
  const update = async (filename, change) => { await safe(filename); await writeFile(filename, change(await readFile(filename, 'utf8')), {mode: 0o600}); };
  await update(path.join(root, 'app/src/main/AndroidManifest.xml'), (text) => {
    if (!text.includes('<activity')) throw new Error('Official Android template activity missing.');
    return text.replace(/(<activity\\b[^>]*)(>)/, (_, attributes, end) => attributes.replace(/\\sandroid:screenOrientation="[^"]*"/g, '') + ' android:screenOrientation="${orientation}"' + end);
  });
  const activities = [];
  const walk = async (current) => {
    await safe(current);
    for (const entry of await readdir(current, {withFileTypes: true})) { if (entry.isSymbolicLink()) throw new Error('Generated source may not be a symlink.'); const filename = path.join(current, entry.name); if (entry.isDirectory()) await walk(filename); else if (entry.name === 'MainActivity.kt') activities.push(filename); }
  };
  await walk(path.join(root, 'app/src/main/java'));
  if (activities.length !== 1) throw new Error('Expected exactly one official Android MainActivity.');
  await update(activities[0], (text) => { const packageName = text.match(/^package\\s+([\\w.]+)/m)?.[1]; if (!packageName || !text.includes('app.tauri.TauriActivity')) throw new Error('Official Android activity template not recognized.'); return ${JSON.stringify(activity)}.replace('WEBRAD_PACKAGE', packageName); });
  if (${Boolean(gradle)}) await update(path.join(root, 'app/build.gradle.kts'), (text) => { if (text.includes('// WebRAD environment-based release signing')) throw new Error('Mobile signing configuration was already applied.'); return text + ${JSON.stringify(gradle)}; });
}
`;
}

/** Runs in Electron main using Node APIs; it does not rely on the disabled RunAsNode fuse. */
export async function configureNativeMobileProject(
  directory: string,
  settings: NativeApplicationSettings,
): Promise<void> {
  if (settings.mobile.splashScreen)
    throw new Error(
      'Custom mobile splash screens are not supported by this generator. Remove Mobile > Splash Screen before building.',
    );
  if (settings.build.platform !== 'android') return;
  const { orientation, activity, gradle } = nativeMobileData(settings);
  const root = path.join(directory, 'src-tauri/gen/android');
  const safe = async (filename: string) => {
    if (!isPathWithin(directory, filename) || filename === directory)
      throw new Error('Unsafe generated mobile path.');
    let cursor = directory;
    for (const part of path.relative(directory, filename).split(path.sep)) {
      cursor = path.join(cursor, part);
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error('Generated mobile files may not be symlinks.');
    }
  };
  const update = async (filename: string, change: (text: string) => string) => {
    await safe(filename);
    await writeFile(filename, change(await readFile(filename, 'utf8')), { mode: 0o600 });
  };
  await update(path.join(root, 'app/src/main/AndroidManifest.xml'), (text) => {
    if (!text.includes('<activity')) throw new Error('Official Android template activity missing.');
    return text.replace(
      /(<activity\b[^>]*)(>)/,
      (_match, attributes: string, end: string) =>
        attributes.replace(/\sandroid:screenOrientation="[^"]*"/g, '') +
        ` android:screenOrientation="${orientation}"` +
        end,
    );
  });
  const activities: string[] = [];
  const walk = async (current: string): Promise<void> => {
    await safe(current);
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Generated source may not be a symlink.');
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.name === 'MainActivity.kt') activities.push(filename);
    }
  };
  await walk(path.join(root, 'app/src/main/java'));
  const filename = activities[0];
  if (activities.length !== 1 || !filename)
    throw new Error('Expected exactly one official Android MainActivity.');
  await update(filename, (text) => {
    const packageName = text.match(/^package\s+([\w.]+)/m)?.[1];
    if (!packageName || !text.includes('app.tauri.TauriActivity'))
      throw new Error('Official Android activity template not recognized.');
    return activity.replace('WEBRAD_PACKAGE', packageName);
  });
  if (gradle)
    await update(path.join(root, 'app/build.gradle.kts'), (text) => {
      if (text.includes('// WebRAD environment-based release signing'))
        throw new Error('Mobile signing configuration was already applied.');
      return text + gradle;
    });
}
