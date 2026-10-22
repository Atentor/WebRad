import type {
  NativeBundleFormat,
  NativeTargetArchitecture,
  NativeTargetPlatform,
} from './types.js';

const FORMATS: Readonly<Record<NativeTargetPlatform, readonly NativeBundleFormat[]>> = {
  web: ['web'],
  windows: ['nsis', 'msi', 'exe'],
  linux: ['deb', 'rpm', 'appimage'],
  macos: ['app', 'dmg'],
  android: ['apk', 'aab'],
  ios: ['ios-app', 'ipa'],
};

const ARCHITECTURES: Readonly<Record<NativeTargetPlatform, readonly NativeTargetArchitecture[]>> = {
  web: ['host'],
  windows: ['host', 'x64', 'x86', 'arm64'],
  linux: ['host', 'x64', 'arm64'],
  macos: ['host', 'x64', 'arm64', 'universal'],
  android: ['arm64', 'armv7', 'x64', 'x86'],
  ios: ['arm64', 'arm64-simulator', 'x64'],
};

/** Format compatibility only; host OS, toolchain and signing are checked by Native Build. */
export function getNativeBundleFormats(
  platform: NativeTargetPlatform,
): readonly NativeBundleFormat[] {
  return FORMATS[platform];
}

export function getDefaultNativeBundleFormat(platform: NativeTargetPlatform): NativeBundleFormat {
  return FORMATS[platform][0] as NativeBundleFormat;
}

export function getNativeArchitectures(
  platform: NativeTargetPlatform,
): readonly NativeTargetArchitecture[] {
  return ARCHITECTURES[platform];
}
