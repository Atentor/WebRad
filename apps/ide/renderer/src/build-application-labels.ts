export const BUILD_STAGE_LABELS = {
  idle: 'Not started',
  preparing: 'Preparing',
  'compiling-webrad': 'Compiling WebRAD',
  'generating-tauri': 'Generating Tauri Project',
  'checking-dependencies': 'Checking Dependencies',
  'compiling-native': 'Compiling Native Application',
  packaging: 'Packaging',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;

export const BUILD_PLATFORM_LABELS = {
  web: 'Web/PWA',
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
  android: 'Android',
  ios: 'iOS',
} as const;
