import path from 'node:path';
import sharp from 'sharp';
import {
  NativeApplicationSettingsSchema,
  type NativeApplicationSettings,
  type ProjectApplicationIcon,
} from '@webrad/project-model';
import { ensureEmptyDirectory, safeRelativePath, writeSafeFile } from './paths.js';
import { createNativeMobileSetupScript } from './mobile.js';

export interface GenerateTauriProjectOptions {
  readonly settings: NativeApplicationSettings;
  readonly files: Readonly<Record<string, string>>;
  readonly binaryFiles?: Readonly<Record<string, Uint8Array>>;
  readonly directory: string;
  readonly networkOrigins?: readonly string[];
}
export interface GeneratedTauriProject {
  readonly directory: string;
  readonly tauriDirectory: string;
  readonly frontendDirectory: string;
}
export function normalizeNativeNetworkOrigins(origins: readonly string[]): readonly string[] {
  return [
    ...new Set(
      origins.map((value) => {
        const url = new URL(value);
        if (
          !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.origin === 'null' ||
          url.hostname.includes('*') ||
          value !== url.origin
        )
          throw new Error(
            `Native network access requires an explicit HTTP(S)/WS(S) origin: ${value}.`,
          );
        return url.origin;
      }),
    ),
  ].sort();
}
export function createTauriConfiguration(
  settingsInput: NativeApplicationSettings,
  networkOrigins: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  const settings = NativeApplicationSettingsSchema.parse(settingsInput);
  const origins = normalizeNativeNetworkOrigins([
    ...settings.security.networkOrigins,
    ...networkOrigins,
  ]);
  const desktop = settings.desktop;
  const mobile = settings.build.platform === 'android' || settings.build.platform === 'ios';
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${origins.join(' ')}`.trim(),
    `img-src 'self' data: blob: ${origins.join(' ')}`.trim(),
    `media-src 'self' blob: ${origins.join(' ')}`.trim(),
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "form-action 'self'",
  ].join('; ');
  const format = settings.build.bundleFormat;
  return {
    $schema: 'https://schema.tauri.app/config/2',
    productName: settings.applicationName,
    version: settings.version,
    identifier: settings.identifier,
    build: { frontendDist: '../frontend' },
    app: {
      withGlobalTauri: false,
      windows: [
        {
          label: 'main',
          title: settings.applicationName,
          width: desktop.width,
          height: desktop.height,
          minWidth: desktop.minWidth,
          minHeight: desktop.minHeight,
          resizable: desktop.resizable,
          fullscreen: mobile ? settings.mobile.fullscreen : desktop.fullscreen,
          maximizable: desktop.maximizable,
          url: 'index.html',
        },
      ],
      security: { csp, capabilities: ['main-window'], assetProtocol: { enable: false, scope: [] } },
    },
    bundle: {
      active: format !== 'exe',
      targets: ['nsis', 'msi', 'deb', 'rpm', 'appimage', 'app', 'dmg'].includes(format)
        ? [format]
        : [],
      shortDescription: settings.description,
      longDescription: settings.description,
      publisher: settings.publisher || undefined,
      icon: [
        'icons/32x32.png',
        'icons/128x128.png',
        'icons/128x128@2x.png',
        'icons/icon.icns',
        'icons/icon.ico',
      ],
      windows: {
        ...(settings.signing.windowsCertificateThumbprint
          ? {
              certificateThumbprint: settings.signing.windowsCertificateThumbprint,
              digestAlgorithm: 'sha256',
            }
          : {}),
      },
      macOS: {
        ...(settings.signing.appleSigningIdentity
          ? { signingIdentity: settings.signing.appleSigningIdentity }
          : {}),
      },
      iOS: {
        minimumSystemVersion: '15.0',
        ...(settings.signing.appleTeamId ? { developmentTeam: settings.signing.appleTeamId } : {}),
        infoPlist: 'Info.ios.plist',
      },
      android: { minSdkVersion: 24 },
    },
  };
}
const DEFAULT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="192" fill="#2563eb"/><path d="M224 256h160l128 320 128-320h160L560 800h-96z" fill="#fff"/></svg>';
function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
export function nativeIosInfoPlist(settings: NativeApplicationSettings): string {
  const orientations =
    settings.mobile.orientation === 'portrait'
      ? ['UIInterfaceOrientationPortrait']
      : settings.mobile.orientation === 'landscape'
        ? ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']
        : [
            'UIInterfaceOrientationPortrait',
            'UIInterfaceOrientationLandscapeLeft',
            'UIInterfaceOrientationLandscapeRight',
          ];
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>UISupportedInterfaceOrientations</key><array>${orientations.map((value) => `<string>${xml(value)}</string>`).join('')}</array><key>UIStatusBarHidden</key><${settings.mobile.fullscreen || !settings.mobile.statusBar ? 'true' : 'false'}/><key>UIViewControllerBasedStatusBarAppearance</key><false/></dict></plist>\n`;
}
export async function generateTauriProject(
  options: GenerateTauriProjectOptions,
): Promise<GeneratedTauriProject> {
  const settings = NativeApplicationSettingsSchema.parse(options.settings);
  if (!options.files['index.html'])
    throw new Error('The WebRAD compiler did not produce index.html.');
  const paths = [...Object.keys(options.files), ...Object.keys(options.binaryFiles ?? {})];
  const seen = new Set<string>();
  for (const filename of paths) {
    safeRelativePath(filename);
    const key = filename.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate generated file path: ${filename}.`);
    seen.add(key);
  }
  const root = await ensureEmptyDirectory(options.directory);
  const config = createTauriConfiguration(settings, options.networkOrigins);
  for (const [filename, content] of Object.entries(options.files)) {
    if (['service-worker.js', 'manifest.webmanifest', 'assets/pwa-register.js'].includes(filename))
      continue;
    if (
      filename === 'index.html' &&
      /pwa-register\.js|navigator\.serviceWorker\.register/.test(content)
    )
      throw new Error(
        'Native output must be compiled with the native target; PWA registration is still present.',
      );
    const mobileHtml =
      filename === 'index.html'
        ? content
            .replace(
              'width=device-width, initial-scale=1.0',
              'width=device-width, initial-scale=1.0, viewport-fit=cover',
            )
            .replace(
              '</head>',
              '<link rel="stylesheet" href="assets/webrad-native.css" />\n</head>',
            )
        : content;
    await writeSafeFile(root, `frontend/${filename}`, mobileHtml);
  }
  for (const [filename, content] of Object.entries(options.binaryFiles ?? {}))
    await writeSafeFile(root, `frontend/${filename}`, content);
  const textFiles: Record<string, string> = {
    'frontend/assets/webrad-native.css': settings.mobile.safeArea
      ? 'html { box-sizing: border-box; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }\n'
      : '/* The application uses the complete WebView area. */\n',
    'configure-mobile.mjs': createNativeMobileSetupScript(settings),
    'src-tauri/tauri.conf.json': `${JSON.stringify(config, null, 2)}\n`,
    'src-tauri/Cargo.toml': `[package]\nname = "webrad-application"\nversion = ${JSON.stringify(settings.version)}\ndescription = ${JSON.stringify(settings.description || settings.applicationName)}\nedition = "2021"\n\n[lib]\nname = "webrad_application_lib"\ncrate-type = ["staticlib", "cdylib", "rlib"]\n\n[build-dependencies]\ntauri-build = { version = "2", features = [] }\n\n[dependencies]\ntauri = { version = "2", features = [] }\n`,
    'src-tauri/build.rs': 'fn main() { tauri_build::build() }\n',
    'src-tauri/src/main.rs':
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\nfn main() { webrad_application_lib::run(); }\n',
    'src-tauri/src/lib.rs':
      '#[cfg_attr(mobile, tauri::mobile_entry_point)]\npub fn run() {\n    tauri::Builder::default()\n        .run(tauri::generate_context!())\n        .expect("WebRAD native application failed to start");\n}\n',
    'src-tauri/capabilities/main-window.json': `${JSON.stringify({ identifier: 'main-window', description: 'Local WebRAD frontend without native command permissions.', windows: ['main'], permissions: [] }, null, 2)}\n`,
    'src-tauri/Info.ios.plist': nativeIosInfoPlist(settings),
    '.gitignore':
      '/src-tauri/target/\n/src-tauri/gen/\n*.jks\n*.keystore\n*.p12\n*.mobileprovision\n.env*\n',
    'README.md':
      '# WebRAD application - Tauri 2\n\nThe frontend directory contains the real WebRAD compiler output. No Electron or WebRAD IDE runtime is required. Install prerequisites from https://v2.tauri.app/start/prerequisites/ and the official cargo tauri CLI version 2. No toolchain is installed by the application.\n\nRun `cargo tauri icon app-icon.png`, then `cargo tauri build` on a matching desktop host. Android: `cargo tauri android init --ci --skip-targets-install`, `node configure-mobile.mjs android`, `cargo tauri icon app-icon-mobile.png`, `cargo tauri android build --apk --debug`. iOS requires macOS, Xcode, CocoaPods, an Apple team and provisioning: `cargo tauri ios init --ci --skip-targets-install`, `node configure-mobile.mjs ios`, `cargo tauri icon app-icon-mobile.png`, `cargo tauri ios build`.\n\nOnly explicitly configured network origins are permitted by CSP. Configure CORS on your API/RestGO backend for the WebView origin (http://tauri.localhost on Windows/Android; tauri://localhost on other platforms). Credentials and signing keys belong in your host keychain or CI secrets. Do not commit credentials.\n\nGenerated mobile settings are applied directly by the WebRAD Native Build engine, or by configure-mobile.mjs after official initialization in standalone/CI builds. See native-settings.json and docs/native-build.md in WebRAD for limitations.\n',
    'native-settings.json': `${JSON.stringify(settings, null, 2)}\n`,
  };
  for (const [filename, content] of Object.entries(textFiles))
    await writeSafeFile(root, filename, content);
  const convertIcon = async (icon: ProjectApplicationIcon | null): Promise<Buffer> => {
    const source = icon
      ? Buffer.from(icon.dataUrl.slice(icon.dataUrl.indexOf(',') + 1), 'base64')
      : Buffer.from(DEFAULT_ICON);
    const metadata = await sharp(source, { limitInputPixels: 16_777_216 }).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error('Application Icon could not be decoded.');
    return sharp(source, { limitInputPixels: 16_777_216 })
      .resize(1024, 1024, { fit: 'contain', background: '#00000000' })
      .ensureAlpha()
      .png()
      .toBuffer();
  };
  const png = await convertIcon(settings.icon);
  await writeSafeFile(root, 'app-icon.png', png);
  await writeSafeFile(
    root,
    'app-icon-mobile.png',
    settings.mobile.icon ? await convertIcon(settings.mobile.icon) : png,
  );
  for (const [name, size] of [
    ['32x32.png', 32],
    ['128x128.png', 128],
    ['128x128@2x.png', 256],
    ['icon.png', 512],
  ] as const)
    await writeSafeFile(
      root,
      `src-tauri/icons/${name}`,
      await sharp(png).resize(size, size).png().toBuffer(),
    );
  return {
    directory: root,
    tauriDirectory: path.join(root, 'src-tauri'),
    frontendDirectory: path.join(root, 'frontend'),
  };
}
