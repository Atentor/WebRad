import type { NativeApplicationSettings } from '@webrad/project-model';

export function createNativeCiWorkflow(settings: NativeApplicationSettings): string {
  const debug = settings.build.configuration === 'debug' ? ' --debug' : '';
  const refs = [
    settings.signing.androidKeystorePathEnvironmentVariable,
    settings.signing.androidKeystorePasswordEnvironmentVariable,
    settings.signing.androidKeyAliasEnvironmentVariable,
    settings.signing.androidKeyPasswordEnvironmentVariable,
  ].filter(Boolean);
  const androidEnv = refs.length
    ? `    env:\n${refs.map((name) => `      ${name}: \${{ secrets.${name} }}`).join('\n')}\n`
    : '';
  return `# Export this workflow to the USER APPLICATION repository. No release is published.
name: Build user application
on:
  workflow_dispatch:
    inputs:
      target:
        type: choice
        default: desktop
        options: [desktop, android, ios-simulator, ios-device]
      android-format:
        type: choice
        default: apk
        options: [apk, aab]
permissions:
  contents: read
jobs:
  desktop:
    if: inputs.target == 'desktop'
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner: windows-latest
            target: x86_64-pc-windows-msvc
            bundles: nsis,msi
          - runner: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
            bundles: deb,rpm,appimage
          - runner: macos-latest
            target: aarch64-apple-darwin
            bundles: app,dmg
          - runner: macos-15-intel
            target: x86_64-apple-darwin
            bundles: app,dmg
    runs-on: \${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: \${{ matrix.target }}
      - if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
      - run: cargo install tauri-cli --version "^2" --locked
      - run: cargo tauri icon app-icon.png
      - run: cargo tauri build --ci --config '{"bundle":{"active":true}}' --target \${{ matrix.target }} --bundles \${{ matrix.bundles }}${debug}
      - uses: actions/upload-artifact@v4
        with:
          name: application-\${{ matrix.target }}
          path: src-tauri/target/\${{ matrix.target }}/${settings.build.configuration}/bundle/
          if-no-files-found: error
  android:
    if: inputs.target == 'android'
    runs-on: ubuntu-22.04
${androidEnv}    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: android-actions/setup-android@v3
      - run: sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.2.12479018"
      - name: Configure NDK
        shell: bash
        run: echo "NDK_HOME=$ANDROID_HOME/ndk/27.2.12479018" >> "$GITHUB_ENV"
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android
      - run: cargo install tauri-cli --version "^2" --locked
      - run: cargo tauri android init --ci --skip-targets-install
      - run: node configure-mobile.mjs android
      - run: cargo tauri icon app-icon-mobile.png
      # Without release signing, Debug APK is installable using the development certificate.
      # For release APK/AAB configure all four signing refs and secrets in Native Application before export.
      - name: Check Android distribution signing
        if: inputs.android-format == 'aab'
        run: node -e 'if (${refs.length} !== 4) throw new Error("AAB requires four configured Android release signing environment references. Export again after configuring signing.")'
      - run: cargo tauri android build --ci --target aarch64 --\${{ inputs.android-format }}${refs.length === 4 ? debug : ' --debug'}
      - uses: actions/upload-artifact@v4
        with:
          name: application-android
          path: src-tauri/gen/android/app/build/outputs/
          if-no-files-found: error
  ios:
    if: inputs.target == 'ios-simulator' || inputs.target == 'ios-device'
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-ios,aarch64-apple-ios-sim
      - run: brew list cocoapods || brew install cocoapods
      - run: cargo install tauri-cli --version "^2" --locked
      # Device/IPA requires certificates/profiles in the runner keychain, or an App Store Connect API key file.
      # Materialize private key files securely on this runner; APPLE_API_KEY_PATH is a path, not the key contents.
      - run: cargo tauri ios init --ci --skip-targets-install
      - run: node configure-mobile.mjs ios
      - run: cargo tauri icon app-icon-mobile.png
      - if: inputs.target == 'ios-simulator'
        run: cargo tauri ios build --ci --target aarch64-sim${debug}
      - if: inputs.target == 'ios-device'
        run: cargo tauri ios build --ci --target aarch64 --export-method ${settings.signing.iosExportMethod}${debug}
      - uses: actions/upload-artifact@v4
        with:
          name: application-ios
          path: src-tauri/gen/apple/build/
          if-no-files-found: error
`;
}
